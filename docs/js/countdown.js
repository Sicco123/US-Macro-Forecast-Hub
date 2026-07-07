/**
 * Live countdown to the 24-hour forecast registration window
 * (17th of each month, 00:00–23:59 US/Eastern).
 */
(function () {
  "use strict";

  const el = document.getElementById("arena-countdown");
  if (!el) return;

  // ponytail: toLocaleString timezone trick — display-only countdown,
  // CI enforces the real deadline server-side.
  function etNow() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  }

  function fmt(ms) {
    const mins = Math.floor(ms / 60000);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
  }

  function tick() {
    const now = etNow();
    let open = new Date(now.getFullYear(), now.getMonth(), 17);
    let close = new Date(now.getFullYear(), now.getMonth(), 18);
    if (now >= close) {
      open = new Date(now.getFullYear(), now.getMonth() + 1, 17);
      close = new Date(now.getFullYear(), now.getMonth() + 1, 18);
    }
    if (now >= open) {
      el.innerHTML = `&#128994; Registration <b>OPEN</b> &mdash; closes in ${fmt(close - now)}`;
      el.classList.add("is-open");
    } else {
      el.innerHTML = `Next 24-hour registration window opens in <b>${fmt(open - now)}</b>`;
      el.classList.remove("is-open");
    }
  }

  tick();
  setInterval(tick, 30000);
})();
