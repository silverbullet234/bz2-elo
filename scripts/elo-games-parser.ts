import * as fs from 'fs';
import * as path from 'path';

interface Game {
  team1command: string;
  team2command: string;
  team1faction: string;
  team2faction: string;
  teamOneThugs: string[];
  teamTwoThugs: string[];
  winningTeamId: number;
}

// Get filename from command line arguments or default to 'sample_games.json'
const inputFilePath = path.join(__dirname, '..', 'data', process.argv[2] || 'sample_games.json');
const outputFilePath = path.join(__dirname, '..', 'data', `${path.basename(inputFilePath, path.extname(inputFilePath))}.ts`);

try {
  const rawData = fs.readFileSync(inputFilePath, 'utf-8');
  const jsonData = JSON.parse(rawData);

  const games: Game[] = [];

  const years = Object.keys(jsonData);
  for (const year of years) {
    const yearData = jsonData[year];
    const rawYear = `raw_${year}`;
    if (yearData[rawYear]) {
      const months = Object.keys(yearData[rawYear].month);
      for (const month of months) {
        const monthData = yearData[rawYear].month[month];
        const dates = Object.keys(monthData);
        for (const date of dates) {
          const dateData = monthData[date];
          const maps = Object.keys(dateData);
          for (const map of maps) {
            const gameData = dateData[map];
            const commanders = gameData.commanders.split(' vs ');
            const factions = gameData.factions.replace(/\[|\]/g, '').replace(/\./g, '').split(', ');
            const winner = gameData.winner;

            const teamOneCommander = commanders[0];
            const teamTwoCommander = commanders[1];

            let teamOneThugs = gameData.teamOne || [];
            let teamTwoThugs = gameData.teamTwo || [];

            if (gameData.teamOneStraggler) {
              teamOneThugs = teamOneThugs.concat(gameData.teamOneStraggler);
            }
            if (gameData.teamTwoStraggler) {
              teamTwoThugs = teamTwoThugs.concat(gameData.teamTwoStraggler);
            }

            const winningTeamId = winner === teamOneCommander ? 1 : 2;

            const game: Game = {
              team1command: teamOneCommander,
              team2command: teamTwoCommander,
              team1faction: factions[0],
              team2faction: factions[1],
              teamOneThugs: teamOneThugs,
              teamTwoThugs: teamTwoThugs,
              winningTeamId: winningTeamId,
            };
            games.push(game);
          }
        }
      }
    }
  }

  const outputContent = `export const games = ${JSON.stringify(games, null, 2)};`;

  fs.writeFileSync(outputFilePath, outputContent);

  console.log(`Successfully converted ${inputFilePath} to ${outputFilePath}`);

} catch (error) {
  console.error(`Error processing file ${inputFilePath}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
