import * as fs from 'fs';
import * as path from 'path';
import { Game } from './game_interface';
import { 
    toGlicko2Scale, 
    computeE, 
    DEFAULT_RATING, 
    DEFAULT_RD, 
    DEFAULT_VOL,
    updateRating,
    toOriginalScale
} from './glicko_math';

// --- Shared Data & Types ---

interface PlayerElos {
    commanderElo: number;
    thugElo: number;
}
const playerElosMap = new Map<string, PlayerElos>();

function getEloStats(playerName: string): PlayerElos {
    if (!playerName) return { commanderElo: 1500, thugElo: 1500 };
    if (!playerElosMap.has(playerName)) {
        playerElosMap.set(playerName, { commanderElo: 1500, thugElo: 1500 });
    }
    return playerElosMap.get(playerName)!;
}

interface GlickoPlayer {
    rating: number;
    rd: number;
    vol: number;
}
interface PlayerGlickoStats {
    commander: GlickoPlayer;
    thug: GlickoPlayer;
}
const glickoStatsMap = new Map<string, PlayerGlickoStats>();

function getGlickoStats(playerName: string): PlayerGlickoStats {
    if (!playerName) {
         return { 
            commander: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL },
            thug: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL }
        };
    }
    if (!glickoStatsMap.has(playerName)) {
        glickoStatsMap.set(playerName, {
            commander: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL },
            thug: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL }
        });
    }
    return glickoStatsMap.get(playerName)!;
}

// --- Faction Logic ---
interface FactionAdjustments {
  [faction: string]: { [faction: string]: number };
}
const factionWinrates: FactionAdjustments = {
  'ISDF': { 'Scion': 0.5215 },
  'Hadean': { 'Scion': 0.5625, 'ISDF': 0.5689 }
};
function getFactionWinrate(faction1: string, faction2: string): number {
    if (faction1 === faction2) return 0.5;
    if (factionWinrates[faction1] && factionWinrates[faction1][faction2]) return factionWinrates[faction1][faction2];
    if (factionWinrates[faction2] && factionWinrates[faction2][faction1]) return 1 - factionWinrates[faction2][faction1];
    return 0.5;
}
function getFactionBonus(myFaction: string, oppFaction: string): number {
    const winrate = getFactionWinrate(myFaction, oppFaction);
    if (winrate === 0.5) return 0;
    return -400 * Math.log10(1 / winrate - 1);
}

// --- Elo Logic ---

function calculateEloTeamStrength(commander: string, thugs: string[], influence: number): number {
    const cmdElo = getEloStats(commander).commanderElo;
    let avgThugElo = 0;
    const validThugs = thugs.filter(t => t !== '');
    if (validThugs.length > 0) {
        avgThugElo = validThugs.reduce((sum, t) => sum + getEloStats(t).thugElo, 0) / validThugs.length;
    }
    if (avgThugElo === 0) return cmdElo;
    return cmdElo * influence + avgThugElo * (1 - influence);
}

function calculateEloExpectedOutcome(
    t1Cmd: string, t1Thugs: string[], t1Fac: string,
    t2Cmd: string, t2Thugs: string[], t2Fac: string,
    influence: number
): number {
    const t1Str = calculateEloTeamStrength(t1Cmd, t1Thugs, influence);
    const t2Str = calculateEloTeamStrength(t2Cmd, t2Thugs, influence);
    
    const expected = 1 / (1 + Math.pow(10, (t2Str - t1Str) / 400));
    const factionWR = getFactionWinrate(t1Fac, t2Fac);
    
    const num = expected * factionWR;
    const den = num + (1 - expected) * (1 - factionWR);
    return num / den;
}

// --- Glicko Logic ---

function calculateGlickoTeamStrength(commander: string, thugs: string[], influence: number): { rating: number, rd: number } {
    const cmdStats = getGlickoStats(commander).commander;
    let avgThugRating = 0;
    let avgThugRD = 0;
    const validThugs = thugs.filter(t => t !== '');
    
    if (validThugs.length > 0) {
        let sumRating = 0;
        let sumRD2 = 0;
        for (const thug of validThugs) {
            const tStats = getGlickoStats(thug).thug;
            sumRating += tStats.rating;
            sumRD2 += tStats.rd * tStats.rd;
        }
        avgThugRating = sumRating / validThugs.length;
        avgThugRD = Math.sqrt(sumRD2) / validThugs.length;
    }

    if (avgThugRating === 0) return { rating: cmdStats.rating, rd: cmdStats.rd };

    const teamRating = cmdStats.rating * influence + avgThugRating * (1 - influence);
    const w1 = influence;
    const w2 = 1 - influence;
    const teamRD = Math.sqrt(Math.pow(w1 * cmdStats.rd, 2) + Math.pow(w2 * avgThugRD, 2));
    return { rating: teamRating, rd: teamRD };
}

// --- Main Simulation ---

function calculateBrierScore(prob: number, actual: number): number {
    return Math.pow(prob - actual, 2);
}

