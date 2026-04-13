"""
Score all submitted forecasts against observed target data using the
Weighted Interval Score (WIS) and other metrics.

The WIS is a proper scoring rule for quantile forecasts that generalizes
the absolute error. It rewards both calibration and sharpness.

Reference:
    Bracher, J., Ray, E.L., Gneiting, T. and Reich, N.G. (2021),
    "Evaluating epidemic forecasts in an interval format,"
    PLOS Computational Biology.
"""

import csv
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

HUB_ROOT = Path(__file__).resolve().parents[2]
TARGET_DATA_PATH = HUB_ROOT / "target-data" / "latest-target_values.csv"
MODEL_OUTPUT_DIR = HUB_ROOT / "model-output"
EVALUATION_DIR = HUB_ROOT / "model-evaluation"


def compute_wis(quantiles: np.ndarray, values: np.ndarray, observed: float) -> float:
    """
    Compute the Weighted Interval Score for a set of quantile forecasts.

    Parameters
    ----------
    quantiles : array of quantile levels (e.g., [0.025, 0.1, ..., 0.9, 0.975])
    values : array of forecast values at those quantile levels
    observed : the actual observed value

    Returns
    -------
    WIS score (lower is better)
    """
    n = len(quantiles)
    if n == 0:
        return np.nan

    # Sort by quantile level
    order = np.argsort(quantiles)
    quantiles = quantiles[order]
    values = values[order]

    score = 0.0
    # Quantile score for each level
    for q, v in zip(quantiles, values):
        if observed < v:
            score += (1 - q) * (v - observed)
        else:
            score += q * (observed - v)

    return score / n


def compute_mae(median_forecast: float, observed: float) -> float:
    """Compute the Mean Absolute Error (point forecast)."""
    return abs(median_forecast - observed)


def load_target_data() -> pd.DataFrame:
    """Load the latest target data."""
    if not TARGET_DATA_PATH.exists():
        print(f"Warning: target data not found at {TARGET_DATA_PATH}")
        return pd.DataFrame()
    return pd.read_csv(TARGET_DATA_PATH)


def load_all_forecasts() -> pd.DataFrame:
    """Load all forecast files from model-output/."""
    all_dfs = []

    for model_dir in MODEL_OUTPUT_DIR.iterdir():
        if not model_dir.is_dir() or model_dir.name.startswith("."):
            continue

        parts = model_dir.name.split("-", 1)
        if len(parts) != 2:
            continue
        team_id, model_id = parts

        for csv_file in sorted(model_dir.glob("*.csv")):
            try:
                df = pd.read_csv(csv_file)
                df["team_id"] = team_id
                df["model_id"] = model_id
                all_dfs.append(df)
            except Exception as e:
                print(f"Warning: could not read {csv_file}: {e}")

    if not all_dfs:
        return pd.DataFrame()
    return pd.concat(all_dfs, ignore_index=True)


def score_all() -> pd.DataFrame:
    """Score all forecasts against target data."""
    target_df = load_target_data()
    if target_df.empty:
        print("No target data available for scoring.")
        return pd.DataFrame()

    forecast_df = load_all_forecasts()
    if forecast_df.empty:
        print("No forecast files found.")
        return pd.DataFrame()

    # Create lookup for target values: (target, truth_date) -> value
    truth_lookup = {}
    for _, row in target_df.iterrows():
        key = (row["target"], row["truth_date"])
        truth_lookup[key] = row["value"]

    scores = []

    # Group forecasts by model, target, horizon, date
    group_cols = ["team_id", "model_id", "target", "target_end_date", "horizon", "location"]
    for group_key, group_df in forecast_df.groupby(group_cols):
        team_id, model_id, target, target_end_date, horizon, location = group_key

        # Look up observed value
        truth_key = (target, target_end_date)
        if truth_key not in truth_lookup:
            continue
        observed = truth_lookup[truth_key]

        # Extract quantile forecasts
        q_rows = group_df[group_df["output_type"] == "quantile"].copy()
        if not q_rows.empty:
            q_rows["output_type_id"] = q_rows["output_type_id"].astype(float)
            q_rows["value"] = q_rows["value"].astype(float)
            quantiles = q_rows["output_type_id"].values
            values = q_rows["value"].values

            wis = compute_wis(quantiles, values, observed)
            scores.append({
                "origin_date": group_df["origin_date"].iloc[0],
                "target": target,
                "target_end_date": target_end_date,
                "horizon": horizon,
                "location": location,
                "team_id": team_id,
                "model_id": model_id,
                "metric": "WIS",
                "value_absolute": round(wis, 6),
            })

        # Extract median/mean for MAE
        median_rows = group_df[group_df["output_type"].isin(["median"])]
        if not median_rows.empty:
            median_val = float(median_rows["value"].iloc[0])
            mae = compute_mae(median_val, observed)
            scores.append({
                "origin_date": group_df["origin_date"].iloc[0],
                "target": target,
                "target_end_date": target_end_date,
                "horizon": horizon,
                "location": location,
                "team_id": team_id,
                "model_id": model_id,
                "metric": "MAE",
                "value_absolute": round(mae, 6),
            })

    scores_df = pd.DataFrame(scores)

    if scores_df.empty:
        return scores_df

    # Compute relative scores (relative to baseline)
    baseline_scores = scores_df[
        (scores_df["team_id"] == "MacroHub") & (scores_df["model_id"] == "Baseline")
    ].set_index(["target", "target_end_date", "horizon", "location", "metric"])["value_absolute"]

    def compute_relative(row):
        key = (row["target"], row["target_end_date"], row["horizon"], row["location"], row["metric"])
        if key in baseline_scores.index:
            baseline = baseline_scores[key]
            if baseline > 0:
                return round(row["value_absolute"] / baseline, 6)
        return np.nan

    scores_df["value_relative"] = scores_df.apply(compute_relative, axis=1)

    # Compute ranks within each group
    rank_group = ["target", "target_end_date", "horizon", "location", "metric"]
    scores_df["rank"] = scores_df.groupby(rank_group)["value_absolute"].rank(method="min").astype(int)
    scores_df["n_models"] = scores_df.groupby(rank_group)["value_absolute"].transform("count").astype(int)

    return scores_df


def main():
    scores_df = score_all()

    if scores_df.empty:
        print("No scores computed.")
        return

    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)

    # Save latest
    latest_path = EVALUATION_DIR / "latest-forecast_scores.csv"
    scores_df.to_csv(latest_path, index=False)
    print(f"Saved {len(scores_df)} scores to {latest_path}")

    # Save snapshot
    snapshot_dir = EVALUATION_DIR / "snapshots"
    snapshot_dir.mkdir(exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    snapshot_path = snapshot_dir / f"{today}-forecast_scores.csv"
    scores_df.to_csv(snapshot_path, index=False)
    print(f"Saved snapshot to {snapshot_path}")


if __name__ == "__main__":
    main()
