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
from pathlib import Path

import numpy as np
import pandas as pd

HUB_ROOT = Path(__file__).resolve().parents[1]
TARGET_DATA = HUB_ROOT / "target-data" / "latest-target_values.csv"
MODEL_OUTPUT = HUB_ROOT / "model-output"
SCORES_FILE = HUB_ROOT / "model-evaluation" / "latest-forecast_scores.csv.gz"
OUT_DIR = HUB_ROOT / "docs" / "data"

SCORED_TARGETS = ["INDPRO", "CPIAUCSL", "PCEPI", "UNRATE"]

# Targets evaluated in log-diff or diff space (must match score_forecasts.py)
LOG_DIFF_TARGETS = {"INDPRO", "CPIAUCSL", "PCEPI"}
DIFF_TARGETS = {"UNRATE"}

QUANTILE_LEVELS = [0.05, 0.1, 0.5, 0.9, 0.95]
QUANTILE_KEYS = ["q005", "q010", "q050", "q090", "q095"]
Q_MAP = dict(zip(QUANTILE_LEVELS, QUANTILE_KEYS))

METRICS = ["MAE", "SqErr"]


def _nan_round(arr, decimals=4):
    """Round array, converting NaN to None for JSON."""
    out = []
    for v in arr:
        if v is None or (isinstance(v, float) and np.isnan(v)):
            out.append(None)
        else:
            out.append(round(float(v), decimals))
    return out


def generate_truth():
    df = pd.read_csv(TARGET_DATA)
    truth = {}
    for tgt, sub in df.groupby("target"):
        sub = sub.sort_values("truth_date")
        values = sub["value"].values.astype(float)
        entry = {
            "dates": sub["truth_date"].tolist(),
            "values": _nan_round(values),
        }
        # Compute transformed values for scored targets so the frontend
        # can plot the truth in the same space as the forecast values.
        if tgt in LOG_DIFF_TARGETS:
            transformed = np.concatenate([[np.nan], np.diff(np.log(values))])
            entry["transformed_values"] = _nan_round(transformed)
            entry["transform"] = "log_diff"
        elif tgt in DIFF_TARGETS:
            transformed = np.concatenate([[np.nan], np.diff(values)])
            entry["transformed_values"] = _nan_round(transformed)
            entry["transform"] = "diff"
        else:
            entry["transform"] = "level"
        truth[tgt] = entry
    with open(OUT_DIR / "truth.json", "w") as f:
        json.dump(truth, f, separators=(",", ":"))
    print(f"  truth.json ({len(truth)} targets)")


def generate_forecasts():
    """Generate one JSON per scored target — vectorized with pivot tables."""
    dfs = []
    for model_dir in MODEL_OUTPUT.iterdir():
        if not model_dir.is_dir() or model_dir.name.startswith("."):
            continue
        model_name = model_dir.name
        for csv_file in sorted(model_dir.glob("*.csv")):
            try:
                df = pd.read_csv(csv_file, usecols=[
                    "origin_date", "target", "target_end_date",
                    "output_type", "output_type_id", "value",
                ])
                df["model"] = model_name
                dfs.append(df)
            except Exception:
                continue

    if not dfs:
        print("  No forecast files found")
        return

    fc = pd.concat(dfs, ignore_index=True)

    for tgt in SCORED_TARGETS:
        tgt_fc = fc[fc["target"] == tgt]
        if tgt_fc.empty:
            continue

        # --- Quantile data: pivot to wide format in one go ---
        q_fc = tgt_fc[tgt_fc["output_type"] == "quantile"].copy()
        q_fc["output_type_id"] = q_fc["output_type_id"].astype(float)
        q_fc["value"] = q_fc["value"].astype(float)

        q_pivot = q_fc.pivot_table(
            index=["model", "origin_date", "target_end_date"],
            columns="output_type_id",
            values="value",
            aggfunc="first",
        ).reset_index()

        # --- Mean data ---
        m_fc = tgt_fc[tgt_fc["output_type"] == "mean"].copy()
        m_fc["value"] = m_fc["value"].astype(float)
        m_fc = m_fc[["model", "origin_date", "target_end_date", "value"]].rename(
            columns={"value": "mean_val"}
        )
        q_pivot = q_pivot.merge(m_fc, on=["model", "origin_date", "target_end_date"], how="left")

        origin_dates = sorted(tgt_fc["origin_date"].unique())
        models = sorted(tgt_fc["model"].unique())

        result = {"target": tgt, "origin_dates": origin_dates, "models": {}}

        for model in models:
            mp = q_pivot[q_pivot["model"] == model]
            model_data = {}

            for od, od_df in mp.groupby("origin_date"):
                od_df = od_df.sort_values("target_end_date")
                teds = od_df["target_end_date"].tolist()
                entry = {"ted": teds}

                for ql, qk in Q_MAP.items():
                    if ql in od_df.columns:
                        entry[qk] = _nan_round(od_df[ql].values, 4)
                    else:
                        entry[qk] = [None] * len(teds)

                entry["mean"] = _nan_round(
                    od_df["mean_val"].values if "mean_val" in od_df.columns
                    else [None] * len(teds), 4
                )
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
        od_idx = {od: i for i, od in enumerate(origin_dates)}
        models = sorted(tdf["model"].unique())
        horizons = sorted(tdf["horizon"].unique())
        n_dates = len(origin_dates)

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
                    # SqErr values in log-diff space are tiny (≈1e-6); use 8dp.
                    # MAE in log-diff space is also small (≈1e-3); use 6dp.
                    decimals = 8 if metric == "SqErr" else 6
                    vals = [None] * n_dates
                    mrows = hdf[hdf["metric"] == metric]
                    for od, va in zip(mrows["origin_date"], mrows["value_absolute"]):
                        idx = od_idx.get(od)
                        if idx is not None:
                            vals[idx] = round(float(va), decimals) if not (isinstance(va, float) and np.isnan(va)) else None
                    metric_data[metric] = vals

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

    for metric in METRICS:
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
                else:
                    model_ranks[tgt] = None
                    model_scores[tgt] = None

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
