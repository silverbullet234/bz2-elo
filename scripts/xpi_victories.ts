
import { games } from '../data/games';
import { Game } from './game_interface';

const commander = 'Xpi';
const defeatedOpponents: string[] = [];

(games as Game[]).forEach(game => {
    let opponent = '';
    let xpiWon = false;

    if (game.team1command === commander) {
        opponent = game.team2command;
        if (game.winningTeamId === 1) {
            xpiWon = true;
        }
    } else if (game.team2command === commander) {
        opponent = game.team1command;
        if (game.winningTeamId === 2) {
            xpiWon = true;
        }
    }

    if (xpiWon && opponent) {
        defeatedOpponents.push(opponent);
    }
});

// Deduplicate and sort
const uniqueDefeated = [...new Set(defeatedOpponents)].sort();

console.log(`Commanders defeated by ${commander}:`);
uniqueDefeated.forEach(opp => console.log(opp));
console.log(`Total unique commanders defeated: ${uniqueDefeated.length}`);
