// Charts for /stats/. Each <figure data-stat-chart> carries a compact JSON
// payload written by tools/stats/build.py:
//   { value_format, granularity, periods: [{s, e, partial}], series: [{label, slot, values: []}] }
// The chart is an inline SVG line chart drawn at the figure's real width, with
// a legend (toggle lines), a hover crosshair and tooltip, and a log-scale
// toggle for series that span orders of magnitude. Colours come from the
// --viz-N custom properties on .stats-page (fixed per series slot, never
// re-assigned when a line is hidden).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function compact(v, format) {
  if (v == null || Number.isNaN(v)) return "–";
  if (format === "percent") return (Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2)) + "%";
  const prefix = format === "usd" ? "$" : "";
  const a = Math.abs(v);
  const f = (n, d) => prefix + (v < 0 ? "-" : "") + n.toFixed(d).replace(/\.0$/, "");
  if (a >= 1e12) return f(a / 1e12, 1) + "T";
  if (a >= 1e9) return f(a / 1e9, 1) + "B";
  if (a >= 1e7) return f(a / 1e6, 0) + "M";
  if (a >= 1e6) return f(a / 1e6, 1) + "M";
  if (a >= 1e4) return f(a / 1e3, 0) + "K";
  if (a >= 1e3) return f(a / 1e3, 1) + "K";
  return prefix + (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 }));
}

function full(v, format) {
  if (v == null) return "–";
  if (format === "percent") return v.toFixed(3).replace(/\.?0+$/, "") + "%";
  if (format === "usd") return "$" + Math.round(v).toLocaleString();
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function periodLabel(p, granularity) {
  const d = new Date(p.s + "T00:00:00Z");
  const day = d.getUTCDate(), mon = MONTHS[d.getUTCMonth()], yr = d.getUTCFullYear();
  if (granularity === "monthly") return `${mon} ${yr}`;
  if (granularity === "weekly") return `w/c ${day} ${mon} ${yr}`;
  return `${day} ${mon} ${yr}`;
}

function niceTicks(min, max, count) {
  const span = max - min || 1;
  const rough = span / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.map((s) => s * pow).find((s) => span / s <= count) || 10 * pow;
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(+t.toFixed(10));
  return ticks;
}

function logTicks(min, max) {
  const ticks = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    const base = 10 ** e;
    if (base >= min && base <= max) ticks.push(base);
  }
  if (ticks.length < 3) {
    for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
      for (const m of [2, 5]) { const t = m * 10 ** e; if (t >= min && t <= max) ticks.push(t); }
    }
    ticks.sort((a, b) => a - b);
  }
  return ticks;
}

