# Battlezone 2 Strat ELO Ratings

An ELO rating system and web viewer for "Battlezone 2" (BZ2) strategy games. This project analyzes game data, calculates player ratings based on roles (Commander vs. Thug), team composition, and faction advantages, and displays them in a modern web application.

## 🚀 Features

-   **ELO Calculation:** Advanced ELO algorithm considering team strengths, commander influence, and faction balance.
-   **Data Parsing:** Scripts to transform raw game logs into structured data.
-   **Web Viewer:** React-based dashboard to view Commander and Thug leaderboards.
-   **Cloud Integration:** Powered by Firebase (Firestore & Functions).
-   **Static Analysis:** Tools to analyze faction win rates and game balance.

## 🛠 Project Structure

-   `elo-viewer/`: React frontend application.
-   `functions/`: Firebase Cloud Functions for data submission and processing.
-   `scripts/`: TypeScript utilities for ELO calculation and data analysis.
-   `data/`: Raw and processed game data JSON files.

## 🚦 Getting Started

### Prerequisites

-   Node.js (v18+)
-   Firebase CLI (`npm install -g firebase-tools`)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/silverbullet234/bz2-elo.git
   cd bz2-elo
   ```

2. Install dependencies for the scripts and web app:
   ```bash
   npm install
   cd elo-viewer && npm install
   cd ../functions && npm install
   ```

### Running the Web App

```bash
cd elo-viewer
npm start
```

### Running Scripts

The scripts are located in the `scripts/` directory and can be executed with `ts-node`:

-   **Calculate ELOs:** `npx ts-node scripts/elo_calculator.ts`
-   **Static Analysis:** `npx ts-node scripts/static_analysis.ts`

## 📊 ELO Methodology

The system uses a weighted ELO formula:
`Team Strength = (Commander ELO * Influence Factor + Average Thug ELO) * Faction Adjustment`

Ratings are split into two categories:
1.  **Commander ELO**: Reflects the player's performance leading the base.
2.  **Thug ELO**: Reflects the player's performance as a field combatant.

## 🤝 Contributing

Feel free to open issues or submit pull requests for improvements to the ELO algorithm or UI features.

## 📜 License

[MIT](LICENSE)
