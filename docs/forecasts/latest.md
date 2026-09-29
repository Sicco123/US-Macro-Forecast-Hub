# Forecasts

Interactive visualization of forecast submissions. Select a target indicator,
models, and time range, then use the slider to browse forecasts at each origin
date. Click on the chart to jump to the nearest origin date. Shaded bands show
the 80% and 90% prediction intervals.

Use the labeled playback controls to browse origins. With the explorer focused,
press ++arrow-left++ / ++arrow-right++ to step and ++space++ to play or pause.
Copy the URL to share your complete selection. Historical backfills are included;
these are not all prospective, pre-registered submissions.

??? note "About transformed units"
    All forecasts — and the **Observed** series — are shown in the **transformed
    space** used for scoring:

    | Target | Transformation | Interpretation |
    |--------|---------------|----------------|
    | INDPRO | Δlog(x) | Monthly log change ≈ monthly % change / 100 |
    | CPIAUCSL | Δlog(x) | Monthly log change |
    | PCEPI | Δlog(x) | Monthly log change |
    | UNRATE | Δx | Monthly change in percentage points |

    Values near **zero** mean little-to-no change; positive values indicate
    growth / increase; negative values indicate contraction / decrease.

<div id="fc-dashboard" markdown="0" tabindex="0" role="region" aria-label="Forecast explorer">
<p class="dash-freshness" data-dashboard-freshness></p>
<p id="fc-status" role="status" aria-live="polite">Loading forecasts…</p>
<button id="fc-retry" class="dash-btn" hidden>Retry loading forecasts</button>

<div class="dash-controls">
  <label>Target
    <select id="fc-target">
      <option value="INDPRO">Industrial production (INDPRO)</option>
      <option value="CPIAUCSL">Consumer prices (CPIAUCSL)</option>
      <option value="PCEPI">PCE prices (PCEPI)</option>
      <option value="UNRATE">Unemployment (UNRATE)</option>
    </select>
  </label>
  <label>Metric
    <select id="fc-metric">
      <option value="MAE">MAE</option>
      <option value="SqErr">RMSE</option>
    </select>
  </label>
  <label>From
    <input type="number" id="fc-year-from" value="2000" min="1900" max="2100">
  </label>
  <label>To
    <input type="number" id="fc-year-to" value="2026" min="1900" max="2100">
  </label>
  <label>Max Horizon
    <select id="fc-max-horizon">
      <option value="1">1 month</option>
      <option value="2">2 months</option>
      <option value="3">3 months</option>
      <option value="4">4 months</option>
      <option value="5">5 months</option>
      <option value="6">6 months</option>
      <option value="7">7 months</option>
      <option value="8">8 months</option>
      <option value="9">9 months</option>
      <option value="10">10 months</option>
      <option value="11">11 months</option>
      <option value="12">12 months</option>
      <option value="13">13 months</option>
      <option value="14">14 months</option>
      <option value="15">15 months</option>
      <option value="16">16 months</option>
      <option value="17">17 months</option>
      <option value="18">18 months</option>
      <option value="19">19 months</option>
      <option value="20">20 months</option>
      <option value="21">21 months</option>
      <option value="22">22 months</option>
      <option value="23">23 months</option>
      <option value="24" selected>24 months</option>
    </select>
  </label>
  <button id="fc-reset-zoom" class="dash-btn" title="Reset zoom to full range">&#x21ba; Reset Zoom</button>
</div>

<div class="dash-models" id="fc-models">Loading models...</div>

<div class="dash-slider-row">
  <button id="fc-play" aria-label="Play through origin dates" aria-pressed="false" disabled>Play</button>
  <button id="fc-prev" aria-label="Previous origin date" disabled>&larr;</button>
  <input type="range" id="fc-slider" aria-label="Forecast origin date" min="0" max="0" value="0" disabled>
  <button id="fc-next" aria-label="Next origin date" disabled>&rarr;</button>
  <span class="slider-date" id="fc-slider-label">&mdash;</span>
</div>

<p id="fc-description"></p>
<p>Outer shading: 90% prediction interval (5th–95th percentile). Inner shading:
80% (10th–90th). The line shows the mean, or the median where a mean is unavailable.</p>
<div class="dash-chart" id="fc-chart" role="region" aria-label="Forecast chart" aria-describedby="fc-description"></div>
<details id="fc-data-details">
  <summary>View forecast values and download CSV</summary>
  <button id="fc-download" class="dash-btn" disabled>Download selected forecasts</button>
  <div id="fc-table" class="dash-table-scroll" role="region" aria-label="Selected forecast values" tabindex="0"></div>
</details>
<details id="fc-accuracy">
  <summary>Explore accuracy at the selected horizon</summary>
  <p>MAE evaluates the median; RMSE evaluates the mean. Lower is better.
  The cumulative chart totals errors over the selected period and is affected by coverage.</p>
  <div class="dash-chart" id="fc-score-chart" role="region" aria-label="Rolling forecast error"></div>
  <div class="dash-chart" id="fc-cumulative-chart" role="region" aria-label="Cumulative forecast error"></div>
</details>

</div>

---

## Forecast Format

| Column | Description |
|--------|-------------|
| `origin_date` | Date the forecast was made (17th of month) |
| `target` | FRED-MD series ID |
| `target_end_date` | Last day of the target month |
| `horizon` | Stored step 0–23; displayed as 1–24 monthly steps after the latest observation available to the model |
| `location` | `US` |
| `output_type` | `quantile` or `mean` |
| `output_type_id` | Quantile level (0.05, 0.1, 0.5, 0.9, 0.95) or empty for mean |
| `value` | Forecast value in transformed units (Δlog for INDPRO/CPIAUCSL/PCEPI; Δ for UNRATE) |
