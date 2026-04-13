# Forecast Archive

All historical forecasts are preserved in the repository, organized by model
and submission date.

---

## Directory Structure

```
model-output/
├── MacroHub-Baseline/
│   ├── 2025-01-15-MacroHub-Baseline.csv
│   ├── 2025-02-15-MacroHub-Baseline.csv
│   └── ...
├── MacroHub-Ensemble/
│   └── ...
├── TeamA-ModelX/
│   └── ...
└── TeamB-ModelY/
    └── ...
```

Each file is named `YYYY-MM-DD-{team}-{model}.csv` where the date is the
origin date (forecast submission date).

---

## Data Access

Forecast files can be accessed directly from the repository or via the GitHub
API. All data is available under the license specified in each model's
metadata file.
