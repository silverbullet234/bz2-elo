
import * as fs from 'fs';
import * as path from 'path';
import { Game } from './game_interface';
import * as admin from 'firebase-admin';
import { 
    GlickoRating, 
    Glicko2ScaleRating, 
    toGlicko2Scale, 
    toOriginalScale, 
    updateRating, 
    DEFAULT_RATING, 
    DEFAULT_RD, 
    DEFAULT_VOL 
} from './glicko_math';

// Constants
const COMMANDER_INFLUENCE = 0.5;

interface GlickoStatsWithRecord extends GlickoRating {
    wins: number;
    losses: number;
}

interface PlayerGlickoStats {
    commander: GlickoStatsWithRecord;
    thug: GlickoStatsWithRecord;
}

// Map of Player Name -> Stats
const playerStats = new Map<string, PlayerGlickoStats>();

// Faction Winrates (from elo_calculator.ts)
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

// Get or create player stats
function getPlayerStats(playerName: string): PlayerGlickoStats {
    if (!playerName) {
         return { 
            commander: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL, wins: 0, losses: 0 },
            thug: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL, wins: 0, losses: 0 }
        };
    }
    if (!playerStats.has(playerName)) {
        playerStats.set(playerName, {
            commander: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL, wins: 0, losses: 0 },
            thug: { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL, wins: 0, losses: 0 }
        });
    }
    return playerStats.get(playerName)!;
}

// Calculate faction rating bonus (in ELO points)
function getFactionBonus(myFaction: string, oppFaction: string): number {
    const winrate = getFactionWinrate(myFaction, oppFaction);
    if (winrate === 0.5) return 0;
    
    // Formula: Delta = -400 * log10(1/P - 1)
    // If P = 0.5, log10(1) = 0.
    // If P > 0.5, 1/P < 2, 1/P - 1 < 1, log is negative, Delta is positive.
    return -400 * Math.log10(1 / winrate - 1);
}

// Composite Team Rating
interface TeamStrength {
    rating: number;
    rd: number;
}

function calculateTeamStrength(commander: string, thugs: string[]): TeamStrength {
    const cmdStats = getPlayerStats(commander).commander;
    
    let avgThugRating = 0;
    let avgThugRD = 0;
    
    const validThugs = thugs.filter(t => t !== '');
    if (validThugs.length > 0) {
        let sumRating = 0;
        let sumRD2 = 0; // sum of squares
        
        for (const thug of validThugs) {
            const tStats = getPlayerStats(thug).thug;
            sumRating += tStats.rating;
            sumRD2 += tStats.rd * tStats.rd;
        }
        
        avgThugRating = sumRating / validThugs.length;
        // For RD, we take the root mean square divided by sqrt(N) for standard error of mean?
        // Or simply Average RD?
        // Let's use a weighted average of variances for the "average player".
        // Var_avg = Sum(Var_i) / N^2
        // RD_avg = Sqrt(Sum(RD_i^2)) / N
        avgThugRD = Math.sqrt(sumRD2) / validThugs.length;
    }

    if (avgThugRating === 0) {
        // No thugs
        return { rating: cmdStats.rating, rd: cmdStats.rd };
    }

    // Combine Commander and Thugs
    // Rating is linear combination
    const teamRating = cmdStats.rating * COMMANDER_INFLUENCE + avgThugRating * (1 - COMMANDER_INFLUENCE);
    
    // RD is combined variance
    // Var_team = (w1 * RD1)^2 + (w2 * RD2)^2 ... simplified assuming independence
    const w1 = COMMANDER_INFLUENCE;
    const w2 = 1 - COMMANDER_INFLUENCE;
    const teamRD = Math.sqrt(Math.pow(w1 * cmdStats.rd, 2) + Math.pow(w2 * avgThugRD, 2));

    return { rating: teamRating, rd: teamRD };
}

async function writeElosToFirestore(db: admin.firestore.Firestore) {
    const commanderElos: { [key: string]: any } = {};
    const thugElos: { [key: string]: any } = {};

    for (const [player, stats] of playerStats.entries()) {
        if (player) {
            commanderElos[player] = {
                rating: stats.commander.rating,
                rd: stats.commander.rd,
                vol: stats.commander.vol,
                wins: stats.commander.wins,
                losses: stats.commander.losses
            };
            thugElos[player] = {
                rating: stats.thug.rating,
                rd: stats.thug.rd,
                vol: stats.thug.vol,
                wins: stats.thug.wins,
                losses: stats.thug.losses
            };
        }
    }

    const elosCollection = db.collection('glicko_elos');
    await elosCollection.doc('commanders').set(commanderElos);
    await elosCollection.doc('thugs').set(thugElos);

    console.log('Successfully wrote Glicko ELOs to Firestore (glicko_elos).');
}

