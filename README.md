# Macro Forecast Hub

A collaborative platform for probabilistic forecasting of key U.S. macroeconomic
indicators from the [FRED-MD](https://research.stlouisfed.org/econ/mccracken/fred-databases/)
monthly dataset.

> Inspired by the [European COVID-19 Forecast Hub](https://github.com/european-modelling-hubs/RespiCast-Covid19)
> and the [Infectious Disease Modeling Hubs](https://hubverse.io/) ecosystem.

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
| 3 | `PAYEMS` | Total Nonfarm Payrolls | Labor Market | Yes |
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
- **Horizons:** 1 through 24 months ahead
- **Output:** 5 quantile levels (0.05, 0.1, 0.5, 0.9, 0.95) + optional mean
- **Submission deadline:** 17th of each month
- **Evaluation metric:** Weighted Interval Score (WIS)

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
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.05,99.5
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.1,100.1
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.5,102.3
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.9,104.5
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.95,105.2
2026-04-17,INDPRO,2026-04-30,0,US,mean,,102.4
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
