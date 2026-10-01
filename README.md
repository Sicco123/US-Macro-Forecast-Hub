# Macro Forecast Hub

A live forecasting arena for probabilistic forecasting of key U.S. macroeconomic
indicators from the [FRED-MD](https://research.stlouisfed.org/econ/mccracken/fred-databases/)
monthly dataset. New submissions use a strict 24-hour registration window.
The explorer and leaderboard also include retrospective historical backfills.

<div align="center">

**[🌐 Live Website & Leaderboard →](https://sicco123.github.io/US-Macro-Forecast-Hub/)**

</div>

> Inspired by [TS-Arena](https://ts-arena.live/), the
> [European COVID-19 Forecast Hub](https://github.com/european-modelling-hubs/RespiCast-Covid19),
> and the [Infectious Disease Modeling Hubs](https://hubverse.io/) ecosystem.

---

## The Website

The hub website is deployed automatically to GitHub Pages on every push to `main`:

**https://sicco123.github.io/US-Macro-Forecast-Hub/**

| Page | What you'll find |
|------|------------------|
| [Leaderboard](https://sicco123.github.io/US-Macro-Forecast-Hub/) | Benchmark-relative geometric means and ranks for MAE, RMSE, and quantile loss. |
| [Forecasts](https://sicco123.github.io/US-Macro-Forecast-Hub/forecasts/latest/) | Monthly forecast explorer with 80%/90% prediction bands and playback. |
| [Evaluation](https://sicco123.github.io/US-Macro-Forecast-Hub/evaluation/history/) | Rolling and cumulative score histories. |
| [Participate](https://sicco123.github.io/US-Macro-Forecast-Hub/participate/how-to-submit/) | Submission guide and registration schedule. |

To preview locally:

```bash
pip install mkdocs-material pymdown-extensions
mkdocs serve   # → http://127.0.0.1:8000
```

---

## Overview

The Macro Forecast Hub collects monthly probabilistic forecasts from multiple
teams and models, evaluates them against realized data, and produces an ensemble
forecast combining the wisdom of all participants.

### Target Indicators

| # | ID | Indicator | Category | Required |
|---|-----|-----------|----------|----------|
| 1 | `INDPRO` | Industrial Production Index | Real Activity | Yes |
| 2 | `UNRATE` | Unemployment Rate | Labor Market | Yes |
| 3 | `PAYEMS` | Total Nonfarm Payrolls | Labor Market | |
| 4 | `CPIAUCSL` | Consumer Price Index | Prices | Yes |
| 5 | `PCEPI` | PCE Price Index | Prices | |
| 6 | `FEDFUNDS` | Federal Funds Rate | Interest Rates | |
| 7 | `GS10` | 10-Year Treasury Rate | Interest Rates | |
| 8 | `TB3MS` | 3-Month Treasury Bill | Interest Rates | |
| 9 | `HOUST` | Housing Starts | Housing | |
| 10 | `M2SL` | M2 Money Stock | Money & Credit | |
| 11 | `DPCERA3M086SBEA` | Real Personal Consumption | Real Activity | |
| 12 | `RETAILx` | Retail Sales | Real Activity | |

### Forecast Specifications

- **Frequency:** Monthly
- **Horizons:** 24 monthly steps, stored as `0` through `23`; the first step is the month after the latest observation available to the model
- **Output:** 5 quantile levels (0.05, 0.1, 0.5, 0.9, 0.95) + optional mean
- **Submission window:** 24 hours — the 17th of each month, 00:00–23:59 US/Eastern (enforced by CI)
- **Evaluation metrics:** MAE (median forecast) and RMSE (mean forecast, or median when no mean is submitted), absolute and relative to the naive benchmark

---

## Repository Structure

```
Macro-Forecast-Hub/
├── hub-config/                  # Hub configuration
│   ├── admin.json               #   Hub metadata and contact
│   ├── tasks.json               #   Target definitions, horizons, output types
│   └── model-metadata-schema.json  # Metadata validation schema
├── model-output/                # Forecast submissions (one dir per model)
│   ├── MacroHub-RandomWalk/      #   Random walk baseline
│   ├── BASELINE-ARMA_BIC/       #   ARMA model with BIC selection
│   └── MacroHub-Ensemble/       #   Hub ensemble
├── model-metadata/              # Model/team descriptions (YAML)
├── model-evaluation/            # Forecast scores and rankings
├── target-data/                 # Ground truth from FRED-MD
│   ├── latest-target_values.csv
│   ├── snapshots/               #   Historical data vintages
│   └── fetch_fred_md.py         #   Download script
├── supporting-files/            # Reference tables
│   ├── indicators.csv           #   Target indicator definitions
│   ├── forecast_months.csv      #   Submission schedule
│   └── locations.csv            #   Location codes
├── src/                         # Source code
│   ├── validation/              #   Submission validation scripts
│   ├── scoring/                 #   Forecast evaluation
│   └── models/                  #   Baseline and ensemble generators
├── docs/                        # Website (mkdocs-material)
├── .github/workflows/           # CI/CD automation
└── mkdocs.yml                   # Website configuration
```

---

## Quick Start

### Submit Forecasts

1. **Fork** this repository
2. **Create** your model directory: `model-output/{team}-{model}/`
3. **Add** your forecast CSV: `YYYY-MM-DD-{team}-{model}.csv`
4. **Add** your metadata YAML: `model-metadata/{team}-{model}.yml`
5. **Open** a pull request — validation runs automatically

See [docs/participate/](docs/participate/) for detailed instructions.

### Forecast File Format

```csv
origin_date,target,target_end_date,horizon,location,output_type,output_type_id,value
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.05,-0.003
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.1,0.0
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.5,0.002
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.9,0.005
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.95,0.007
2026-04-17,INDPRO,2026-04-30,0,US,mean,,0.002
...
```

### Run Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Fetch latest FRED-MD target data
python target-data/fetch_fred_md.py

# Generate baseline forecast
python src/models/baseline.py

# Validate a submission
CHANGED_FILES="model-output/MyTeam-MyModel/2026-04-17-MyTeam-MyModel.csv" \
  python src/validation/validate_forecast.py

# Score forecasts
python src/scoring/score_forecasts.py

# Build the website locally
mkdocs serve
```

---

## Automation

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `validate_submission` | PR to `model-output/` | Validates forecast format and metadata |
| `update_target_data` | 10th monthly | Fetches latest FRED-MD data |
| `generate_baseline` | After data update | Produces baseline & ensemble forecasts |
| `scoring` | After data update | Evaluates all forecasts against realized values |
| `deploy_website` | Push to `docs/` | Builds and deploys the GitHub Pages site |

---

## Data Source

All target data comes from **FRED-MD**, a monthly macroeconomic database
maintained by the Federal Reserve Bank of St. Louis.

> McCracken, M.W. and Ng, S. (2016), "FRED-MD: A Monthly Database for
> Macroeconomic Research," *Journal of Business & Economic Statistics*, 34:4,
> 574-589.

---

## License

- **Code:** MIT License
- **Forecast data:** As specified in each model's metadata
- **Target data:** Subject to FRED terms of use

## Dashboard checks

Run `node tests/dashboard.cjs` for the dashboard regression checks (Node.js,
no packages required), then `mkdocs build --strict` to validate the site.
The checks cover data aggregation and interaction logic using DOM/Plotly doubles;
viewport, screen-reader, and browser rendering still require a browser check.

## Foundation benchmarks

Chronos-2, TimesFM 2.5, and Toto 1.0 use the optional
[FoundationForecast runner](docs/about/benchmarks.md). Install
`requirements-foundation.txt` in a separate Python 3.11 environment, then run:

```bash
python target-data/fetch_fred_md.py --panel-only
python -m src.models.foundation --origin 2026-04-15
# Or resume monthly historical forecasts for selected models:
python -m src.models.foundation --models Chronos TimesFM Toto --start 2000-01-17 --end 2026-03-17
```

Outputs use the existing `BASELINE-{model}` submission format. Re-run scoring
and `src/generate_dashboard_data.py` to include them in the website. Historical
runs use revised truth and may overlap model pretraining. Chronos and Toto
submit quantiles only because the wrapper's point forecasts are medians.

The corrected runner forecasts the full FRED-MD panel before selecting the four
hub targets. Chronos-2 and Toto run jointly across variables; TimesFM 2.5 remains
an independent-series comparator. Full-panel forecasts are saved separately in
`model-panel-output/`. Auxiliary series use the official transformation codes;
the four hub targets keep their existing scoring transformations.

The repository's existing target-only results include 316 origins per model: January 2000–March 2026
monthly backfills and April 15, 2026. All three are included in the refreshed
ensemble, scores, and dashboard data. These existing results have not been
regenerated with the corrected full-panel runner.

Adapter checks without model downloads:

```bash
PYTHONPATH=. python tests/foundation.py
PYTHONPATH=. .venv-foundation/bin/python tests/panel_inference.py
PYTHONPATH=. python tests/scoring.py
node tests/dashboard.cjs
```
