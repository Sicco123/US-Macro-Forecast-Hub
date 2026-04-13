# Forecast Archive

All historical forecasts are preserved in the repository, organized by model
and submission date. The backfill covers **January 2000 through March 2026**
(315 monthly origins per model).

---

## Models

### MacroHub-RandomWalk (Random Walk)

- **316 forecast files** (2000-01-17 to 2026-04-13)
- Targets: INDPRO, CPIAUCSL, PCEPI, UNRATE
- Point forecast = last observed value
- Quantiles from empirical h-step random-walk error distribution

### BASELINE-ARMA_BIC

- **316 forecast files** (2000-01-17 to 2026-04-15)
- Targets: INDPRO, CPIAUCSL, PCEPI, UNRATE
- ARIMA(p,d,q) with FRED-MD transformations; orders selected by BIC
- Quantiles from Gaussian predictive distribution, inverted to levels

---

## Directory Structure

```
model-output/
├── MacroHub-RandomWalk/
│   ├── 2000-01-17-MacroHub-RandomWalk.csv
│   ├── 2000-02-17-MacroHub-RandomWalk.csv
│   ├── ...
│   └── 2026-04-13-MacroHub-RandomWalk.csv
└── BASELINE-ARMA_BIC/
    ├── 2000-01-17-BASELINE-ARMA_BIC.csv
    ├── 2000-02-17-BASELINE-ARMA_BIC.csv
    ├── ...
    └── 2026-04-15-BASELINE-ARMA_BIC.csv
```

Each file is named `YYYY-MM-DD-{team}-{model}.csv` where the date is the
origin date (17th of each month).

---

## Data Access

Forecast files can be accessed directly from the repository or via the GitHub
API. All data is available under the license specified in each model's
metadata file.
