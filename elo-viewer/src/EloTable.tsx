
import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

interface EloData {
  [player: string]: {
    elo: number;
    wins: number;
    losses: number;
  };
}

const minGames = 5; // Minimum games required to be displayed

const EloTable: React.FC = () => {
  const [commanders, setCommanders] = useState<EloData>({});
  const [thugs, setThugs] = useState<EloData>({});
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const fetchElos = async () => {
      const commandersDoc = await getDoc(doc(db, 'elos', 'commanders'));
      if (commandersDoc.exists()) {
        setCommanders(commandersDoc.data() as EloData);
      }

      const thugsDoc = await getDoc(doc(db, 'elos', 'thugs'));
      if (thugsDoc.exists()) {
        setThugs(thugsDoc.data() as EloData);
      }
    };

    fetchElos();
  }, []);

  const filterAndSortData = (data: EloData) => {
    const filteredPlayers = Object.entries(data).filter(([, playerData]) => {
      const totalGames = playerData.wins + playerData.losses;
      return totalGames >= minGames;
    });

    return filteredPlayers.sort(([, a], [, b]) => {
      return sortOrder === 'asc' ? a.elo - b.elo : b.elo - a.elo;
    });
  };

  const handleSort = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
      <div>
        <h2>Commander ELOs</h2>
        <button onClick={handleSort}>Sort by ELO ({sortOrder === 'asc' ? 'Ascending' : 'Descending'})</button>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>ELO</th>
              <th>Wins</th>
              <th>Losses</th>
            </tr>
          </thead>
          <tbody>
            {filterAndSortData(commanders).map(([player, data]) => (
              <tr key={player}>
                <td>{player}</td>
                <td>{data.elo.toFixed(2)}</td>
                <td>{data.wins}</td>
                <td>{data.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2>Thug ELOs</h2>
        <button onClick={handleSort}>Sort by ELO ({sortOrder === 'asc' ? 'Ascending' : 'Descending'})</button>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>ELO</th>
              <th>Wins</th>
              <th>Losses</th>
            </tr>
          </thead>
          <tbody>
            {filterAndSortData(thugs).map(([player, data]) => (
              <tr key={player}>
                <td>{player}</td>
                <td>{data.elo.toFixed(2)}</td>
                <td>{data.wins}</td>
                <td>{data.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EloTable;
