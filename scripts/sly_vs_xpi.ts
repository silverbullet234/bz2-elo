
import { games } from '../data/games';
import { Game } from './game_interface';

const commander1 = 'Sly';
const commander2 = 'Xpi';

let slyWins = 0;
let xpiWins = 0;
let totalGames = 0;

(games as Game[]).forEach(game => {
    if ((game.team1command === commander1 && game.team2command === commander2) ||
        (game.team1command === commander2 && game.team2command === commander1)) {
        totalGames++;
        const winner = game.winningTeamId === 1 ? game.team1command : game.team2command;
        if (winner === commander1) {
            slyWins++;
        } else if (winner === commander2) {
            xpiWins++;
        }
    }
});

console.log(`Total games between ${commander1} and ${commander2} as commanders: ${totalGames}`);
console.log(`${commander1} wins: ${slyWins}`);
console.log(`${commander2} wins: ${xpiWins}`);
