const baseline = {
  baseYear: 2025,
  endYear: 2065,
  baseGdpPc: 3250,
  threshold: 14000,
  realGrowth: 7.5,
  inflation: 4,
  depreciation: 2,
  population: 0.5,
  thresholdGrowth: 2,
  medianAgeYear: 2053,
  taper: false
};

const FRONTIER_REAL_GROWTH = 2.5; // article: frontier economies grow under 2.5%

const engineBaseline = {
  labour: 0.8,
  capital: 3.7,
  productivity: 2.5
};

const rankSeries = {
  years: [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024],
  countries: [
    {
      id: "CHN",
      name: "China",
      className: "china",
      ranks: [172, 151, 137, 136, 119, 94, 82, 83],
      values: [319, 613, 969, 1778, 4629, 8175, 10627, 13293]
    },
    {
      id: "VNM",
      name: "Vietnam",
      className: "vietnam",
      ranks: [191, 179, 174, 174, 161, 155, 143, 130],
      values: [99, 288, 404, 711, 1683, 2578, 3534, 4717]
    },
    {
      id: "IND",
      name: "India",
      className: "india",
      ranks: [165, 166, 170, 175, 170, 167, 169, 155],
      values: [371, 375, 443, 710, 1348, 1584, 1907, 2592]
    }
  ]
};

const state = { ...baseline };
const engineState = { ...engineBaseline };
let rankChartMode = "rank";
let rankYear = 2024;
let rankPlayHandle = null;
let primerRevealed = false;
const rankView = { built: false };
let chartGeom = null;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const fmtPercent = (value, digits = 1) => `${value.toFixed(digits)}%`;
const fmtPts = (value) => `${value.toFixed(1)} pts`;
const fmtMoney = (value) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(value)}`;
};

function usdGrowthFactor(realGrowthPct) {
  const real = 1 + realGrowthPct / 100;
  const inflation = 1 + state.inflation / 100;
  const depreciation = 1 + state.depreciation / 100;
  const population = 1 + state.population / 100;
  return (real * inflation) / (depreciation * population);
}

function usdPerPersonGrowth() {
  return (usdGrowthFactor(state.realGrowth) - 1) * 100;
}

function projectSeries() {
  const years = [];
  const factor = usdGrowthFactor(state.realGrowth);
  const thresholdGrowth = state.thresholdGrowth / 100;

  for (let year = state.baseYear; year <= state.endYear; year += 1) {
    const t = year - state.baseYear;
    years.push({
      year,
      gdp: state.baseGdpPc * factor ** t,
      threshold: state.threshold * (1 + thresholdGrowth) ** t,
      realGrowth: state.realGrowth
    });
  }

  return years;
}

// The article's frontier warning as a model: real growth glides from the
// slider value toward FRONTIER_REAL_GROWTH in proportion to the share of the
// income gap still remaining, s_t = (1 - y/H) / (1 - y0/H0).
function projectTaperSeries() {
  const years = [];
  const g0 = state.realGrowth;
  const r0 = state.baseGdpPc / state.threshold;
  const thresholdGrowth = state.thresholdGrowth / 100;
  let gdp = state.baseGdpPc;
  let threshold = state.threshold;

  years.push({ year: state.baseYear, gdp, threshold, realGrowth: g0 });

  for (let year = state.baseYear + 1; year <= state.endYear; year += 1) {
    const ratio = Math.min(1, gdp / threshold);
    const gapShare = r0 >= 0.999 ? 0 : Math.max(0, (1 - ratio) / (1 - r0));
    const gReal = FRONTIER_REAL_GROWTH + (g0 - FRONTIER_REAL_GROWTH) * gapShare;
    gdp *= usdGrowthFactor(gReal);
    threshold *= 1 + thresholdGrowth;
    years.push({ year, gdp, threshold, realGrowth: gReal });
  }

  return years;
}

function crossingPoint(series) {
  return series.find((point) => point.gdp >= point.threshold) || null;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
  return (value) => {
    const ratio = (value - domainMin) / (domainMax - domainMin || 1);
    return rangeMin + ratio * (rangeMax - rangeMin);
  };
}

function scaleLog(domainMin, domainMax, rangeMin, rangeMax) {
  const safeMin = Math.max(1, domainMin);
  const safeMax = Math.max(safeMin + 1, domainMax);
  const logMin = Math.log(safeMin);
  const logMax = Math.log(safeMax);

  return (value) => {
    const ratio = (Math.log(Math.max(1, value)) - logMin) / (logMax - logMin || 1);
    return rangeMin + ratio * (rangeMax - rangeMin);
  };
}

function pathFrom(points, xScale, yScale, key) {
  return points
    .map((point, index) => {
      const x = xScale(point.year);
      const y = yScale(point[key]);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function doublingTicks(minY, maxY) {
  const ticks = [];
  let tick = 250;
  while (tick <= maxY) {
    if (tick >= minY) ticks.push(tick);
    tick *= 2;
  }
  return ticks;
}

/* ------------------------------ rank chart ------------------------------ */

function rankPointValue(country, index) {
  return rankChartMode === "rank"
    ? country.ranks[index]
    : (country.values[index] / country.values[0]) * 100;
}

function rankValueLabel(country, rawValue) {
  if (rankChartMode === "rank") return `#${Math.round(rawValue)}`;
  const multiple = rawValue / 100;
  return `${multiple >= 10 ? multiple.toFixed(0) : multiple.toFixed(1)}x`;
}

