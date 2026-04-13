"""
Generate JSON data files for the interactive website dashboard.

Reads model-output/, model-evaluation/, and target-data/ to produce
compact JSON files consumed by the Plotly.js frontend.

Output files (in docs/data/):
  - truth.json           Ground truth time series per target
  - forecasts_{TGT}.json Forecast data per target (all models, all origins)
  - scores_{TGT}.json    Score time series per target
  - summary.json         Pre-aggregated summary table for leaderboard
"""

import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

HUB_ROOT = Path(__file__).resolve().parents[1]
TARGET_DATA = HUB_ROOT / "target-data" / "latest-target_values.csv"
MODEL_OUTPUT = HUB_ROOT / "model-output"
SCORES_FILE = HUB_ROOT / "model-evaluation" / "latest-forecast_scores.csv"
OUT_DIR = HUB_ROOT / "docs" / "data"

# Only targets that have been scored (backfill targets)
SCORED_TARGETS = ["INDPRO", "CPIAUCSL", "PCEPI", "UNRATE"]

QUANTILE_KEYS = ["q005", "q010", "q050", "q090", "q095"]
QUANTILE_LEVELS = [0.05, 0.1, 0.5, 0.9, 0.95]
Q_MAP = dict(zip(QUANTILE_LEVELS, QUANTILE_KEYS))

METRICS = ["WIS", "MAE", "SqErr", "MeanQS",
           "Coverage_80", "Coverage_90", "IntervalWidth_80", "IntervalWidth_90"]


def round_list(arr, decimals=4):
    """Round a list/array of floats, replacing NaN with None."""
    out = []
    for v in arr:
        if v is None or (isinstance(v, float) and np.isnan(v)):
            out.append(None)
        else:
            out.append(round(float(v), decimals))
    return out


def generate_truth():
    """Generate truth.json with time series per target."""
    df = pd.read_csv(TARGET_DATA)
    truth = {}
    for tgt in df["target"].unique():
        sub = df[df["target"] == tgt].sort_values("truth_date")
        truth[tgt] = {
            "dates": sub["truth_date"].tolist(),
            "values": round_list(sub["value"].values),
        }
    with open(OUT_DIR / "truth.json", "w") as f:
        json.dump(truth, f, separators=(",", ":"))
    print(f"  truth.json ({len(truth)} targets)")


def generate_forecasts():
    """Generate one JSON per scored target with all forecast data."""
    # Collect all forecast CSVs
    all_dfs = []
    for model_dir in MODEL_OUTPUT.iterdir():
        if not model_dir.is_dir() or model_dir.name.startswith("."):
            continue
        model_name = model_dir.name
        for csv_file in sorted(model_dir.glob("*.csv")):
            try:
                df = pd.read_csv(csv_file)
                df["model"] = model_name
                all_dfs.append(df)
            except Exception:
                continue

    if not all_dfs:
        print("  No forecast files found")
        return

    fc = pd.concat(all_dfs, ignore_index=True)

    for tgt in SCORED_TARGETS:
        tgt_fc = fc[fc["target"] == tgt].copy()
        if tgt_fc.empty:
            continue

        origin_dates = sorted(tgt_fc["origin_date"].unique())
        models = sorted(tgt_fc["model"].unique())

        result = {
            "target": tgt,
            "origin_dates": origin_dates,
            "models": {},
        }

        for model in models:
            model_data = {}
            mdf = tgt_fc[tgt_fc["model"] == model]

            for od in origin_dates:
                od_df = mdf[mdf["origin_date"] == od]
                if od_df.empty:
                    continue

                # Get quantile forecasts
                q_df = od_df[od_df["output_type"] == "quantile"].copy()
                mean_df = od_df[od_df["output_type"] == "mean"]

                if q_df.empty:
                    continue

                q_df["output_type_id"] = q_df["output_type_id"].astype(float)

                # Group by target_end_date (one per horizon)
                teds = sorted(q_df["target_end_date"].unique())
                entry = {"ted": teds}

                for ql, qk in Q_MAP.items():
                    vals = []
                    for ted in teds:
                        row = q_df[(q_df["target_end_date"] == ted) &
                                   (q_df["output_type_id"] == ql)]
                        vals.append(round(float(row["value"].iloc[0]), 4) if len(row) > 0 else None)
                    entry[qk] = vals

                # Mean forecast
                mean_vals = []
                for ted in teds:
                    row = mean_df[mean_df["target_end_date"] == ted]
                    mean_vals.append(round(float(row["value"].iloc[0]), 4) if len(row) > 0 else None)
                entry["mean"] = mean_vals

                model_data[od] = entry

            result["models"][model] = model_data

        out_path = OUT_DIR / f"forecasts_{tgt}.json"
        with open(out_path, "w") as f:
            json.dump(result, f, separators=(",", ":"))
        print(f"  forecasts_{tgt}.json ({len(origin_dates)} origins, {len(models)} models)")


