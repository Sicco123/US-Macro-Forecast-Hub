# Submission Format

Forecast files must be CSV files with the following structure.

---

## File Naming

```
model-output/{team_abbr}-{model_abbr}/YYYY-MM-DD-{team_abbr}-{model_abbr}.csv
```

- `YYYY-MM-DD` — the origin date (forecast submission date, typically the 15th)
- `{team_abbr}` — your team abbreviation (max 16 chars, alphanumeric + underscore)
- `{model_abbr}` — your model abbreviation (max 16 chars, alphanumeric + underscore)

---

## Column Specification

| Column | Type | Description |
|--------|------|-------------|
| `origin_date` | date (YYYY-MM-DD) | Date the forecast was made |
| `target` | string | FRED series identifier (e.g., `INDPRO`, `UNRATE`) |
| `target_end_date` | date (YYYY-MM-DD) | Last day of the month being forecasted |
| `horizon` | integer | Months ahead: 0 (nowcast), 1, 2, 3, or 4 |
| `location` | string | Location code (`US`) |
| `output_type` | string | `quantile`, `median`, or `mean` |
| `output_type_id` | float/string | Quantile level (e.g., `0.5`) or empty for median/mean |
| `value` | float | The forecast value |

---

## Output Types

### Quantile (required)

You must provide forecasts at these 23 quantile levels:

```
0.01, 0.025, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5,
0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.975, 0.99
```

Quantile values must be **monotonically non-decreasing** for each
target/horizon/location combination.

### Median (optional)

A single point forecast at the median. Set `output_type_id` to an empty string.

### Mean (optional)

The expected value of the predictive distribution. Set `output_type_id` to an
empty string.

---

## Required Targets

At minimum, you must submit forecasts for these 4 core indicators:

| Target ID | Indicator |
|-----------|-----------|
| `INDPRO` | Industrial Production Index |
| `UNRATE` | Unemployment Rate |
| `PAYEMS` | Total Nonfarm Payrolls |
| `CPIAUCSL` | Consumer Price Index |

The remaining 8 indicators are optional.

---

## Example

```csv
origin_date,target,target_end_date,horizon,location,output_type,output_type_id,value
2026-04-15,INDPRO,2026-04-30,0,US,quantile,0.01,98.5
2026-04-15,INDPRO,2026-04-30,0,US,quantile,0.025,99.1
2026-04-15,INDPRO,2026-04-30,0,US,quantile,0.05,99.5
...
2026-04-15,INDPRO,2026-04-30,0,US,quantile,0.975,105.2
2026-04-15,INDPRO,2026-04-30,0,US,quantile,0.99,106.1
2026-04-15,INDPRO,2026-04-30,0,US,median,,102.3
2026-04-15,INDPRO,2026-05-31,1,US,quantile,0.01,97.8
...
2026-04-15,UNRATE,2026-04-30,0,US,quantile,0.01,3.2
...
```