// Piecewise-linear interpolation in pixel space (so tips ride the drawn line)
// plus in value space (for labels).
function interpolateAt(points, yearFloat) {
  const first = points[0];
  const last = points[points.length - 1];
  if (yearFloat <= first.year) return { ...first };
  if (yearFloat >= last.year) return { ...last };
  let i = 0;
  while (points[i + 1].year < yearFloat) i += 1;
  const a = points[i];
  const b = points[i + 1];
  const t = (yearFloat - a.year) / (b.year - a.year);
  return {
    year: yearFloat,
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
    value: a.value + t * (b.value - a.value)
  };
}

// Years (interpolated) at which `other` overtakes India in the rank table.
function rankOvertakes(other, india) {
  const years = rankSeries.years;
  const crossings = [];
  for (let i = 0; i < years.length - 1; i += 1) {
    const before = other.ranks[i] - india.ranks[i];
    const after = other.ranks[i + 1] - india.ranks[i + 1];
    if (before > 0 && after <= 0) {
      const s = before / (before - after);
      crossings.push({
        yearFloat: years[i] + s * (years[i + 1] - years[i]),
        indiaRank: india.ranks[i] + s * (india.ranks[i + 1] - india.ranks[i]),
        name: other.name
      });
    }
  }
  return crossings;
}

