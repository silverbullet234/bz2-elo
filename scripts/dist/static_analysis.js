import { games } from '../data/games';
const matchups = {};
for (const game of games) {
    let { team1faction, team2faction, winningTeamId } = game;
    if (team1faction > team2faction) {
        // a sorting matchup alphabetically
        [team1faction, team2faction] = [team2faction, team1faction];
        winningTeamId = winningTeamId === 1 ? 2 : 1;
    }
    if (!matchups[team1faction]) {
        matchups[team1faction] = {};
    }
    if (!matchups[team1faction][team2faction]) {
        matchups[team1faction][team2faction] = {
            faction1Wins: 0,
            faction2Wins: 0,
            totalGames: 0,
        };
    }
    if (winningTeamId === 1) {
        matchups[team1faction][team2faction].faction1Wins++;
    }
    else {
        matchups[team1faction][team2faction].faction2Wins++;
    }
    matchups[team1faction][team2faction].totalGames++;
}
console.log('Faction Winrates:');
for (const faction1 in matchups) {
    for (const faction2 in matchups[faction1]) {
        const matchup = matchups[faction1][faction2];
        if (faction1 === faction2) {
            console.log(`\n${faction1} vs ${faction2}:`);
            console.log(`Total Games: ${matchup.totalGames}`);
            continue;
        }
        const faction1Winrate = (matchup.faction1Wins / matchup.totalGames) * 100;
        const faction2Winrate = (matchup.faction2Wins / matchup.totalGames) * 100;
        console.log(`\n${faction1} vs ${faction2}:`);
        console.log(`  - Total Games: ${matchup.totalGames}`);
        console.log(`  - ${faction1} Wins: ${matchup.faction1Wins} (${faction1Winrate.toFixed(2)}%)`);
        console.log(`  - ${faction2} Wins: ${matchup.faction2Wins} (${faction2Winrate.toFixed(2)}%)`);
    }
}