def generate_scores():
    """Generate score time series JSON per target and summary JSON."""
    if not SCORES_FILE.exists():
        print("  No scores file found")
        return

    df = pd.read_csv(SCORES_FILE)
    df["model"] = df["team_id"] + "-" + df["model_id"]

    # --- Per-target score time series ---
    for tgt in SCORED_TARGETS:
        tdf = df[df["target"] == tgt]
        if tdf.empty:
            continue

        origin_dates = sorted(tdf["origin_date"].unique())
        models = sorted(tdf["model"].unique())
        horizons = sorted(tdf["horizon"].unique())

        result = {
            "target": tgt,
            "origin_dates": origin_dates,
            "horizons": [int(h) for h in horizons],
            "metrics": METRICS,
            "models": {},
        }

        for model in models:
            mdf = tdf[tdf["model"] == model]
            model_scores = {}

            for h in horizons:
                hdf = mdf[mdf["horizon"] == h]
                hkey = f"h{int(h)}"
                metric_data = {}

                for metric in METRICS:
                    metric_df = hdf[hdf["metric"] == metric]
                    # Build array aligned with origin_dates
                    od_to_val = dict(zip(metric_df["origin_date"], metric_df["value_absolute"]))
                    vals = [od_to_val.get(od) for od in origin_dates]
                    metric_data[metric] = round_list(vals, 6)

                model_scores[hkey] = metric_data

            result["models"][model] = model_scores

        out_path = OUT_DIR / f"scores_{tgt}.json"
        with open(out_path, "w") as f:
            json.dump(result, f, separators=(",", ":"))
        print(f"  scores_{tgt}.json ({len(origin_dates)} origins)")

    # --- Summary table ---
    models = sorted(df["model"].unique())
    targets = SCORED_TARGETS

    summary = {
        "models": models,
        "targets": targets,
        "avg_rank": {},
        "avg_score": {},
    }

    for metric in ["MAE", "SqErr", "WIS"]:
        mdf = df[df["metric"] == metric]
        rank_data = {}
        score_data = {}

        for model in models:
            model_ranks = {}
            model_scores = {}
            for tgt in targets:
                sub = mdf[(mdf["model"] == model) & (mdf["target"] == tgt)]
                if not sub.empty:
                    model_ranks[tgt] = round(float(sub["rank"].mean()), 2)
                    model_scores[tgt] = round(float(sub["value_absolute"].mean()), 4)
                    # Overall across targets
                else:
                    model_ranks[tgt] = None
                    model_scores[tgt] = None

            # Add overall average
            vals = [v for v in model_ranks.values() if v is not None]
            model_ranks["Overall"] = round(sum(vals) / len(vals), 2) if vals else None
            vals = [v for v in model_scores.values() if v is not None]
            model_scores["Overall"] = round(sum(vals) / len(vals), 4) if vals else None

            rank_data[model] = model_ranks
            score_data[model] = model_scores

        summary["avg_rank"][metric] = rank_data
        summary["avg_score"][metric] = score_data

    out_path = OUT_DIR / "summary.json"
    with open(out_path, "w") as f:
        json.dump(summary, f, separators=(",", ":"))
    print(f"  summary.json ({len(models)} models, {len(targets)} targets)")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("Generating dashboard data...")
    generate_truth()
    generate_forecasts()
    generate_scores()
    print("Done!")


if __name__ == "__main__":
    main()
