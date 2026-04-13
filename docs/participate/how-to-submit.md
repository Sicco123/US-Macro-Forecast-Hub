# How to Submit Forecasts

This guide explains how to submit probabilistic forecasts to the Macro Forecast Hub.

---

## Overview

Forecasts are submitted via **pull requests** to the GitHub repository. Each
submission includes:

1. A **forecast file** (CSV) in the `model-output/` directory
2. A **model metadata file** (YAML) in the `model-metadata/` directory (first submission only)

Submissions are automatically validated by CI and, upon passing, merged into the
main branch.

---

## Submission Timeline

| Event | Timing |
|-------|--------|
| **Submission window opens** | 10th of each month |
| **Submission deadline** | 17th of each month, 23:59 US/Eastern |
| **Target data updated** | ~10th of each month (FRED-MD release) |
| **Scores published** | After target data is available |

---

## Step-by-Step Guide

### 1. Fork the repository

Fork [Macro-Forecast-Hub](https://github.com/macro-forecast-hub/Macro-Forecast-Hub)
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
The automated validation will check your files and post a comment with
the result.

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
    You **must** submit forecasts for: INDPRO, UNRATE, PAYEMS, CPIAUCSL.
    Other targets are optional but encouraged.

!!! tip "Use the template"
    Check the baseline model output in `model-output/MacroHub-RandomWalk/`
    for an example of the expected format.
