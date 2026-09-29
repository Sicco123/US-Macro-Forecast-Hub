"""FoundationForecast benchmarks in the hub's monthly change space.

Run from the repository root with `python -m src.models.foundation --help`.
Historical runs use revised truth, not historical release vintages.
"""
import argparse
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from .baseline import LOG_DIFF_TARGETS, REQUIRED_QUANTILES, TARGET_DATA_PATH
from ..validation.validate_forecast import REQUIRED_COLUMNS

HUB_ROOT = Path(__file__).resolve().parents[2]
TARGETS = ("INDPRO", "CPIAUCSL", "PCEPI", "UNRATE")
CHECKPOINTS = {
    "Chronos": "amazon/chronos-2",
    "TimesFM": "google/timesfm-2.5-200m-pytorch",
    "Toto": "Datadog/Toto-Open-Base-1.0",
}
HORIZONS = 24
CONTEXT = 512


def prepare_history(truth, origin):
    """Validate monthly levels, cut at origin, then transform without lookahead."""
    frames = []
    for target in TARGETS:
        history = truth.loc[truth.target == target, ["truth_date", "value"]].copy()
        history["truth_date"] = pd.to_datetime(history.truth_date)
        history = history.loc[history.truth_date < pd.Timestamp(origin)].sort_values("truth_date")
        if len(history) < 25:
            raise ValueError(f"{target}: at least 25 monthly levels required before {origin}")
        dates = pd.DatetimeIndex(history.truth_date)
        if dates.has_duplicates or not dates.is_month_end.all():
            raise ValueError(f"{target}: history must have unique month-end dates")
        values = history.value.to_numpy(dtype=float)
        if not np.isfinite(values).all() or (target in LOG_DIFF_TARGETS and (values <= 0).any()):
            raise ValueError(f"{target}: invalid levels in input history")
        # The hub has isolated missing months. Forward-fill levels using only
        # pre-origin data; never compress two calendar months into one step.
        # ponytail: one-month gaps only; longer gaps need an explicit data policy.
        levels = history.set_index("truth_date").value.asfreq("ME").ffill(limit=1)
        if levels.isna().any():
            raise ValueError(f"{target}: history contains a gap longer than one month")
        dates, values = levels.index, levels.to_numpy(dtype=float)
        changes = np.diff(np.log(values) if target in LOG_DIFF_TARGETS else values)
        frames.append(pd.DataFrame({"unique_id": target, "ds": dates[1:], "y": changes}).tail(CONTEXT))
    return pd.concat(frames, ignore_index=True)


def hub_rows(forecasts, history, origin, model):
    """Convert and validate the pinned package's percentile column convention."""
    qcols = [f"{model}-q-{100 * q:g}" for q in REQUIRED_QUANTILES]
    # In FoundationForecast 0.1.10, Chronos-2 and Toto return medians as their
    # point column. Do not mislabel those as means for RMSE evaluation.
    value_cols = qcols + ([model] if model == "TimesFM" else [])
    required = {"unique_id", "ds", *value_cols}
    if not required.issubset(forecasts.columns):
        raise ValueError(f"{model}: missing forecast columns {required - set(forecasts.columns)}")
    if set(forecasts.unique_id) != set(TARGETS):
        raise ValueError(f"{model}: output must contain exactly the four hub targets")
    rows = []
    for target in TARGETS:
        block = forecasts.loc[forecasts.unique_id == target].sort_values("ds")
        last = history.loc[history.unique_id == target, "ds"].max()
        expected = pd.date_range(last + pd.offsets.MonthEnd(1), periods=HORIZONS, freq="ME")
        if not pd.DatetimeIndex(pd.to_datetime(block.ds)).equals(expected):
            raise ValueError(f"{model}/{target}: expected 24 consecutive forecast months")
        values = block[value_cols].to_numpy(dtype=float)
        if not np.isfinite(values).all() or (np.diff(values[:, :5], axis=1) < 0).any():
            raise ValueError(f"{model}/{target}: non-finite or crossing quantiles")
        for horizon, (month, predictions) in enumerate(zip(expected, values)):
            base = dict(origin_date=str(origin), target=target,
                        target_end_date=month.strftime("%Y-%m-%d"), horizon=horizon, location="US")
            for q, value in zip(REQUIRED_QUANTILES, predictions[:5]):
                rows.append({**base, "output_type": "quantile", "output_type_id": q, "value": float(value)})
            if model == "TimesFM":
                rows.append({**base, "output_type": "mean", "output_type_id": "", "value": float(predictions[-1])})
    return pd.DataFrame(rows, columns=REQUIRED_COLUMNS)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", nargs="+", choices=CHECKPOINTS, default=list(CHECKPOINTS))
    parser.add_argument("--origin", type=date.fromisoformat, help="One forecast origin (YYYY-MM-DD)")
    parser.add_argument("--start", type=date.fromisoformat, help="First monthly backfill origin")
    parser.add_argument("--end", type=date.fromisoformat, help="Last monthly backfill origin")
    parser.add_argument("--target-data", type=Path, default=TARGET_DATA_PATH)
    parser.add_argument("--output-dir", type=Path, default=HUB_ROOT / "model-output")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    if bool(args.start) != bool(args.end) or bool(args.origin) == bool(args.start):
        parser.error("choose --origin OR both --start and --end")
    if args.start and (args.start > args.end or args.start.day != 17 or args.end.day != 17):
        parser.error("backfill endpoints must be ordered dates on the 17th")
    origins = [args.origin] if args.origin else [d.date().replace(day=17) for d in pd.date_range(
        args.start.replace(day=1), args.end.replace(day=1), freq="MS")]
    truth = pd.read_csv(args.target_data)
    # Validate all requested inputs before downloading any model weights.
    histories = {origin: prepare_history(truth, origin) for origin in origins}
    try:
        import torch
        from foundationforecast import FoundationForecast
        from foundationforecast.models import Chronos, TimesFM, Toto
    except ImportError as exc:
        raise SystemExit("Install requirements-foundation.txt in a separate Python 3.11 environment.") from exc
    classes = {"Chronos": Chronos, "TimesFM": TimesFM, "Toto": Toto}
    for name in args.models:
        kwargs = {"repo_id": CHECKPOINTS[name], "alias": name, "batch_size": 4}
        if name != "Chronos":
            kwargs["context_length"] = CONTEXT
        model = classes[name](**kwargs)
        forecaster = FoundationForecast(models=[model])
        try:
            for origin, history in histories.items():
                path = args.output_dir / f"BASELINE-{name}" / f"{origin}-BASELINE-{name}.csv"
                if path.exists():
                    print(f"Keeping existing {path}", flush=True)
                    continue
                np.random.seed(args.seed)
                torch.manual_seed(args.seed)
                print(f"Forecasting {name} at {origin} ({CHECKPOINTS[name]})", flush=True)
                forecasts = forecaster.forecast(history, h=HORIZONS, freq="ME", quantiles=REQUIRED_QUANTILES)
                output = hub_rows(forecasts, history, origin, name)
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary = path.with_suffix(".csv.tmp")
                output.to_csv(temporary, index=False)
                temporary.replace(path)
                print(f"Saved {len(output)} rows to {path}", flush=True)
        finally:
            model.clear_model_cache()


if __name__ == "__main__":
    main()
