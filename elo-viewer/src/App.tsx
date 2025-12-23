import React from 'react';
import './App.css';
import EloTable from './EloTable';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Battlezone 2 Strat ELO Ratings</h1>
      </header>
      <main>
        <EloTable />
      </main>
      <footer className="footer-left-aligned">
        <p>Last Updated: Dec 21 2025</p>
        <p>
          These scores were calculated from ~700 games (raw data: <a href="https://bz2stats.us/data/data.json" target="_blank" rel="noopener noreferrer">https://bz2stats.us/data/data.json</a>), using an Elo rating system.
        </p>
        <p>
          <a href="https://en.wikipedia.org/wiki/Elo_rating_system" target="_blank" rel="noopener noreferrer">https://en.wikipedia.org/wiki/Elo_rating_system</a>
        </p>
        <p>
          Each team is assigned a power score based on the following:
        </p>
        <p>
          P = (w * C) + ((1 - w) * T_avg)
        </p>
        <ul>
          <li>P: The total team power or rating.</li>
          <li>C: The Commander's current rating.</li>
          <li>T_avg: The average rating of all Thugs on the team.</li>
          <li>w: A weight between 0 and 1 (for example, 0.4 if the Commander represents 40% of the team's total "power").</li>
        </ul>
        <p>
          After the power scores are assigned, a standard Elo rating is assigned. All players from the team share the same update in Elo (up or down) from an individual game.
        </p>
        <p>
          Notable drawbacks that contribute to inaccuracies:
        </p>
        <ul>
          <li>Not all games played are represented</li>
          <li>2024 games don't include Thugs</li>
          <li>The number of games is a relatively low sample size so error margins are high</li>
          <li>Bias exists in race picking, since it's not done blind (eg. the weaker team may pick scion for fun)</li>
          <li>The number of thugs on each side can't be easily controlled for (3 vs 2 for example)</li>
        </ul>
      </footer>
    </div>
  );
}

export default App;