const svgNS = "http://www.w3.org/2000/svg";
function el(name, attrs = {}, text) {
  const n = document.createElementNS(svgNS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

function setupChart(figure) {
  const host = figure.querySelector(".chart-host");
  const data = JSON.parse(figure.querySelector("script[type='application/json']").textContent);
  if (!data.periods?.length || !data.series?.length) return;
  const title = figure.dataset.title || "";
  const hidden = new Set();
  // Log scale is offered when there is something positive to plot; zero and
  // negative values simply break the line on the log scale.
  const maxV = Math.max(...data.series.flatMap((s) => s.values.filter((v) => v != null)));
  const minPos = Math.min(...data.series.flatMap((s) => s.values.filter((v) => v != null && v > 0)));
  const positive = Number.isFinite(minPos) && maxV > 0;
  const spansOrders = positive && maxV / minPos > 50 && data.series.length > 1;
  let useLog = spansOrders;

  const controls = document.createElement("div");
  controls.className = "chart-controls";
  if (positive && data.series.length > 1) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox"; box.checked = useLog; box.className = "chart-log";
    box.addEventListener("change", () => { useLog = box.checked; render(); });
    label.append(box, " log scale");
    controls.append(label);
  }
  figure.insertBefore(controls, host);

  const legend = document.createElement("ul");
  legend.className = "chart-legend";
  if (data.series.length > 1) {
    data.series.forEach((s, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button"; btn.setAttribute("aria-pressed", "true");
      const sw = document.createElement("span"); sw.className = "swatch"; sw.style.background = `var(--viz-${s.slot || i + 1})`;
      btn.append(sw, s.label);
      btn.addEventListener("click", () => {
        if (hidden.has(i)) hidden.delete(i); else hidden.add(i);
        btn.setAttribute("aria-pressed", hidden.has(i) ? "false" : "true");
        render();
      });
      li.append(btn); legend.append(li);
    });
    figure.insertBefore(legend, figure.querySelector("figcaption"));
  }

  const tip = document.createElement("div");
  tip.className = "chart-tip"; tip.hidden = true;
  host.append(tip);

  function render() {
    host.querySelector("svg")?.remove();
    host.querySelector(".no-js-note")?.remove();
    const width = Math.max(280, host.clientWidth || 600);
    const height = Math.round(Math.min(360, Math.max(220, width * 0.45)));
    const m = { top: 12, right: 14, bottom: 28, left: 48 };
    const W = width - m.left - m.right, H = height - m.top - m.bottom;
    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", "aria-label": `Line chart: ${title}` });

    const shown = data.series.map((s, i) => ({ ...s, i })).filter((s) => !hidden.has(s.i));
    const vals = shown.flatMap((s) => s.values.filter((v) => v != null));
    if (!vals.length) { host.prepend(svg); return; }
    const pos = vals.filter((v) => v > 0);
    if (useLog && !pos.length) useLog = false;
    let lo = useLog ? Math.min(...pos) : 0;
    let hi = Math.max(...vals);
    if (hi === lo) hi = lo + 1;
    const ticks = useLog ? logTicks(lo, hi) : niceTicks(0, hi, 4);
    if (!useLog && ticks.length) hi = Math.max(hi, ticks[ticks.length - 1]);
    if (useLog) { lo = Math.min(lo, ticks[0] ?? lo); hi = Math.max(hi, ticks[ticks.length - 1] ?? hi); }
    const n = data.periods.length;
    const t0 = Date.parse(data.periods[0].s), t1 = Date.parse(data.periods[n - 1].s);
    const x = (i) => m.left + (n === 1 ? W / 2 : ((Date.parse(data.periods[i].s) - t0) / (t1 - t0 || 1)) * W);
    const y = (v) => m.top + H - (useLog ? (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo) || 1) : (v - lo) / (hi - lo)) * H;

    for (const t of ticks) {
      svg.append(el("line", { class: "grid", x1: m.left, x2: m.left + W, y1: y(t), y2: y(t) }));
      svg.append(el("text", { x: m.left - 6, y: y(t) + 4, "text-anchor": "end" }, compact(t, data.value_format)));
    }
    svg.append(el("line", { class: "axis", x1: m.left, x2: m.left + W, y1: m.top + H, y2: m.top + H }));
    // x labels: first of each month, thinned to fit
    const monthStarts = [];
    let lastKey = "";
    data.periods.forEach((p, i) => {
      const key = p.s.slice(0, 7);
      if (key !== lastKey) { monthStarts.push(i); lastKey = key; }
    });
    const every = Math.max(1, Math.ceil(monthStarts.length / Math.max(2, Math.floor(W / 70))));
    monthStarts.forEach((i, k) => {
      if (k % every) return;
      const d = new Date(data.periods[i].s + "T00:00:00Z");
      svg.append(el("text", { x: x(i), y: m.top + H + 18, "text-anchor": "middle" }, `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`));
    });

    for (const s of shown) {
      const color = `var(--viz-${s.slot || s.i + 1})`;
      let d = "", pen = false;
      s.values.forEach((v, i) => {
        if (v == null || (useLog && v <= 0)) { pen = false; return; }
        d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true;
      });
      svg.append(el("path", { class: "line", d, stroke: color }));
      s.values.forEach((v, i) => {
        if (v == null || (useLog && v <= 0)) return;
        const last = i === s.values.length - 1;
        if (data.periods[i].partial || last || n <= 12) {
          svg.append(el("circle", { class: "pt", cx: x(i), cy: y(v), r: data.periods[i].partial ? 4 : 3, stroke: color, fill: data.periods[i].partial ? "var(--background)" : color }));
        }
      });
    }

    const cursor = el("line", { class: "cursor", y1: m.top, y2: m.top + H, x1: 0, x2: 0, visibility: "hidden" });
    svg.append(cursor);
    const hit = el("rect", { x: m.left, y: m.top, width: W, height: H, fill: "transparent" });
    hit.addEventListener("pointermove", (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ev.clientX - r.left;
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } }
      cursor.setAttribute("x1", x(best)); cursor.setAttribute("x2", x(best)); cursor.setAttribute("visibility", "visible");
      const p = data.periods[best];
      tip.innerHTML = "";
      const b = document.createElement("b"); b.textContent = periodLabel(p, data.granularity) + (p.partial ? " (incomplete)" : "");
      tip.append(b);
      for (const s of shown) {
        const v = s.values[best];
        if (v == null) continue;
        const row = document.createElement("div"); row.className = "row";
        const name = document.createElement("span");
        const sw = document.createElement("span"); sw.className = "swatch"; sw.style.background = `var(--viz-${s.slot || s.i + 1})`;
        name.append(sw, " ", s.label);
        const val = document.createElement("span"); val.textContent = full(v, data.value_format);
        row.append(name, val); tip.append(row);
      }
      tip.hidden = false;
      const left = x(best) + 12 + tip.offsetWidth > width ? x(best) - tip.offsetWidth - 12 : x(best) + 12;
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = `${Math.max(0, Math.min(ev.clientY - r.top - 10, height - tip.offsetHeight))}px`;
    });
    hit.addEventListener("pointerleave", () => { tip.hidden = true; cursor.setAttribute("visibility", "hidden"); });
    svg.append(hit);
    host.prepend(svg);
  }

  render();
  if ("ResizeObserver" in window) {
    let last = host.clientWidth;
    new ResizeObserver(() => { if (host.clientWidth !== last) { last = host.clientWidth; render(); } }).observe(host);
  }
}

for (const figure of document.querySelectorAll("[data-stat-chart]")) {
  try { setupChart(figure); } catch (err) { console.error("stats chart failed", err); }
}

// Section permalinks: the # after each heading is a normal link to the
// section's id, so it works without JavaScript. With it, a click also copies
// the absolute URL, so one chart can be shared without editing the address bar.
for (const link of document.querySelectorAll(".stat-link")) {
  link.addEventListener("click", async () => {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") return;
    try {
      await navigator.clipboard.writeText(new URL(link.getAttribute("href"), location.href).href);
    } catch {
      return; // clipboard denied: the hash navigation still happened
    }
    let note = link.nextElementSibling;
    if (!note || !note.classList.contains("stat-copied")) {
      note = document.createElement("span");
      note.className = "stat-copied";
      note.setAttribute("role", "status");
      link.after(note);
    }
    note.textContent = "Link copied";
    clearTimeout(note._timer);
    note._timer = setTimeout(() => { note.textContent = ""; }, 1800);
  });
}
