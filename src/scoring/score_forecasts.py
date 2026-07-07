"""
Score all submitted forecasts against observed target data.

Metrics computed:
  - MAE — absolute error of median (Q0.5) forecast
  - SqErr — squared error of mean forecast (sqrt of avg → RMSE)

Comparison space (forecasts and truth evaluated in same transformed scale):
  INDPRO, CPIAUCSL, PCEPI → Δlog(x)  monthly log difference
  UNRATE                  → Δx       monthly first difference
  all others              → level (unchanged)

Fully vectorized — no Python loops over forecast groups.
"""

from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

HUB_ROOT = Path(__file__).resolve().parents[2]
TARGET_DATA_PATH = HUB_ROOT / "target-data" / "latest-target_values.csv"
MODEL_OUTPUT_DIR = HUB_ROOT / "model-output"
EVALUATION_DIR = HUB_ROOT / "model-evaluation"

BASE_COLS = ["origin_date", "target", "target_end_date", "horizon",
             "location", "team_id", "model_id"]
Q_LEVELS = [0.05, 0.1, 0.5, 0.9, 0.95]

# Targets evaluated in log-diff or diff space
LOG_DIFF_TARGETS = {"INDPRO", "CPIAUCSL", "PCEPI"}
DIFF_TARGETS = {"UNRATE"}


def load_all_forecasts() -> pd.DataFrame:
    """Load all forecast CSVs from model-output/."""
    dfs = []
    for model_dir in MODEL_OUTPUT_DIR.iterdir():
        if not model_dir.is_dir() or model_dir.name.startswith("."):
            continue
        parts = model_dir.name.split("-", 1)
        if len(parts) != 2:
            continue
        team_id, model_id = parts
        for f in sorted(model_dir.glob("*.csv")):
            try:
                df = pd.read_csv(f)
                df["team_id"] = team_id
                df["model_id"] = model_id
                dfs.append(df)
            except Exception as e:
                print(f"Warning: {f}: {e}")
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()


