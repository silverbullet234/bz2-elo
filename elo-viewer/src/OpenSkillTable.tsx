
import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

interface OpenSkillEntry {
    mu: number;
    sigma: number;
    ordinal: number;
    wins: number;
    losses: number;
}

interface OpenSkillData {
  [player: string]: OpenSkillEntry;
}

const minGames = 10; // Minimum games required to be displayed

const OpenSkillTable: React.FC = () => {
  const [commanders, setCommanders] = useState<OpenSkillData>({});
  const [thugs, setThugs] = useState<OpenSkillData>({});
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const fetchData = async () => {
      const commandersDoc = await getDoc(doc(db, 'openskill', 'commanders'));
      if (commandersDoc.exists()) {
        setCommanders(commandersDoc.data() as OpenSkillData);
      }

      const thugsDoc = await getDoc(doc(db, 'openskill', 'thugs'));
      if (thugsDoc.exists()) {
        setThugs(thugsDoc.data() as OpenSkillData);
      }
    };

    fetchData();
  }, []);

  const filterAndSortData = (data: OpenSkillData) => {
    const filteredPlayers = Object.entries(data).filter(([, playerData]) => {
      const totalGames = playerData.wins + playerData.losses;
      return totalGames >= minGames;
    });

    return filteredPlayers.sort(([, a], [, b]) => {
      return sortOrder === 'asc' ? a.ordinal - b.ordinal : b.ordinal - a.ordinal;
    });
  };

  const handleSort = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const renderTable = (title: string, data: OpenSkillData) => (
    <div>
      <h2>{title}</h2>
      <button onClick={handleSort}>Sort by Rating ({sortOrder === 'asc' ? 'Ascending' : 'Descending'})</button>
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Rating (Ordinal)</th>
            <th>Mean (μ)</th>
            <th>Uncertainty (σ)</th>
            <th>Wins</th>
            <th>Losses</th>
          </tr>
        </thead>
        <tbody>
          {filterAndSortData(data).map(([player, stats]) => (
            <tr key={player}>
              <td>{player}</td>
              <td>{stats.ordinal.toFixed(2)}</td>
              <td>{stats.mu.toFixed(2)}</td>
              <td>{stats.sigma.toFixed(2)}</td>
              <td>{stats.wins}</td>
              <td>{stats.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        {renderTable("Commander OpenSkill", commanders)}
        {renderTable("Thug OpenSkill", thugs)}
    </div>
  );
};

export default OpenSkillTable;
