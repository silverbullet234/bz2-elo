import * as fs from 'fs';
import { Game } from './game_interface';

// --- Configuration ---
const COMMANDER_INFLUENCE_FACTOR = 2.6; // Optimized value
const K_FACTOR = 50;

// --- Interfaces ---
interface PlayerElos {
    commanderElo: number;
    thugElo: number;
}

interface PredictionResult {
    gameIndex: number;
    predictedProbability: number;
    actualOutcome: number; // 1 for Team 1 win, 0 for Team 2 win
    isCorrect: boolean;
    team1Name: string; // Commander name for context
    team2Name: string;
}

// --- Faction Data ---
const factionWinrates: { [key: string]: { [key: string]: number } } = {
    'ISDF': { 'Scion': 0.5215 },
    'Hadean': { 'Scion': 0.5625, 'ISDF': 0.5689 }
};

function getFactionWinrate(faction1: string, faction2: string): number {
    if (faction1 === faction2) return 0.5;
    if (factionWinrates[faction1] && factionWinrates[faction1][faction2]) return factionWinrates[faction1][faction2];
    if (factionWinrates[faction2] && factionWinrates[faction2][faction1]) return 1 - factionWinrates[faction2][faction1];
    return 0.5;
}

// --- ELO Logic ---
const playerElos = new Map<string, PlayerElos>();

function getElo(name: string): PlayerElos {
    if (!playerElos.has(name)) {
        playerElos.set(name, { commanderElo: 1500, thugElo: 1500 });
    }
    return playerElos.get(name)!;
}

function calculateTeamStrength(commander: string, thugs: string[]): number {
    const cmdElo = getElo(commander).commanderElo;
    
    // Filter empty strings if any
    const activeThugs = thugs.filter(t => t && t.length > 0);
    
    let avgThugElo = 0;
    if (activeThugs.length > 0) {
        avgThugElo = activeThugs.reduce((sum, t) => sum + getElo(t).thugElo, 0) / activeThugs.length;
    }

    if (avgThugElo > 0) {
        // Weighted average based on influence factor
        return (cmdElo * COMMANDER_INFLUENCE_FACTOR + avgThugElo) / (COMMANDER_INFLUENCE_FACTOR + 1);
    } else {
        return cmdElo;
    }
}

function calculateWinProbability(
    team1Strength: number, 
    team2Strength: number, 
    team1Faction: string, 
    team2Faction: string
): number {
    const eloProb = 1 / (1 + Math.pow(10, (team2Strength - team1Strength) / 400));
    const factionProb = getFactionWinrate(team1Faction, team2Faction);

    // Combine probabilities (Bayesian-ish update of odds, or weighted average)
    // Using the multiplicative odds approach we settled on:
    // P_final = (P_elo * P_faction) / (P_elo * P_faction + (1-P_elo)*(1-P_faction))
    
    const numerator = eloProb * factionProb;
    const denominator = numerator + (1 - eloProb) * (1 - factionProb);
    
    return numerator / denominator;
}

function updateElos(
    t1Cmd: string, t1Thugs: string[],
    t2Cmd: string, t2Thugs: string[],
    actualOutcome: number,
    predictedProb: number
) {
    const eloChange = K_FACTOR * (actualOutcome - predictedProb);

    // Update Team 1
    getElo(t1Cmd).commanderElo += eloChange;
    t1Thugs.forEach(t => { if(t) getElo(t).thugElo += eloChange });

    // Update Team 2
    getElo(t2Cmd).commanderElo -= eloChange;
    t2Thugs.forEach(t => { if(t) getElo(t).thugElo -= eloChange });
}

// --- Main Script ---

function main() {
    // 1. Load Data
    const rawData = fs.readFileSync('../data/games.ts', 'utf-8');
    // Extract JSON array from TS file
    const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
    const games: Game[] = JSON.parse(gamesJson);

    console.log(`Loaded ${games.length} games.`);
    console.log(`Using Commander Influence Factor: ${COMMANDER_INFLUENCE_FACTOR}`);

    const results: PredictionResult[] = [];
    let correctPredictions = 0;
    let totalLogLoss = 0;

    // 2. Iterate Games (Walk-Forward Validation)
    games.forEach((game, index) => {
        const { team1command, team2command, team1faction, team2faction, teamOneThugs, teamTwoThugs, winningTeamId } = game;
        
        // a. Calculate Strength BEFORE the game
        const t1Str = calculateTeamStrength(team1command, teamOneThugs);
        const t2Str = calculateTeamStrength(team2command, teamTwoThugs);

        // b. Predict
        const probTeam1Wins = calculateWinProbability(t1Str, t2Str, team1faction, team2faction);

        // c. Check Outcome
        const actualOutcome = winningTeamId === 1 ? 1 : 0;
        
        // A prediction is "correct" if probability > 0.5 matches outcome
        const isCorrect = (probTeam1Wins > 0.5 && actualOutcome === 1) || (probTeam1Wins < 0.5 && actualOutcome === 0);
        if (isCorrect) correctPredictions++;

        // d. Metrics
        // Clamp for Log Loss
        const safeProb = Math.max(0.0001, Math.min(0.9999, probTeam1Wins));
        totalLogLoss += -(actualOutcome * Math.log(safeProb) + (1 - actualOutcome) * Math.log(1 - safeProb));

        results.push({
            gameIndex: index,
            predictedProbability: probTeam1Wins,
            actualOutcome,
            isCorrect,
            team1Name: team1command,
            team2Name: team2command
        });

        // e. Update ELOs for next game
        updateElos(team1command, teamOneThugs, team2command, teamTwoThugs, actualOutcome, probTeam1Wins);
    });

    // 3. Report Results
    const accuracy = (correctPredictions / games.length) * 100;
    const avgLogLoss = totalLogLoss / games.length;

    console.log(`\n--- Performance Summary ---`);
    console.log(`Total Games: ${games.length}`);
    console.log(`Accuracy: ${accuracy.toFixed(2)}% (Correctly predicted winner)`);
    console.log(`Log Loss: ${avgLogLoss.toFixed(5)}`);
    console.log(`---------------------------`);

    // 4. Calibration Check (Bucket Predictions)
    console.log(`\nCalibration (Expected vs Actual Win Rate):`);
    const buckets = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    for (let i = 0; i < buckets.length - 1; i++) {
        const low = buckets[i];
        const high = buckets[i+1];
        const gamesInBucket = results.filter(r => r.predictedProbability >= low && r.predictedProbability < high);
        
        if (gamesInBucket.length > 0) {
            const wins = gamesInBucket.filter(r => r.actualOutcome === 1).length;
            const actualWinRate = wins / gamesInBucket.length;
            console.log(`[${low.toFixed(1)} - ${high.toFixed(1)}]: ${gamesInBucket.length} games. Pred Avg: ${((low+high)/2).toFixed(2)} | Actual: ${actualWinRate.toFixed(2)}`);
        }
    }
}

main();
