# Commander Influence Analysis
**Date:** December 22, 2025

This document summarizes the analysis performed to determine the optimal "Commander Influence Factor" for the Battlezone 2 ELO rating system.

## 1. Global Optimization
We ran a historical simulation over the entire dataset (712 games) to find the single influence factor that minimized the prediction error (Log Loss).

*   **Optimal Global Factor:** `2.6` (approx. 2.7)
*   **Resulting Log Loss:** `0.65477`
*   **Accuracy:** ~60.8%

**Conclusion:** On average, a Commander's ELO contributes roughly **2.6 times more** to the team's strength than the average Thug's ELO.

## 2. Commander vs. "Strongest Player"
We tested the hypothesis that the "Commander Influence" was just a proxy for having the strongest player on the team, regardless of role.

*   **Commander Weighted Model:** Log Loss `0.65477` (Best Factor: 2.6)
*   **Strongest Player Model:** Log Loss `0.66403` (Best Factor: 0.8)

**Conclusion:** The **Commander role specifically** is the predictive factor. Weighting the Commander is significantly better than just weighting the highest-rated player.

## 3. Influence by Team Size
We analyzed whether the optimal influence factor changes based on the number of players in the game.

| Team Size (Total) | Format | Sample Size | Best Factor | Log Loss | Interpretation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **2** | 1v1 (plus 1 Thug?) * | 46 games | **6.0+** | 0.677 | **Hero Mode:** Commander skill is dominant. |
| **3** | 2v2 / 3v3 | 99 games | **1.0** | 0.712 | **Balanced:** Commander and Thugs have equal weight. |
| **4** | 3v3 / 4v4 | 110 games | **1.0** | 0.628 | **Balanced:** Commander and Thugs have equal weight. |
| **5** | 4v4 / 5v5 | 145 games | **3.5** | 0.620 | **Strategic:** Commander importance spikes again. |

*\*Note: Team Size 2 in this context means 1 Commander + 1 Thug vs Same.*

**Analysis:**
The relationship is **U-shaped**.
*   In **small games**, individual skill (Commander) dominates.
*   In **medium games**, teamwork dilutes individual impact.
*   In **large games**, the need for strategic coordination (Commander) likely becomes the deciding factor again.

## Recommendation
While dynamic weighting is interesting, the sample sizes for specific buckets (especially 2v2) are small. The global average of **2.6** provides a robust improvement over the baseline (1.0) and balances the high-influence extremes (small/large games) with the low-influence middle.

**Current Implementation:**
The system is currently set to use a static factor of **2.6**.
