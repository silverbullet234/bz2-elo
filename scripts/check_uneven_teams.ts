import * as fs from 'fs';
import * as path from 'path';
import { Game } from './game_interface';

function main() {
    const gamesPath = path.join(__dirname, '../data/games.ts');
    const rawData = fs.readFileSync(gamesPath, 'utf-8');
    const gamesJson = rawData.substring(rawData.indexOf('[')).replace('];', ']');
    const games: Game[] = JSON.parse(gamesJson);

    console.log(`Analyzing Uneven Team Sizes over ${games.length} games...\n`);

    let unevenGames = 0;
    let largerTeamWins = 0;
    let smallerTeamWins = 0;

    for (const game of games) {
        const team1Size = 1 + game.teamOneThugs.filter(t => t !== '').length;
        const team2Size = 1 + game.teamTwoThugs.filter(t => t !== '').length;

        if (team1Size !== team2Size) {
            unevenGames++;
            
            const largerTeamId = team1Size > team2Size ? 1 : 2;
            
            if (game.winningTeamId === largerTeamId) {
                largerTeamWins++;
            } else {
                smallerTeamWins++;
            }
        }
    }

    console.log(`Total Uneven Games: ${unevenGames}`);
    if (unevenGames > 0) {
        console.log(`Larger Team Wins: ${largerTeamWins} (${(largerTeamWins / unevenGames * 100).toFixed(2)}%)`);
        console.log(`Smaller Team Wins: ${smallerTeamWins} (${(smallerTeamWins / unevenGames * 100).toFixed(2)}%)`);
    } else {
        console.log("No uneven games found.");
    }
}

if (require.main === module) {
    main();
}
