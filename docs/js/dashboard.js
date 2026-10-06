/* Shared behavior for the two vanilla-JavaScript dashboards. */
(function () {
  "use strict";
  const base = new URL("../data/", document.currentScript.src);
  const cache = new Map();
  let plotlyPromise;
  const D = window.Dashboard = {
    color: (i) => (document.body.getAttribute("data-md-color-scheme") === "slate"
      ? ["#9ab5ff", "#ffb380", "#80cbc4", "#df9bea", "#cbb5aa", "#e0c36a", "#f39bb7", "#a8c7d5"]
      : ["#4055a8", "#b34800", "#007f73", "#9a3caf", "#795548", "#875900", "#a52c56", "#4b636c"])[i % 8],
    dashes: ["solid", "dash", "dot", "dashdot", "longdash"],
    escape: (value) => String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]),
    format: (value) => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumSignificantDigits: 4 }) : "—",
    modelName: (value) => String(value).replace(/^(MacroHub|BASELINE)[- _]+/i, ""),
    point: (entry, i) => Number.isFinite(entry.mean?.[i])
      ? { value: entry.mean[i], statistic: "Mean" }
      : { value: entry.q050?.[i] ?? null, statistic: "Median" },
    json(name) {
      if (!cache.has(name)) {
        cache.set(name, fetch(new URL(name, base), { cache: "no-cache", signal: AbortSignal.timeout(20000) }).then((r) => {
          if (!r.ok) throw new Error(`Data request failed (${r.status})`);
          return r.json();
        }).catch((e) => { cache.delete(name); throw e; }));
      }
      return cache.get(name);
    },
    plotly() {
      if (window.Plotly) return Promise.resolve();
      if (!plotlyPromise) plotlyPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.plot.ly/plotly-2.35.2.min.js";
        script.onload = resolve;
        script.onerror = () => { script.remove(); plotlyPromise = null; reject(new Error("Chart library could not load")); };
        document.head.append(script);
      });
      return plotlyPromise;
    },
    validMonth: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value),
    nextMonth: (value) => {
      const [year, month] = value.split("-").map(Number);
      return `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01`;
    },
    timeAxis: (dark, label) => ({
      tickmode: "linear", tick0: "2000-01-01", dtick: "M60", tickformat: "%Y",
      hoverformat: label ? `%b %Y · ${label}` : "%b %Y",
      showgrid: true, gridcolor: dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)",
      minor: { tickmode: "linear", tick0: "2000-01-01", dtick: "M12", showgrid: true,
        gridcolor: dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)" },
    }),
    crisisShapes: (dark) => [["2007-12-01", "2009-07-01"], ["2020-03-01", "2021-07-01"]].map(([x0, x1]) => ({
      type: "rect", x0, x1, y0: 0, y1: 1, yref: "paper", layer: "below", line: { width: 0 },
      fillcolor: dark ? "rgba(129,199,132,0.12)" : "rgba(46,125,50,0.10)",
    })),
    hoverLabel: (dark) => ({ bgcolor: dark ? "#2e2e2e" : "#fff", font: { color: dark ? "#ddd" : "#333", family: "'JetBrains Mono', monospace" } }),
    // Unified hover rows "Name:   value": names padded, values right-aligned (needs the monospace hoverLabel).
    // At least 3 decimals; more for tiny values (CPI MAE ~0.003) so ~3 significant digits survive.
    alignHover(traces) {
      const shown = traces.filter((t) => t.hoverinfo !== "skip");
      const max = shown.flatMap((t) => t.y).filter(Number.isFinite).reduce((a, v) => Math.max(a, Math.abs(v)), 0);
      const dec = max > 0 ? Math.max(3, 2 - Math.floor(Math.log10(max))) : 3;
      const width = Math.max(0, ...shown.map((t) => t.name.length)) + 1;
      shown.forEach((t) => {
        // Pre-formatted in JS: Plotly drops d3 formats with a custom fill character.
        t.text = t.y.map((v) => Number.isFinite(v) ? v.toFixed(dec).padStart(dec + 6, "\u00A0") : "");
        t.hovertemplate = D.escape((t.name + ":").padEnd(width, "\u00A0")) + "%{text}"
          + (t.customdata ? "\u00A0(%{customdata})" : "") + "<extra></extra>";
      });
      return traces;
    },
    range(from, to) {
      const valid = D.validMonth(from.value) && D.validMonth(to.value) && from.validity.valid && to.validity.valid && from.value <= to.value;
      from.setAttribute("aria-invalid", String(!valid));
      to.setAttribute("aria-invalid", String(!valid));
      return valid;
    },
    restore(controls, params = new URLSearchParams(location.search)) {
      for (const [key, input] of Object.entries(controls)) {
        if (!params.has(key)) continue;
        let v = params.get(key);
        if (input.type === "month" && /^\d{4}$/.test(v)) v += /to$/i.test(key) ? "-12" : "-01";
        if (input.type === "checkbox") input.checked = v !== "false";
        else if (input.tagName === "SELECT") {
          if ([...input.options].some((o) => o.value === v)) input.value = v;
        } else if (D.validMonth(v) && v >= input.min && v <= input.max) input.value = v;
      }
    },
    save(controls, extra = {}) {
      const url = new URL(location.href);
      for (const [key, input] of Object.entries(controls)) url.searchParams.set(key, input.type === "checkbox" ? input.checked : input.value);
      for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
      // Replace filters in the current entry: browser Back still returns to the previous page.
      history.replaceState(null, "", url);
    },
    table(container, headers, rows, caption) {
      let page = 0;
      const render = () => {
        const start = page * 100;
        container.innerHTML = `<table class="eval-summary-table"><caption>${D.escape(caption)} — rows ${rows.length ? start + 1 : 0}–${Math.min(start + 100, rows.length)} of ${rows.length}</caption><thead><tr>${headers.map((h) => `<th scope="col">${D.escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.slice(start, start + 100).map((row) => `<tr>${row.map((v, i) => `<${i ? "td" : 'th scope="row"'}>${D.escape(v)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table>`;
        if (rows.length <= 100) return;
        const nav = document.createElement("div");
        nav.className = "dash-pagination";
        for (const [label, delta, disabled] of [["Previous rows", -1, !page], ["Next rows", 1, start + 100 >= rows.length]]) {
          const button = document.createElement("button");
          button.textContent = label; button.className = "dash-btn"; button.disabled = disabled;
          button.addEventListener("click", () => { page += delta; render(); container.focus(); });
          nav.append(button);
        }
        container.append(nav);
      };
      render();
    },
    download(headers, rows, name) {
      const quote = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
      const blob = new Blob([[headers, ...rows].map((r) => r.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = name;
      link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    },
    // Rank by the full-history MAE ratio to RandomWalk, excluding ensembles.
    bestModel(data, candidates = Object.keys(data.models)) {
      const target = data.target || "target";
      const ranked = D.summarize({ [target]: data }, "MAE", {
        horizon: "all", fromMonth: "0000-01", toMonth: "9999-12", includeCovid: true,
      });
      return candidates.filter((m) => !/ensemble/i.test(m) && !/randomwalk/i.test(m))
        .sort((a, b) => (ranked[a]?.[target]?.geomean ?? Infinity) - (ranked[b]?.[target]?.geomean ?? Infinity) || a.localeCompare(b))[0];
    },
    // Use paired sums so model and RandomWalk totals cover the same forecast cases.
    relativeCumulative(data, model, metric, horizon, fromMonth, toMonth) {
      const scores = data.models[model] || {};
      const hKeys = horizon === "all" ? Object.keys(scores) : [`h${horizon}`];
      const x = [], y = [];
      let total = 0, benchmark = 0;
      data.origin_dates.forEach((date, i) => {
        const month = date.slice(0, 7);
        if (month < fromMonth || month > toMonth) return;
        for (const h of hKeys) {
          const s = scores[h]?.[`${metric}_paired_sum`]?.[i];
          const b = scores[h]?.[`${metric}_benchmark_sum`]?.[i];
          if (Number.isFinite(s) && s >= 0 && Number.isFinite(b) && b >= 0) {
            total += s; benchmark += b;
          }
        }
        x.push(date); y.push(benchmark > 0 ? total / benchmark : null);
      });
      return { x, y };
    },
    // Rank each origin/horizon cell before averaging. Equal values share the minimum rank.
    summarize(data, metric, { horizon, fromMonth, toMonth, includeCovid, includeGfc = true }) {
      const result = {};
      for (const [target, sd] of Object.entries(data)) {
        const models = Object.keys(sd.models);
        const sums = Object.fromEntries(models.map((m) => [m, { score: 0, rank: 0, count: 0, horizons: {} }]));
        const hKeys = [...new Set(models.flatMap((m) => Object.keys(sd.models[m])))].filter((h) => horizon === "all" || h === `h${horizon}`);
        sd.origin_dates.forEach((date, i) => {
          const month = date.slice(0, 7);
          if (month < fromMonth || month > toMonth || (!includeCovid && month >= "2020-03" && month <= "2021-06")) return;
          if (!includeGfc && month >= "2007-12" && month <= "2009-06") return;
          for (const h of hKeys) {
            const cell = models.map((m) => ({ m, v: sd.models[m][h]?.[metric]?.[i] })).filter((x) => Number.isFinite(x.v)).sort((a, b) => a.v - b.v);
            let rank = 1;
            cell.forEach(({ m, v }, j) => {
              if (j === 0 || v !== cell[j - 1].v) rank = j + 1;
              const weight = sd.models[m][h]?.[`${metric}_count`]?.[i] ?? 1;
              sums[m].score += v * weight;
              const storedRank = sd.models[m][h]?.[`${metric}_rank`]?.[i];
              sums[m].rank += (Number.isFinite(storedRank) ? storedRank : rank) * weight;
              sums[m].count += weight;
              const score = sd.models[m][h]?.[`${metric}_paired_sum`]?.[i];
              const benchmark = sd.models[m][h]?.[`${metric}_benchmark_sum`]?.[i];
              if (Number.isFinite(score) && score >= 0 && Number.isFinite(benchmark) && benchmark >= 0) {
                const pair = sums[m].horizons[h] ||= { score: 0, benchmark: 0 };
                pair.score += score; pair.benchmark += benchmark;
              }
            });
          }
        });
        for (const [m, s] of Object.entries(sums)) {
          result[m] ||= {};
          const ratios = Object.values(s.horizons).filter((p) => p.benchmark > 0).map((p) => p.score / p.benchmark);
          result[m][target] = { count: s.count,
            geomean: ratios.length ? (ratios.includes(0) ? 0 : Math.exp(ratios.reduce((sum, r) => sum + Math.log(r), 0) / ratios.length / (metric === "SqErr" ? 2 : 1))) : null,
            rank: s.count ? s.rank / s.count : null,
            score: s.count ? (metric === "SqErr" ? Math.sqrt(s.score / s.count) : s.score / s.count) : null };
        }
      }
      return result;
    },
  };
  document.querySelectorAll("[data-dashboard-freshness]").forEach(async (el) => {
    try {
      const m = await D.json("status.json");
      el.textContent = `Latest forecast origin: ${m.latest_origin || "unavailable"}. Observations through ${m.truth_through || "unavailable"}. Dashboard generated ${m.generated_at}. Includes historical backfills.`;
    } catch { el.textContent = "Data freshness unavailable. Historical backfills are included."; }
  });
})();
