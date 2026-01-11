import * as fs from 'fs';
import * as path from 'path';
import { Game } from './game_interface';
import admin from 'firebase-admin';

interface PlayerElos {
  commanderElo: number;
  commanderWins: number;
  commanderLosses: number;
  thugElo: number;
  thugWins: number;
  thugLosses: number;
}

const kFactor = 80;
const commanderInfluenceFactor = 0.5;

interface FactionAdjustments {
  [faction: string]: {
    [faction: string]: number;
  };
}

const factionWinrates: FactionAdjustments = {
  'ISDF': {
    'Scion': 0.5215,
  },
  'Hadean': {
    'Scion': 0.5625,
    'ISDF': 0.5689,
  }
};

function getFactionWinrate(faction1: string, faction2: string): number {
    if (faction1 === faction2) {
        return 0.5;
    }
    if (factionWinrates[faction1] && factionWinrates[faction1][faction2]) {
        return factionWinrates[faction1][faction2];
    }
    if (factionWinrates[faction2] && factionWinrates[faction2][faction1]) {
        return 1 - factionWinrates[faction2][faction1];
    }
    return 0.5;
}

export const playerElos = new Map<string, PlayerElos>();

function readElos(filePath: string, eloType: 'commander' | 'thug') {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const startIndex = fileContent.indexOf('{');
    const endIndex = fileContent.lastIndexOf('}');
    const jsonString = fileContent.substring(startIndex, endIndex + 1).replace(/,\s*}/g, '}');
    const elos = JSON.parse(jsonString);
    for (const player in elos) {
        if (!playerElos.has(player)) {
            playerElos.set(player, { commanderElo: 1500, commanderWins: 0, commanderLosses: 0, thugElo: 1500, thugWins: 0, thugLosses: 0 });
        }
        const playerElo = playerElos.get(player)!;
        if (eloType === 'commander') {
            playerElo.commanderElo = elos[player];
            playerElo.commanderWins = 0;
            playerElo.commanderLosses = 0;
        } else {
            playerElo.thugElo = elos[player];
            playerElo.thugWins = 0;
            playerElo.thugLosses = 0;
        }
    }
}

export function getPlayerElo(playerName: string): PlayerElos {
  if (!playerName) {
    // Return a dummy object for empty player names, but don't add it to the map
    return { commanderElo: 1500, commanderWins: 0, commanderLosses: 0, thugElo: 1500, thugWins: 0, thugLosses: 0 };
  }
  if (!playerElos.has(playerName)) {
    playerElos.set(playerName, { commanderElo: 1500, commanderWins: 0, commanderLosses: 0, thugElo: 1500, thugWins: 0, thugLosses: 0 });
  }
  return playerElos.get(playerName)!;
}

export function calculateTeamStrength(commander: string, thugs: string[]): number {
  const commanderElo = getPlayerElo(commander).commanderElo;
  
  let avgThugElo = 0;
  if (thugs.length > 0) {
    const validThugs = thugs.filter(thug => thug !== '');
    if (validThugs.length > 0) {
      avgThugElo = validThugs.reduce((sum, thug) => sum + getPlayerElo(thug).thugElo, 0) / validThugs.length;
    }
  }

  if (avgThugElo > 0) {
    return (commanderElo * commanderInfluenceFactor + avgThugElo * (1 - commanderInfluenceFactor));
  } else {
    return commanderElo;
  }
}

