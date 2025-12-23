"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const games_1 = require("../data/games");
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
        if (typeof elos[player] === 'number') {
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
        else {
            const data = elos[player];
            if (eloType === 'commander') {
                playerElo.commanderElo = data.elo;
                playerElo.commanderWins = data.wins;
                playerElo.commanderLosses = data.losses;
            }
            else { // thug
                playerElo.thugElo = data.elo;
                playerElo.thugWins = data.wins;
                playerElo.thugLosses = data.losses;
            }
        }
    }
}
// @ts-ignore
const updated_commander_elos_js_1 = require("../data/updated_commander_elos.js");
// @ts-ignore
const updated_thug_elos_js_1 = require("../data/updated_thug_elos.js");
readElos(updated_commander_elos_js_1.elos, 'commander');
readElos(updated_thug_elos_js_1.elos, 'thug');
function getPlayerElo(playerName) {
    if (!playerName) {
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
const targetPlayer = "F9bomber";
let commanderGames = 0;
let commanderWins = 0;
let commanderLosses = 0;
let thugGames = 0;
let thugWins = 0;
let thugLosses = 0;
for (const game of games_1.games) {
    const { team1command, team2command, team1faction, team2faction, teamOneThugs, teamTwoThugs, winningTeamId } = game;
    // Commander role
    if (team1command === targetPlayer) {
        commanderGames++;
        if (winningTeamId === 1) {
            commanderWins++;
        }
        else {
            commanderLosses++;
        }
    }
    else if (team2command === targetPlayer) {
        commanderGames++;
        if (winningTeamId === 2) {
            commanderWins++;
        }
        else {
            commanderLosses++;
        }
    }
    // Thug role
    if (teamOneThugs.includes(targetPlayer)) {
        thugGames++;
        if (winningTeamId === 1) {
            thugWins++;
        }
        else {
            thugLosses++;
        }
    }
    else if (teamTwoThugs.includes(targetPlayer)) {
        thugGames++;
        if (winningTeamId === 2) {
            thugWins++;
        }
        else {
            thugLosses++;
        }
    }
}
const f9bomberElos = playerElos.get(targetPlayer);
if (!f9bomberElos) {
    console.log(`Player "${targetPlayer}" not found in ELO data.`);
    process.exit(1);
}
console.log(`
Analysis for ${targetPlayer}:
------------------------------
`);
console.log(`Commander Stats:
  ELO: ${f9bomberElos.commanderElo.toFixed(2)}
  Wins: ${commanderWins}
  Losses: ${commanderLosses}`);
const commanderWinRate = commanderGames > 0 ? (commanderWins / commanderGames) * 100 : 0;
console.log(`  Win Rate: ${commanderWinRate.toFixed(2)}%`);
console.log(`
Thug Stats:
  ELO: ${f9bomberElos.thugElo.toFixed(2)}
  Wins: ${thugWins}
  Losses: ${thugLosses}`);
const thugWinRate = thugGames > 0 ? (thugWins / thugGames) * 100 : 0;
console.log(`  Win Rate: ${thugWinRate.toFixed(2)}%`);
// Further analysis to explain discrepancy
console.log(`
Discrepancy Analysis:
-----------------------
`);
if (f9bomberElos.commanderElo < 1500 && commanderWinRate > 50) {
    console.log(`F9bomber's Commander ELO is below initial (1500) despite a positive win rate.`);
    console.log(`Possible reasons for this discrepancy:`);
    console.log(`1.  **Challenging Matchups:** F9bomber might frequently face teams with significantly higher ELOs, even if he wins more than 50% of his games. In ELO systems, winning against much stronger opponents yields larger ELO gains, while losing to weaker opponents results in larger ELO losses. Conversely, winning against weaker opponents yields small gains, and losing to stronger opponents results in small losses. If F9bomber consistently wins against weaker opponents (low ELO gain) or loses to opponents that are still considered weaker by the system (even if he wins overall), his ELO might not climb significantly.`);
    console.log(`2.  **Team Strength Composition:** When F9bomber plays as a commander, the overall strength of his team (including thugs' ELOs and faction adjustments) might be consistently rated lower by the ELO system. If the system expects him to lose most games (due to lower team strength), even a 50%+ win rate would result in relatively small ELO gains, or even losses if the wins are against very low-rated opponents.`);
    console.log(`3.  **Thug Performance:** The ELO calculations are based on *team strength*, which includes the average ELO of thugs. If F9bomber plays with thugs whose ELOs are generally lower, it could depress the overall team strength calculation, leading to the system expecting his team to lose more often. Even if he pulls out wins, the individual ELO gain might be small due to the team's perceived lower strength.`);
    console.log(`4.  **Faction Adjustments:** While the system applies faction adjustments, if F9bomber's faction is often pitted against a favored faction where the system expects his team to lose, his ELO might not reflect his raw win/loss record.`);
    console.log(`5.  **Game Count:** If the number of commander games is relatively small, the ELO might not have fully stabilized or might be influenced more by early game outcomes.`);
}
else {
    console.log(`No significant winrate/ELO discrepancy found for ${targetPlayer} as a commander.`);
}
if (f9bomberElos.thugElo < 1500 && thugWinRate > 50) {
    console.log(`F9bomber's Thug ELO is below initial (1500) despite a positive win rate.`);
    console.log(`Possible reasons for this discrepancy: (Similar to commander, but applied to thug role performance)`);
}
else {
    console.log(`No significant winrate/ELO discrepancy found for ${targetPlayer} as a thug.`);
}
