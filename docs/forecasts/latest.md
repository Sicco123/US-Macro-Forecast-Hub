# Forecasts

Interactive visualization of forecast submissions. Select a target indicator,
models, and time range, then use the slider to browse forecasts at each origin
date. Click on the chart to jump to the nearest origin date. Shaded bands show
the 80% and 90% prediction intervals.

<div id="fc-dashboard" markdown="0">

<div class="dash-controls">
  <label>Target
    <select id="fc-target">
      <option value="INDPRO">INDPRO</option>
      <option value="CPIAUCSL">CPIAUCSL</option>
      <option value="PCEPI">PCEPI</option>
      <option value="UNRATE">UNRATE</option>
    </select>
  </label>
  <label>Metric
    <select id="fc-metric">
      <option value="MAE">MAE</option>
      <option value="WIS">WIS</option>
      <option value="SqErr">RMSE</option>
      <option value="MeanQS">MeanQS</option>
      <option value="Coverage_80">Coverage 80%</option>
      <option value="Coverage_90">Coverage 90%</option>
    </select>
  </label>
  <label>From
    <input type="number" id="fc-year-from" value="2000" min="2000" max="2026">
  </label>
  <label>To
    <input type="number" id="fc-year-to" value="2026" min="2000" max="2026">
  </label>
</div>

<div class="dash-models" id="fc-models">Loading models...</div>

<div class="dash-slider-row">
  <button id="fc-prev" title="Previous origin date">&larr;</button>
  <input type="range" id="fc-slider" min="0" max="0" value="0">
  <button id="fc-next" title="Next origin date">&rarr;</button>
  <span class="slider-date" id="fc-slider-label">&mdash;</span>
</div>

<div class="dash-chart" id="fc-chart"></div>
<div class="dash-chart" id="fc-score-chart"></div>
<div class="dash-chart" id="fc-cumulative-chart"></div>

</div>

---

## Forecast Format

| Column | Description |
|--------|-------------|
| `origin_date` | Date the forecast was made (17th of month) |
| `target` | FRED-MD series ID |
| `target_end_date` | Last day of the target month |
| `horizon` | Months ahead (1--24) |
| `location` | `US` |
| `output_type` | `quantile` or `mean` |
| `output_type_id` | Quantile level (0.05, 0.1, 0.5, 0.9, 0.95) or empty for mean |
| `value` | Forecast value in original units (levels) |