function buildRankChart() {
  const svg = document.getElementById("rankChart");
  if (!svg) return;

  const compact = window.matchMedia("(max-width: 640px)").matches;
  const width = compact ? 620 : 820;
  const height = compact ? 400 : 430;
  const pad = compact
    ? { top: 30, right: 94, bottom: 58, left: 56 }
    : { top: 34, right: 128, bottom: 58, left: 70 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const years = rankSeries.years;
  const x = scaleLinear(years[0], years[years.length - 1], pad.left, pad.left + chartW);
  const isRank = rankChartMode === "rank";
  const y = isRank
    ? scaleLinear(75, 200, pad.top, pad.top + chartH)
    : scaleLog(80, 5200, pad.top + chartH, pad.top);
  const yTicks = isRank ? [80, 100, 120, 140, 160, 180, 200] : [100, 300, 1000, 3000, 5000];
  const xTicks = [1990, 2000, 2010, 2020, 2024];

  const grid = yTicks.map((tick) => {
    const yy = y(tick);
    return `
      <line class="grid-line" x1="${pad.left}" x2="${pad.left + chartW}" y1="${yy}" y2="${yy}"></line>
      <text class="tick-label" x="${pad.left - 14}" y="${yy + 4}" text-anchor="end">${isRank ? `#${tick}` : tick}</text>
    `;
  }).join("");

  const xAxis = xTicks.map((year) => {
    const xx = x(year);
    return `
      <line class="grid-line" x1="${xx}" x2="${xx}" y1="${pad.top}" y2="${pad.top + chartH}"></line>
      <text class="tick-label" x="${xx}" y="${pad.top + chartH + 30}" text-anchor="middle">${year}</text>
    `;
  }).join("");

  const countries = rankSeries.countries.map((country) => {
    const points = years.map((year, index) => ({
      year,
      value: rankPointValue(country, index),
      x: x(year),
      y: y(rankPointValue(country, index))
    }));
    return { country, points, path: pathFrom(points, x, y, "value") };
  });

  const lines = countries.map(({ country, path }) => `
    <path class="rank-line ${country.className}" d="${path}"></path>
  `).join("");

  const dots = countries.map(({ country, points }) => points.map((point, index) => `
    <circle class="rank-dot ${country.className}" data-year="${point.year}"
      cx="${point.x}" cy="${point.y}" r="4.5">
      <title>${country.name}, ${point.year}: ${rankValueLabel(country, rankPointValue(country, index))}</title>
    </circle>
  `).join("")).join("");

  const india = rankSeries.countries.find((c) => c.id === "IND");
  const markers = isRank
    ? rankSeries.countries
        .filter((c) => c.id !== "IND")
        .flatMap((c) => rankOvertakes(c, india))
        .map((cross) => `
          <g class="rank-marker" data-year="${cross.yearFloat.toFixed(2)}">
            <circle cx="${x(cross.yearFloat)}" cy="${y(cross.indiaRank)}" r="5"></circle>
            <text x="${x(cross.yearFloat) + 9}" y="${y(cross.indiaRank) - 10}">
              ${cross.name} passes India &#8776;${Math.round(cross.yearFloat)}
            </text>
          </g>
        `).join("")
    : "";

  const tips = countries.map(({ country }) => `
    <g class="rank-tip" data-country="${country.id}">
      <text class="rank-end-label ${country.className}"></text>
      <text class="rank-end-value"></text>
    </g>
  `).join("");

  svg.innerHTML = `
    <defs>
      <clipPath id="rankClip">
        <rect x="${pad.left}" y="${pad.top - 6}" width="${chartW}" height="${chartH + 12}"></rect>
      </clipPath>
    </defs>
    ${grid}
    ${xAxis}
    <line class="axis" x1="${pad.left}" x2="${pad.left + chartW}" y1="${pad.top + chartH}" y2="${pad.top + chartH}"></line>
    <line class="axis" x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${pad.top + chartH}"></line>
    <text class="rank-race-year" x="${pad.left + chartW - 10}" y="${pad.top + chartH - 18}" text-anchor="end"></text>
    <g clip-path="url(#rankClip)">${lines}</g>
    ${dots}
    ${markers}
    ${tips}
    <text x="${pad.left}" y="${height - 16}" class="chart-note">
      ${isRank
        ? "Lower rank numbers are richer in nominal GDP per person."
        : "Index uses each country's 1990 value as 100, on a log scale."}
    </text>
  `;

  rankView.built = true;
  rankView.pad = pad;
  rankView.chartW = chartW;
  rankView.x = x;
  rankView.countries = countries;
  rankView.clipRect = svg.querySelector("#rankClip rect");
  rankView.raceYear = svg.querySelector(".rank-race-year");
  rankView.dots = [...svg.querySelectorAll(".rank-dot")];
  rankView.markers = [...svg.querySelectorAll(".rank-marker")];
  rankView.tips = [...svg.querySelectorAll(".rank-tip")].map((g) => ({
    g,
    name: g.querySelector(".rank-end-label"),
    value: g.querySelector(".rank-end-value"),
    data: countries.find(({ country }) => country.id === g.dataset.country)
  }));

  setText(
    "rankCaption",
    isRank
      ? "Rank view: China moves from #172 to #83, Vietnam from #191 to #130, and India from #165 to #155 among World Bank countries/economies with data. Dots mark observed years; the sweep and its overtake markers interpolate between them."
      : "Index view: since 1990, nominal dollar GDP per person rises roughly 42x for China, 48x for Vietnam, and 7x for India. Dots mark observed years; the sweep interpolates between them."
  );

  updateRankChart(rankYear);
}

function updateRankChart(yearFloat) {
  if (!rankView.built) return;
  rankYear = yearFloat;
  const { pad, chartW, x } = rankView;

  rankView.clipRect.setAttribute("width", Math.max(0, x(yearFloat) - pad.left + 4));
  rankView.raceYear.textContent = Math.floor(yearFloat);
  setText("rankYearOut", String(Math.floor(yearFloat)));
  const scrub = document.getElementById("rankScrub");
  if (scrub && Number(scrub.value) !== Math.floor(yearFloat)) {
    scrub.value = String(Math.floor(yearFloat));
  }

  rankView.dots.forEach((dot) => {
    dot.style.display = Number(dot.dataset.year) <= yearFloat + 0.001 ? "" : "none";
  });
  rankView.markers.forEach((marker) => {
    marker.style.display = Number(marker.dataset.year) <= yearFloat ? "" : "none";
  });

  const placed = rankView.tips
    .map((tip) => ({ tip, at: interpolateAt(tip.data.points, yearFloat) }))
    .sort((a, b) => a.at.y - b.at.y);

  let lastY = -Infinity;
  placed.forEach(({ tip, at }) => {
    let labelY = at.y - 4;
    if (labelY < lastY + 34) labelY = lastY + 34;
    lastY = labelY;
    const labelX = at.x + 12;
    tip.name.setAttribute("x", labelX);
    tip.name.setAttribute("y", labelY);
    tip.name.textContent = tip.data.country.name;
    tip.value.setAttribute("x", labelX);
    tip.value.setAttribute("y", labelY + 19);
    tip.value.textContent = rankValueLabel(tip.data.country, at.value);
  });
}

function stopRankPlay() {
  if (rankPlayHandle) {
    cancelAnimationFrame(rankPlayHandle);
    rankPlayHandle = null;
  }
  const button = document.getElementById("rankPlay");
  if (button) button.textContent = "Play the race";
}

function startRankPlay() {
  const button = document.getElementById("rankPlay");
  if (prefersReducedMotion()) {
    updateRankChart(2024);
    return;
  }
  stopRankPlay();
  if (button) button.textContent = "Pause";
  const startYear = 1990;
  const endYear = 2024;
  const duration = 7000;
  const begin = performance.now();

  const step = (now) => {
    const progress = Math.min(1, (now - begin) / duration);
    updateRankChart(startYear + (endYear - startYear) * progress);
    if (progress < 1) {
      rankPlayHandle = requestAnimationFrame(step);
    } else {
      stopRankPlay();
    }
  };
  rankPlayHandle = requestAnimationFrame(step);
}

/* ----------------------------- growth chart ----------------------------- */

function renderChart(options = {}) {
  const svg = document.getElementById("growthChart");
  if (!svg) return;

  const animate = Boolean(options.animate) && !prefersReducedMotion();
  const series = state.taper ? projectTaperSeries() : projectSeries();
  const ghost = state.taper ? projectSeries() : null;
  const crossing = crossingPoint(series);
  const width = 760;
  const height = 430;
  const pad = { top: 34, right: 34, bottom: 56, left: 70 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const allPoints = ghost ? series.concat(ghost) : series;
  const maxY = Math.max(...allPoints.flatMap((point) => [point.gdp, point.threshold])) * 1.12;
  const minY = Math.min(state.baseGdpPc, state.threshold) * 0.55;
  const x = scaleLinear(state.baseYear, state.endYear, pad.left, pad.left + chartW);
  const y = scaleLog(minY, maxY, pad.top + chartH, pad.top);
  const yTicks = doublingTicks(minY, maxY);
  const xTicks = [state.baseYear, 2035, 2047, 2055, state.endYear].filter(
    (year, index, arr) => year >= state.baseYear && year <= state.endYear && arr.indexOf(year) === index
  );
  const clockX = x(Math.max(state.baseYear, Math.min(state.endYear, state.medianAgeYear)));
  const bandWidth = pad.left + chartW - clockX;
  const gdpPath = pathFrom(series, x, y, "gdp");
  const thresholdPath = pathFrom(series, x, y, "threshold");
  const ghostPath = ghost ? pathFrom(ghost, x, y, "gdp") : "";

  const grid = yTicks.map((value) => {
    const yy = y(value);
    return `
      <line class="grid-line" x1="${pad.left}" x2="${pad.left + chartW}" y1="${yy}" y2="${yy}"></line>
      <text class="tick-label" x="${pad.left - 14}" y="${yy + 4}" text-anchor="end">${fmtMoney(value)}</text>
    `;
  }).join("");

  const xAxis = xTicks.map((year) => {
    const xx = x(year);
    return `
      <line class="grid-line" x1="${xx}" x2="${xx}" y1="${pad.top}" y2="${pad.top + chartH}"></line>
      <text class="tick-label" x="${xx}" y="${pad.top + chartH + 30}" text-anchor="middle">${year}</text>
    `;
  }).join("");

  const crossingParts = crossing
    ? `
      <line class="crossing-rule" x1="${x(crossing.year)}" x2="${x(crossing.year)}" y1="${pad.top}" y2="${pad.top + chartH}"></line>
      <circle class="crossing-dot" cx="${x(crossing.year)}" cy="${y(crossing.gdp)}" r="7"></circle>
      <rect class="chart-label-bg" x="${Math.min(x(crossing.year) + 12, width - 156)}" y="${Math.max(y(crossing.gdp) - 36, 16)}" width="132" height="34" rx="8"></rect>
      <text class="chart-label" x="${Math.min(x(crossing.year) + 28, width - 140)}" y="${Math.max(y(crossing.gdp) - 14, 38)}">Crossing: ${crossing.year}</text>
    `
    : `
      <rect class="chart-label-bg" x="${width - 214}" y="16" width="190" height="34" rx="8"></rect>
      <text class="chart-label" x="${width - 198}" y="38">No crossing by ${state.endYear}</text>
    `;

  const bandLabel = bandWidth > 40
    ? clockX + 12 > width - 170
      ? `<text x="${clockX - 10}" y="${pad.top + chartH - 14}" class="chart-note" text-anchor="end">median age &gt; 40</text>`
      : `<text x="${clockX + 12}" y="${pad.top + chartH - 14}" class="chart-note">median age &gt; 40</text>`
    : "";

  const legendSecondRow = ghost
    ? `
      <line x1="${pad.left + 14}" y1="${pad.top + 40}" x2="${pad.left + 58}" y2="${pad.top + 40}" class="ghost-line"></line>
      <text x="${pad.left + 68}" y="${pad.top + 45}" class="legend-label">Same sliders, never tapering</text>
    `
    : "";

  svg.innerHTML = `
    ${bandWidth > 2 ? `<rect class="clock-band" x="${clockX}" y="${pad.top}" width="${bandWidth}" height="${chartH}"></rect>` : ""}
    ${grid}
    ${xAxis}
    <line class="axis" x1="${pad.left}" x2="${pad.left + chartW}" y1="${pad.top + chartH}" y2="${pad.top + chartH}"></line>
    <line class="axis" x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${pad.top + chartH}"></line>
    ${ghost ? `<path class="ghost-line" d="${ghostPath}"></path>` : ""}
    <path class="line threshold-line" d="${thresholdPath}"></path>
    <path class="line gdp-line" d="${gdpPath}"></path>
    ${crossingParts}
    <line x1="${pad.left + 14}" y1="${pad.top + 18}" x2="${pad.left + 58}" y2="${pad.top + 18}" class="line gdp-line"></line>
    <text x="${pad.left + 68}" y="${pad.top + 23}" class="legend-label">India GDP/person, USD</text>
    <line x1="${pad.left + 238}" y1="${pad.top + 18}" x2="${pad.left + 282}" y2="${pad.top + 18}" class="line threshold-line"></line>
    <text x="${pad.left + 292}" y="${pad.top + 23}" class="legend-label">High-income line</text>
    ${legendSecondRow}
    <text x="${pad.left}" y="${height - 16}" class="chart-note">Vertical scale uses doubling steps. Hover or touch the chart to read any year.</text>
    ${bandLabel}
    <g class="hover-layer" style="display: none">
      <line class="hover-rule" y1="${pad.top}" y2="${pad.top + chartH}"></line>
      <circle class="hover-dot gdp" r="5"></circle>
      <circle class="hover-dot threshold" r="5"></circle>
      <rect class="hover-bg" height="26" rx="6"></rect>
      <text class="hover-text"></text>
    </g>
  `;

  chartGeom = { series, x, y, pad, chartW, chartH, width };

  if (animate) {
    svg.querySelectorAll("path.gdp-line, path.threshold-line").forEach((path) => {
      if (!path.getTotalLength) return;
      const length = path.getTotalLength();
      path.style.strokeDasharray = path.classList.contains("threshold-line") ? "8 8" : String(length);
      if (path.classList.contains("threshold-line")) return;
      path.style.strokeDashoffset = length;
      path.getBoundingClientRect();
      path.style.transition = "stroke-dashoffset 650ms cubic-bezier(0.16, 1, 0.3, 1)";
      path.style.strokeDashoffset = "0";
    });
  }
}

function setupChartHover() {
  const svg = document.getElementById("growthChart");
  if (!svg) return;

  const hide = () => {
    const layer = svg.querySelector(".hover-layer");
    if (layer) layer.style.display = "none";
  };

  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("pointermove", (event) => {
    if (!chartGeom) return;
    const layer = svg.querySelector(".hover-layer");
    if (!layer) return;

    const { series, x, y, pad, chartW, width } = chartGeom;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    if (px < pad.left - 6 || px > pad.left + chartW + 6) {
      hide();
      return;
    }

    const span = state.endYear - state.baseYear;
    const year = Math.round(state.baseYear + ((px - pad.left) / chartW) * span);
    const point = series[Math.min(series.length - 1, Math.max(0, year - state.baseYear))];
    if (!point) return;

    const xx = x(point.year);
    layer.style.display = "";
    layer.querySelector(".hover-rule").setAttribute("x1", xx);
    layer.querySelector(".hover-rule").setAttribute("x2", xx);
    const gdpDot = layer.querySelector(".hover-dot.gdp");
    gdpDot.setAttribute("cx", xx);
    gdpDot.setAttribute("cy", y(point.gdp));
    const thresholdDot = layer.querySelector(".hover-dot.threshold");
    thresholdDot.setAttribute("cx", xx);
    thresholdDot.setAttribute("cy", y(point.threshold));

    const text = layer.querySelector(".hover-text");
    text.textContent = `${point.year} · India ${fmtMoney(point.gdp)} · line ${fmtMoney(point.threshold)}`;
    const boxWidth = text.textContent.length * 6.9 + 18;
    const boxX = xx + 12 + boxWidth > width - 8 ? xx - 12 - boxWidth : xx + 12;
    const boxY = pad.top + (state.taper ? 56 : 34);
    const box = layer.querySelector(".hover-bg");
    box.setAttribute("x", boxX);
    box.setAttribute("y", boxY);
    box.setAttribute("width", boxWidth);
    text.setAttribute("x", boxX + 9);
    text.setAttribute("y", boxY + 17.5);
  });
}

/* ------------------------------ model board ----------------------------- */

function renderModel(options = {}) {
  const usdGrowth = usdPerPersonGrowth();
  const series = state.taper ? projectTaperSeries() : projectSeries();
  const crossing = crossingPoint(series);
  const crossingLabel = crossing ? String(crossing.year) : `>${state.endYear}`;
  const distance = state.threshold / state.baseGdpPc;
  const approx = state.realGrowth + state.inflation - state.depreciation - state.population;

  const atBaseline = Object.keys(baseline).every((key) => state[key] === baseline[key]);
  setText("heroLabel", atBaseline ? "Baseline crossing year" : "Crossing year, your settings");
  setText("crossingYear", crossingLabel);
  setText("heroYear", crossingLabel);
  setText("usdGrowth", fmtPercent(usdGrowth));
  setText("distanceMultiple", `${distance.toFixed(1)}x`);
  setText(
    "heroSubcopy",
    state.taper
      ? `with ${fmtPercent(usdGrowth)} USD per-person growth, tapering`
      : `with ${fmtPercent(usdGrowth)} USD per-person growth`
  );

  let caption = `Exact USD per-person growth is ${fmtPercent(usdGrowth)}. The back-of-envelope version is ${fmtPercent(approx)}: real growth plus inflation, minus rupee depreciation and population growth. The chart uses doubling steps so compounding does not flatten the story.`;
  if (state.taper) {
    const finalReal = series[series.length - 1].realGrowth;
    caption += ` Taper on: real growth fades from ${fmtPercent(state.realGrowth)} toward ${fmtPercent(FRONTIER_REAL_GROWTH)} as the gap closes (it is ${fmtPercent(finalReal)} by ${state.endYear}); the dotted line keeps the never-tapering path.`;
  }
  setText("chartCaption", caption);

  setText("realGrowthOut", fmtPercent(state.realGrowth));
  setText("inflationOut", fmtPercent(state.inflation));
  setText("depreciationOut", fmtPercent(state.depreciation));
  setText("populationOut", fmtPercent(state.population));
  setText("thresholdGrowthOut", fmtPercent(state.thresholdGrowth));

  renderChart(options);
}

function engineTotal() {
  return state.population + engineState.labour + engineState.capital + engineState.productivity;
}

function renderEngine() {
  const total = engineTotal();
  setText("labourOut", fmtPts(engineState.labour));
  setText("capitalOut", fmtPts(engineState.capital));
  setText("productivityOut", fmtPts(engineState.productivity));
  setText("engineRealGrowth", fmtPercent(total));
  setText(
    "engineBreakdown",
    `${state.population.toFixed(1)} (population, from the calculator's slider) + ${engineState.labour.toFixed(1)} (worker share) + ${engineState.capital.toFixed(1)} (capital) + ${engineState.productivity.toFixed(1)} (productivity) = ${total.toFixed(1)}%`
  );
}

function syncInputs() {
  document.querySelectorAll("[data-model-control]").forEach((input) => {
    input.value = state[input.dataset.modelControl];
  });
  document.querySelectorAll("[data-model-number]").forEach((input) => {
    input.value = state[input.dataset.modelNumber];
  });
  document.querySelectorAll("[data-engine-control]").forEach((input) => {
    input.value = engineState[input.dataset.engineControl];
  });
  const taperToggle = document.getElementById("taperToggle");
  if (taperToggle) taperToggle.checked = state.taper;
}

function setStage(stage) {
  document.querySelectorAll("[data-stage-pill]").forEach((pill) => {
    pill.classList.toggle("is-active", pill.dataset.stagePill === stage);
  });
}

const numberBounds = {
  baseYear: [1990, 2060],
  baseGdpPc: [100, 20000],
  threshold: [1000, 40000],
  medianAgeYear: [2026, 2065]
};

function setupControls() {
  document.querySelectorAll("[data-model-control]").forEach((input) => {
    input.addEventListener("input", () => {
      state[input.dataset.modelControl] = Number(input.value);
      renderModel();
      if (input.dataset.modelControl === "population") renderEngine();
    });
  });

  document.querySelectorAll("[data-model-number]").forEach((input) => {
    input.addEventListener("input", () => {
      const value = Number(input.value);
      const [min, max] = numberBounds[input.dataset.modelNumber] || [-Infinity, Infinity];
      if (!Number.isFinite(value) || value < min || value > max) return;
      state[input.dataset.modelNumber] = value;
      renderModel();
    });
  });

  document.querySelectorAll("[data-engine-control]").forEach((input) => {
    input.addEventListener("input", () => {
      engineState[input.dataset.engineControl] = Number(input.value);
      renderEngine();
    });
  });

  const taperToggle = document.getElementById("taperToggle");
  taperToggle?.addEventListener("change", () => {
    state.taper = taperToggle.checked;
    renderModel({ animate: true });
  });

  document.getElementById("applyEngine")?.addEventListener("click", () => {
    const total = Math.round(engineTotal() * 10) / 10;
    const clamped = Math.min(10, Math.max(4, total));
    const note = document.getElementById("applyNote");
    if (note) {
      note.hidden = clamped === total;
      note.textContent = clamped === total
        ? ""
        : `The engine says ${total.toFixed(1)}%, but the calculator's slider runs 4-10%. Applied ${clamped.toFixed(1)}%.`;
    }
    state.realGrowth = clamped;
    syncInputs();
    renderModel({ animate: true });
  });

  document.getElementById("resetModel")?.addEventListener("click", () => {
    Object.assign(state, baseline);
    Object.assign(engineState, engineBaseline);
    const note = document.getElementById("applyNote");
    if (note) note.hidden = true;
    syncInputs();
    renderEngine();
    renderModel({ animate: true });
  });
}

function setupTabs() {
  // Every panel is visible in the HTML so the page is complete without
  // JavaScript; with it, show one tab at a time.
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.hidden = !panel.classList.contains("is-active");
  });
  document.querySelectorAll("[data-tab-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.tabTarget;
      document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
        const active = panel.dataset.tabPanel === target;
        panel.hidden = !active;
        panel.classList.toggle("is-active", active);
      });
      document.querySelectorAll(".tab-button").forEach((tab) => {
        const active = tab.dataset.tabTarget === target;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      // Bring the reader to the tabs, not the top of the page, so the new tab's content is in view.
      const bar = document.querySelector(".tabbar");
      if (bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ behavior: "smooth" });
      if (target === "primer" && !primerRevealed) {
        primerRevealed = true;
        renderChart({ animate: true });
      }
    });
  });
}

