import { games } from '../data/games';
const kFactor = 50;
const commanderInfluenceFactor = 1;
const factionAdjustments = {
    'ISDF': {
        'Scion': 0.5215,
    },
    'Hadean': {
        'Scion': 0.5625,
        'ISDF': 0.5689,
    }
};
function getFactionAdjustment(faction1, faction2) {
    if (faction1 === faction2) {
        return [1, 1];
    }
    if (factionAdjustments[faction1] && factionAdjustments[faction1][faction2]) {
        const team1Adj = factionAdjustments[faction1][faction2];
        return [team1Adj, 1 - team1Adj];
    }
    if (factionAdjustments[faction2] && factionAdjustments[faction2][faction1]) {
        const team2Adj = factionAdjustments[faction2][faction1];
        return [1 - team2Adj, team2Adj];
    }
    // Should not happen with the provided table
    return [1, 1];
}
const playerElos = new Map();
function readElos(elosData, eloType) {
    const elos = elosData;
    for (const player in elos) {
        if (!playerElos.has(player)) {
            playerElos.set(player, { commanderElo: 1500, commanderWins: 0, commanderLosses: 0, thugElo: 1500, thugWins: 0, thugLosses: 0 });
        }
        const playerElo = playerElos.get(player);
        if (eloType === 'commander') {
            playerElo.commanderElo = elos[player];
            playerElo.commanderWins = 0;
            playerElo.commanderLosses = 0;
        }
        else {
            playerElo.thugElo = elos[player];
            playerElo.thugWins = 0;
            playerElo.thugLosses = 0;
        }
    }
}
import { elos as initialCommanderElos } from '../data/commander_elos.js';
import { elos as initialThugElos } from '../data/thug_elos.js';
readElos(initialCommanderElos, 'commander');
readElos(initialThugElos, 'thug');
function getPlayerElo(playerName) {
    if (!playerName) {
        // Return a dummy object for empty player names, but don't add it to the map
        return { commanderElo: 1500, commanderWins: 0, commanderLosses: 0, thugElo: 1500, thugWins: 0, thugLosses: 0 };
    }
    if (!playerElos.has(playerName)) {
        playerElos.set(playerName, { commanderElo: 1500, commanderWins: 0, commanderLosses: 0, thugElo: 1500, thugWins: 0, thugLosses: 0 });
    }
    return playerElos.get(playerName);
}
function calculateTeamStrength(commander, thugs, faction1, faction2, isTeam1) {
    const commanderElo = getPlayerElo(commander).commanderElo;
    let avgThugElo = 0;
    if (thugs.length > 0) {
        const validThugs = thugs.filter(thug => thug !== '');
        if (validThugs.length > 0) {
            avgThugElo = validThugs.reduce((sum, thug) => sum + getPlayerElo(thug).thugElo, 0) / validThugs.length;
        }
    }
    const [adj1, adj2] = getFactionAdjustment(faction1, faction2);
    const factionAdjustment = isTeam1 ? adj1 : adj2;
    return (commanderElo * commanderInfluenceFactor + avgThugElo) * factionAdjustment;
}
function updateElos(team1Commander, team1Thugs, team2Commander, team2Thugs, actualOutcome, expectedOutcome) {
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
    }
    else { // Team 2 wins
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
for (const game of games) {
    const { team1command, team2command, team1faction, team2faction, teamOneThugs, teamTwoThugs, winningTeamId } = game;
    const team1Strength = calculateTeamStrength(team1command, teamOneThugs, team1faction, team2faction, true);
    const team2Strength = calculateTeamStrength(team2command, teamTwoThugs, team1faction, team2faction, false);
    const expectedOutcome = 1 / (1 + Math.pow(10, (team2Strength - team1Strength) / 400));
    const actualOutcome = winningTeamId === 1 ? 1 : 0;
    updateElos(team1command, teamOneThugs, team2command, teamTwoThugs, actualOutcome, expectedOutcome);
}
import admin from 'firebase-admin';
const { credential } = admin;
admin.initializeApp({
    credential: credential.applicationDefault(),
    databaseURL: 'https://elo-bz2.firebaseio.com',
    projectId: 'elo-bz2'
});
const db = admin.firestore();
async function writeElosToFirestore() {
    const commanderElos = {};
    const thugElos = {};
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
writeElosToFirestore();
