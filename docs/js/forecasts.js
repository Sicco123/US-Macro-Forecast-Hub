/**
 * Interactive forecast visualization dashboard.
 */
(function () {
  "use strict";

  const ROOT = document.getElementById("fc-dashboard");
  if (!ROOT) return;

  const D = window.Dashboard;

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
  let sliderIndex = -1;
  let minMonth = "2000-01", maxMonth = "2100-12";
  let requestId = 0;
  let modelSelection = null;
  let defaultModels = new Set();
  let restoredOrigin = null;
  let tableRows = [];
  let selectedModels = new Set();
  let modelColorMap = {};          // stable model → color mapping
  let yAxisRange = null;
  let maxHorizon = 24;

  const selTarget = ROOT.querySelector("#fc-target");
  const selMetric = ROOT.querySelector("#fc-metric");
  const selMaxHorizon = ROOT.querySelector("#fc-max-horizon");
  const modelBox = ROOT.querySelector("#fc-models");
  const btnShowModels = ROOT.querySelector("#fc-models-show");
  const btnHideModels = ROOT.querySelector("#fc-models-hide");
  const monthFrom = ROOT.querySelector("#fc-month-from");
  const monthTo = ROOT.querySelector("#fc-month-to");
  const slider = ROOT.querySelector("#fc-slider");
  const sliderLabel = ROOT.querySelector("#fc-slider-label");
  const btnPrev = ROOT.querySelector("#fc-prev");
  const btnNext = ROOT.querySelector("#fc-next");
  const btnPlay = ROOT.querySelector("#fc-play");
  const chartDiv = ROOT.querySelector("#fc-chart");
  const scoreChartDiv = ROOT.querySelector("#fc-score-chart");
  const relativeChartDiv = ROOT.querySelector("#fc-relative-chart");
  const relativeTable = ROOT.querySelector("#fc-relative-table");
  const btnResetZoom = ROOT.querySelector("#fc-reset-zoom");

  const status = ROOT.querySelector("#fc-status");
  const retry = ROOT.querySelector("#fc-retry");
  const controls = { target: selTarget, metric: selMetric, horizon: selMaxHorizon, from: monthFrom, to: monthTo };
  const tableDiv = ROOT.querySelector("#fc-table");
  const download = ROOT.querySelector("#fc-download");
  const accuracy = ROOT.querySelector("#fc-accuracy");
  function clearCharts() {
    if (window.Plotly) [chartDiv, scoreChartDiv, relativeChartDiv].forEach((d) => Plotly.purge(d));
    relativeTable.replaceChildren();
    tableDiv.replaceChildren(); tableRows = []; download.disabled = true;
  }
  function validRange() {
    if (D.range(monthFrom, monthTo)) return true;
    stopPlay(); clearCharts();
    status.textContent = "Enter valid months with From no later than To.";
    [slider, btnPrev, btnNext, btnPlay].forEach((el) => { el.disabled = true; });
    return false;
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

  function computeYRange() {
    const fromMonth = monthFrom.value;
    const toMonth = monthTo.value;

    // Observed values: collected separately and NEVER clipped — the observed
    // line must always be fully visible, even when the selected model's
    // envelope is much narrower than the data (e.g. 2008 / COVID spikes).
    const truthVals = [];
    const t = truthData[currentTarget];
    if (t) {
      const displayVals = truthDisplayValues(t);
      t.dates.forEach((d, i) => {
        const month = d.slice(0, 7);
        if (month >= fromMonth && month <= toMonth && displayVals[i] != null) {
          truthVals.push(displayVals[i]);
        }
      });
    }
    // Include the displayed forecast envelopes in full; do not clip uncertainty.
    const fcVals = [];
    if (fcData) {
      for (const model of Object.keys(fcData.models)) {
        if (!selectedModels.has(model)) continue;
        for (const od of originDates) {
          const e = fcData.models[model][od];
          if (!e) continue;
          for (const v of (e.q005 || []).slice(0, maxHorizon)) if (v != null) fcVals.push(v);
          for (const v of (e.q095 || []).slice(0, maxHorizon)) if (v != null) fcVals.push(v);
          e.ted.slice(0, maxHorizon).forEach((_, i) => { const v = D.point(e, i).value; if (Number.isFinite(v)) fcVals.push(v); });
        }
      }
    }
    if (truthVals.length === 0 && fcVals.length === 0) return null;

    let lo = Infinity, hi = -Infinity;
    for (const v of fcVals) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
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
    if (btnPlay) { btnPlay.textContent = "Play"; btnPlay.setAttribute("aria-label", "Play through origin dates"); btnPlay.setAttribute("aria-pressed", "false"); }
  }
  function togglePlay() {
    if (playTimer) { stopPlay(); return; }
    if (!fcData || !originDates.length || !validRange()) return;
    if (sliderIndex >= originDates.length - 1) {
      sliderIndex = 0; slider.value = 0; updateSliderLabel(); draw();
    }
    btnPlay.textContent = "Pause";
    btnPlay.setAttribute("aria-label", "Pause playback");
    btnPlay.setAttribute("aria-pressed", "true");
    playTimer = setInterval(() => {
      if (sliderIndex >= originDates.length - 1) { stopPlay(); return; }
      stepSlider(1);
    }, 650);
  }

  // --- loading / empty states ---
  function setLoading(on) {
    ROOT.setAttribute("aria-busy", String(on));
    [chartDiv, scoreChartDiv, relativeChartDiv].forEach((d) => d.classList.toggle("dash-chart--loading", on));
    [slider, btnPrev, btnNext, btnPlay].forEach((el) => { el.disabled = on || !originDates.length; });
    [btnShowModels, btnHideModels].forEach((el) => { el.disabled = on || !modelBox.querySelectorAll("input").length; });
  }

  function readHash() {
    const params = new URLSearchParams(location.search);
    if (!params.has("target")) {
      const legacy = new URLSearchParams(location.hash.slice(1)).get("target");
      if (legacy) params.set("target", legacy);
    }
    D.restore(controls, params);
    maxHorizon = +selMaxHorizon.value;
    modelSelection = params.has("models") ? params.get("models").split(",") : null;
    restoredOrigin = params.get("origin");
  }
  function writeHash() {
    if (!fcData) return;
    D.save(controls, { origin: originDates[sliderIndex] || "", models: [...selectedModels].join(",") });
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

    [[btnShowModels, true], [btnHideModels, false]].forEach(([button, checked]) => {
      button.addEventListener("click", () => {
        selectedModels.clear();
        modelBox.querySelectorAll("input").forEach((cb) => {
          cb.checked = checked;
          if (checked) selectedModels.add(cb.value);
        });
        updateSlider(); yAxisRange = computeYRange(); draw(); drawScoreChart();
      });
    });
    selTarget.addEventListener("change", onTargetChange);
    selMetric.addEventListener("change", () => { writeHash(); drawScoreChart(); });
    selMaxHorizon.addEventListener("change", () => {
      maxHorizon = parseInt(selMaxHorizon.value);
      yAxisRange = computeYRange();
      draw(); drawScoreChart();
    });
    monthFrom.addEventListener("change", onRangeChange);
    monthTo.addEventListener("change", onRangeChange);
    slider.addEventListener("input", onSliderMove);
    btnPrev.addEventListener("click", () => { stopPlay(); stepSlider(-1); });
    btnNext.addEventListener("click", () => { stopPlay(); stepSlider(1); });
    if (btnPlay) btnPlay.addEventListener("click", togglePlay);
    if (btnResetZoom) btnResetZoom.addEventListener("click", resetZoom);

    ROOT.addEventListener("keydown", (e) => {
      if (e.target.closest("input, select, button, a, summary, textarea, [contenteditable]")) return;
      if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); stopPlay(); }
      if (e.key === "ArrowLeft") stepSlider(-1);
      if (e.key === "ArrowRight") stepSlider(1);
      if (e.key === " " && btnPlay) { e.preventDefault(); togglePlay(); }
    });

    // Redraw charts when dark/light mode toggles
    new MutationObserver(() => { Object.keys(modelColorMap).sort().forEach((m, i) => { modelColorMap[m] = D.color(i); }); draw(); drawScoreChart(); })
      .observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });

    retry.addEventListener("click", onTargetChange);
    accuracy.addEventListener("toggle", () => { if (accuracy.open) { drawScoreChart(); } });
    download.addEventListener("click", () => D.download(["model", "target_end_date", "statistic", "value", "q005", "q010", "q050", "q090", "q095"], tableRows, `${currentTarget}-${originDates[sliderIndex]}.csv`));
    window.addEventListener("popstate", () => { readHash(); onTargetChange(); });
    readHash();
    await onTargetChange();
  }

  async function onTargetChange() {
    const id = ++requestId;
    const target = selTarget.value;
    const previousOrigin = currentTarget === target ? originDates[sliderIndex] : null;
    if (fcData && modelSelection === null && (selectedModels.size !== defaultModels.size || [...selectedModels].some((m) => !defaultModels.has(m)))) modelSelection = [...selectedModels];
    stopPlay(); fcData = null; scoresData = null; originDates = [];
    clearCharts(); modelBox.replaceChildren();
    ROOT.querySelector("#fc-description").textContent = "";
    status.textContent = "Loading forecasts…"; retry.hidden = true; setLoading(true);
    try {
      const [truth, forecasts, scores] = await Promise.all([
        D.json("truth.json"), D.json(`forecasts_${target}.json`),
        D.json(`scores_${target}.json`).catch(() => null), D.plotly(),
      ]);
      if (id !== requestId) return;
      truthData = truth; fcData = forecasts; scoresData = scores; currentTarget = target;
      if (!forecasts.origin_dates.length) {
        status.textContent = "No forecasts are available for this indicator yet.";
        return;
      }
      minMonth = forecasts.origin_dates[0].slice(0, 7);
      const latestYear = +forecasts.origin_dates.at(-1).slice(0, 4);
      maxMonth = `${latestYear + 2}-12`;
      for (const input of [monthFrom, monthTo]) { input.min = minMonth; input.max = maxMonth; }
      const params = new URLSearchParams(location.search);
      if (!params.has("from")) monthFrom.value = `${Math.max(+minMonth.slice(0, 4), latestYear - 5)}-01`;
      if (!params.has("to")) monthTo.value = maxMonth;
      buildModelCheckboxes();
      updateSlider();
      const desired = restoredOrigin || previousOrigin;
      const commonLatest = originDates.findLastIndex((d) => [...selectedModels].every((m) => fcData.models[m]?.[d]));
      sliderIndex = desired && originDates.includes(desired) ? originDates.indexOf(desired) : commonLatest >= 0 ? commonLatest : originDates.length - 1;
      restoredOrigin = null; modelSelection = null;
      slider.value = Math.max(0, sliderIndex); updateSliderLabel();
      yAxisRange = computeYRange();
      draw(); drawScoreChart();
      if (!scores) { status.textContent = "Forecasts loaded. Accuracy data could not load. Retry to recover it."; retry.hidden = false; }
    } catch {
      if (id !== requestId) return;
      clearCharts(); status.textContent = "Could not load forecasts. Check your connection and retry."; retry.hidden = false;
    } finally { if (id === requestId) { setLoading(false); updateSliderLabel(); } }
  }

  function buildModelCheckboxes() {
    if (!fcData) return;
    const models = Object.keys(fcData.models).sort();
    selectedModels = modelSelection === null
      ? new Set([(scoresData ? D.bestModel(scoresData, models) : models.find((m) => !/ensemble|randomwalk/i.test(m))), "MacroHub-RandomWalk"].filter((m) => models.includes(m)))
      : new Set(modelSelection.filter((m) => models.includes(m)));
    if (modelSelection === null) defaultModels = new Set(selectedModels);
    if (modelSelection === null && !selectedModels.size && models.length) selectedModels.add(models[0]);
    // Stable color map: sorted order determines color, never changes on selection
    modelColorMap = {};
    models.forEach((m, i) => { modelColorMap[m] = D.color(i); });
    modelBox.innerHTML = models
      .map((m) => {
        const c = modelColorMap[m];
        const chk = selectedModels.has(m) ? "checked" : "";
        return `<label><input type="checkbox" value="${D.escape(m)}" ${chk}
                 style="accent-color:${c}"> <span style="color:${c}; font-weight:600" aria-hidden="true">●</span> ${D.escape(D.modelName(m))}</label>`;
      })
      .join("");
    modelBox.querySelectorAll("input").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) selectedModels.add(cb.value);
        else selectedModels.delete(cb.value);
        updateSlider(); yAxisRange = computeYRange(); draw(); drawScoreChart();
      });
    });
  }

  function updateSlider() {
    if (!fcData) return;
    const fromMonth = monthFrom.value;
    const toMonth = monthTo.value;
    const previousOrigin = originDates[sliderIndex];
    originDates = fcData.origin_dates.filter((d) => {
      const month = d.slice(0, 7);
      return month >= fromMonth && month <= toMonth && (!selectedModels.size || [...selectedModels].some((m) => fcData.models[m]?.[d]));
    });
    slider.max = Math.max(0, originDates.length - 1);
    sliderIndex = !originDates.length ? -1 : previousOrigin ? findClosestOrigin(previousOrigin) : originDates.length - 1;
    slider.value = sliderIndex;
    updateSliderLabel();
  }

  function resetZoom() {
    // Reset month inputs to full range and redraw all charts from scratch
    monthFrom.value = minMonth;
    monthTo.value = maxMonth;
    onRangeChange();
  }

  function onRangeChange() {
    if (!validRange()) return;
    updateSlider();
    yAxisRange = computeYRange();
    draw(); drawScoreChart();
  }

  function onSliderMove() {
    stopPlay();  // manual drag takes over from autoplay
    sliderIndex = parseInt(slider.value);
    updateSliderLabel();
    draw();
  }

  function stepSlider(delta) {
    if (!fcData || !originDates.length || !validRange()) return;
    sliderIndex = Math.max(0, Math.min(originDates.length - 1, sliderIndex + delta));
    slider.value = sliderIndex; updateSliderLabel(); draw();
  }

  function updateSliderLabel() {
    const date = originDates[sliderIndex];
    sliderLabel.textContent = date || "No origins";
    slider.setAttribute("aria-valuetext", date || "No forecast origins in this range");
    const unavailable = !date || ROOT.getAttribute("aria-busy") === "true" || !D.range(monthFrom, monthTo);
    slider.disabled = btnPlay.disabled = unavailable;
    btnPrev.disabled = unavailable || sliderIndex <= 0;
    btnNext.disabled = unavailable || sliderIndex >= originDates.length - 1;
  }

  function syncMonthsFromPlotly(eventData) {
    const yZoom = Number.isFinite(eventData["yaxis.range[0]"]) && Number.isFinite(eventData["yaxis.range[1]"]);
    if (yZoom) yAxisRange = [eventData["yaxis.range[0]"], eventData["yaxis.range[1]"]];
    if (eventData["yaxis.autorange"]) yAxisRange = computeYRange();
    if (eventData["xaxis.range[0]"] && eventData["xaxis.range[1]"]) {
      const newFrom = eventData["xaxis.range[0]"].slice(0, 7);
      const newTo = eventData["xaxis.range[1]"].slice(0, 7);
      if (D.validMonth(newFrom) && D.validMonth(newTo)) {
        monthFrom.value = newFrom < minMonth ? minMonth : newFrom;
        monthTo.value = newTo > maxMonth ? maxMonth : newTo;
        updateSlider();
        if (!yZoom) yAxisRange = computeYRange();
        draw(); drawScoreChart();
      }
    }
    if (eventData["xaxis.autorange"]) {
      monthFrom.value = minMonth;
      monthTo.value = maxMonth;
      updateSlider();
      if (!yZoom) yAxisRange = computeYRange();
      draw(); drawScoreChart();
    }
  }

  // --- main forecast chart ---
  function draw() {
    if (!fcData || !window.Plotly || !validRange()) return;
    writeHash(); updateSliderLabel();
    if (!originDates.length) { clearCharts(); status.textContent = "No forecasts for the selected models in this range. Select another model or widen the dates."; return; }
    status.textContent = selectedModels.size ? "" : "Select a model to show its forecast.";
    renderTable();
    if (selectedModels.size && !tableRows.length) status.textContent = "No forecasts for these models at this origin. Choose another origin or model.";

    const originDate = originDates[sliderIndex];
    ROOT.querySelector("#fc-description").textContent = `${selTarget.selectedOptions[0].textContent}. Origin ${originDate}; up to ${maxHorizon} monthly steps. Units: ${yAxisLabel(currentTarget)}. Exact values and intervals are in the table below.`;
    const fromMonth = monthFrom.value;
    const toMonth = monthTo.value;
    const traces = [];

    const t = truthData[currentTarget];
    if (t) {
      const endLimit = new Date(D.nextMonth(toMonth));
      const startLimit = new Date(`${fromMonth}-01`);
      const xArr = [], yArr = [];
      const displayVals = truthDisplayValues(t);
      const decimals = (t.transform === "log_diff" || t.transform === "diff") ? 4 : 2;
      t.dates.forEach((d, i) => {
        const dt = new Date(d);
        if (dt >= startLimit && dt < endLimit && displayVals[i] != null) {
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
      const points = teds.map((_, i) => D.point(entry, i));
      const pointY = points.map((p) => p.value);
      traces.push({
        x: teds, y: pointY, mode: "lines+markers", name: D.modelName(model),
        line: { color: color, width: 2.8, dash: D.dashes[Object.keys(fcData.models).sort().indexOf(model) % D.dashes.length] },
        marker: { size: 6, color: color },
        customdata: points.map((p) => p.statistic),
        hovertemplate: "%{x|%b %Y}<br>%{customdata}: %{y:.6g}<extra>" + D.escape(D.modelName(model)) + "</extra>",
      });
    });

    const dark = isDark();
    const originLineColor = dark ? "rgba(160,180,255,0.45)" : "rgba(63,81,181,0.35)";
    const originTextColor = dark ? "rgba(160,180,255,0.8)" : "rgba(63,81,181,0.7)";
    const titleColor = dark ? "#ddd" : "#333";
    const spikeColor = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)";

    const shapes = [...D.crisisShapes(dark), {
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
      title: { text: currentTarget, font: { size: 16, color: titleColor }, x: 0.01 },
      xaxis: {
        range: [`${fromMonth}-01`, D.nextMonth(toMonth)],
        ...D.timeAxis(dark),
        spikecolor: spikeColor, spikethickness: 1,
      },
      yaxis: {
        title: { text: yAxisLabel(currentTarget), standoff: 10 },
        range: yAxisRange, ...plotlyGrid(),
      },
      shapes, annotations,
      legend: { orientation: "h", y: -0.12, x: 0.5, xanchor: "center",
                font: { size: 13 }, bgcolor: "rgba(0,0,0,0)" },
      margin: { t: 40, r: 16, b: 60, l: chartDiv.clientWidth < 500 ? 48 : 65 },
      hovermode: "x unified", hoverlabel: { bgcolor: dark ? "#2e2e2e" : "#fff", font: { color: dark ? "#ddd" : "#333" } },
      height: chartDiv.clientWidth < 500 ? 420 : 500,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    };

    Plotly.react(chartDiv, traces, layout, PLOTLY_CONFIG);
    chartDiv.removeAllListeners && chartDiv.removeAllListeners("plotly_relayout");
    chartDiv.removeAllListeners && chartDiv.removeAllListeners("plotly_click");
    chartDiv.on("plotly_relayout", syncMonthsFromPlotly);

    // Click on chart to jump forecast origin to the closest date
    chartDiv.on("plotly_click", function (data) {
      if (data.points && data.points.length > 0) {
        stopPlay();
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
    if (!window.Plotly || !accuracy.open || !validRange()) return;
    if (!scoresData || originDates.length === 0) { Plotly.purge(scoreChartDiv); Plotly.purge(relativeChartDiv); relativeTable.replaceChildren(); return; }

    const metricKey = selMetric.value;
    const isRMSE = metricKey === "SqErr";
    const displayName = isRMSE ? "RMSE" : metricKey;

    const models = Object.keys(scoresData.models).sort().filter((m) => selectedModels.has(m));
    const fromMonth = monthFrom.value;
    const toMonth = monthTo.value;
    const traces = [];

    // Use only the selected max horizon (data keys are h0, h1, ... where h0 = horizon 1)
    const hk = `h${maxHorizon - 1}`;

    models.forEach((model) => {
      const color = modelColorMap[model];
      const modelScores = scoresData.models[model];
      const hData = modelScores[hk]?.[metricKey];

      const filtDates = [], filtVals = [];
      scoresData.origin_dates.forEach((d, i) => {
        const month = d.slice(0, 7);
        const v = hData?.[i];
        if (month >= fromMonth && month <= toMonth && v != null) {
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
        x: filtDates, y: rolling, mode: "lines", name: D.modelName(model),
        line: { color: color, width: 2.2, dash: D.dashes[Object.keys(fcData.models).sort().indexOf(model) % D.dashes.length] },
        hovertemplate: "%{x|%b %Y}<br>" + displayName + ": %{y:.6g}<extra>" + D.escape(D.modelName(model)) + "</extra>",
      });
    });

    const dark2 = isDark();
    const layout = {
      font: plotlyFont(),
      title: { text: `${displayName} — horizon ${maxHorizon} (12-month rolling avg)`, font: { size: 14, color: dark2 ? "#ccc" : "#555" }, x: 0.01 },
      xaxis: {
        range: [`${fromMonth}-01`, D.nextMonth(toMonth)],
        ...D.timeAxis(dark2),
        spikecolor: dark2 ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)", spikethickness: 1,
      },
      yaxis: { title: { text: displayName, standoff: 10 }, ...plotlyGrid() },
      shapes: D.crisisShapes(dark2),
      legend: { orientation: "h", y: -0.18, x: 0.5, xanchor: "center",
                font: { size: 13 }, bgcolor: "rgba(0,0,0,0)" },
      margin: { t: 36, r: 16, b: 70, l: chartDiv.clientWidth < 500 ? 48 : 65 },
      hovermode: "x unified", hoverlabel: { bgcolor: dark2 ? "#2e2e2e" : "#fff", font: { color: dark2 ? "#ddd" : "#333" } },
      height: 340,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    };

    Plotly.react(scoreChartDiv, traces, layout, PLOTLY_CONFIG);
    scoreChartDiv.removeAllListeners && scoreChartDiv.removeAllListeners("plotly_relayout");
    scoreChartDiv.on("plotly_relayout", syncMonthsFromPlotly);
    drawRelativeChart();
  }

  function drawRelativeChart() {
    const metric = selMetric.value;
    const fromMonth = monthFrom.value, toMonth = monthTo.value;
    const models = Object.keys(scoresData.models).sort().filter((m) => selectedModels.has(m));
    const rows = [];
    const traces = models.map((model) => {
      const series = D.relativeCumulative(scoresData, model, metric, String(maxHorizon - 1), fromMonth, toMonth);
      series.x.forEach((date, i) => rows.push([D.modelName(model), date, D.format(series.y[i])]));
      return { ...series, mode: "lines", name: D.modelName(model),
        line: { color: modelColorMap[model], width: 2.2, dash: D.dashes[Object.keys(fcData.models).sort().indexOf(model) % D.dashes.length] },
        hovertemplate: "%{x|%b %Y}<br>Model / RW: %{y:.6g}<extra>" + D.escape(D.modelName(model)) + "</extra>" };
    });
    const dark = isDark();
    Plotly.react(relativeChartDiv, traces, {
      font: plotlyFont(),
      title: { text: `Cumulative ${metric === "SqErr" ? "squared" : "absolute"} error / RW`, font: { size: 14 }, x: 0.01 },
      xaxis: { range: [`${fromMonth}-01`, D.nextMonth(toMonth)], ...D.timeAxis(dark) },
      yaxis: { title: { text: "Model / RW (1 = RW)", standoff: 10 }, ...plotlyGrid() },
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 1, y1: 1, line: { color: plotlyFont().color, width: 1.5, dash: "dash" } }],
      annotations: traces.some((t) => t.y.some(Number.isFinite)) ? [] : [{ xref: "paper", yref: "paper", x: 0.5, y: 0.5, showarrow: false,
        text: selectedModels.size ? "No paired losses with<br>positive RW total in this range." : "Select a model to compare with RW." }],
      legend: { orientation: "h", y: -0.18, x: 0.5, xanchor: "center" },
      margin: { t: 36, r: 16, b: 70, l: relativeChartDiv.clientWidth < 500 ? 48 : 65 },
      hovermode: "x unified", height: 340,
      plot_bgcolor: "rgba(0,0,0,0)", paper_bgcolor: "rgba(0,0,0,0)",
    }, PLOTLY_CONFIG);
    D.table(relativeTable, ["Model", "Origin", "Model / RW"], rows, "Cumulative error / RW");
    relativeChartDiv.removeAllListeners && relativeChartDiv.removeAllListeners("plotly_relayout");
    relativeChartDiv.on("plotly_relayout", syncMonthsFromPlotly);
  }

  function renderTable() {
    tableRows = [];
    for (const model of [...selectedModels].sort()) {
      const entry = fcData.models[model]?.[originDates[sliderIndex]];
      if (!entry) continue;
      entry.ted.slice(0, maxHorizon).forEach((date, i) => {
        const point = D.point(entry, i);
        tableRows.push([model, date, point.statistic, point.value, ...["q005", "q010", "q050", "q090", "q095"].map((q) => entry[q]?.[i] ?? null)]);
      });
    }
    download.disabled = !tableRows.length;
    if (!tableRows.length) { tableDiv.textContent = "No forecasts for the selected models and origin."; return; }
    D.table(tableDiv, ["Model", "Target month", "Statistic", "Value", "5%", "10%", "Median", "90%", "95%"], tableRows.map((r) => r.map((v, i) => i === 0 ? D.modelName(v) : i < 3 ? v : D.format(v))), `${currentTarget} at origin ${originDates[sliderIndex]} — ${yAxisLabel(currentTarget)}`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
