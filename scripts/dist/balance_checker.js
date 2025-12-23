import { games } from '../data/games';
let unbalancedGames = 0;
let teamWithMoreThugsWins = 0;
for (const game of games) {
    if (game.teamOneThugs.length !== game.teamTwoThugs.length) {
        unbalancedGames++;
        if (game.teamOneThugs.length > game.teamTwoThugs.length && game.winningTeamId === 1) {
            teamWithMoreThugsWins++;
        }
        else if (game.teamTwoThugs.length > game.teamOneThugs.length && game.winningTeamId === 2) {
            teamWithMoreThugsWins++;
        }
    }
}
const winrate = (teamWithMoreThugsWins / unbalancedGames) * 100;
console.log(`Found ${unbalancedGames} games where the number of thugs on each team is not balanced.`);
console.log(`The team with more thugs won ${teamWithMoreThugsWins} of those games.`);
console.log(`The winrate for teams with more thugs is ${winrate.toFixed(2)}%.`);