function setupEquations() {
  const drawer = document.getElementById("equationDrawer");
  const panel = drawer?.querySelector(".drawer-panel");
  const openButtons = [document.getElementById("openEquations"), document.getElementById("openEquationsInline")];
  let lastFocus = null;

  panel?.setAttribute("tabindex", "-1");

  function openDrawer() {
    lastFocus = document.activeElement;
    drawer?.classList.add("is-open");
    drawer?.setAttribute("aria-hidden", "false");
    panel?.focus({ preventScroll: true });
  }

  function closeDrawer() {
    if (!drawer?.classList.contains("is-open")) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    if (lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true });
  }

  openButtons.forEach((button) => button?.addEventListener("click", openDrawer));
  document.querySelectorAll("[data-close-equations]").forEach((node) => {
    node.addEventListener("click", closeDrawer);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  document.querySelectorAll("[data-equation-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.equationMode;
      document.querySelectorAll("[data-equation-mode]").forEach((modeButton) => {
        const active = modeButton.dataset.equationMode === mode;
        modeButton.classList.toggle("is-active", active);
        modeButton.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll("[data-equation-panel]").forEach((panelNode) => {
        const active = panelNode.dataset.equationPanel === mode;
        panelNode.hidden = !active;
        panelNode.classList.toggle("is-active", active);
      });
    });
  });
}