async function main() {
    // Read games
    const gamesPath = path.join(__dirname, '../data/games.ts');
    const rawData = fs.readFileSync(gamesPath, 'utf-8');
    const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
    const games: Game[] = JSON.parse(gamesJson);

    console.log(`Processing ${games.length} games...`);

    for (const game of games) {
        const { team1command, team2command, team1faction, team2faction, teamOneThugs, teamTwoThugs, winningTeamId } = game;

        // 1. Calculate Team Strengths (Base)
        const t1Str = calculateTeamStrength(team1command, teamOneThugs);
        const t2Str = calculateTeamStrength(team2command, teamTwoThugs);

        // 2. Calculate Faction Bonuses
        // Team 1 bonus when playing against Team 2
        const t1Bonus = getFactionBonus(team1faction, team2faction);
        // Team 2 bonus when playing against Team 1 (should be -t1Bonus usually, but let's calc independently)
        const t2Bonus = getFactionBonus(team2faction, team1faction);

        // 3. Prepare "Effective" Opponents
        const t2EffectiveRatingForT1 = t2Str.rating - t1Bonus;
        const t1EffectiveRatingForT2 = t1Str.rating - t2Bonus;

        const t1Score = winningTeamId === 1 ? 1 : 0;
        const t2Score = winningTeamId === 2 ? 1 : 0;

        // 4. Update Team 1 Players
        const t2OpponentGlicko = toGlicko2Scale({ rating: t2EffectiveRatingForT1, rd: t2Str.rd, vol: DEFAULT_VOL });
        
        // Update Commander
        const t1CmdStats = getPlayerStats(team1command).commander;
        const t1CmdGlicko = toGlicko2Scale(t1CmdStats);
        const t1CmdNew = updateRating(t1CmdGlicko, [{ 
            opponentMu: t2OpponentGlicko.mu, 
            opponentPhi: t2OpponentGlicko.phi, 
            score: t1Score 
        }]);
        Object.assign(t1CmdStats, toOriginalScale(t1CmdNew));
        if (t1Score === 1) t1CmdStats.wins++; else t1CmdStats.losses++;

        // Update Thugs
        for (const thug of teamOneThugs.filter(t => t !== '')) {
            const thugStats = getPlayerStats(thug).thug;
            const thugGlicko = toGlicko2Scale(thugStats);
            const thugNew = updateRating(thugGlicko, [{
                opponentMu: t2OpponentGlicko.mu, 
                opponentPhi: t2OpponentGlicko.phi, 
                score: t1Score
            }]);
            Object.assign(thugStats, toOriginalScale(thugNew));
            if (t1Score === 1) thugStats.wins++; else thugStats.losses++;
        }

        // 5. Update Team 2 Players
        const t1OpponentGlicko = toGlicko2Scale({ rating: t1EffectiveRatingForT2, rd: t1Str.rd, vol: DEFAULT_VOL });
        
        // Update Commander
        const t2CmdStats = getPlayerStats(team2command).commander;
        const t2CmdGlicko = toGlicko2Scale(t2CmdStats);
        const t2CmdNew = updateRating(t2CmdGlicko, [{ 
            opponentMu: t1OpponentGlicko.mu, 
            opponentPhi: t1OpponentGlicko.phi, 
            score: t2Score 
        }]);
        Object.assign(t2CmdStats, toOriginalScale(t2CmdNew));
        if (t2Score === 1) t2CmdStats.wins++; else t2CmdStats.losses++;

        // Update Thugs
        for (const thug of teamTwoThugs.filter(t => t !== '')) {
            const thugStats = getPlayerStats(thug).thug;
            const thugGlicko = toGlicko2Scale(thugStats);
            const thugNew = updateRating(thugGlicko, [{
                opponentMu: t1OpponentGlicko.mu, 
                opponentPhi: t1OpponentGlicko.phi, 
                score: t2Score
            }]);
            Object.assign(thugStats, toOriginalScale(thugNew));
             if (t2Score === 1) thugStats.wins++; else thugStats.losses++;
        }
    }
    
    // Write to Firestore
    const { credential } = admin;
    try {
        admin.initializeApp({
            credential: credential.applicationDefault(),
            databaseURL: 'https://elo-bz2.firebaseio.com',
            projectId: 'elo-bz2'
        });

        const db = admin.firestore();
        await writeElosToFirestore(db);
    } catch (e) {
        console.warn("Could not initialize Firebase Admin or write to DB. (This is expected in local dev without creds)");
        console.log("Printing sample results instead:");
        const samplePlayers = Array.from(playerStats.keys()).slice(0, 5);
        for(const p of samplePlayers) {
            console.log(p, playerStats.get(p));
        }
    }
}

if (require.main === module) {
    main().catch(console.error);
}
