
import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

interface GlickoData {
  [player: string]: {
    rating: number;
    rd: number;
    wins: number;
    losses: number;
  };
}

const minGames = 10; // Minimum games required to be displayed

const GlickoTable: React.FC = () => {
  const [commanders, setCommanders] = useState<GlickoData>({});
  const [thugs, setThugs] = useState<GlickoData>({});
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const fetchElos = async () => {
      const commandersDoc = await getDoc(doc(db, 'glicko_elos', 'commanders'));
      if (commandersDoc.exists()) {
        setCommanders(commandersDoc.data() as GlickoData);
      }

      const thugsDoc = await getDoc(doc(db, 'glicko_elos', 'thugs'));
      if (thugsDoc.exists()) {
        setThugs(thugsDoc.data() as GlickoData);
      }
    };

    fetchElos();
  }, []);

  const filterAndSortData = (data: GlickoData) => {
    const filteredPlayers = Object.entries(data).filter(([, playerData]) => {
      const totalGames = (playerData.wins || 0) + (playerData.losses || 0);
      return totalGames >= minGames;
    });

    return filteredPlayers.sort(([, a], [, b]) => {
      return sortOrder === 'asc' ? a.rating - b.rating : b.rating - a.rating;
    });
  };

  const handleSort = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
      <div>
        <h2>Commander Glicko-2</h2>
        <button onClick={handleSort}>Sort by Rating ({sortOrder === 'asc' ? 'Ascending' : 'Descending'})</button>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Rating</th>
              <th>RD</th>
              <th>Wins</th>
              <th>Losses</th>
            </tr>
          </thead>
          <tbody>
            {filterAndSortData(commanders).map(([player, data]) => (
              <tr key={player}>
                <td>{player}</td>
                <td>{data.rating.toFixed(0)}</td>
                <td>{data.rd.toFixed(0)}</td>
                <td>{data.wins || 0}</td>
                <td>{data.losses || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2>Thug Glicko-2</h2>
        <button onClick={handleSort}>Sort by Rating ({sortOrder === 'asc' ? 'Ascending' : 'Descending'})</button>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Rating</th>
              <th>RD</th>
              <th>Wins</th>
              <th>Losses</th>
            </tr>
          </thead>
          <tbody>
            {filterAndSortData(thugs).map(([player, data]) => (
              <tr key={player}>
                <td>{player}</td>
                <td>{data.rating.toFixed(0)}</td>
                <td>{data.rd.toFixed(0)}</td>
                <td>{data.wins || 0}</td>
                <td>{data.losses || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GlickoTable;