function setupRankChart() {
  document.querySelectorAll("[data-rank-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      stopRankPlay();
      rankChartMode = button.dataset.rankMode;
      document.querySelectorAll("[data-rank-mode]").forEach((modeButton) => {
        const active = modeButton.dataset.rankMode === rankChartMode;
        modeButton.classList.toggle("is-active", active);
        modeButton.setAttribute("aria-selected", String(active));
      });
      rankYear = 2024;
      buildRankChart();
    });
  });

  document.getElementById("rankPlay")?.addEventListener("click", () => {
    if (rankPlayHandle) {
      stopRankPlay();
    } else {
      startRankPlay();
    }
  });

  document.getElementById("rankScrub")?.addEventListener("input", (event) => {
    stopRankPlay();
    updateRankChart(Number(event.target.value));
  });
}

function setupStoryObserver() {
  const steps = document.querySelectorAll(".story-step");
  if (!steps.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.dataset.stage) {
        setStage(visible.target.dataset.stage);
      }
    },
    { rootMargin: "-18% 0px -55% 0px", threshold: [0.2, 0.45, 0.7] }
  );

  steps.forEach((step) => observer.observe(step));
}

window.addEventListener("resize", () => {
  stopRankPlay();
  buildRankChart();
});

setupControls();
setupTabs();
setupEquations();
setupRankChart();
setupStoryObserver();
setupChartHover();
syncInputs();
renderEngine();
renderModel();
buildRankChart();
