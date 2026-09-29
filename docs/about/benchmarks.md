# Foundation benchmarks

The hub includes a runner for [FoundationForecast](https://github.com/TimeCopilot/foundationforecast)
with these fixed model versions:

| Model | Checkpoint | Submitted outputs |
|---|---|---|
| Chronos | `amazon/chronos-2` | Five quantiles |
| TimesFM | `google/timesfm-2.5-200m-pytorch` | Mean and five quantiles |
| Toto | `Datadog/Toto-Open-Base-1.0` | Five quantiles from 128 samples |

Each model forecasts INDPRO, CPIAUCSL, PCEPI, and UNRATE for 24 months using
up to 512 monthly changes before the origin. Models run without fine-tuning.
The same transformations and scoring rules apply as for the other benchmarks.
An isolated missing month is filled with the previous level before differencing;
longer gaps stop the run. Only data before the origin is used for this fill.

FoundationForecast 0.1.10 returns median point forecasts for Chronos-2 and Toto;
these are not submitted as means, so their RMSE is unavailable. TimesFM's
requested 5th and 95th percentiles are clamped to its outer native quantile knots
by the wrapper. This affects its interval coverage and quantile loss.

Historical runs use revised observations and may overlap the models' pretraining
data. Treat them as retrospective comparisons, not prospective performance.

## Run locally

Use a separate Python 3.11 environment with sufficient space for PyTorch,
FoundationForecast's dependencies, and downloaded model weights. A CUDA GPU
speeds up inference; the wrapper also supports CPU execution.

```bash
python3.11 -m venv .venv-foundation
.venv-foundation/bin/python -m pip install -r requirements-foundation.txt
.venv-foundation/bin/python -m src.models.foundation --origin 2026-04-15
```

To backfill monthly origins, or run just one model:

```bash
.venv-foundation/bin/python -m src.models.foundation --models Chronos --start 2000-01-17 --end 2026-03-17
```

Existing forecast files are kept so an interrupted run can resume. Invalid input,
missing forecast months, non-finite values, and crossing quantiles stop the run
before that file is saved. No substitute model is used on failure.

Outputs go to `model-output/BASELINE-{model}/`. After generating forecasts,
refresh the scores and website data in the usual hub environment:

```bash
python src/scoring/score_forecasts.py
python src/generate_dashboard_data.py
mkdocs build --strict
```

Models appear in the dashboards once their forecast files and dashboard data
have been generated; adding metadata alone does not create benchmark results.