def score_all() -> pd.DataFrame:
    """Score all forecasts — fully vectorized."""
    # ── Load data ──────────────────────────────────────────────────────────
    target_df = pd.read_csv(TARGET_DATA_PATH)
    target_df["truth_date"] = pd.to_datetime(target_df["truth_date"])
    target_df = target_df.sort_values(["target", "truth_date"]).reset_index(drop=True)
    fc = load_all_forecasts()
    if fc.empty:
        return pd.DataFrame()

    print(f"  Loaded {len(fc):,} forecast rows")

    # ── Transform truth to comparison space ───────────────────────────────
    # Levels for most targets; Δlog for INDPRO/CPIAUCSL/PCEPI; Δ for UNRATE
    target_df["observed"] = target_df["value"].astype(float)
    for t in LOG_DIFF_TARGETS:
        mask = target_df["target"] == t
        vals = target_df.loc[mask, "value"].values.astype(float)
        transformed = np.concatenate([[np.nan], np.diff(np.log(vals))])
        target_df.loc[mask, "observed"] = transformed
    for t in DIFF_TARGETS:
        mask = target_df["target"] == t
        vals = target_df.loc[mask, "value"].values.astype(float)
        transformed = np.concatenate([[np.nan], np.diff(vals)])
        target_df.loc[mask, "observed"] = transformed

    # Merge truth values (convert datetime back to string to match forecast format)
    truth = target_df.rename(columns={"truth_date": "target_end_date"}).copy()
    truth["target_end_date"] = truth["target_end_date"].dt.strftime("%Y-%m-%d")
    fc = fc.merge(truth[["target", "target_end_date", "observed"]],
                  on=["target", "target_end_date"], how="inner")

    # ── Quantile forecasts: pivot wide ─────────────────────────────────────
    q_fc = fc[fc["output_type"] == "quantile"].copy()
    q_fc["output_type_id"] = q_fc["output_type_id"].astype(float)
    q_fc["value"] = q_fc["value"].astype(float)

    q_pivot = q_fc.pivot_table(
        index=BASE_COLS + ["observed"],
        columns="output_type_id",
        values="value",
        aggfunc="first",
    ).reset_index()

    obs = q_pivot["observed"].values
    n = len(q_pivot)
    avail_q = sorted([c for c in q_pivot.columns if isinstance(c, float)])

    # ── MAE from Q0.5 ─────────────────────────────────────────────────────
    mae = np.full(n, np.nan)
    if 0.5 in avail_q:
        mae = np.abs(q_pivot[0.5].values.astype(float) - obs)

    # ── Build base DataFrame from pivot ────────────────────────────────────
    base = q_pivot[BASE_COLS].copy()
    base["MAE"] = np.round(mae, 6)

    # ── SqErr from mean forecast ───────────────────────────────────────────
    mean_fc = fc[fc["output_type"] == "mean"][
        BASE_COLS + ["value", "observed"]
    ].copy()
    mean_fc["value"] = mean_fc["value"].astype(float)
    mean_fc["SqErr"] = np.round((mean_fc["value"] - mean_fc["observed"]) ** 2, 8)

    base = base.merge(mean_fc[BASE_COLS + ["SqErr"]], on=BASE_COLS, how="left")

    print(f"  Scored {len(base):,} forecast groups")

    # ── Melt to long format ────────────────────────────────────────────────
    metric_cols = ["MAE", "SqErr"]
    long = base.melt(
        id_vars=BASE_COLS,
        value_vars=metric_cols,
        var_name="metric",
        value_name="value_absolute",
    ).dropna(subset=["value_absolute"])

    # ── Relative scores (vs RandomWalk baseline) ──────────────────────────
    ratio_metrics = {"MAE", "SqErr"}
    merge_keys = ["target", "target_end_date", "horizon", "location", "metric"]
    bl = long[(long["team_id"] == "MacroHub") & (long["model_id"] == "RandomWalk")][
        merge_keys + ["value_absolute"]
    ].rename(columns={"value_absolute": "_bl"}).drop_duplicates(subset=merge_keys)

    long = long.merge(bl, on=merge_keys, how="left")
    is_ratio = long["metric"].isin(ratio_metrics)
    bl_ok = long["_bl"].notna() & (long["_bl"] > 0)
    long["value_relative"] = np.where(
        is_ratio & bl_ok,
        np.round(long["value_absolute"] / long["_bl"], 2),
        np.nan,
    )
    long.drop(columns=["_bl"], inplace=True)

    # ── Ranks ──────────────────────────────────────────────────────────────
    rank_group = ["target", "target_end_date", "horizon", "location", "metric"]
    long["n_models"] = long.groupby(rank_group)["value_absolute"].transform("count").astype(int)

    def _rank_grp(g):
        return g["value_absolute"].rank(method="min").astype(int)

    long["rank"] = long.groupby(rank_group, group_keys=False).apply(_rank_grp)

    return long


def main():
    import time
    t0 = time.time()
    scores_df = score_all()

    if scores_df.empty:
        print("No scores computed.")
        return

    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)

    # Gzipped CSV: ~5x smaller, keeps files well under GitHub's 100 MB limit.
    # pandas reads/writes .csv.gz transparently based on the extension.
    latest_path = EVALUATION_DIR / "latest-forecast_scores.csv.gz"
    scores_df.to_csv(latest_path, index=False)
    print(f"Saved {len(scores_df):,} scores to {latest_path}")

    snapshot_dir = EVALUATION_DIR / "snapshots"
    snapshot_dir.mkdir(exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    snapshot_path = snapshot_dir / f"{today}-forecast_scores.csv.gz"
    scores_df.to_csv(snapshot_path, index=False)
    print(f"Saved snapshot to {snapshot_path}")

    # Keep only recent snapshots — each is a full copy of the scores table,
    # so an unbounded archive is what blew past GitHub's file size limit.
    KEEP_SNAPSHOTS = 6
    for p in sorted(snapshot_dir.glob("*-forecast_scores.csv.gz"))[:-KEEP_SNAPSHOTS]:
        p.unlink()
        print(f"Pruned old snapshot {p.name}")
    print(f"Total time: {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
