import * as fs from 'fs';
import { Game } from './game_interface';

// --- Shared Logic ---

interface PlayerElos {
  commanderElo: number;
  commanderWins: number;
  commanderLosses: number;
  thugElo: number;
  thugWins: number;
  thugLosses: number;
}

const kFactor = 50;

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

// --- Team Strength Calculators ---

function calculateStrength_CommanderWeighted(commanderElo: number, thugsElos: number[], factor: number): number {
  let avgThugElo = 0;
  if (thugsElos.length > 0) {
    avgThugElo = thugsElos.reduce((sum, elo) => sum + elo, 0) / thugsElos.length;
  }
  if (avgThugElo > 0) {
    return (commanderElo * factor + avgThugElo) / (factor + 1);
  } else {
    return commanderElo;
  }
}

function calculateStrength_StrongestPlayerWeighted(commanderElo: number, thugsElos: number[], factor: number): number {
  const allElos = [commanderElo, ...thugsElos];
  const maxElo = Math.max(...allElos);
  
  // Remove one instance of maxElo from the "others" list
  const others = [...allElos];
  const maxIndex = others.indexOf(maxElo);
  if (maxIndex > -1) {
    others.splice(maxIndex, 1);
  }

  let avgOthers = 0;
  if (others.length > 0) {
    avgOthers = others.reduce((sum, elo) => sum + elo, 0) / others.length;
  }

  if (avgOthers > 0) {
    return (maxElo * factor + avgOthers) / (factor + 1);
  } else {
    return maxElo;
  }
}


// --- Simulation ---

type ModelType = 'COMMANDER' | 'STRONGEST_PLAYER';

function runSimulation(games: Game[], influenceFactor: number, modelType: ModelType): number {
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
        
        const t1Cmd = getElo(team1command);
        const t2Cmd = getElo(team2command);
        const t1ThugElos = teamOneThugs.filter(t => t).map(t => getElo(t).thugElo);
        const t2ThugElos = teamTwoThugs.filter(t => t).map(t => getElo(t).thugElo);

        let t1Strength = 0;
        let t2Strength = 0;

        if (modelType === 'COMMANDER') {
            t1Strength = calculateStrength_CommanderWeighted(t1Cmd.commanderElo, t1ThugElos, influenceFactor);
            t2Strength = calculateStrength_CommanderWeighted(t2Cmd.commanderElo, t2ThugElos, influenceFactor);
        } else {
            // For Strongest Player, we pool all ELOs (using Thug ELO for everyone to simulate generic "Skill")
            // Actually, in our system, players have separate Cmd/Thug ELOs. 
            // A "Strongest Player" hypothesis usually implies "Best General Gamer". 
            // Let's use the ELO relevant to the role they are currently playing to determine "Strength",
            // BUT weight the highest number more.
            
            // However, to match the user's hypothesis "Typical strongest player IS commander",
            // we should probably just look at the numerical values.
            
            t1Strength = calculateStrength_StrongestPlayerWeighted(t1Cmd.commanderElo, t1ThugElos, influenceFactor);
            t2Strength = calculateStrength_StrongestPlayerWeighted(t2Cmd.commanderElo, t2ThugElos, influenceFactor);
        }

        const expectedOutcome = calculateExpectedOutcome(t1Strength, t2Strength, team1faction, team2faction);
        
        const safePrediction = Math.max(0.0001, Math.min(0.9999, expectedOutcome));
        const actualOutcome = winningTeamId === 1 ? 1 : 0;
        const logLoss = -(actualOutcome * Math.log(safePrediction) + (1 - actualOutcome) * Math.log(1 - safePrediction));
        totalLogLoss += logLoss;

        // Update ELOs
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

    return totalLogLoss / games.length;
}

// --- Main Execution ---

const rawData = fs.readFileSync('../data/games.ts', 'utf-8');
const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
const games: Game[] = JSON.parse(gamesJson);

console.log(`Comparing Models on ${games.length} games...`);

// Test Commander Model
let minErrorCmd = Infinity;
let bestFactorCmd = -1;
for (let factor = 0.0; factor <= 5.0; factor += 0.2) {
    const error = runSimulation(games, factor, 'COMMANDER');
    if (error < minErrorCmd) { minErrorCmd = error; bestFactorCmd = factor; }
}

// Test Strongest Player Model
let minErrorStrong = Infinity;
let bestFactorStrong = -1;
for (let factor = 0.0; factor <= 5.0; factor += 0.2) {
    const error = runSimulation(games, factor, 'STRONGEST_PLAYER');
    if (error < minErrorStrong) { minErrorStrong = error; bestFactorStrong = factor; }
}

console.log(`
Results:`);
console.log(`1. Commander Weighted Model`);
console.log(`   Best Factor: ${bestFactorCmd.toFixed(1)}`);
console.log(`   Best Log Loss: ${minErrorCmd.toFixed(5)}`);

console.log(`
2. Strongest Player Weighted Model`);
console.log(`   Best Factor: ${bestFactorStrong.toFixed(1)}`);
console.log(`   Best Log Loss: ${minErrorStrong.toFixed(5)}`);

if (minErrorCmd < minErrorStrong) {
    console.log(`
Conclusion: The COMMANDER role is more predictive of victory.`);
} else {
    console.log(`
Conclusion: The STRONGEST PLAYER is more predictive of victory (regardless of role).`);
}
