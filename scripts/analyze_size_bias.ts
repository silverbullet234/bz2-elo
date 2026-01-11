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

function calculateBrierScore(prob: number, actual: number): number {
    return Math.pow(prob - actual, 2);
}

function runSimulation(games: Game[], influence: number) {
    playerElosMap.clear();

    let totalCorrect = 0;
    let totalCount = 0;

    // Track accuracy by team size (total players in game)
    // Map<Size, {correct, count}>
    const sizeStats = new Map<number, {correct: number, count: number}>();

    for (const game of games) {
        const { team1command, team2command, team1faction, team2faction, teamOneThugs, teamTwoThugs, winningTeamId } = game;
        const actualOutcome = winningTeamId === 1 ? 1 : 0;

        const team1Size = 1 + teamOneThugs.filter(t => t !== '').length;
        const team2Size = 1 + teamTwoThugs.filter(t => t !== '').length;
        const totalSize = team1Size + team2Size;

        // ELO Prediction
        const eloExp = calculateEloExpectedOutcome(team1command, teamOneThugs, team1faction, team2command, teamTwoThugs, team2faction, influence);
        const isCorrect = Math.round(eloExp) === actualOutcome ? 1 : 0;

        totalCorrect += isCorrect;
        totalCount++;

        if (!sizeStats.has(totalSize)) {
            sizeStats.set(totalSize, { correct: 0, count: 0 });
        }
        const s = sizeStats.get(totalSize)!;
        s.correct += isCorrect;
        s.count++;

        // Elo Update
        const kFactor = 50;
        const eloChange = kFactor * (actualOutcome - eloExp);
        
        const t1Cmd = getEloStats(team1command);
        t1Cmd.commanderElo += eloChange;
        for (const thug of teamOneThugs.filter(t => t !== '')) getEloStats(thug).thugElo += eloChange;

        const t2Cmd = getEloStats(team2command);
        t2Cmd.commanderElo -= eloChange;
        for (const thug of teamTwoThugs.filter(t => t !== '')) getEloStats(thug).thugElo -= eloChange;
    }

    return sizeStats;
}

function main() {
    const gamesPath = path.join(__dirname, '../data/games.ts');
    const rawData = fs.readFileSync(gamesPath, 'utf-8');
    const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
    const games: Game[] = JSON.parse(gamesJson);

    // Using the optimized influence from previous step
    const bestInfluence = 0.8; 

    console.log(`Analyzing Accuracy by Team Size (Influence=${bestInfluence})...
`);
    const stats = runSimulation(games, bestInfluence);

    const sortedSizes = Array.from(stats.keys()).sort((a, b) => a - b);
    
    console.log(`| Total Players | Games | Accuracy |
`);
    console.log(`|---------------|-------|----------|
`);
    
    let wAvgNum = 0;
    let wAvgDen = 0;

    for (const size of sortedSizes) {
        const data = stats.get(size)!;
        const acc = (data.correct / data.count * 100).toFixed(2);
        console.log(`|       ${size}       |  ${data.count.toString().padEnd(4)} |  ${acc}%  |
`);
        
        wAvgNum += data.correct;
        wAvgDen += data.count;
    }
    
    console.log(`
Overall Accuracy: ${(wAvgNum / wAvgDen * 100).toFixed(2)}%
`);
}

if (require.main === module) {
    main();
}
