
import * as fs from 'fs';
import * as path from 'path';
import { Game } from './game_interface';
import * as admin from 'firebase-admin';
import { rating, rate, ordinal, Rating } from 'openskill';

// Initialize ratings maps
// We keep separate ratings for when a player is a Commander vs a Thug
const commanderRatings = new Map<string, Rating>();
const thugRatings = new Map<string, Rating>();

// Track W/L records
const commanderRecords = new Map<string, { wins: number, losses: number }>();
const thugRecords = new Map<string, { wins: number, losses: number }>();

function getRating(playerName: string, role: 'commander' | 'thug'): Rating {
    const map = role === 'commander' ? commanderRatings : thugRatings;
    if (!map.has(playerName)) {
        // Default OpenSkill rating (mu=25, sigma=25/3)
        map.set(playerName, rating());
    }
    return map.get(playerName)!;
}

function updateRecord(playerName: string, role: 'commander' | 'thug', result: 'win' | 'loss') {
    const map = role === 'commander' ? commanderRecords : thugRecords;
    if (!map.has(playerName)) {
        map.set(playerName, { wins: 0, losses: 0 });
    }
    const record = map.get(playerName)!;
    if (result === 'win') {
        record.wins++;
    } else {
        record.losses++;
    }
}

async function writeOpenSkillToFirestore(db: admin.firestore.Firestore) {
    const commanderOutput: { [key: string]: { mu: number, sigma: number, ordinal: number, wins: number, losses: number } } = {};
    const thugOutput: { [key: string]: { mu: number, sigma: number, ordinal: number, wins: number, losses: number } } = {};

    // Process Commanders
    for (const [player, rat] of commanderRatings.entries()) {
        const record = commanderRecords.get(player) || { wins: 0, losses: 0 };
        commanderOutput[player] = {
            mu: rat.mu,
            sigma: rat.sigma,
            ordinal: ordinal(rat),
            wins: record.wins,
            losses: record.losses
        };
    }

    // Process Thugs
    for (const [player, rat] of thugRatings.entries()) {
        const record = thugRecords.get(player) || { wins: 0, losses: 0 };
        thugOutput[player] = {
            mu: rat.mu,
            sigma: rat.sigma,
            ordinal: ordinal(rat),
            wins: record.wins,
            losses: record.losses
        };
    }

    const collection = db.collection('openskill');
    await collection.doc('commanders').set(commanderOutput);
    await collection.doc('thugs').set(thugOutput);

    console.log('Successfully wrote OpenSkill ratings to Firestore.');
}

async function main() {
    // 1. Load Games
    const rawData = fs.readFileSync(path.join(__dirname, '../data/games.ts'), 'utf-8');
    // Basic parsing of the TS file to get the JSON array
    const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
    const games: Game[] = JSON.parse(gamesJson);

    console.log(`Processing ${games.length} games...`);

    // 2. Iterate and Calculate
    for (const game of games) {
        const { team1command, team2command, teamOneThugs, teamTwoThugs, winningTeamId } = game;

        // Construct teams for OpenSkill
        // Team 1
        const t1CommanderRating = getRating(team1command, 'commander');
        const t1ThugRatings = teamOneThugs.filter(t => t).map(t => getRating(t, 'thug'));
        
        // Team 2
        const t2CommanderRating = getRating(team2command, 'commander');
        const t2ThugRatings = teamTwoThugs.filter(t => t).map(t => getRating(t, 'thug'));

        const team1 = [t1CommanderRating, ...t1ThugRatings];
        const team2 = [t2CommanderRating, ...t2ThugRatings];

        // Ranks: Lower is better. 1st place = 1, 2nd place = 2
        // If Team 1 wins (winningTeamId === 1), ranks are [1, 2]
        // If Team 2 wins (winningTeamId === 2), ranks are [2, 1]
        const ranks = winningTeamId === 1 ? [1, 2] : [2, 1];

        // Calculate new ratings
        // rate returns [[newRatingT1P1, newRatingT1P2...], [newRatingT2P1...]]
        const newRatings = rate([team1, team2], { rank: ranks });

        // Update Maps
        const newTeam1Ratings = newRatings[0];
        const newTeam2Ratings = newRatings[1];

        // Update Team 1
        commanderRatings.set(team1command, newTeam1Ratings[0]);
        updateRecord(team1command, 'commander', winningTeamId === 1 ? 'win' : 'loss');
        
        let t1ThugIndex = 1;
        teamOneThugs.filter(t => t).forEach(t => {
            thugRatings.set(t, newTeam1Ratings[t1ThugIndex]);
            updateRecord(t, 'thug', winningTeamId === 1 ? 'win' : 'loss');
            t1ThugIndex++;
        });

        // Update Team 2
        commanderRatings.set(team2command, newTeam2Ratings[0]);
        updateRecord(team2command, 'commander', winningTeamId === 2 ? 'win' : 'loss');

        let t2ThugIndex = 1;
        teamTwoThugs.filter(t => t).forEach(t => {
            thugRatings.set(t, newTeam2Ratings[t2ThugIndex]);
            updateRecord(t, 'thug', winningTeamId === 2 ? 'win' : 'loss');
            t2ThugIndex++;
        });
    }

    // 3. Save to Firestore
    const { credential } = admin;
    try {
        admin.initializeApp({
            credential: credential.applicationDefault(),
            databaseURL: 'https://elo-bz2.firebaseio.com',
            projectId: 'elo-bz2'
        });
    } catch (e) {
        // App might already be initialized if running in certain contexts, though unlikely here
        if (!admin.apps.length) {
            console.error("Firebase init failed", e);
            process.exit(1);
        }
    }

    const db = admin.firestore();
    await writeOpenSkillToFirestore(db);
}

if (require.main === module) {
    main().catch(console.error);
}
