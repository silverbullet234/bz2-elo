import * as fs from 'fs';
import { Game } from './game_interface';

const fileContent = fs.readFileSync('../data/games.ts', 'utf-8');
const gamesJson = fileContent.substring(fileContent.indexOf('[')).replace('];', ']');
const games: Game[] = JSON.parse(gamesJson);

let unbalancedGames = 0;
let teamWithMoreThugsWins = 0;

for (const game of games) {
  if (game.teamOneThugs.length !== game.teamTwoThugs.length) {
    unbalancedGames++;
    if (game.teamOneThugs.length > game.teamTwoThugs.length && game.winningTeamId === 1) {
      teamWithMoreThugsWins++;
    } else if (game.teamTwoThugs.length > game.teamOneThugs.length && game.winningTeamId === 2) {
      teamWithMoreThugsWins++;
    }
  }
}

const winrate = (teamWithMoreThugsWins / unbalancedGames) * 100;

console.log(`Found ${unbalancedGames} games where the number of thugs on each team is not balanced.`);
console.log(`The team with more thugs won ${teamWithMoreThugsWins} of those games.`);
console.log(`The winrate for teams with more thugs is ${winrate.toFixed(2)}%.`);