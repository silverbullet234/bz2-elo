
import { calculateExpectedOutcome, getPlayerElo, playerElos } from './elo_calculator';

describe('ELO Calculator', () => {
    beforeEach(() => {
        // Clear the playerElos map before each test
        playerElos.clear();
    });

    test('should predict ISDF to win by a small margin in a 3v3 ISDF vs Scion game', () => {
        // Given
        const team1Commander = 'Player1';
        const team1Thugs = ['Player2', 'Player3'];
        const team1Faction = 'ISDF';
        
        const team2Commander = 'Player4';
        const team2Thugs = ['Player5', 'Player6'];
        const team2Faction = 'Scion';

        // All players have 1500 rating
        for (let i = 1; i <= 6; i++) {
            const playerName = `Player${i}`;
            getPlayerElo(playerName); // This will initialize the player with 1500 ELO
        }

        // When
        const finalExpectedOutcome = calculateExpectedOutcome(team1Commander, team1Thugs, team1Faction, team2Commander, team2Thugs, team2Faction);

        // Then
        expect(finalExpectedOutcome).toBeGreaterThan(0.5);
        expect(finalExpectedOutcome).toBeLessThan(0.6); // Expecting a "small margin"
    });

    test('should predict a 50/50 outcome for a 3v3 mirror matchup with equal ratings', () => {
        // Given
        const team1Commander = 'PlayerA';
        const team1Thugs = ['PlayerB', 'PlayerC'];
        const team1Faction = 'ISDF'; // Same faction
        
        const team2Commander = 'PlayerD';
        const team2Thugs = ['PlayerE', 'PlayerF'];
        const team2Faction = 'ISDF'; // Same faction

        // All players have 1500 rating
        for (const player of [team1Commander, ...team1Thugs, team2Commander, ...team2Thugs]) {
            getPlayerElo(player); // This will initialize the player with 1500 ELO
        }

        // When
        const finalExpectedOutcome = calculateExpectedOutcome(team1Commander, team1Thugs, team1Faction, team2Commander, team2Thugs, team2Faction);

        // Then
        expect(finalExpectedOutcome).toBeCloseTo(0.5);
    });

    test('should predict Scion to lose by a small margin in a 3v3 Scion vs ISDF game with equal ratings', () => {
        // Given
        const team1Commander = 'Player1';
        const team1Thugs = ['Player2', 'Player3'];
        const team1Faction = 'Scion';
        
        const team2Commander = 'Player4';
        const team2Thugs = ['Player5', 'Player6'];
        const team2Faction = 'ISDF';

        // All players have 1500 rating
        for (let i = 1; i <= 6; i++) {
            const playerName = `Player${i}`;
            getPlayerElo(playerName); // This will initialize the player with 1500 ELO
        }

        // When
        const finalExpectedOutcome = calculateExpectedOutcome(team1Commander, team1Thugs, team1Faction, team2Commander, team2Thugs, team2Faction);

        // Then
        expect(finalExpectedOutcome).toBeGreaterThan(0.4);
        expect(finalExpectedOutcome).toBeLessThan(0.5);
    });

    test('should predict 0.64 for Hadeon vs Hadeon where Team 1 has a 1700 commander and all others are 1500', () => {
        // Given
        const team1Commander = 'HighRated';
        const team1Thugs = ['Player2', 'Player3'];
        const team1Faction = 'Hadeon';
        
        const team2Commander = 'Player4';
        const team2Thugs = ['Player5', 'Player6'];
        const team2Faction = 'Hadeon';

        // Set Team 1 commander to 1700
        getPlayerElo(team1Commander).commanderElo = 1700;
        
        // All other players are 1500 (default)
        for (const player of [...team1Thugs, team2Commander, ...team2Thugs]) {
            getPlayerElo(player);
        }

        // When
        const finalExpectedOutcome = calculateExpectedOutcome(team1Commander, team1Thugs, team1Faction, team2Commander, team2Thugs, team2Faction);

        // Then
        expect(finalExpectedOutcome).toBeCloseTo(0.64, 2);
    });

    test('should predict ~0.66 for 1700 ISDF commander vs 1500 Scion team', () => {
        // Given
        const team1Commander = 'HighRatedISDF';
        const team1Thugs = ['Player2', 'Player3'];
        const team1Faction = 'ISDF';
        
        const team2Commander = 'Player4';
        const team2Thugs = ['Player5', 'Player6'];
        const team2Faction = 'Scion';

        // Set Team 1 commander to 1700
        getPlayerElo(team1Commander).commanderElo = 1700;
        
        // All other players are 1500 (default)
        for (const player of [...team1Thugs, team2Commander, ...team2Thugs]) {
            getPlayerElo(player);
        }

        // When
        const finalExpectedOutcome = calculateExpectedOutcome(team1Commander, team1Thugs, team1Faction, team2Commander, team2Thugs, team2Faction);

        // Then
        // Calculation: 
        // Team1 Strength = (1700 + 1500)/2 = 1600
        // Team2 Strength = (1500 + 1500)/2 = 1500
        // expectedOutcome = 1 / (1 + 10^((1500-1600)/400)) = 1 / (1 + 10^-0.25) = 1 / (1 + 0.5623) = 0.6401
        // factionWinrate (ISDF vs Scion) = 0.5215
        // numerator = 0.6401 * 0.5215 = 0.3338
        // denominator = 0.3338 + (1 - 0.6401) * (1 - 0.5215) = 0.3338 + 0.3599 * 0.4785 = 0.3338 + 0.1722 = 0.5060
        // finalExpectedOutcome = 0.3338 / 0.5060 = 0.6597
        expect(finalExpectedOutcome).toBeCloseTo(0.66, 2);
    });
});

