import * as fs from 'fs';
import * as path from 'path';
import { Game } from './game_interface';
import { 
    GlickoRating, 
    toGlicko2Scale, 
    computeE, 
    DEFAULT_RATING, 
    DEFAULT_RD, 
    DEFAULT_VOL,
    updateRating,
    toOriginalScale
} from './glicko_math';
import { playerElos, getPlayerElo, calculateTeamStrength as calculateEloTeamStrength, calculateExpectedOutcome } from './elo_calculator';

// --- Re-implementing parts of Glicko Logic locally to avoid module state conflicts or circular deps ---

const COMMANDER_INFLUENCE = 0.5;

interface GlickoPlayer {
    rating: number;
    rd: number;
    vol: number;
}
interface PlayerGlickoStats {
    commander: GlickoPlayer;
    thug: GlickoPlayer;
}

const glickoStats = new Map<string, PlayerGlickoStats>();

function getGlickoStats(playerName: string): PlayerGlickoStats {
    if (!playerName) {
         return { 
            commander: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL },
            thug: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL }
        };
    }
    if (!glickoStats.has(playerName)) {
        glickoStats.set(playerName, {
            commander: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL },
            thug: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL }
        });
    }
    return glickoStats.get(playerName)!;
}

function calculateGlickoTeamStrength(commander: string, thugs: string[]): { rating: number, rd: number } {
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

    const teamRating = cmdStats.rating * COMMANDER_INFLUENCE + avgThugRating * (1 - COMMANDER_INFLUENCE);
    const w1 = COMMANDER_INFLUENCE;
    const w2 = 1 - COMMANDER_INFLUENCE;
    const teamRD = Math.sqrt(Math.pow(w1 * cmdStats.rd, 2) + Math.pow(w2 * avgThugRD, 2));
    return { rating: teamRating, rd: teamRD };
}

// --- Faction Logic Shared ---
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

// --- Evaluation ---

function calculateBrierScore(prob: number, actual: number): number {
    return Math.pow(prob - actual, 2);
}

