# Model Evaluation

This directory contains forecast evaluation scores for all models
participating in the Macro Forecast Hub.

## File Structure

| File | Description |
|------|-------------|
| `latest-forecast_scores.csv` | Most recent complete evaluation results |
| `snapshots/YYYY-MM-DD-forecast_scores.csv` | Historical evaluation snapshots |

## Scoring Methodology

Models are evaluated using the **Weighted Interval Score (WIS)**, a proper
scoring rule for probabilistic forecasts that generalizes the absolute error.

The WIS decomposes into three components:
- **Dispersion**: Width of the prediction intervals (sharpness)
- **Underprediction**: Penalty for observations below the lower quantiles
- **Overprediction**: Penalty for observations above the upper quantiles

### Score Columns

| Column | Description |
|--------|-------------|
| `origin_date` | Forecast submission date |
| `target` | FRED series identifier |
| `target_end_date` | Month being forecasted |
| `horizon` | Months ahead (1-24) |
| `location` | Location code (US) |
| `team_id` | Team abbreviation |
| `model_id` | Model abbreviation |
| `metric` | Score metric (WIS, MAE, coverage) |
| `value_absolute` | Raw score value |
| `value_relative` | Score relative to baseline model |
| `n_models` | Number of models evaluated |
| `rank` | Model rank for this target/horizon (1 = best) |

## Reference

Bracher, J., Ray, E.L., Gneiting, T. and Reich, N.G. (2021), "Evaluating
epidemic forecasts in an interval format," *PLOS Computational Biology*.