function runSimulation(games: Game[], influence: number) {
    // Reset State
    playerElosMap.clear();
    glickoStatsMap.clear();

    let eloBrierSum = 0;
    let glickoBrierSum = 0;
    let eloCorrect = 0;
    let glickoCorrect = 0;
    let count = 0;

    for (const game of games) {
        const { team1command, team2command, team1faction, team2faction, teamOneThugs, teamTwoThugs, winningTeamId } = game;
        const actualOutcome = winningTeamId === 1 ? 1 : 0;

        // --- ELO ---
        const eloExp = calculateEloExpectedOutcome(team1command, teamOneThugs, team1faction, team2command, teamTwoThugs, team2faction, influence);
        eloBrierSum += calculateBrierScore(eloExp, actualOutcome);
        if (Math.round(eloExp) === actualOutcome) eloCorrect++;

        // Elo Update
        const kFactor = 50;
        const eloChange = kFactor * (actualOutcome - eloExp);
        
        const t1Cmd = getEloStats(team1command);
        t1Cmd.commanderElo += eloChange;
        for (const thug of teamOneThugs.filter(t => t !== '')) getEloStats(thug).thugElo += eloChange;

        const t2Cmd = getEloStats(team2command);
        t2Cmd.commanderElo -= eloChange;
        for (const thug of teamTwoThugs.filter(t => t !== '')) getEloStats(thug).thugElo -= eloChange;

        // --- GLICKO ---
        const t1Str = calculateGlickoTeamStrength(team1command, teamOneThugs, influence);
        const t2Str = calculateGlickoTeamStrength(team2command, teamTwoThugs, influence);

        const t1Bonus = getFactionBonus(team1faction, team2faction);
        const t2Bonus = getFactionBonus(team2faction, team1faction);

        const t1EffRating = t1Str.rating + t1Bonus;
        const t2EffRating = t2Str.rating + t2Bonus;

        const t1G2 = toGlicko2Scale({ rating: t1EffRating, rd: t1Str.rd, vol: 0.06 });
        const t2G2 = toGlicko2Scale({ rating: t2EffRating, rd: t2Str.rd, vol: 0.06 });
        
        const phi_composite = Math.sqrt(t1G2.phi * t1G2.phi + t2G2.phi * t2G2.phi);
        const glickoExp = computeE(t1G2.mu, t2G2.mu, phi_composite);

        glickoBrierSum += calculateBrierScore(glickoExp, actualOutcome);
        if (Math.round(glickoExp) === actualOutcome) glickoCorrect++;

        // Glicko Update
        const t2EffForT1 = t2Str.rating - t1Bonus;
        const t1EffForT2 = t1Str.rating - t2Bonus;

        const t2OpponentGlicko = toGlicko2Scale({ rating: t2EffForT1, rd: t2Str.rd, vol: DEFAULT_VOL });
        const t1OpponentGlicko = toGlicko2Scale({ rating: t1EffForT2, rd: t1Str.rd, vol: DEFAULT_VOL });

        // Update T1
        const t1CmdStats = getGlickoStats(team1command).commander;
        let p = toGlicko2Scale(t1CmdStats);
        let newP = updateRating(p, [{ opponentMu: t2OpponentGlicko.mu, opponentPhi: t2OpponentGlicko.phi, score: actualOutcome }]);
        Object.assign(t1CmdStats, toOriginalScale(newP));
        
        for (const thug of teamOneThugs.filter(t => t !== '')) {
            const ts = getGlickoStats(thug).thug;
            p = toGlicko2Scale(ts);
            newP = updateRating(p, [{ opponentMu: t2OpponentGlicko.mu, opponentPhi: t2OpponentGlicko.phi, score: actualOutcome }]);
            Object.assign(ts, toOriginalScale(newP));
        }

        // Update T2
        const t2CmdStats = getGlickoStats(team2command).commander;
        p = toGlicko2Scale(t2CmdStats);
        newP = updateRating(p, [{ opponentMu: t1OpponentGlicko.mu, opponentPhi: t1OpponentGlicko.phi, score: 1 - actualOutcome }]);
        Object.assign(t2CmdStats, toOriginalScale(newP));

        for (const thug of teamTwoThugs.filter(t => t !== '')) {
            const ts = getGlickoStats(thug).thug;
            p = toGlicko2Scale(ts);
            newP = updateRating(p, [{ opponentMu: t1OpponentGlicko.mu, opponentPhi: t1OpponentGlicko.phi, score: 1 - actualOutcome }]);
            Object.assign(ts, toOriginalScale(newP));
        }

        count++;
    }

    return {
        eloAcc: (eloCorrect / count * 100).toFixed(2),
        glickoAcc: (glickoCorrect / count * 100).toFixed(2),
        eloBrier: (eloBrierSum / count).toFixed(4),
        glickoBrier: (glickoBrierSum / count).toFixed(4)
    };
}

function main() {
    const gamesPath = path.join(__dirname, '../data/games.ts');
    const rawData = fs.readFileSync(gamesPath, 'utf-8');
    const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
    const games: Game[] = JSON.parse(gamesJson);

    console.log(`Optimizing Commander Influence Factor (0.0 - 1.0) over ${games.length} games...\n`);
    console.log(`| Influence | Elo Acc | Elo Brier | Glicko Acc | Glicko Brier |`);
    console.log(`|-----------|---------|-----------|------------|--------------|`);

    for (let i = 0; i <= 10; i++) {
        const influence = parseFloat((i / 10).toFixed(1));
        const res = runSimulation(games, influence);
        console.log(`|   ${influence.toFixed(1)}     |  ${res.eloAcc}% |   ${res.eloBrier}  |   ${res.glickoAcc}%   |    ${res.glickoBrier}    |`);
    }
}

if (require.main === module) {
    main();
}