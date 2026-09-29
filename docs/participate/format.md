# Submission Format

Forecast files must be CSV files with the following structure.

---

## File Naming

```
model-output/{team_abbr}-{model_abbr}/YYYY-MM-DD-{team_abbr}-{model_abbr}.csv
```

- `YYYY-MM-DD` — the origin date (forecast submission date, typically the 17th)
- `{team_abbr}` — your team abbreviation (max 16 chars, alphanumeric + underscore)
- `{model_abbr}` — your model abbreviation (max 16 chars, alphanumeric + underscore)

---

## Column Specification

| Column | Type | Description |
|--------|------|-------------|
| `origin_date` | date (YYYY-MM-DD) | Date the forecast was made |
| `target` | string | FRED series identifier (e.g., `INDPRO`, `UNRATE`) |
| `target_end_date` | date (YYYY-MM-DD) | Last day of the month being forecasted |
| `horizon` | integer | Zero-based step, 0–23. The dashboard displays steps 1–24. |
| `location` | string | Location code (`US`) |
| `output_type` | string | `quantile` or `mean` |
| `output_type_id` | float/string | Quantile level (e.g., `0.5`) or empty for mean |
| `value` | float | The forecast value |

---

## Output Types

### Quantile (required)

You must provide forecasts at these 5 quantile levels:

```
0.05, 0.1, 0.5, 0.9, 0.95
```

The 0.5 quantile serves as the median point forecast. Quantile values must be
**monotonically non-decreasing** for each target/horizon/location combination.

### Mean (optional)

The expected value of the predictive distribution. Set `output_type_id` to an
empty string.

---

## Required Targets

At minimum, you must submit forecasts for these 3 core indicators:

| Target ID | Indicator |
|-----------|-----------|
| `INDPRO` | Industrial Production Index |
| `UNRATE` | Unemployment Rate |
| `CPIAUCSL` | Consumer Price Index |

The remaining 9 indicators are optional.

---

## Example

This excerpt assumes the latest observation is March 2026: stored horizon `0`
targets April, and `1` targets May. The first step is the month after the latest
observation available to the model, not necessarily the month after the origin.
Include all five quantiles for each target and horizon you submit, and include
all three required indicators in the complete file.

```csv
origin_date,target,target_end_date,horizon,location,output_type,output_type_id,value
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.05,-0.003
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.1,0.0
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.5,0.002
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.9,0.005
2026-04-17,INDPRO,2026-04-30,0,US,quantile,0.95,0.007
2026-04-17,INDPRO,2026-04-30,0,US,mean,,0.002
2026-04-17,INDPRO,2026-05-31,1,US,quantile,0.05,-0.004
...
2026-04-17,UNRATE,2026-04-30,0,US,quantile,0.05,-0.2
...
```

!!! warning "Values must be in transformed units"
    For the scored targets, submit values in the **transformed space**:
    `INDPRO`, `CPIAUCSL`, and `PCEPI` use **Δlog(x)** (monthly log change);
    `UNRATE` uses **Δx** (monthly first difference in percentage points).
    See [Target Data](../indicators/target-data.md) for details.
