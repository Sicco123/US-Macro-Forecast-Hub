---
hide:
  - toc
  - navigation
---

# Forecasts

<div id="fc-dashboard" markdown="0" tabindex="0" role="region" aria-label="Forecast explorer">
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
    <input type="month" id="fc-month-from" value="2000-01" min="1900-01" max="2100-12">
  </label>
  <label>To
    <input type="month" id="fc-month-to" value="2026-12" min="1900-01" max="2100-12">
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

<div class="dash-models">
  <button id="fc-models-show" type="button" class="dash-btn" aria-controls="fc-models" disabled>Show all models</button>
  <button id="fc-models-hide" type="button" class="dash-btn" aria-controls="fc-models" disabled>Hide all models</button>
</div>
<div class="dash-models" id="fc-models">Loading models...</div>

<div class="dash-slider-row">
  <button id="fc-play" aria-label="Play through origin dates" aria-pressed="false" disabled>Play</button>
  <button id="fc-prev" aria-label="Previous origin date" disabled>&larr;</button>
  <input type="range" id="fc-slider" aria-label="Forecast origin date" min="0" max="0" value="0" disabled>
  <button id="fc-next" aria-label="Next origin date" disabled>&rarr;</button>
  <span class="slider-date" id="fc-slider-label">&mdash;</span>
</div>
<p class="dash-note">The slider shows dates with forecasts from the selected models.</p>

<p id="fc-description" class="visually-hidden"></p>
<p class="dash-note" id="fc-chart-note">Forecast bands show 80% and 90% prediction intervals; background shading marks the 2007–09 financial crisis and March 2020–June 2021 Covid period. <a href="../../evaluation/methodology/">Methodology</a></p>
<div class="dash-chart" id="fc-chart" role="region" aria-label="Forecast chart" aria-describedby="fc-description fc-chart-note"></div>
<details id="fc-data-details">
  <summary>View forecast values and download CSV</summary>
  <button id="fc-download" class="dash-btn" disabled>Download selected forecasts</button>
  <div id="fc-table" class="dash-table-scroll" role="region" aria-label="Selected forecast values" tabindex="0"></div>
</details>
<details id="fc-accuracy">
  <summary>Explore accuracy at the selected horizon</summary>
  <div class="dash-chart-grid">
  <div class="dash-chart" id="fc-score-chart" role="region" aria-label="Rolling forecast error" aria-describedby="fc-score-note"></div>
  <div class="dash-chart" id="fc-relative-chart" role="region" aria-label="Cumulative forecast error relative to RandomWalk" aria-describedby="fc-relative-note"></div>
  </div>
  <p class="dash-note" id="fc-score-note">Background shading marks the 2007–09 financial crisis and March 2020–June 2021 Covid period.</p>
  <p class="dash-note" id="fc-relative-note">Cumulative model loss / cumulative RandomWalk loss on matching forecast cases. 1 = RandomWalk; below 1 = less error. Totals restart at From. RMSE uses squared errors.</p>
  <details><summary>View cumulative ratios to RandomWalk</summary><div id="fc-relative-table" class="dash-table-scroll" role="region" aria-label="Cumulative ratios to RandomWalk" tabindex="0"></div></details>
</details>

</div>
