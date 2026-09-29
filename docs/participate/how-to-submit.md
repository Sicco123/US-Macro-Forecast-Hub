# How to Submit Forecasts

Submit through GitHub with a forecast CSV and, on your first submission, model
metadata. Prepare both files before the 17th; registration runs from 00:00 to
23:59 America/New_York (Eastern) on that date. You need forecasts for INDPRO,
UNRATE, and CPIAUCSL. PAYEMS and the other indicators are optional.

Use the [CSV format and examples](format.md) and [metadata template](metadata.md).
Stored horizons are 0–23; values for scored indicators use transformed units.

---

## Overview

Forecasts are submitted via **pull requests** to the GitHub repository. Each
submission includes:

1. A **forecast file** (CSV) in the `model-output/` directory
2. A **model metadata file** (YAML) in the `model-metadata/` directory (first submission only)

Submissions are automatically validated by CI. Check the results in your pull
request before it is reviewed and merged.

---

## Submission Timeline

Forecasts are **pre-registered** during a strict **24-hour window** — you may
only submit on the origin date itself. Pull requests validated outside this
window are automatically rejected by CI.

| Event | Timing |
|-------|--------|
| **Registration window opens** | 17th of each month, 00:00 US/Eastern |
| **Registration window closes** | 17th of each month, 23:59 US/Eastern |
| **Target data updated** | ~10th of each month (FRED-MD release) |
| **Scores published** | After target data is available |

---

## Step-by-Step Guide

### 1. Fork the repository

Fork [Macro-Forecast-Hub](https://github.com/Sicco123/US-Macro-Forecast-Hub)
to your GitHub account.

### 2. Create your model directory

```
model-output/{team_abbr}-{model_abbr}/
```

For example: `model-output/MyTeam-ARModel/`

### 3. Generate your forecast

Produce a CSV file following the [submission format](format.md).

Name it: `YYYY-MM-DD-{team_abbr}-{model_abbr}.csv`

For example: `2026-04-17-MyTeam-ARModel.csv`

### 4. Add model metadata

On your first submission, create a YAML file in `model-metadata/`:

```
model-metadata/{team_abbr}-{model_abbr}.yml
```

See [Model Metadata](metadata.md) for the required fields.

### 5. Submit a pull request

Push your changes and open a pull request against the `main` branch.
The automated validation checks your files. Open the pull request’s Checks
tab for results and error details.

---

## Validation

All submissions are automatically checked for:

- Correct file paths and naming conventions
- Required columns and data types
- Valid target indicators, horizons, and locations
- Required quantile levels
- Monotonicity of quantile values
- Consistency between metadata and forecast files

If validation fails, check the CI output for specific error messages and
update your PR accordingly.

---

## Tips

!!! tip "Test locally before submitting"
    Run the validation scripts locally:
    ```bash
    CHANGED_FILES="model-output/MyTeam-ARModel/2026-04-17-MyTeam-ARModel.csv" \
      python src/validation/validate_forecast.py
    ```

!!! tip "Required vs optional targets"
    You **must** submit forecasts for: INDPRO, UNRATE, CPIAUCSL.
    Other targets are optional but encouraged.

!!! tip "Use the template"
    Check the baseline model output in `model-output/MacroHub-RandomWalk/`
    for an example of the expected format.
