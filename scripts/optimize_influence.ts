import * as fs from 'fs';
import { Game } from './game_interface';

// --- Duplicate Core Logic to allow dynamic parameters ---

interface PlayerElos {
  commanderElo: number;
  commanderWins: number;
  commanderLosses: number;
  thugElo: number;
  thugWins: number;
  thugLosses: number;
}

const kFactor = 50;

// Faction winrates (hardcoded for simulation consistency)
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

function calculateTeamStrength(commanderElo: number, thugsElos: number[], influenceFactor: number): number {
  let avgThugElo = 0;
  if (thugsElos.length > 0) {
    avgThugElo = thugsElos.reduce((sum, elo) => sum + elo, 0) / thugsElos.length;
  }

  if (avgThugElo > 0) {
    return (commanderElo * influenceFactor + avgThugElo) / (influenceFactor + 1);
  } else {
    return commanderElo;
  }
}

function calculateExpectedOutcome(
    team1Strength: number, 
    team2Strength: number, 
    team1faction: string, 
    team2faction: string
): number {
    const expectedOutcome = 1 / (1 + Math.pow(10, (team2Strength - team1Strength) / 400));
    const factionWinrate = getFactionWinrate(team1faction, team2faction);

    const numerator = expectedOutcome * factionWinrate;
    const denominator = numerator + (1 - expectedOutcome) * (1 - factionWinrate);
    return numerator / denominator;
}

// --- Simulation Logic ---

function runSimulation(games: Game[], influenceFactor: number): number {
    // Reset ELOs for this run
    const playerElos = new Map<string, PlayerElos>();
    
    const getElo = (name: string) => {
        if (!playerElos.has(name)) {
            playerElos.set(name, { commanderElo: 1500, commanderWins: 0, commanderLosses: 0, thugElo: 1500, thugWins: 0, thugLosses: 0 });
        }
        return playerElos.get(name)!;
    };

    let totalLogLoss = 0;

    for (const game of games) {
        const { team1command, team2command, team1faction, team2faction, teamOneThugs, teamTwoThugs, winningTeamId } = game;
        
        // Get current ELOs
        const t1Cmd = getElo(team1command);
        const t2Cmd = getElo(team2command);
        const t1ThugElos = teamOneThugs.filter(t => t).map(t => getElo(t).thugElo);
        const t2ThugElos = teamTwoThugs.filter(t => t).map(t => getElo(t).thugElo);

        // Calculate Strength with dynamic influence factor
        const t1Strength = calculateTeamStrength(t1Cmd.commanderElo, t1ThugElos, influenceFactor);
        const t2Strength = calculateTeamStrength(t2Cmd.commanderElo, t2ThugElos, influenceFactor);

        // Prediction
        const expectedOutcome = calculateExpectedOutcome(t1Strength, t2Strength, team1faction, team2faction);
        
        // Error Calculation (Log Loss)
        // Clip to avoid log(0)
        const safePrediction = Math.max(0.0001, Math.min(0.9999, expectedOutcome));
        const actualOutcome = winningTeamId === 1 ? 1 : 0;
        
        // Log Loss: - (y * log(p) + (1-y) * log(1-p))
        const logLoss = -(actualOutcome * Math.log(safePrediction) + (1 - actualOutcome) * Math.log(1 - safePrediction));
        totalLogLoss += logLoss;

        // Update ELOs (Standard ELO update)
        const eloChange = kFactor * (actualOutcome - expectedOutcome); // Using simplified update for simulation
        
        // Note: Ideally we replicate the exact update logic from elo_calculator.ts
        // But for optimization, the standard update is close enough if kFactor is same.
        // Let's replicate exact logic to be safe.
        
        if (actualOutcome === 1) {
             t1Cmd.commanderElo += kFactor * (1 - expectedOutcome);
             teamOneThugs.filter(t => t).forEach(t => getElo(t).thugElo += kFactor * (1 - expectedOutcome));
             
             t2Cmd.commanderElo -= kFactor * (1 - expectedOutcome);
             teamTwoThugs.filter(t => t).forEach(t => getElo(t).thugElo -= kFactor * (1 - expectedOutcome));
        } else {
             t1Cmd.commanderElo -= kFactor * expectedOutcome;
             teamOneThugs.filter(t => t).forEach(t => getElo(t).thugElo -= kFactor * expectedOutcome);
             
             t2Cmd.commanderElo += kFactor * expectedOutcome;
             teamTwoThugs.filter(t => t).forEach(t => getElo(t).thugElo += kFactor * expectedOutcome);
        }
    }

    return totalLogLoss / games.length; // Average Log Loss
}

// --- Main Execution ---

const rawData = fs.readFileSync('../data/games.ts', 'utf-8');
const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
const games: Game[] = JSON.parse(gamesJson);

console.log(`Running optimization on ${games.length} games...`);
console.log('Testing Commander Influence Factors from 0.0 to 5.0...');

let bestFactor = -1;
let minError = Infinity;

for (let factor = 0.0; factor <= 5.0; factor += 0.1) {
    const error = runSimulation(games, factor);
    // console.log(`Factor: ${factor.toFixed(1)}, Log Loss: ${error.toFixed(5)}`);
    
    if (error < minError) {
        minError = error;
        bestFactor = factor;
    }
}

console.log(`\nOptimization Complete.`);
console.log(`Best Commander Influence Factor: ${bestFactor.toFixed(1)}`);
console.log(`Minimum Log Loss: ${minError.toFixed(5)}`);
