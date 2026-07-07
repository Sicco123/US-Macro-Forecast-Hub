/**
 * Interactive forecast visualization dashboard.
 */
(function () {
  "use strict";

  const ROOT = document.getElementById("fc-dashboard");
  if (!ROOT) return;

  const COLORS = [
    "#3f51b5", "#ff7043", "#26a69a", "#ab47bc",
    "#e65100", "#ffa726", "#ef5350", "#66bb6a",
    "#8d6e63", "#78909c",
  ];

  function isDark() {
    return document.body.getAttribute("data-md-color-scheme") === "slate";
  }
  function plotlyFont() {
    const c = isDark() ? "#ccc" : "#444";
    return { family: "Inter, system-ui, sans-serif", size: 13, color: c };
  }
  function plotlyGrid() {
    return isDark()
      ? { gridcolor: "rgba(255,255,255,0.1)", zerolinecolor: "rgba(255,255,255,0.18)" }
      : { gridcolor: "rgba(0,0,0,0.06)", zerolinecolor: "rgba(0,0,0,0.1)" };
  }
  const PLOTLY_CONFIG = { responsive: true, displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"] };

  let truthData = {};
  let fcData = null;
  let scoresData = null;
  let currentTarget = null;
  let originDates = [];
  let sliderIndex = 0;
  let selectedModels = new Set();
  let modelColorMap = {};          // stable model → color mapping
  let yAxisRange = null;
  let maxHorizon = 24;

  const selTarget = ROOT.querySelector("#fc-target");
  const selMetric = ROOT.querySelector("#fc-metric");
  const selMaxHorizon = ROOT.querySelector("#fc-max-horizon");
  const modelBox = ROOT.querySelector("#fc-models");
  const yearFrom = ROOT.querySelector("#fc-year-from");
  const yearTo = ROOT.querySelector("#fc-year-to");
  const slider = ROOT.querySelector("#fc-slider");
  const sliderLabel = ROOT.querySelector("#fc-slider-label");
  const btnPrev = ROOT.querySelector("#fc-prev");
  const btnNext = ROOT.querySelector("#fc-next");
  const btnPlay = ROOT.querySelector("#fc-play");
  const chartDiv = ROOT.querySelector("#fc-chart");
  const scoreChartDiv = ROOT.querySelector("#fc-score-chart");
  const cumChartDiv = ROOT.querySelector("#fc-cumulative-chart");
  const btnResetZoom = ROOT.querySelector("#fc-reset-zoom");

  function basePath() {
    const scripts = document.querySelectorAll("script[src]");
    for (const s of scripts) {
      if (s.src.includes("/js/forecasts.js"))
        return s.src.replace("/js/forecasts.js", "/data/");
    }
    return "data/";
  }
  const DATA_BASE = basePath();

  async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
    return r.json();
  }

  function hexToRgba(hex, a) {
    return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;
  }

  // Return the transformed values array for a target (or levels if no transform)
  function truthDisplayValues(t) {
    return (t && t.transformed_values) ? t.transformed_values : (t ? t.values : []);
  }

  // Human-readable label for the y-axis given a target's transform type
  function yAxisLabel(target) {
    const t = truthData[target];
    if (!t) return target;
    if (t.transform === "log_diff") return `\u0394log(${target})`;
    if (t.transform === "diff") return `\u0394${target} (pp)`;
    return target;
  }

  // Chart title suffix describing the transformation
  function transformSuffix(target) {
    const t = truthData[target];
    if (!t) return "";
    if (t.transform === "log_diff") return " \u2014 monthly log change";
    if (t.transform === "diff") return " \u2014 monthly change (pp)";
    return "";
  }

  function computeYRange() {
    const yFrom = parseInt(yearFrom.value) || 2000;
    const yTo = parseInt(yearTo.value) || 2026;

    // Observed values: collected separately and NEVER clipped — the observed
    // line must always be fully visible, even when the selected model's
    // envelope is much narrower than the data (e.g. 2008 / COVID spikes).
    const truthVals = [];
    const t = truthData[currentTarget];
    if (t) {
      const displayVals = truthDisplayValues(t);
      t.dates.forEach((d, i) => {
        const y = parseInt(d.slice(0, 4));
        if (y >= yFrom && y <= yTo + 1 && displayVals[i] != null) {
          truthVals.push(displayVals[i]);
        }
      });
    }
    // Forecast envelope (q005 / q095) of the selected models: percentile-clip
    // so stale level-space outliers can't blow the axis out
    const fcVals = [];
    if (fcData) {
      for (const model of Object.keys(fcData.models)) {
        if (!selectedModels.has(model)) continue;
        for (const od of originDates) {
          const e = fcData.models[model][od];
          if (!e) continue;
          for (const v of (e.q005 || [])) if (v != null) fcVals.push(v);
          for (const v of (e.q095 || [])) if (v != null) fcVals.push(v);
        }
      }
    }
    if (truthVals.length === 0 && fcVals.length === 0) return null;

    let lo = Infinity, hi = -Infinity;
    if (fcVals.length) {
      fcVals.sort((a, b) => a - b);
      lo = fcVals[Math.floor(fcVals.length * 0.01)];
      hi = fcVals[Math.min(fcVals.length - 1, Math.floor(fcVals.length * 0.99))];
    }
    for (const v of truthVals) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const pad = (hi - lo) * 0.08 || 1;
    return [lo - pad, hi + pad];
  }

  // --- play-through animation over origin dates ---
  let playTimer = null;
  function stopPlay() {
    if (!playTimer) return;
    clearInterval(playTimer);
    playTimer = null;
    if (btnPlay) { btnPlay.innerHTML = "&#9654;"; btnPlay.title = "Play through origin dates"; }
  }
  function togglePlay() {
    if (playTimer) { stopPlay(); return; }
    if (sliderIndex >= originDates.length - 1) {
      sliderIndex = 0; slider.value = 0; updateSliderLabel(); draw();
    }
    btnPlay.innerHTML = "&#10074;&#10074;";
    btnPlay.title = "Pause";
    playTimer = setInterval(() => {
      if (sliderIndex >= originDates.length - 1) { stopPlay(); return; }
      stepSlider(1);
    }, 650);
  }

  // --- loading / empty states ---
  function setLoading(on) {
    [chartDiv, scoreChartDiv, cumChartDiv].forEach((d) =>
      d.classList.toggle("dash-chart--loading", on));
  }

  // --- shareable state: persist target in the URL hash ---
  function readHash() {
    const t = new URLSearchParams(location.hash.slice(1)).get("target");
    if (t && [...selTarget.options].some((o) => o.value === t)) selTarget.value = t;
  }
  function writeHash() {
    history.replaceState(null, "", "#target=" + currentTarget);
  }

  // Find the closest origin date index to a given date string
  function findClosestOrigin(dateStr) {
    const target = new Date(dateStr).getTime();
    let bestIdx = 0, bestDist = Infinity;
    originDates.forEach((d, i) => {
      const dist = Math.abs(new Date(d).getTime() - target);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    });
    return bestIdx;
  }

  async function init() {
    truthData = await fetchJSON(DATA_BASE + "truth.json");

    selTarget.addEventListener("change", onTargetChange);
    selMetric.addEventListener("change", () => { drawScoreChart(); drawCumulativeChart(); });
    selMaxHorizon.addEventListener("change", () => {
      maxHorizon = parseInt(selMaxHorizon.value);
      draw(); drawScoreChart(); drawCumulativeChart();
    });
    yearFrom.addEventListener("change", onRangeChange);
    yearTo.addEventListener("change", onRangeChange);
    slider.addEventListener("input", onSliderMove);
    btnPrev.addEventListener("click", () => stepSlider(-1));
    btnNext.addEventListener("click", () => stepSlider(1));
    if (btnPlay) btnPlay.addEventListener("click", togglePlay);
    if (btnResetZoom) btnResetZoom.addEventListener("click", resetZoom);

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "ArrowLeft") stepSlider(-1);
      if (e.key === "ArrowRight") stepSlider(1);
      if (e.key === " " && btnPlay) { e.preventDefault(); togglePlay(); }
    });

    // Redraw charts when dark/light mode toggles
    new MutationObserver(() => { draw(); drawScoreChart(); drawCumulativeChart(); })
      .observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });

    readHash();
    await onTargetChange();
  }

  async function onTargetChange() {
    stopPlay();
    currentTarget = selTarget.value;
    writeHash();
    setLoading(true);
    try { fcData = await fetchJSON(DATA_BASE + `forecasts_${currentTarget}.json`); } catch { fcData = null; }
    try { scoresData = await fetchJSON(DATA_BASE + `scores_${currentTarget}.json`); } catch { scoresData = null; }
    setLoading(false);
    if (!fcData) {
      modelBox.innerHTML = "";
      chartDiv.innerHTML =
        `<div class="dash-empty">No forecast data available for ${currentTarget} yet.</div>`;
      Plotly.purge(scoreChartDiv); Plotly.purge(cumChartDiv);
      return;
    }
    buildModelCheckboxes();
    updateSlider();
    yAxisRange = computeYRange();
    draw();
    drawScoreChart();
    drawCumulativeChart();
  }

  // Model with the lowest average MAE at the current max horizon
  function bestModel(models) {
    if (!scoresData) return null;
    const hk = `h${maxHorizon - 1}`;
    let best = null, bestVal = Infinity;
    for (const m of models) {
      const arr = scoresData.models[m]?.[hk]?.MAE;
      if (!arr) continue;
      const v = arr.filter(Number.isFinite);
      if (!v.length) continue;
      const avg = v.reduce((a, b) => a + b, 0) / v.length;
      if (avg < bestVal) { bestVal = avg; best = m; }
    }
    return best;
  }

  function buildModelCheckboxes() {
    if (!fcData) return;
    const models = Object.keys(fcData.models).sort();
    // Default: only the best-scoring model on — less clutter, users opt in to more
    const best = bestModel(models);
    selectedModels = best ? new Set([best]) : new Set(models);
    // Stable color map: sorted order determines color, never changes on selection
    modelColorMap = {};
    models.forEach((m, i) => { modelColorMap[m] = COLORS[i % COLORS.length]; });
    modelBox.innerHTML = models
      .map((m) => {
        const c = modelColorMap[m];
        const chk = selectedModels.has(m) ? "checked" : "";
        return `<label><input type="checkbox" value="${m}" ${chk}
                 style="accent-color:${c}"> <span style="color:${c}; font-weight:600">●</span> ${m}</label>`;
      })
      .join("");
    modelBox.querySelectorAll("input").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) selectedModels.add(cb.value);
        else selectedModels.delete(cb.value);
        yAxisRange = computeYRange();  // range must track the selection
        draw(); drawScoreChart(); drawCumulativeChart();
      });
    });
  }

  function updateSlider() {
    if (!fcData) return;
    const yFrom = parseInt(yearFrom.value) || 2000;
    const yTo = parseInt(yearTo.value) || 2026;
    originDates = fcData.origin_dates.filter((d) => {
      const y = parseInt(d.slice(0, 4));
      return y >= yFrom && y <= yTo;
    });
    slider.max = Math.max(0, originDates.length - 1);
    sliderIndex = Math.min(sliderIndex, originDates.length - 1);
    if (sliderIndex < 0) sliderIndex = originDates.length - 1;
    slider.value = sliderIndex;
    updateSliderLabel();
  }

  function resetZoom() {
    // Reset year inputs to full range and redraw all charts from scratch
    yearFrom.value = 2000;
    yearTo.value = 2026;
    onRangeChange();
  }

  function onRangeChange() {
    updateSlider();
    yAxisRange = computeYRange();
    draw(); drawScoreChart(); drawCumulativeChart();
  }

  function onSliderMove() {
    stopPlay();  // manual drag takes over from autoplay
    sliderIndex = parseInt(slider.value);
    updateSliderLabel();
    draw();
  }

  function stepSlider(delta) {
    // Step through the FULL origin list; if the next origin falls outside the
    // current zoom window, slide the window along (width preserved) so the
    // arrows/autoplay are never stopped by the zoom.
    const all = fcData ? fcData.origin_dates : originDates;
    const cur = originDates[sliderIndex];
    const gi = Math.max(0, Math.min(all.length - 1, all.indexOf(cur) + delta));
    const next = all[gi];
    const ny = parseInt(next.slice(0, 4));
    const yF = parseInt(yearFrom.value) || 2000;
    const yT = parseInt(yearTo.value) || 2026;

    if (ny < yF || ny + 2 > yT) {
      const span = yT - yF;
      let nF = delta > 0 ? Math.min(2026, ny + 2) - span : ny;
      nF = Math.max(2000, Math.min(nF, 2026 - span));
      const nT = nF + span;
      if (nF !== yF || nT !== yT) {
        yearFrom.value = nF;
        yearTo.value = nT;
        updateSlider();
        yAxisRange = computeYRange();
        sliderIndex = Math.max(0, originDates.indexOf(next));
        slider.value = sliderIndex;
        updateSliderLabel();
        draw(); drawScoreChart(); drawCumulativeChart();
        return;
      }
    }
    sliderIndex = Math.max(0, Math.min(originDates.length - 1, sliderIndex + delta));
    slider.value = sliderIndex;
    updateSliderLabel();
    draw();
  }

  function updateSliderLabel() {
    sliderLabel.textContent = originDates[sliderIndex] || "\u2014";
  }

  function syncYearsFromPlotly(eventData) {
    if (eventData["xaxis.range[0]"] && eventData["xaxis.range[1]"]) {
      const newFrom = parseInt(eventData["xaxis.range[0]"].slice(0, 4));
      const newTo = parseInt(eventData["xaxis.range[1]"].slice(0, 4));
      if (!isNaN(newFrom) && !isNaN(newTo)) {
        yearFrom.value = Math.max(2000, newFrom);
        yearTo.value = Math.min(2026, newTo);
        updateSlider();
        yAxisRange = computeYRange();
        draw(); drawScoreChart(); drawCumulativeChart();
      }
    }
    if (eventData["xaxis.autorange"]) {
      yearFrom.value = 2000;
      yearTo.value = 2026;
      updateSlider();
      yAxisRange = computeYRange();
      draw(); drawScoreChart(); drawCumulativeChart();
    }
  }

  // --- main forecast chart ---
  function draw() {
    if (!fcData || originDates.length === 0) { Plotly.purge(chartDiv); return; }

    const originDate = originDates[sliderIndex];
    const yFrom = parseInt(yearFrom.value) || 2000;
    const yTo = parseInt(yearTo.value) || 2026;
    const traces = [];

    const t = truthData[currentTarget];
    if (t) {
      const endLimit = new Date(yTo + 1, 0, 1);
      const startLimit = new Date(yFrom, 0, 1);
      const xArr = [], yArr = [];
      const displayVals = truthDisplayValues(t);
      const decimals = (t.transform === "log_diff" || t.transform === "diff") ? 4 : 2;
      t.dates.forEach((d, i) => {
        const dt = new Date(d);
        if (dt >= startLimit && dt <= endLimit && displayVals[i] != null) {
          xArr.push(d); yArr.push(displayVals[i]);
        }
      });
      traces.push({
        x: xArr, y: yArr, mode: "lines", name: "Observed",
        line: { color: isDark() ? "#b0bec5" : "#37474f", width: 2.2 },
        hovertemplate: `%{x|%b %Y}<br>Value: %{y:.${decimals}f}<extra>Observed</extra>`,
      });
    }

    const models = Object.keys(fcData.models).sort().filter((m) => selectedModels.has(m));
    models.forEach((model) => {
      const color = modelColorMap[model];
      const entry = fcData.models[model][originDate];
      if (!entry) return;
      const teds = entry.ted.slice(0, maxHorizon);
      const sl = (arr) => arr ? arr.slice(0, maxHorizon) : null;

      if (entry.q005 && entry.q095) {
        const lo = sl(entry.q005), hi = sl(entry.q095);
        traces.push({
          x: teds.concat([...teds].reverse()),
          y: lo.concat([...hi].reverse()),
          fill: "toself", fillcolor: hexToRgba(color, 0.12),
          line: { color: "transparent" }, showlegend: false, hoverinfo: "skip",
        });
      }
      if (entry.q010 && entry.q090) {
        const lo = sl(entry.q010), hi = sl(entry.q090);
        traces.push({
          x: teds.concat([...teds].reverse()),
          y: lo.concat([...hi].reverse()),
          fill: "toself", fillcolor: hexToRgba(color, 0.25),
          line: { color: "transparent" }, showlegend: false, hoverinfo: "skip",
        });
      }
      // Point forecast: show mean (falling back to Q0.5 if mean unavailable)
      const pointY = sl(entry.mean || entry.q050);
      traces.push({
        x: teds, y: pointY, mode: "lines+markers", name: model,
        line: { color: color, width: 2.8 },
        marker: { size: 6, color: color },
        hovertemplate: "%{x|%b %Y}<br>Mean: %{y:.2f}<extra>" + model + "</extra>",
      });
    });

    const dark = isDark();
    const originLineColor = dark ? "rgba(160,180,255,0.45)" : "rgba(63,81,181,0.35)";
    const originTextColor = dark ? "rgba(160,180,255,0.8)" : "rgba(63,81,181,0.7)";
    const titleColor = dark ? "#ddd" : "#333";
    const spikeColor = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)";

    const shapes = [{
      type: "line", x0: originDate, x1: originDate,
      y0: 0, y1: 1, yref: "paper",
      line: { color: originLineColor, width: 1.5, dash: "dash" },
    }];
    const annotations = [{
      x: originDate, y: 1, yref: "paper",
      text: "forecast origin", showarrow: false,
      font: { size: 10, color: originTextColor }, yanchor: "bottom",
    }];

    const layout = {
      font: plotlyFont(),
      title: { text: currentTarget + transformSuffix(currentTarget), font: { size: 16, color: titleColor }, x: 0.01 },
      xaxis: {
        range: [`${yFrom}-01-01`, `${yTo + 1}-01-01`],
        ...plotlyGrid(), tickformat: "%Y",
        spikecolor: spikeColor, spikethickness: 1,
      },
      yaxis: {
        title: { text: yAxisLabel(currentTarget), standoff: 10 },
        range: yAxisRange, ...plotlyGrid(),
      },
      shapes, annotations,
      legend: { orientation: "h", y: -0.12, x: 0.5, xanchor: "center",
                font: { size: 12 }, bgcolor: "rgba(0,0,0,0)" },
      margin: { t: 40, r: 16, b: 60, l: 65 },
      hovermode: "x unified", hoverlabel: { bgcolor: dark ? "#2e2e2e" : "#fff", font: { color: dark ? "#ddd" : "#333" } },
      height: 500,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    };

    Plotly.react(chartDiv, traces, layout, PLOTLY_CONFIG);
    chartDiv.removeAllListeners && chartDiv.removeAllListeners("plotly_relayout");
    chartDiv.removeAllListeners && chartDiv.removeAllListeners("plotly_click");
    chartDiv.on("plotly_relayout", syncYearsFromPlotly);

    // Click on chart to jump forecast origin to the closest date
    chartDiv.on("plotly_click", function (data) {
      if (data.points && data.points.length > 0) {
        const clickedDate = data.points[0].x;
        const idx = findClosestOrigin(clickedDate);
        sliderIndex = idx;
        slider.value = sliderIndex;
        updateSliderLabel();
        draw();
      }
    });
  }

  // --- score chart (rolling metric) — single horizon only (maxHorizon) ---
  function drawScoreChart() {
    if (!scoresData || originDates.length === 0) { Plotly.purge(scoreChartDiv); return; }

    const metricKey = selMetric.value;
    const isRMSE = metricKey === "SqErr";
    const displayName = isRMSE ? "RMSE" : metricKey;

    const models = Object.keys(scoresData.models).sort().filter((m) => selectedModels.has(m));
    const yFrom = parseInt(yearFrom.value) || 2000;
    const yTo = parseInt(yearTo.value) || 2026;
    const traces = [];

    // Use only the selected max horizon (data keys are h0, h1, ... where h0 = horizon 1)
    const hk = `h${maxHorizon - 1}`;

    models.forEach((model) => {
      const color = modelColorMap[model];
      const modelScores = scoresData.models[model];
      const hData = modelScores[hk]?.[metricKey];

      const filtDates = [], filtVals = [];
      scoresData.origin_dates.forEach((d, i) => {
        const y = parseInt(d.slice(0, 4));
        const v = hData?.[i];
        if (y >= yFrom && y <= yTo && v != null) {
          filtDates.push(d); filtVals.push(v);
        }
      });

      const rolling = [];
      for (let i = 0; i < filtVals.length; i++) {
        const start = Math.max(0, i - 11);
        const win = filtVals.slice(start, i + 1);
        let avg = win.reduce((a, b) => a + b, 0) / win.length;
        if (isRMSE) avg = Math.sqrt(avg);
        rolling.push(avg);
      }

      traces.push({
        x: filtDates, y: rolling, mode: "lines", name: model,
        line: { color: color, width: 2.2 },
        hovertemplate: "%{x|%b %Y}<br>" + displayName + ": %{y:.4f}<extra>" + model + "</extra>",
      });
    });

    const dark2 = isDark();
    const layout = {
      font: plotlyFont(),
      title: { text: `${displayName} — horizon ${maxHorizon} (12-month rolling avg)`, font: { size: 14, color: dark2 ? "#ccc" : "#555" }, x: 0.01 },
      xaxis: {
        range: [`${yFrom}-01-01`, `${yTo + 1}-01-01`],
        ...plotlyGrid(), tickformat: "%Y",
        spikecolor: dark2 ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)", spikethickness: 1,
      },
      yaxis: { title: { text: displayName, standoff: 10 }, ...plotlyGrid() },
      legend: { orientation: "h", y: -0.18, x: 0.5, xanchor: "center",
                font: { size: 12 }, bgcolor: "rgba(0,0,0,0)" },
      margin: { t: 36, r: 16, b: 70, l: 65 },
      hovermode: "x unified", hoverlabel: { bgcolor: dark2 ? "#2e2e2e" : "#fff", font: { color: dark2 ? "#ddd" : "#333" } },
      height: 340,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    };

    Plotly.react(scoreChartDiv, traces, layout, PLOTLY_CONFIG);
    scoreChartDiv.removeAllListeners && scoreChartDiv.removeAllListeners("plotly_relayout");
    scoreChartDiv.on("plotly_relayout", syncYearsFromPlotly);
  }

  // --- cumulative error chart (only for MAE and RMSE) — single horizon only ---
  function drawCumulativeChart() {
    const metricKey = selMetric.value;
    if (metricKey !== "MAE" && metricKey !== "SqErr") {
      Plotly.purge(cumChartDiv);
      cumChartDiv.style.display = "none";
      return;
    }
    cumChartDiv.style.display = "block";

    if (!scoresData || originDates.length === 0) { Plotly.purge(cumChartDiv); return; }

    const isRMSE = metricKey === "SqErr";
    const displayName = isRMSE ? "Cumulative Squared Error" : "Cumulative Absolute Error";

    const models = Object.keys(scoresData.models).sort().filter((m) => selectedModels.has(m));
    const yFrom = parseInt(yearFrom.value) || 2000;
    const yTo = parseInt(yearTo.value) || 2026;
    const traces = [];

    // Use only the selected max horizon
    const hk = `h${maxHorizon - 1}`;

    models.forEach((model) => {
      const color = modelColorMap[model];
      const modelScores = scoresData.models[model];
      const hData = modelScores[hk]?.[metricKey];

      // filter and accumulate
      const filtDates = [], cumVals = [];
      let cumSum = 0;
      scoresData.origin_dates.forEach((d, i) => {
        const y = parseInt(d.slice(0, 4));
        const v = hData?.[i];
        if (y >= yFrom && y <= yTo && v != null) {
          cumSum += v;
          filtDates.push(d);
          cumVals.push(cumSum);
        }
      });

      traces.push({
        x: filtDates, y: cumVals, mode: "lines", name: model,
        line: { color: color, width: 2.2 },
        fill: "tozeroy", fillcolor: hexToRgba(color, 0.08),
        hovertemplate: "%{x|%b %Y}<br>" + displayName + ": %{y:.2f}<extra>" + model + "</extra>",
      });
    });

    const dark3 = isDark();
    const layout = {
      font: plotlyFont(),
      title: { text: `${displayName} — horizon ${maxHorizon}`, font: { size: 14, color: dark3 ? "#ccc" : "#555" }, x: 0.01 },
      xaxis: {
        range: [`${yFrom}-01-01`, `${yTo + 1}-01-01`],
        ...plotlyGrid(), tickformat: "%Y",
        spikecolor: dark3 ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)", spikethickness: 1,
      },
      yaxis: { title: { text: displayName, standoff: 10 }, ...plotlyGrid() },
      legend: { orientation: "h", y: -0.18, x: 0.5, xanchor: "center",
                font: { size: 12 }, bgcolor: "rgba(0,0,0,0)" },
      margin: { t: 36, r: 16, b: 70, l: 75 },
      hovermode: "x unified", hoverlabel: { bgcolor: dark3 ? "#2e2e2e" : "#fff", font: { color: dark3 ? "#ddd" : "#333" } },
      height: 340,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    };

    Plotly.react(cumChartDiv, traces, layout, PLOTLY_CONFIG);
    cumChartDiv.removeAllListeners && cumChartDiv.removeAllListeners("plotly_relayout");
    cumChartDiv.on("plotly_relayout", syncYearsFromPlotly);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
