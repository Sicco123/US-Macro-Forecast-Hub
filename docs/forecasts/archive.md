# Forecast Archive

Historical forecasts are preserved by model and origin date in the repository.
Use the [forecast explorer](latest.md) to select an origin, inspect its prediction
intervals, and download the selected values.

<p class="dash-freshness" data-dashboard-freshness></p>

The archive includes retrospective backfills as well as later forecast files.
Backfilled origins should not be interpreted as prospective registrations.
Model availability varies by origin; the explorer lists the available models.

Forecasts for INDPRO, CPIAUCSL, and PCEPI use monthly log changes; UNRATE uses
monthly changes in percentage points. See [the methodology](../evaluation/methodology.md)
for the benchmark and scoring definitions.

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
