/* Registration opens on the 17th, midnight to midnight in America/New_York. */
(function () {
  "use strict";
  const el = document.getElementById("arena-countdown");
  if (!el) return;
  const zone = "America/New_York";
  const parts = (date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23",
  }).formatToParts(date).map((p) => [p.type, p.value]));
  function midnight(year, month, day) {
    const noon = new Date(Date.UTC(year, month, day, 12));
    return new Date(+noon - Number(parts(noon).hour) * 3600000);
  }
  function duration(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60);
    return days ? `${days}d ${hours}h` : `${hours}h ${minutes % 60}m`;
  }
  function tick() {
    const now = new Date(), p = parts(now);
    let month = Number(p.month) - 1;
    if (+p.day >= 18) month++;
    const open = midnight(+p.year, month, 17), close = midnight(+p.year, month, 18);
    const isOpen = now >= open && now < close;
    const date = (d) => d.toLocaleDateString("en-US", { timeZone: zone, month: "long", day: "numeric", year: "numeric" });
    el.textContent = isOpen
      ? `Registration OPEN — closes ${date(close)} at 00:00 Eastern (${zone}), in ${duration(close - now)}.`
      : `Next registration: ${date(open)}, 00:00–23:59 Eastern (${zone}). Opens in ${duration(open - now)}.`;
    el.classList.toggle("is-open", isOpen);
  }
  tick();
  setInterval(tick, 30000);
})();
