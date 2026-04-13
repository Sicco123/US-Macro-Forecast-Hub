"""
Generate the hub ensemble forecast by combining all submitted model forecasts.

The ensemble uses an equal-weight median aggregation: for each target, horizon,
location, and quantile level, the ensemble value is the median across all
contributing models.
"""

from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

HUB_ROOT = Path(__file__).resolve().parents[2]
MODEL_OUTPUT_DIR = HUB_ROOT / "model-output"
ENSEMBLE_DIR = HUB_ROOT / "model-output" / "MacroHub-Ensemble"

# Minimum number of models required to form an ensemble
MIN_MODELS = 2


def load_latest_forecasts() -> pd.DataFrame:
    """
    Load the most recent forecast file from each model directory.
    Excludes the ensemble itself.
    """
    all_dfs = []

    for model_dir in MODEL_OUTPUT_DIR.iterdir():
        if not model_dir.is_dir() or model_dir.name.startswith("."):
            continue
        if model_dir.name == "MacroHub-Ensemble":
            continue

        csv_files = sorted(model_dir.glob("*.csv"))
        if not csv_files:
            continue

        # Use the most recent file
        latest_file = csv_files[-1]
        try:
            df = pd.read_csv(latest_file)
            parts = model_dir.name.split("-", 1)
            if len(parts) == 2:
                df["_team"] = parts[0]
                df["_model"] = parts[1]
                all_dfs.append(df)
        except Exception as e:
            print(f"Warning: could not read {latest_file}: {e}")

    if not all_dfs:
        return pd.DataFrame()
    return pd.concat(all_dfs, ignore_index=True)


def generate_ensemble(forecasts_df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute the median ensemble across models for each group.
    """
    if forecasts_df.empty:
        return pd.DataFrame()

    group_cols = [
        "origin_date", "target", "target_end_date", "horizon",
        "location", "output_type", "output_type_id",
    ]

    # Only include groups with enough contributing models
    ensemble_records = []

    for group_key, group_df in forecasts_df.groupby(group_cols):
        n_models = group_df["_model"].nunique()
        if n_models < MIN_MODELS:
            continue

        ensemble_value = group_df["value"].astype(float).median()

        record = dict(zip(group_cols, group_key))
        record["value"] = round(ensemble_value, 4)
        ensemble_records.append(record)

    return pd.DataFrame(ensemble_records)


def main():
    forecasts_df = load_latest_forecasts()

    if forecasts_df.empty:
        print("No model forecasts found.")
        return

    n_models = forecasts_df[["_team", "_model"]].drop_duplicates().shape[0]
    print(f"Found forecasts from {n_models} model(s).")

    if n_models < MIN_MODELS:
        print(f"Need at least {MIN_MODELS} models for ensemble. Skipping.")
        return

    ensemble_df = generate_ensemble(forecasts_df)

    if ensemble_df.empty:
        print("No ensemble forecasts generated.")
        return

    ENSEMBLE_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    output_path = ENSEMBLE_DIR / f"{today}-MacroHub-Ensemble.csv"
    ensemble_df.to_csv(output_path, index=False)
    print(f"Saved {len(ensemble_df)} ensemble rows to {output_path}")


if __name__ == "__main__":
    main()
