import * as fs from 'fs';
import * as path from 'path';
import { Game } from './game_interface';

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

// --- Raw Faction Winrates ---
const RAW_WINRATES: any = {
  'ISDF': { 'Scion': 0.5215 },
  'Hadean': { 'Scion': 0.5625, 'ISDF': 0.5689 }
};

function getAdjustedFactionWinrate(faction1: string, faction2: string, weight: number): number {
    if (faction1 === faction2) return 0.5;
    
    let raw = 0.5;
    if (RAW_WINRATES[faction1] && RAW_WINRATES[faction1][faction2]) {
        raw = RAW_WINRATES[faction1][faction2];
    } else if (RAW_WINRATES[faction2] && RAW_WINRATES[faction2][faction1]) {
        raw = 1 - RAW_WINRATES[faction2][faction1];
    }

    // Blend: 0.5 is neutral. 
    // weight 0 -> 0.5
    // weight 1 -> raw
    return 0.5 + (raw - 0.5) * weight;
}

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
    influence: number,
    factionWeight: number
): number {
    const t1Str = calculateEloTeamStrength(t1Cmd, t1Thugs, influence);
    const t2Str = calculateEloTeamStrength(t2Cmd, t2Thugs, influence);
    
    const expected = 1 / (1 + Math.pow(10, (t2Str - t1Str) / 400));
    const factionWR = getAdjustedFactionWinrate(t1Fac, t2Fac, factionWeight);
    
    // Multiplicative combine
    const num = expected * factionWR;
    const den = num + (1 - expected) * (1 - factionWR);
    return num / den;
}

function calculateBrierScore(prob: number, actual: number): number {
    return Math.pow(prob - actual, 2);
}

function runSimulation(games: Game[], factionWeight: number) {
    playerElosMap.clear();

    const influence = 0.5; // Locked per user request
    const kFactor = 80;    // Locked per user request
    let totalCorrect = 0;
    let totalCount = 0;
    let brierSum = 0;

    for (const game of games) {
        const { team1command, team2command, team1faction, team2faction, teamOneThugs, teamTwoThugs, winningTeamId } = game;
        const actualOutcome = winningTeamId === 1 ? 1 : 0;

        const team1Size = 1 + teamOneThugs.filter(t => t !== '').length;
        const team2Size = 1 + teamTwoThugs.filter(t => t !== '').length;
        const isEven = team1Size === team2Size;

        const eloExp = calculateEloExpectedOutcome(team1command, teamOneThugs, team1faction, team2command, teamTwoThugs, team2faction, influence, factionWeight);

        if (isEven) {
            const isCorrect = Math.round(eloExp) === actualOutcome ? 1 : 0;
            totalCorrect += isCorrect;
            brierSum += calculateBrierScore(eloExp, actualOutcome);
            totalCount++;
        }

        // Always Update
        const eloChange = kFactor * (actualOutcome - eloExp);
        const t1Cmd = getEloStats(team1command);
        t1Cmd.commanderElo += eloChange;
        for (const thug of teamOneThugs.filter(t => t !== '')) getEloStats(thug).thugElo += eloChange;

        const t2Cmd = getEloStats(team2command);
        t2Cmd.commanderElo -= eloChange;
        for (const thug of teamTwoThugs.filter(t => t !== '')) getEloStats(thug).thugElo -= eloChange;
    }

    return {
        accuracy: (totalCorrect / totalCount * 100).toFixed(2),
        brier: (brierSum / totalCount).toFixed(4)
    };
}

function main() {
    const gamesPath = path.join(__dirname, '../data/games.ts');
    const rawData = fs.readFileSync(gamesPath, 'utf-8');
    const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
    const games: Game[] = JSON.parse(gamesJson);

    console.log(`Optimizing Faction Adjustment Weight (0.0 to 2.0) on Even Games (Inf=0.5, K=80)...
`);
    console.log(`| Weight | Accuracy | Brier Score |
`);
    console.log(`|--------|----------|-------------|
`);

    for (let w = 0; w <= 20; w += 2) {
        const weight = w / 10;
        const res = runSimulation(games, weight);
        console.log(`|  ${weight.toFixed(1)}   |  ${res.accuracy}%  |   ${res.brier}    |
`);
    }
}

if (require.main === module) {
    main();
}