function updateElos(
    team1Commander: string,
    team1Thugs: string[],
    team2Commander: string,
    team2Thugs: string[],
    actualOutcome: number,
    expectedOutcome: number
  ) {
  
    if (actualOutcome === 1) { // Team 1 wins
      const eloChange = kFactor * (1 - expectedOutcome);
      const team1CommanderElo = getPlayerElo(team1Commander);
      team1CommanderElo.commanderElo += eloChange;
      team1CommanderElo.commanderWins++;
      for (const thug of team1Thugs.filter(thug => thug !== '')) {
        const thugElo = getPlayerElo(thug);
        thugElo.thugElo += eloChange;
        thugElo.thugWins++;
      }
  
      const team2CommanderElo = getPlayerElo(team2Commander);
      team2CommanderElo.commanderElo -= eloChange;
      team2CommanderElo.commanderLosses++;
      for (const thug of team2Thugs.filter(thug => thug !== '')) {
        const thugElo = getPlayerElo(thug);
        thugElo.thugElo -= eloChange;
        thugElo.thugLosses++;
      }
    } else { // Team 2 wins
      const eloChange = kFactor * expectedOutcome;
      const team1CommanderElo = getPlayerElo(team1Commander);
      team1CommanderElo.commanderElo -= eloChange;
      team1CommanderElo.commanderLosses++;
      for (const thug of team1Thugs.filter(thug => thug !== '')) {
        const thugElo = getPlayerElo(thug);
        thugElo.thugElo -= eloChange;
        thugElo.thugLosses++;
      }
  
      const team2CommanderElo = getPlayerElo(team2Commander);
      team2CommanderElo.commanderElo += eloChange;
      team2CommanderElo.commanderWins++;
      for (const thug of team2Thugs.filter(thug => thug !== '')) {
        const thugElo = getPlayerElo(thug);
        thugElo.thugElo += eloChange;
        thugElo.thugWins++;
      }
    }
}

async function writeElosToFirestore(db: admin.firestore.Firestore) {
    const commanderElos: { [key: string]: { elo: number, wins: number, losses: number } } = {};
    const thugElos: { [key: string]: { elo: number, wins: number, losses: number } } = {};

    for (const [player, elo] of playerElos.entries()) {
        if (player) {
            commanderElos[player] = {
                elo: elo.commanderElo,
                wins: elo.commanderWins,
                losses: elo.commanderLosses
            };
            thugElos[player] = {
                elo: elo.thugElo,
                wins: elo.thugWins,
                losses: elo.thugLosses
            };
        }
    }

    const elosCollection = db.collection('elos');
    await elosCollection.doc('commanders').set(commanderElos);
    await elosCollection.doc('thugs').set(thugElos);

    console.log('Successfully wrote ELOs to Firestore.');
}

export function calculateExpectedOutcome(
    team1command: string,
    team1Thugs: string[],
    team1faction: string,
    team2command: string,
    team2Thugs: string[],
    team2faction: string
): number {
    const team1Strength = calculateTeamStrength(team1command, team1Thugs);
    const team2Strength = calculateTeamStrength(team2command, team2Thugs);

    const expectedOutcome = 1 / (1 + Math.pow(10, (team2Strength - team1Strength) / 400));
    const factionWinrate = getFactionWinrate(team1faction, team2faction);

    // Multiplicatively apply faction winrate and normalize
    const numerator = expectedOutcome * factionWinrate;
    const denominator = numerator + (1 - expectedOutcome) * (1 - factionWinrate);
    const finalExpectedOutcome = numerator / denominator;

    return finalExpectedOutcome;
}

async function main() {
    readElos(path.join(__dirname, '../data/commander_elos.js'), 'commander');
    readElos(path.join(__dirname, '../data/thug_elos.js'), 'thug');

    const rawData = fs.readFileSync(path.join(__dirname, '../data/games.ts'), 'utf-8');
    const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
    const games: Game[] = JSON.parse(gamesJson);

    for (const game of games) {
        const { team1command, team2command, team1faction, team2faction, teamOneThugs, teamTwoThugs, winningTeamId } = game;

        const finalExpectedOutcome = calculateExpectedOutcome(team1command, teamOneThugs, team1faction, team2command, teamTwoThugs, team2faction);

        const actualOutcome = winningTeamId === 1 ? 1 : 0;
        updateElos(team1command, teamOneThugs, team2command, teamTwoThugs, actualOutcome, finalExpectedOutcome);
    }
    
    const { credential } = admin;
    admin.initializeApp({
        credential: credential.applicationDefault(),
        databaseURL: 'https://elo-bz2.firebaseio.com',
        projectId: 'elo-bz2'
    });

    const db = admin.firestore();
    await writeElosToFirestore(db);
}


if (require.main === module) {
    main().catch(console.error);
}