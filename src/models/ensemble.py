"""
Generate the hub ensemble forecast for one forecast origin.

The ensemble uses an equal-weight median aggregation: for each target, horizon,
location, and quantile level, the ensemble value is the median across all
models that submitted a forecast for that origin.

Run after the submission window closes (the monthly workflow runs it on the 18th
for the 17th): `python src/models/ensemble.py [--origin YYYY-MM-DD]`.
"""

import argparse
from datetime import date
from pathlib import Path

import pandas as pd

HUB_ROOT = Path(__file__).resolve().parents[2]
MODEL_OUTPUT_DIR = HUB_ROOT / "model-output"
ENSEMBLE_DIR = HUB_ROOT / "model-output" / "MacroHub-Ensemble"

# Minimum number of models required to form an ensemble
MIN_MODELS = 2

GROUP_COLS = ["origin_date", "target", "target_end_date", "horizon",
              "location", "output_type", "output_type_id"]


def load_origin_forecasts(origin: str) -> pd.DataFrame:
    """Every model's file for this origin; a model's older files never stand in."""
    dfs = [pd.read_csv(path).assign(_model=path.parent.name)
           for path in sorted(MODEL_OUTPUT_DIR.glob(f"*/{origin}-*.csv"))
           if path.parent.name != ENSEMBLE_DIR.name]
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()


def generate_ensemble(forecasts: pd.DataFrame) -> pd.DataFrame:
    """Median per group over at least MIN_MODELS models.

    Mean rows (empty output_type_id) drop out of the grouping, so the ensemble
    submits quantiles only and is scored on its median.
    """
    if forecasts.empty:
        return forecasts
    agg = forecasts.groupby(GROUP_COLS).agg(
        value=("value", "median"), n=("_model", "nunique")).reset_index()
    return agg.loc[agg.n >= MIN_MODELS].drop(columns="n")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default=date.today().replace(day=17).isoformat(),
                        help="Forecast origin (default: the 17th of this month)")
    origin = parser.parse_args(argv).origin

    forecasts = load_origin_forecasts(origin)
    ensemble_df = generate_ensemble(forecasts)
    if ensemble_df.empty:
        print(f"No ensemble for {origin}: fewer than {MIN_MODELS} models submitted.")
        return

    ENSEMBLE_DIR.mkdir(parents=True, exist_ok=True)
    output_path = ENSEMBLE_DIR / f"{origin}-MacroHub-Ensemble.csv"
    ensemble_df.to_csv(output_path, index=False)
    print(f"Saved {len(ensemble_df)} ensemble rows from "
          f"{forecasts._model.nunique()} models to {output_path}")


if __name__ == "__main__":
    main()
