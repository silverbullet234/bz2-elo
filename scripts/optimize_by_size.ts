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

function calculateStrength(commanderElo: number, thugsElos: number[], factor: number): number {
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

// --- Simulation by Team Size ---

function runSimulationForSize(games: Game[], targetTeamSize: number, influenceFactor: number): number {
    // Filter games by team size (count includes commander)
    // We assume balanced games mostly, so team1 size is sufficient proxy
    const sizeGames = games.filter(g => (g.teamOneThugs.filter(t=>t).length + 1) === targetTeamSize);

    if (sizeGames.length < 10) return -1; // Not enough data

    // Reset ELOs for every run to ensure isolation
    // Wait, we can't reset ELOs per size bucket because player skill is built across ALL games.
    // We must replay ALL games to build ELOs, but only MEASURE error on the target size.
    
    const playerElos = new Map<string, PlayerElos>();
    const getElo = (name: string) => {
        if (!playerElos.has(name)) {
            playerElos.set(name, { commanderElo: 1500, commanderWins: 0, commanderLosses: 0, thugElo: 1500, thugWins: 0, thugLosses: 0 });
        }
        return playerElos.get(name)!;
    };

    let totalLogLoss = 0;
    let count = 0;

    for (const game of games) {
        const { team1command, team2command, team1faction, team2faction, teamOneThugs, teamTwoThugs, winningTeamId } = game;
        
        const currentSize = teamOneThugs.filter(t=>t).length + 1;
        
        const t1Cmd = getElo(team1command);
        const t2Cmd = getElo(team2command);
        const t1ThugElos = teamOneThugs.filter(t => t).map(t => getElo(t).thugElo);
        const t2ThugElos = teamTwoThugs.filter(t => t).map(t => getElo(t).thugElo);

        const t1Strength = calculateStrength(t1Cmd.commanderElo, t1ThugElos, influenceFactor);
        const t2Strength = calculateStrength(t2Cmd.commanderElo, t2ThugElos, influenceFactor);

        const expectedOutcome = calculateExpectedOutcome(t1Strength, t2Strength, team1faction, team2faction);
        
        // Update ELOs (always do this to keep history valid)
        const actualOutcome = winningTeamId === 1 ? 1 : 0;
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

        // Only count error if this is a game of the target size
        if (currentSize === targetTeamSize) {
            const safePrediction = Math.max(0.0001, Math.min(0.9999, expectedOutcome));
            const logLoss = -(actualOutcome * Math.log(safePrediction) + (1 - actualOutcome) * Math.log(1 - safePrediction));
            totalLogLoss += logLoss;
            count++;
        }
    }

    return count > 0 ? totalLogLoss / count : -1;
}

// --- Main ---

const rawData = fs.readFileSync('../data/games.ts', 'utf-8');
const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
const games: Game[] = JSON.parse(gamesJson);

const teamSizes = [2, 3, 4, 5, 6]; // 2v2 up to 6v6

console.log(`Analyzing Optimal Commander Influence by Team Size...`);
console.log(`(Note: Team Size 2 means 1 Commander + 1 Thug vs same)`);

for (const size of teamSizes) {
    let minError = Infinity;
    let bestFactor = -1;
    let gameCount = 0;

    // Quick pass to count games
    gameCount = games.filter(g => (g.teamOneThugs.filter(t=>t).length + 1) === size).length;
    
    if (gameCount < 20) {
        console.log(`\nTeam Size ${size}: Skipped (Only ${gameCount} games)`);
        continue;
    }

    // Optimization Loop
    for (let factor = 0.0; factor <= 6.0; factor += 0.5) {
        const error = runSimulationForSize(games, size, factor);
        if (error !== -1 && error < minError) {
            minError = error;
            bestFactor = factor;
        }
    }

    console.log(`\nTeam Size ${size} (${gameCount} games):`);
    console.log(`   Best Factor: ${bestFactor.toFixed(1)}`);
    console.log(`   Log Loss: ${minError.toFixed(5)}`);
}