async function main() {
    const gamesPath = path.join(__dirname, '../data/games.ts');
    const rawData = fs.readFileSync(gamesPath, 'utf-8');
    const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
    const games: Game[] = JSON.parse(gamesJson);

    let eloBrierSum = 0;
    let glickoBrierSum = 0;
    let eloCorrect = 0;
    let glickoCorrect = 0;
    let count = 0;

    // We must simulate the games chronologically for both systems
    // Elo system state is already imported from elo_calculator (it has state inside the module)
    // We need to RESET Elo state to defaults if we want a fair comparison from scratch
    // However, elo_calculator.ts exports `playerElos` which is a Map. We can clear it.
    playerElos.clear();

    console.log(`Comparing predictive power over ${games.length} games...`);

    for (const game of games) {
        const { team1command, team2command, team1faction, team2faction, teamOneThugs, teamTwoThugs, winningTeamId } = game;
        const actualOutcome = winningTeamId === 1 ? 1 : 0;

        // --- ELO PREDICTION ---
        // calculateExpectedOutcome in elo_calculator.ts uses the CURRENT state of playerElos
        // and it applies faction winrate inside.
        // But wait, the imported `elo_calculator` functions depend on `playerElos` map.
        // We cleared it, so it starts fresh.
        // We need to replicate the Update logic here because the exported function `updateElos` isn't exported or we need to access it.
        // Checking elo_calculator.ts ... it DOES NOT export `updateElos`. It has a main() that runs it.
        // We have to implement the Elo Update logic here to simulate the timeline.
        
        // 1. Elo Prediction
        const eloExpOutcome = calculateExpectedOutcome(team1command, teamOneThugs, team1faction, team2command, teamTwoThugs, team2faction);
        
        eloBrierSum += calculateBrierScore(eloExpOutcome, actualOutcome);
        if (Math.round(eloExpOutcome) === actualOutcome) eloCorrect++;

        // 2. Elo Update (Manual implementation based on reading the file)
        const kFactor = 50;
        const eloChange = kFactor * (actualOutcome - eloExpOutcome); // Win(1) - Exp < 0 if Exp > 1 (impossible). 
        // If Win=1, Change = 50 * (1 - Exp). Positive.
        // If Win=0, Change = 50 * (0 - Exp). Negative. 
        
        // Update Team 1
        const t1Cmd = getPlayerElo(team1command);
        t1Cmd.commanderElo += eloChange;
        for (const thug of teamOneThugs.filter(t => t !== '')) getPlayerElo(thug).thugElo += eloChange;

        // Update Team 2
        const t2Cmd = getPlayerElo(team2command);
        t2Cmd.commanderElo -= eloChange;
        for (const thug of teamTwoThugs.filter(t => t !== '')) getPlayerElo(thug).thugElo -= eloChange;


        // --- GLICKO PREDICTION ---
        // 1. Team Strengths
        const t1Str = calculateGlickoTeamStrength(team1command, teamOneThugs);
        const t2Str = calculateGlickoTeamStrength(team2command, teamTwoThugs);
        
        // 2. Faction Adjustment (Bonus/Malus to Rating)
        const t1Bonus = getFactionBonus(team1faction, team2faction);
        const t2Bonus = getFactionBonus(team2faction, team1faction);
        
        const t1EffRating = t1Str.rating + t1Bonus; // Boosting T1 directly instead of nerfing opp for prediction is simpler
        const t2EffRating = t2Str.rating + t2Bonus;

        // 3. Glicko Expected Outcome (E)
        // We need to use the glicko E formula: 1 / (1 + exp(-g(phi) * (mu - mu_opp)))
        // We are comparing two TEAMS. 
        // The Glicko paper E formula is for Player vs Player.
        // We treat the teams as players.
        // RD_diff = sqrt(RD1^2 + RD2^2) used for the 'g' factor?
        // Standard Glicko prediction for two players i and j:
        // E = 1 / ( 1 + 10 ^ ( -g(sqrt(RD1^2 + RD2^2)) * (R1 - R2) / 400 ) ) ? No that's Glicko-1/Elo-like.
        
        // Glicko-2 uses: E = 1 / (1 + exp(-g(phi_j) * (mu - mu_j)))
        // We need to convert our Team Ratings to Glicko-2 scale first.
        const t1G2 = toGlicko2Scale({ rating: t1EffRating, rd: t1Str.rd, vol: 0.06 });
        const t2G2 = toGlicko2Scale({ rating: t2EffRating, rd: t2Str.rd, vol: 0.06 });
        
        // To predict T1 vs T2, we treat T2 as the opponent 'j'
        // But what is the RD for the calculation?
        // In Glicko-2, the match usually assumes the opponent has an RD.
        // The `computeE` function takes (mu, mu_j, phi_j).
        // It accounts for the opponent's uncertainty (phi_j) reducing the expected win prob if high.
        // But it doesn't account for the player's OWN uncertainty in the basic formula.
        // However, usually for "Win Probability" between two uncertain entities, you use the composite RD.
        // Reference: Glicko-1 uses g(sqrt(RD1^2 + RD2^2)).
        // Glicko-2 scale: phi_composite = sqrt(phi1^2 + phi2^2).
        
        const phi_composite = Math.sqrt(t1G2.phi * t1G2.phi + t2G2.phi * t2G2.phi);
        const glickoExpOutcome = computeE(t1G2.mu, t2G2.mu, phi_composite);

        glickoBrierSum += calculateBrierScore(glickoExpOutcome, actualOutcome);
        if (Math.round(glickoExpOutcome) === actualOutcome) glickoCorrect++;

        // 4. Glicko Update
        // Re-using logic from glicko_calculator.ts
        // Update T1
        // For update, we use the specific Opponent's Phi, not composite? 
        // The updateRating function iterates matches.
        // match.opponentPhi is used.
        // In the update step, we do NOT use composite phi for the 'g' function inside the integral approximations.
        
        // Opponent Effective Ratings for Update (Opponent - MyBonus, as per glicko_calculator.ts)
        const t2EffForT1 = t2Str.rating - t1Bonus; // T2 is weaker because T1 has bonus
        const t1EffForT2 = t1Str.rating - t2Bonus;

        const t2OpponentGlicko = toGlicko2Scale({ rating: t2EffForT1, rd: t2Str.rd, vol: DEFAULT_VOL });
        const t1OpponentGlicko = toGlicko2Scale({ rating: t1EffForT2, rd: t1Str.rd, vol: DEFAULT_VOL });

        // Update T1 Commander
        const t1CmdStats = getGlickoStats(team1command).commander;
        let p = toGlicko2Scale(t1CmdStats);
        let newP = updateRating(p, [{ opponentMu: t2OpponentGlicko.mu, opponentPhi: t2OpponentGlicko.phi, score: actualOutcome }]);
        Object.assign(t1CmdStats, toOriginalScale(newP));
        
        // Update T1 Thugs
        for (const thug of teamOneThugs.filter(t => t !== '')) {
            const ts = getGlickoStats(thug).thug;
            p = toGlicko2Scale(ts);
            newP = updateRating(p, [{ opponentMu: t2OpponentGlicko.mu, opponentPhi: t2OpponentGlicko.phi, score: actualOutcome }]);
            Object.assign(ts, toOriginalScale(newP));
        }

        // Update T2 Commander
        const t2CmdStats = getGlickoStats(team2command).commander;
        p = toGlicko2Scale(t2CmdStats);
        // T2 score is 1 - actualOutcome
        newP = updateRating(p, [{ opponentMu: t1OpponentGlicko.mu, opponentPhi: t1OpponentGlicko.phi, score: 1 - actualOutcome }]);
        Object.assign(t2CmdStats, toOriginalScale(newP));

        // Update T2 Thugs
        for (const thug of teamTwoThugs.filter(t => t !== '')) {
            const ts = getGlickoStats(thug).thug;
            p = toGlicko2Scale(ts);
            newP = updateRating(p, [{ opponentMu: t1OpponentGlicko.mu, opponentPhi: t1OpponentGlicko.phi, score: 1 - actualOutcome }]);
            Object.assign(ts, toOriginalScale(newP));
        }

        count++;
    }

    console.log(`
Results after ${count} games:`);
    console.log(`Elo Accuracy: ${(eloCorrect / count * 100).toFixed(2)}%`);
    console.log(`Glicko Accuracy: ${(glickoCorrect / count * 100).toFixed(2)}%`);
    console.log(`Elo Brier Score (Lower is better): ${(eloBrierSum / count).toFixed(4)}`);
    console.log(`Glicko Brier Score (Lower is better): ${(glickoBrierSum / count).toFixed(4)}`);
}

if (require.main === module) {
    main().catch(console.error);
}