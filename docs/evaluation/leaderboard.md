# Leaderboard

Model performance rankings based on forecast accuracy against realized values.

---

## Scoring Overview

Models are ranked by their **Weighted Interval Score (WIS)** relative to the
baseline random walk model. A relative WIS below 1.0 means the model
outperforms the baseline.

---

## Current Rankings

!!! note "Coming soon"
    The leaderboard will be populated once target data becomes available for
    scored forecast rounds. Rankings will include:

    - Overall ranking across all targets and horizons
    - Per-indicator rankings
    - Per-horizon rankings
    - Historical performance trends

---

## How Rankings Work

1. **WIS** is computed for each model, target, horizon, and forecast round
2. Scores are normalized relative to the baseline model
3. Overall rankings use the mean relative WIS across all evaluated combinations
4. Rankings are updated automatically when new target data is released

See [Methodology](methodology.md) for details on the scoring rules.
