
import { games } from '../data/games';
import { Game } from './game_interface';

const p1 = 'sly';
const p2 = 'xpi';

const matchingGames = (games as Game[]).filter(game => {
    const players = [
        game.team1command,
        game.team2command,
        ...game.teamOneThugs,
        ...game.teamTwoThugs
    ].map(p => p.toLowerCase());
    return players.some(p => p.includes(p1)) && players.some(p => p.includes(p2));
});

console.log(`Total games where both ${p1} and ${p2} played (case-insensitive): ${matchingGames.length}`);

matchingGames.forEach((game, index) => {
    console.log(`Game ${index + 1}:`);
    console.log(`  Team 1 Commander: ${game.team1command}`);
    console.log(`  Team 2 Commander: ${game.team2command}`);
    console.log(`  Team 1 Thugs: ${game.teamOneThugs.join(', ')}`);
    console.log(`  Team 2 Thugs: ${game.teamTwoThugs.join(', ')}`);
    console.log(`  Winner: Team ${game.winningTeamId}`);
});
