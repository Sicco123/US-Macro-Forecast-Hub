/**
 * Interactive forecast visualization dashboard.
 */
(function () {
  "use strict";

  const ROOT = document.getElementById("fc-dashboard");
  if (!ROOT) return;

  const COLORS = [
    "#3f51b5", "#ff7043", "#26a69a", "#ab47bc",
    "#5c6bc0", "#ffa726", "#ef5350", "#66bb6a",
    "#8d6e63", "#78909c",
  ];

  const PLOTLY_FONT = { family: "Inter, system-ui, sans-serif", size: 13, color: "#444" };
  const PLOTLY_GRID = { gridcolor: "rgba(0,0,0,0.06)", zerolinecolor: "rgba(0,0,0,0.1)" };
  const PLOTLY_CONFIG = { responsive: true, displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] };

  let truthData = {};
  let fcData = null;
  let scoresData = null;
  let currentTarget = null;
  let originDates = [];
  let sliderIndex = 0;
  let selectedModels = new Set();
  let yAxisRange = null;

  const selTarget = ROOT.querySelector("#fc-target");
  const selMetric = ROOT.querySelector("#fc-metric");
  const modelBox = ROOT.querySelector("#fc-models");
  const yearFrom = ROOT.querySelector("#fc-year-from");
  const yearTo = ROOT.querySelector("#fc-year-to");
  const slider = ROOT.querySelector("#fc-slider");
  const sliderLabel = ROOT.querySelector("#fc-slider-label");
  const btnPrev = ROOT.querySelector("#fc-prev");
  const btnNext = ROOT.querySelector("#fc-next");
  const chartDiv = ROOT.querySelector("#fc-chart");
  const scoreChartDiv = ROOT.querySelector("#fc-score-chart");
  const cumChartDiv = ROOT.querySelector("#fc-cumulative-chart");

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

  function computeYRange() {
    const yFrom = parseInt(yearFrom.value) || 2000;
    const yTo = parseInt(yearTo.value) || 2026;
    let yMin = Infinity, yMax = -Infinity;
    const t = truthData[currentTarget];
    if (t) {
      t.dates.forEach((d, i) => {
        const y = parseInt(d.slice(0, 4));
        if (y >= yFrom && y <= yTo + 1 && t.values[i] != null) {
          yMin = Math.min(yMin, t.values[i]);
          yMax = Math.max(yMax, t.values[i]);
        }
      });
    }
    if (fcData) {
      for (const model of Object.keys(fcData.models)) {
        for (const od of originDates) {
          const e = fcData.models[model][od];
          if (!e) continue;
          for (const v of (e.q005 || [])) if (v != null) { yMin = Math.min(yMin, v); yMax = Math.max(yMax, v); }
          for (const v of (e.q095 || [])) if (v != null) { yMin = Math.min(yMin, v); yMax = Math.max(yMax, v); }
        }
      }
    }
    if (!isFinite(yMin)) return null;
    const pad = (yMax - yMin) * 0.08;
    return [yMin - pad, yMax + pad];
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
    yearFrom.addEventListener("change", onRangeChange);
    yearTo.addEventListener("change", onRangeChange);
    slider.addEventListener("input", onSliderMove);
    btnPrev.addEventListener("click", () => stepSlider(-1));
    btnNext.addEventListener("click", () => stepSlider(1));

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "ArrowLeft") stepSlider(-1);
      if (e.key === "ArrowRight") stepSlider(1);
    });

    await onTargetChange();
  }

  async function onTargetChange() {
    currentTarget = selTarget.value;
    try { fcData = await fetchJSON(DATA_BASE + `forecasts_${currentTarget}.json`); } catch { fcData = null; }
    try { scoresData = await fetchJSON(DATA_BASE + `scores_${currentTarget}.json`); } catch { scoresData = null; }
    buildModelCheckboxes();
    updateSlider();
    yAxisRange = computeYRange();
    draw();
    drawScoreChart();
    drawCumulativeChart();
  }

  function buildModelCheckboxes() {
    if (!fcData) return;
    const models = Object.keys(fcData.models);
    selectedModels = new Set(models);
    modelBox.innerHTML = models
      .map((m, i) => {
        const c = COLORS[i % COLORS.length];
        return `<label><input type="checkbox" value="${m}" checked
                 style="accent-color:${c}"> ${m}</label>`;
      })
      .join("");
    modelBox.querySelectorAll("input").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) selectedModels.add(cb.value);
        else selectedModels.delete(cb.value);
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

  function onRangeChange() {
    updateSlider();
    yAxisRange = computeYRange();
    draw(); drawScoreChart(); drawCumulativeChart();
  }

  function onSliderMove() {
    sliderIndex = parseInt(slider.value);
    updateSliderLabel();
    draw();
  }

  function stepSlider(delta) {
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
      t.dates.forEach((d, i) => {
        const dt = new Date(d);
        if (dt >= startLimit && dt <= endLimit && t.values[i] != null) {
          xArr.push(d); yArr.push(t.values[i]);
        }
      });
      traces.push({
        x: xArr, y: yArr, mode: "lines", name: "Observed",
        line: { color: "#37474f", width: 2.2 },
        hovertemplate: "%{x|%b %Y}<br>Value: %{y:.2f}<extra>Observed</extra>",
      });
    }

    const models = Object.keys(fcData.models).filter((m) => selectedModels.has(m));
    models.forEach((model, mi) => {
      const color = COLORS[mi % COLORS.length];
      const entry = fcData.models[model][originDate];
      if (!entry) return;
      const teds = entry.ted;

      if (entry.q005 && entry.q095) {
        traces.push({
          x: teds.concat([...teds].reverse()),
          y: entry.q005.concat([...entry.q095].reverse()),
          fill: "toself", fillcolor: hexToRgba(color, 0.12),
          line: { color: "transparent" }, showlegend: false, hoverinfo: "skip",
        });
      }
      if (entry.q010 && entry.q090) {
        traces.push({
          x: teds.concat([...teds].reverse()),
          y: entry.q010.concat([...entry.q090].reverse()),
          fill: "toself", fillcolor: hexToRgba(color, 0.25),
          line: { color: "transparent" }, showlegend: false, hoverinfo: "skip",
        });
      }
      // Point forecast: show mean (falling back to Q0.5 if mean unavailable)
      const pointY = entry.mean || entry.q050;
      traces.push({
        x: teds, y: pointY, mode: "lines+markers", name: model,
        line: { color: color, width: 2.8 },
        marker: { size: 6, color: color },
        hovertemplate: "%{x|%b %Y}<br>Mean: %{y:.2f}<extra>" + model + "</extra>",
      });
    });

    const shapes = [{
      type: "line", x0: originDate, x1: originDate,
      y0: 0, y1: 1, yref: "paper",
      line: { color: "rgba(63,81,181,0.35)", width: 1.5, dash: "dash" },
    }];
    const annotations = [{
      x: originDate, y: 1, yref: "paper",
      text: "forecast origin", showarrow: false,
      font: { size: 10, color: "rgba(63,81,181,0.7)" }, yanchor: "bottom",
    }];

    const layout = {
      font: PLOTLY_FONT,
      title: { text: currentTarget, font: { size: 16, color: "#333" }, x: 0.01 },
      xaxis: {
        range: [`${yFrom}-01-01`, `${yTo + 1}-01-01`],
        ...PLOTLY_GRID, tickformat: "%Y", dtick: "M24",
      },
      yaxis: {
        title: { text: currentTarget, standoff: 10 },
        range: yAxisRange, ...PLOTLY_GRID,
      },
      shapes, annotations,
      legend: { orientation: "h", y: -0.12, x: 0.5, xanchor: "center",
                font: { size: 12 }, bgcolor: "rgba(255,255,255,0)" },
      margin: { t: 40, r: 16, b: 60, l: 65 },
      hovermode: "x unified", height: 500,
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

  // --- score chart (rolling metric) ---
  function drawScoreChart() {
    if (!scoresData || originDates.length === 0) { Plotly.purge(scoreChartDiv); return; }

    const metricKey = selMetric.value;
    const isRMSE = metricKey === "SqErr";
    const displayName = isRMSE ? "RMSE" : metricKey;

    const models = Object.keys(scoresData.models).filter((m) => selectedModels.has(m));
    const yFrom = parseInt(yearFrom.value) || 2000;
    const yTo = parseInt(yearTo.value) || 2026;
    const traces = [];

    models.forEach((model, mi) => {
      const color = COLORS[mi % COLORS.length];
      const modelScores = scoresData.models[model];
      const nDates = scoresData.origin_dates.length;
      const avgVals = new Array(nDates).fill(null);

      const horizonKeys = Object.keys(modelScores);
      for (let i = 0; i < nDates; i++) {
        let sum = 0, cnt = 0;
        for (const hk of horizonKeys) {
          const v = modelScores[hk][metricKey]?.[i];
          if (v != null) { sum += v; cnt++; }
        }
        if (cnt > 0) avgVals[i] = sum / cnt;
      }

      const filtDates = [], filtVals = [];
      scoresData.origin_dates.forEach((d, i) => {
        const y = parseInt(d.slice(0, 4));
        if (y >= yFrom && y <= yTo && avgVals[i] != null) {
          filtDates.push(d); filtVals.push(avgVals[i]);
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

    const layout = {
      font: PLOTLY_FONT,
      title: { text: `${displayName} (12-month rolling avg)`, font: { size: 14, color: "#555" }, x: 0.01 },
      xaxis: {
        range: [`${yFrom}-01-01`, `${yTo + 1}-01-01`],
        ...PLOTLY_GRID, tickformat: "%Y", dtick: "M24",
      },
      yaxis: { title: { text: displayName, standoff: 10 }, ...PLOTLY_GRID },
      legend: { orientation: "h", y: -0.18, x: 0.5, xanchor: "center",
                font: { size: 12 }, bgcolor: "rgba(255,255,255,0)" },
      margin: { t: 36, r: 16, b: 70, l: 65 },
      hovermode: "x unified", height: 340,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    };

    Plotly.react(scoreChartDiv, traces, layout, PLOTLY_CONFIG);
    scoreChartDiv.removeAllListeners && scoreChartDiv.removeAllListeners("plotly_relayout");
    scoreChartDiv.on("plotly_relayout", syncYearsFromPlotly);
  }

  // --- cumulative error chart (only for MAE and RMSE) ---
  function drawCumulativeChart() {
    const metricKey = selMetric.value;
    // Only show cumulative chart for MAE and SE (RMSE)
    if (metricKey !== "MAE" && metricKey !== "SqErr") {
      Plotly.purge(cumChartDiv);
      cumChartDiv.style.display = "none";
      return;
    }
    cumChartDiv.style.display = "block";

    if (!scoresData || originDates.length === 0) { Plotly.purge(cumChartDiv); return; }

    const isRMSE = metricKey === "SqErr";
    const displayName = isRMSE ? "Cumulative Squared Error" : "Cumulative Absolute Error";

    const models = Object.keys(scoresData.models).filter((m) => selectedModels.has(m));
    const yFrom = parseInt(yearFrom.value) || 2000;
    const yTo = parseInt(yearTo.value) || 2026;
    const traces = [];

    models.forEach((model, mi) => {
      const color = COLORS[mi % COLORS.length];
      const modelScores = scoresData.models[model];
      const nDates = scoresData.origin_dates.length;
      const avgVals = new Array(nDates).fill(null);

      const horizonKeys = Object.keys(modelScores);
      for (let i = 0; i < nDates; i++) {
        let sum = 0, cnt = 0;
        for (const hk of horizonKeys) {
          const v = modelScores[hk][metricKey]?.[i];
          if (v != null) { sum += v; cnt++; }
        }
        if (cnt > 0) avgVals[i] = sum / cnt;
      }

      // filter and accumulate
      const filtDates = [], cumVals = [];
      let cumSum = 0;
      scoresData.origin_dates.forEach((d, i) => {
        const y = parseInt(d.slice(0, 4));
        if (y >= yFrom && y <= yTo && avgVals[i] != null) {
          cumSum += avgVals[i];
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

    const layout = {
      font: PLOTLY_FONT,
      title: { text: displayName, font: { size: 14, color: "#555" }, x: 0.01 },
      xaxis: {
        range: [`${yFrom}-01-01`, `${yTo + 1}-01-01`],
        ...PLOTLY_GRID, tickformat: "%Y", dtick: "M24",
      },
      yaxis: { title: { text: displayName, standoff: 10 }, ...PLOTLY_GRID },
      legend: { orientation: "h", y: -0.18, x: 0.5, xanchor: "center",
                font: { size: 12 }, bgcolor: "rgba(255,255,255,0)" },
      margin: { t: 36, r: 16, b: 70, l: 75 },
      hovermode: "x unified", height: 340,
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
