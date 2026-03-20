const THEME_STORAGE_KEY = "jobs-map-theme";
const THEME_COLORS = {
  light: "#f8f4ea",
  dark: "#0b1014",
};
const systemThemeMedia = typeof window.matchMedia === "function"
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

const state = {
  records: [],
  meta: null,
  mode: "change",
  theme: document.documentElement.dataset.theme || "light",
  changeKey: "yoy_pct",
  changeLabel: "YoY",
  rects: [],
  hoveredId: null,
  selectedId: null,
  dpr: window.devicePixelRatio || 1,
};

const MODE_CONFIG = {
  change: {
    label: "Employment change",
    legendLow: "Declining",
    legendHigh: "Growing",
    gradients: {
      light: "linear-gradient(90deg, #d9725e 0%, #f3c6bc 38%, #dcefe8 64%, #4da089 100%)",
      dark: "linear-gradient(90deg, #91453c 0%, #d28779 34%, #4c8d78 68%, #90d0b6 100%)",
    },
  },
  exposure: {
    label: "AI exposure",
    legendLow: "Lower exposure",
    legendHigh: "Higher exposure",
    gradients: {
      light: "linear-gradient(90deg, #9ac3d9 0%, #d6ecf6 32%, #f4dfb8 68%, #cb8d2d 100%)",
      dark: "linear-gradient(90deg, #3f6e89 0%, #8ebfda 32%, #bb9b58 68%, #f0c76d 100%)",
    },
  },
};

const els = {
  canvas: document.getElementById("treemapCanvas"),
  canvasShell: document.getElementById("canvasShell"),
  canvasState: document.getElementById("canvasState"),
  detailPanel: document.getElementById("detailPanel"),
  legendGradient: document.getElementById("legendGradient"),
  legendLow: document.getElementById("legendLow"),
  legendHigh: document.getElementById("legendHigh"),
  modeToggle: document.getElementById("modeToggle"),
  panelSubline: document.getElementById("panelSubline"),
  recordList: document.getElementById("recordList"),
  statsGrid: document.getElementById("statsGrid"),
  themeButton: document.getElementById("themeButton"),
  themeMeta: document.querySelector('meta[name="theme-color"]'),
  tooltip: document.getElementById("tooltip"),
};

const ctx = els.canvas.getContext("2d");
const hoverMedia = window.matchMedia("(hover: hover) and (pointer: fine)");
const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => layoutAndDraw()) : null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[%,$\s,]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeTheme(value) {
  return value === "dark" ? "dark" : "light";
}

function readStoredThemeChoice() {
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "dark" || storedTheme === "light" ? storedTheme : null;
  } catch {
    return null;
  }
}

function resolvedThemeChoice() {
  return safeTheme(readStoredThemeChoice() ?? (systemThemeMedia?.matches ? "dark" : "light"));
}

function isDarkTheme() {
  return state.theme === "dark";
}

function persistThemeChoice(choice) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Ignore storage errors and keep the in-memory preference.
  }
}

function syncDocumentTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.colorScheme = state.theme;
  document.documentElement.classList.toggle("theme-dark", state.theme === "dark");
  document.documentElement.classList.toggle("theme-light", state.theme !== "dark");

  if (document.body) {
    document.body.dataset.theme = state.theme;
    document.body.style.colorScheme = state.theme;
    document.body.classList.toggle("theme-dark", state.theme === "dark");
    document.body.classList.toggle("theme-light", state.theme !== "dark");
  }

  if (els.themeMeta) {
    els.themeMeta.setAttribute("content", THEME_COLORS[state.theme] ?? THEME_COLORS.light);
  }
}

function syncThemeButton() {
  if (!els.themeButton) return;
  els.themeButton.setAttribute("aria-pressed", String(isDarkTheme()));
  els.themeButton.textContent = isDarkTheme() ? "Σκούρο θέμα: ανοιχτό" : "Σκούρο θέμα: κλειστό";
}

function applyTheme(theme, { persist = true } = {}) {
  state.theme = safeTheme(theme);
  syncDocumentTheme();
  syncThemeButton();

  if (persist) {
    persistThemeChoice(state.theme);
  }
}

function canvasPalette() {
  const styles = getComputedStyle(document.documentElement);
  return {
    fill: styles.getPropertyValue("--canvas-fill").trim() || "rgba(255, 252, 245, 0.82)",
    text: styles.getPropertyValue("--tile-ink").trim() || "#1d2730",
    textMuted: styles.getPropertyValue("--tile-muted").trim() || "rgba(29, 39, 48, 0.72)",
    stroke: styles.getPropertyValue("--tile-stroke").trim() || "rgba(29, 39, 48, 0.92)",
    strokeSoft: styles.getPropertyValue("--tile-stroke-soft").trim() || "rgba(29, 39, 48, 0.5)",
  };
}

function formatJobs(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 10e6 ? 1 : 2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(value >= 100e3 ? 0 : 1)}K`;
  return Math.round(value).toLocaleString("en-US");
}

function formatCount(value) {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

function formatSignedCount(value) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toLocaleString("en-US")}`;
}

function formatSignedPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}%`;
}

function formatShare(value) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatExposure(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}/10`;
}

function formatPeriod(value) {
  return value ? String(value) : "—";
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .map((item, index) => {
      if (Array.isArray(item) && item.length >= 2) {
        const jobs = parseNumber(item[1]);
        if (!Number.isFinite(jobs)) return null;
        return {
          period: String(item[0] ?? `P${index + 1}`),
          jobs,
        };
      }

      if (!item || typeof item !== "object") return null;

      const jobs = parseNumber(item.jobs ?? item.value ?? item.employment ?? item.count);
      if (!Number.isFinite(jobs)) return null;

      return {
        period: String(item.period ?? item.label ?? item.date ?? `P${index + 1}`),
        jobs,
      };
    })
    .filter(Boolean);
}

function derivePct(current, base) {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return null;
  return ((current - base) / base) * 100;
}

function deriveMetricsFromHistory(history) {
  if (!history.length) {
    return {
      yoy_pct: null,
      five_year_pct: null,
      source_period: null,
    };
  }

  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  const earliest = history[0];

  return {
    yoy_pct: previous ? derivePct(latest.jobs, previous.jobs) : null,
    five_year_pct: earliest ? derivePct(latest.jobs, earliest.jobs) : null,
    source_period: latest.period ?? null,
  };
}

function normalizeRecord(record, index) {
  const history = normalizeHistory(record.history);
  const derived = deriveMetricsFromHistory(history);
  const jobs = parseNumber(record.jobs ?? record.employment ?? record.total_jobs);
  const exposure = parseNumber(record.exposure ?? record.ai_exposure);

  return {
    id: record.slug || record.id || `record-${index + 1}`,
    title: String(record.title ?? record.label_en ?? record.label ?? `Record ${index + 1}`),
    label_el: String(record.label_el ?? record.title ?? record.label ?? `Record ${index + 1}`),
    category: String(record.category ?? "occupation-major-group"),
    jobs: Number.isFinite(jobs) ? jobs : 0,
    employment_share: parseNumber(record.employment_share),
    yoy_pct: parseNumber(record.yoy_pct ?? record.change_pct ?? record.change),
    five_year_pct: parseNumber(record.five_year_pct ?? record.fiveYearPct ?? record.long_change_pct),
    history,
    description: String(record.description ?? ""),
    exposure,
    exposure_rationale: String(record.exposure_rationale ?? record.rationale ?? ""),
    source_period: String(record.source_period ?? derived.source_period ?? ""),
    url: typeof record.url === "string" ? record.url : "",
    isco_major_group: record.isco_major_group != null ? String(record.isco_major_group) : "",
    derived_yoy_pct: derived.yoy_pct,
    derived_five_year_pct: derived.five_year_pct,
  };
}

function extractRecordsAndMeta(payload, fallbackMeta) {
  if (Array.isArray(payload)) {
    return { records: payload, meta: fallbackMeta };
  }

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.data)) {
      return { records: payload.data, meta: payload._meta ?? payload.meta ?? fallbackMeta };
    }

    if (Array.isArray(payload.records)) {
      return { records: payload.records, meta: payload._meta ?? payload.meta ?? fallbackMeta };
    }
  }

  return { records: [], meta: fallbackMeta };
}

function pickChangeMetric(records) {
  const yoyCount = records.filter((record) => Number.isFinite(record.yoy_pct)).length;
  const fiveYearCount = records.filter((record) => Number.isFinite(record.five_year_pct)).length;

  if (yoyCount >= fiveYearCount && yoyCount > 0) {
    return { key: "yoy_pct", label: "YoY" };
  }

  if (fiveYearCount > 0) {
    return { key: "five_year_pct", label: "5Y" };
  }

  return { key: "derived_yoy_pct", label: "Latest change" };
}

function sumJobs(records) {
  return records.reduce((total, record) => total + (Number.isFinite(record.jobs) ? record.jobs : 0), 0);
}

function resolveTotalJobs() {
  const fromMeta = parseNumber(
    state.meta?.total_jobs ??
    state.meta?.latest_total_jobs ??
    state.meta?.summary?.total_jobs
  );

  return Number.isFinite(fromMeta) ? fromMeta : sumJobs(state.records);
}

function resolvedShare(record, totalJobs) {
  if (Number.isFinite(record.employment_share)) return record.employment_share;
  if (!Number.isFinite(totalJobs) || totalJobs <= 0) return null;
  return record.jobs / totalJobs;
}

function latestSourcePeriod() {
  const fromMeta = state.meta?.source_period ?? state.meta?.latest_period ?? state.meta?.summary?.source_period;
  if (fromMeta) return String(fromMeta);

  const periods = state.records.map((record) => record.source_period).filter(Boolean);
  if (!periods.length) return "";
  return periods.sort().at(-1);
}

function metricValue(record, mode = state.mode) {
  if (mode === "exposure") return Number.isFinite(record.exposure) ? record.exposure : null;

  const direct = record[state.changeKey];
  if (Number.isFinite(direct)) return direct;
  if (state.changeKey !== "yoy_pct" && Number.isFinite(record.yoy_pct)) return record.yoy_pct;
  if (state.changeKey !== "five_year_pct" && Number.isFinite(record.five_year_pct)) return record.five_year_pct;
  if (Number.isFinite(record.derived_yoy_pct)) return record.derived_yoy_pct;
  if (Number.isFinite(record.derived_five_year_pct)) return record.derived_five_year_pct;
  return null;
}

function metricNote(record) {
  const changeValue = metricValue(record, "change");
  if (Number.isFinite(changeValue)) {
    if (Number.isFinite(record[state.changeKey])) return `${state.changeLabel} ${formatSignedPercent(changeValue)}`;
    if (Number.isFinite(record.yoy_pct)) return `YoY ${formatSignedPercent(record.yoy_pct)}`;
    if (Number.isFinite(record.five_year_pct)) return `5Y ${formatSignedPercent(record.five_year_pct)}`;
  }

  if (Number.isFinite(record.exposure)) {
    return `Exposure ${formatExposure(record.exposure)}`;
  }

  return "No metric";
}

function weightedAverage(records, getter) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const record of records) {
    const value = getter(record);
    if (!Number.isFinite(value) || !Number.isFinite(record.jobs) || record.jobs <= 0) continue;
    weightedSum += value * record.jobs;
    totalWeight += record.jobs;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function topRecordByJobs() {
  return state.records[0] ?? null;
}

function buildComputedStats() {
  const totalJobs = resolveTotalJobs();
  const averageChange = weightedAverage(state.records, (record) => metricValue(record, "change"));
  const averageExposure = weightedAverage(state.records, (record) => record.exposure);
  const topRecord = topRecordByJobs();
  const topShare = topRecord ? resolvedShare(topRecord, totalJobs) : null;

  return [
    {
      label: "Total employment",
      value: formatJobs(totalJobs),
      note: `Across ${state.records.length} loaded groups`,
    },
    {
      label: "Change layer",
      value: Number.isFinite(averageChange) ? formatSignedPercent(averageChange) : "—",
      note: `${state.changeLabel} weighted average`,
    },
    {
      label: "AI exposure",
      value: Number.isFinite(averageExposure) ? formatExposure(averageExposure) : "—",
      note: "Job-weighted average",
    },
    {
      label: "Largest group",
      value: topRecord ? topRecord.label_el : "—",
      note: topShare != null ? `${formatShare(topShare)} of employment` : "Share unavailable",
    },
    {
      label: "Source period",
      value: formatPeriod(latestSourcePeriod()),
      note: "Resolved from records or metadata",
    },
    {
      label: "Mode",
      value: MODE_CONFIG[state.mode].label,
      note: "Color legend updates instantly",
    },
  ];
}

function buildMetaStats() {
  const statItems = Array.isArray(state.meta?.stats) ? state.meta.stats : null;
  if (statItems?.length) {
    return statItems.slice(0, 6).map((item) => ({
      label: String(item.label ?? "Stat"),
      value: String(item.value ?? "—"),
      note: String(item.note ?? ""),
    }));
  }

  if (!state.meta) {
    return buildComputedStats();
  }

  const computed = buildComputedStats();
  const totalJobs = parseNumber(
    state.meta?.total_jobs ??
    state.meta?.total_employed ??
    state.meta?.summary?.total_jobs
  );
  const metaRate = parseNumber(state.meta?.unemployment_rate ?? state.meta?.summary?.unemployment_rate);
  const registeredUnemployed = parseNumber(state.meta?.registered_unemployed);
  const metaVacancies = parseNumber(state.meta?.vacancies_total ?? state.meta?.vacancies ?? state.meta?.summary?.vacancies);
  const metaNetFlow = parseNumber(
    state.meta?.private_sector_monthly_balance ??
    state.meta?.net_flow ??
    state.meta?.net_hires ??
    state.meta?.summary?.net_flow
  );
  const avgExposure = weightedAverage(state.records, (record) => record.exposure);
  const topRecord = topRecordByJobs();

  if (
    !Number.isFinite(metaRate) &&
    !Number.isFinite(registeredUnemployed) &&
    !Number.isFinite(metaVacancies) &&
    !Number.isFinite(metaNetFlow)
  ) {
    return computed;
  }

  return [
    {
      label: "Total employment",
      value: Number.isFinite(totalJobs) ? formatCount(totalJobs) : "—",
      note: `ELSTAT LFS · ${state.meta?.source_period || state.meta?.latest_period || "Latest period"}`,
    },
    {
      label: "Unemployment rate",
      value: Number.isFinite(metaRate) ? `${metaRate.toFixed(1)}%` : "—",
      note: `ELSTAT LFS · ${state.meta?.source_period || state.meta?.latest_period || "Latest period"}`,
    },
    {
      label: "Registered unemployed",
      value: Number.isFinite(registeredUnemployed) ? formatCount(registeredUnemployed) : "—",
      note: `DYPA · ${state.meta?.registered_unemployment_period || "Latest month"}`,
    },
    {
      label: "Open vacancies",
      value: Number.isFinite(metaVacancies) ? formatCount(metaVacancies) : "—",
      note: `ELSTAT vacancies · ${state.meta?.vacancies_period || "Latest period"}`,
    },
    {
      label: "Private-sector balance",
      value: Number.isFinite(metaNetFlow) ? formatSignedCount(metaNetFlow) : "—",
      note: `ERGANI · ${state.meta?.ergani_latest_report?.label || "Latest monthly report"}`,
    },
    {
      label: "Largest group",
      value: topRecord ? topRecord.label_el : "—",
      note: Number.isFinite(avgExposure) ? `Avg exposure ${formatExposure(avgExposure)}` : "Weighted by jobs",
    },
  ];
}

function renderStats() {
  const cards = buildMetaStats();
  els.statsGrid.innerHTML = cards.map((card) => `
    <article class="stat-card">
      <div class="stat-label">${escapeHtml(card.label)}</div>
      <div class="stat-value">${escapeHtml(card.value)}</div>
      <div class="stat-note">${escapeHtml(card.note)}</div>
    </article>
  `).join("");
}

function toHsl(h, s, l, alpha = 1) {
  return `hsla(${h} ${s}% ${l}% / ${alpha})`;
}

function colorForChange(value, alpha = 1) {
  if (!Number.isFinite(value)) {
    return isDarkTheme() ? toHsl(198, 12, 34, alpha) : toHsl(35, 14, 72, alpha);
  }

  const clipped = clamp(value, -8, 8);
  const magnitude = Math.abs(clipped) / 8;

  if (isDarkTheme()) {
    if (clipped >= 0) {
      return toHsl(165, 40 + magnitude * 24, 29 + magnitude * 26, alpha);
    }

    return toHsl(12, 60 + magnitude * 14, 30 + magnitude * 24, alpha);
  }

  if (clipped >= 0) {
    return toHsl(165, 38 + magnitude * 22, 88 - magnitude * 30, alpha);
  }

  return toHsl(12, 62 + magnitude * 10, 88 - magnitude * 28, alpha);
}

function colorForExposure(value, alpha = 1) {
  if (!Number.isFinite(value)) {
    return isDarkTheme() ? toHsl(198, 12, 34, alpha) : toHsl(35, 14, 72, alpha);
  }

  const clipped = clamp(value, 0, 10) / 10;
  const hue = 204 - clipped * 170;
  const saturation = isDarkTheme() ? 38 + clipped * 26 : 48 + clipped * 24;
  const lightness = isDarkTheme() ? 30 + clipped * 24 : 89 - clipped * 32;
  return toHsl(hue, saturation, lightness, alpha);
}

function colorForRecord(record, mode = state.mode, alpha = 1) {
  return mode === "exposure"
    ? colorForExposure(record.exposure, alpha)
    : colorForChange(metricValue(record, "change"), alpha);
}

function drawLegend() {
  const config = MODE_CONFIG[state.mode];
  els.legendGradient.style.background = config.gradients[state.theme] ?? config.gradients.light;
  els.legendLow.textContent = config.legendLow;
  els.legendHigh.textContent = config.legendHigh;
}

function squarify(items, x, y, width, height) {
  if (!items.length || width <= 0 || height <= 0) return [];

  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return [];

  const result = [];
  let remaining = [...items];
  let cx = x;
  let cy = y;
  let cw = width;
  let ch = height;

  while (remaining.length && cw > 0 && ch > 0) {
    const remainingTotal = remaining.reduce((sum, item) => sum + item.value, 0);
    const vertical = cw >= ch;
    const side = vertical ? ch : cw;

    let row = [remaining[0]];
    let rowSum = remaining[0].value;

    for (let index = 1; index < remaining.length; index += 1) {
      const candidate = [...row, remaining[index]];
      const candidateSum = rowSum + remaining[index].value;
      if (
        worstAspect(candidate, candidateSum, side, remainingTotal, vertical ? cw : ch) <=
        worstAspect(row, rowSum, side, remainingTotal, vertical ? cw : ch)
      ) {
        row = candidate;
        rowSum = candidateSum;
      } else {
        break;
      }
    }

    const rowFraction = rowSum / remainingTotal;
    const rowThickness = vertical ? cw * rowFraction : ch * rowFraction;
    let offset = 0;

    for (const item of row) {
      const itemFraction = item.value / rowSum;
      const itemLength = side * itemFraction;
      result.push({
        ...item,
        x: vertical ? cx : cx + offset,
        y: vertical ? cy + offset : cy,
        width: vertical ? rowThickness : itemLength,
        height: vertical ? itemLength : rowThickness,
      });
      offset += itemLength;
    }

    if (vertical) {
      cx += rowThickness;
      cw -= rowThickness;
    } else {
      cy += rowThickness;
      ch -= rowThickness;
    }

    remaining = remaining.slice(row.length);
  }

  return result;
}

function worstAspect(row, rowSum, side, totalArea, availableExtent) {
  const rowExtent = availableExtent * (rowSum / totalArea);
  if (rowExtent === 0) return Number.POSITIVE_INFINITY;

  let worst = 0;
  for (const item of row) {
    const itemLength = side * (item.value / rowSum);
    if (itemLength === 0) continue;
    const aspect = Math.max(rowExtent / itemLength, itemLength / rowExtent);
    if (aspect > worst) worst = aspect;
  }

  return worst;
}

function currentRecord(recordId) {
  return state.records.find((record) => record.id === recordId) ?? null;
}

function setCanvasMessage(message, isVisible = true) {
  els.canvasState.textContent = message;
  els.canvasState.classList.toggle("is-hidden", !isVisible);
}

function updatePanelSubline() {
  if (!state.records.length) {
    els.panelSubline.textContent = "Loading records…";
    return;
  }

  const totalJobs = resolveTotalJobs();
  const topRecord = topRecordByJobs();
  const topLabel = topRecord ? topRecord.label_el : "—";
  const period = state.meta?.source_period || state.meta?.latest_period || latestSourcePeriod();
  els.panelSubline.textContent = `${state.records.length} groups loaded, ${formatJobs(totalJobs)} total employment, source period ${period || "—"}, largest tile: ${topLabel}.`;
}

function layoutAndDraw() {
  if (!state.records.length) return;

  const rect = els.canvasShell.getBoundingClientRect();
  const width = Math.max(0, Math.floor(rect.width));
  const height = Math.max(0, Math.floor(rect.height));

  if (!width || !height) return;

  state.dpr = window.devicePixelRatio || 1;
  els.canvas.width = width * state.dpr;
  els.canvas.height = height * state.dpr;
  els.canvas.style.width = `${width}px`;
  els.canvas.style.height = `${height}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  const margin = 12;
  const gap = 3;
  const items = state.records.map((record) => ({
    ...record,
    value: Math.max(1, record.jobs || 0),
  }));

  state.rects = squarify(items, margin, margin, width - margin * 2, height - margin * 2)
    .map((item) => ({
      ...item,
      x: item.x + gap / 2,
      y: item.y + gap / 2,
      width: item.width - gap,
      height: item.height - gap,
    }))
    .filter((item) => item.width > 1 && item.height > 1);

  drawTreemap(width, height);
}

function drawTreemap(width, height) {
  const palette = canvasPalette();

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.fill;
  ctx.fillRect(0, 0, width, height);

  for (const rect of state.rects) {
    const isHovered = rect.id === state.hoveredId;
    const isSelected = rect.id === state.selectedId;
    const fill = colorForRecord(rect, state.mode, isHovered || isSelected ? 0.96 : 0.88);

    ctx.fillStyle = fill;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    if (isSelected) {
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = 2.2;
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
    } else if (isHovered) {
      ctx.strokeStyle = palette.strokeSoft;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
    }

    drawTileText(rect, palette);
  }
}

function fitText(text, maxWidth, font) {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;

  let fitted = text;
  while (fitted.length > 3 && ctx.measureText(`${fitted}…`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }

  return `${fitted}…`;
}

function drawTileText(rect, palette = canvasPalette()) {
  if (rect.width < 72 || rect.height < 44) return;

  const titleSize = clamp(Math.min(rect.width / 9.5, rect.height / 4.3), 10, 20);
  const subSize = clamp(titleSize - 2.5, 9, 14);
  const titleFont = `700 ${titleSize}px ${getComputedStyle(document.body).getPropertyValue("--font-ui")}`;
  const subFont = `500 ${subSize}px ${getComputedStyle(document.body).getPropertyValue("--font-ui")}`;
  const padding = 10;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4);
  ctx.clip();
  ctx.fillStyle = palette.text;
  ctx.textBaseline = "top";

  const title = fitText(rect.label_el, rect.width - padding * 2, titleFont);
  ctx.font = titleFont;
  ctx.fillText(title, rect.x + padding, rect.y + padding);

  if (rect.height >= 72) {
    ctx.font = subFont;
    ctx.fillStyle = palette.textMuted;
    const subtitle = fitText(metricNote(rect), rect.width - padding * 2, subFont);
    ctx.fillText(subtitle, rect.x + padding, rect.y + padding + titleSize + 4);
  }

  ctx.restore();
}

function hitTest(clientX, clientY) {
  const bounds = els.canvas.getBoundingClientRect();
  const x = clientX - bounds.left;
  const y = clientY - bounds.top;

  for (let index = state.rects.length - 1; index >= 0; index -= 1) {
    const rect = state.rects[index];
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
      return rect;
    }
  }

  return null;
}

function renderRecordList() {
  const totalJobs = resolveTotalJobs();
  els.recordList.innerHTML = state.records.map((record) => {
    const share = resolvedShare(record, totalJobs);
    const selectedClass = record.id === state.selectedId ? " is-selected" : "";
    return `
      <button type="button" class="record-item${selectedClass}" data-record-id="${escapeHtml(record.id)}" role="listitem">
        <span class="record-item-top">
          <span class="record-swatch" style="background:${colorForRecord(record, state.mode, 0.92)}"></span>
          <span class="record-title">${escapeHtml(record.label_el)}</span>
        </span>
        <span class="record-meta">${escapeHtml(record.title)}</span>
        <span class="record-meta">${formatJobs(record.jobs)} jobs${share != null ? ` · ${formatShare(share)}` : ""}</span>
      </button>
    `;
  }).join("");
}

function renderHistory(record) {
  if (!record.history.length) {
    return `
      <div class="history-card">
        <div class="history-head">
          <h3>Employment history</h3>
          <span class="detail-subtitle">No series provided</span>
        </div>
      </div>
    `;
  }

  const maxJobs = Math.max(...record.history.map((point) => point.jobs));
  const bars = record.history.map((point) => {
    const height = maxJobs > 0 ? Math.max(10, Math.round((point.jobs / maxJobs) * 100)) : 10;
    return `
      <div class="history-bar">
        <div class="history-bar-fill" style="height:${height}px;background:${colorForRecord(record, state.mode, 0.96)}"></div>
        <div class="history-bar-label">${escapeHtml(point.period)}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="history-card">
      <div class="history-head">
        <h3>Employment history</h3>
        <span class="detail-subtitle">${record.history.length} points</span>
      </div>
      <div class="history-bars">${bars}</div>
    </div>
  `;
}

function renderSourceContext() {
  if (!state.meta) return "";

  const topSectors = Array.isArray(state.meta.top_vacancy_sectors) ? state.meta.top_vacancy_sectors.slice(0, 3) : [];
  const topRegions = Array.isArray(state.meta.top_registered_unemployment_regions) ? state.meta.top_registered_unemployment_regions.slice(0, 3) : [];
  const links = [
    state.meta?.sources?.lfs?.publication_url ? { label: "ELSTAT LFS", url: state.meta.sources.lfs.publication_url } : null,
    state.meta?.sources?.vacancies?.publication_url ? { label: "ELSTAT vacancies", url: state.meta.sources.vacancies.publication_url } : null,
    state.meta?.sources?.dypa?.page_url ? { label: "DYPA", url: state.meta.sources.dypa.page_url } : null,
    state.meta?.sources?.ergani?.page_url ? { label: "ERGANI", url: state.meta.sources.ergani.page_url } : null,
  ].filter(Boolean);

  const sectorItems = topSectors.length ? topSectors.map((sector) => `
    <li>
      <span>${escapeHtml(sector.label)}</span>
      <strong>${formatCount(parseNumber(sector.vacancies))}</strong>
    </li>
  `).join("") : `<li><span>No sector breakdown available.</span><strong>—</strong></li>`;

  const regionItems = topRegions.length ? topRegions.map((region) => `
    <li>
      <span>${escapeHtml(region.region)}</span>
      <strong>${formatCount(parseNumber(region.registered_total))}</strong>
    </li>
  `).join("") : `<li><span>No regional breakdown available.</span><strong>—</strong></li>`;

  const linkItems = links.length ? links.map((link) => `
    <a class="detail-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>
  `).join("") : "";

  return `
    <section class="context-card">
      <div class="history-head">
        <h3>National context</h3>
        <span class="detail-subtitle">Official source snapshot</span>
      </div>

      <div class="context-grid">
        <div class="context-stat">
          <span>Registered unemployed</span>
          <strong>${formatCount(parseNumber(state.meta.registered_unemployed))}</strong>
          <small>${escapeHtml(state.meta.registered_unemployment_period || "DYPA latest month")}</small>
        </div>
        <div class="context-stat">
          <span>Vacancies total</span>
          <strong>${formatCount(parseNumber(state.meta.vacancies_total))}</strong>
          <small>${escapeHtml(state.meta.vacancies_period || "ELSTAT latest quarter")}</small>
        </div>
        <div class="context-stat">
          <span>ERGANI monthly balance</span>
          <strong>${formatSignedCount(parseNumber(state.meta.private_sector_monthly_balance))}</strong>
          <small>${escapeHtml(state.meta.ergani_latest_report?.label || "Latest monthly report")}</small>
        </div>
        <div class="context-stat">
          <span>ERGANI hires / departures</span>
          <strong>${formatCount(parseNumber(state.meta.private_sector_monthly_hires))} / ${formatCount(parseNumber(state.meta.private_sector_monthly_departures))}</strong>
          <small>Private salaried employment flows</small>
        </div>
      </div>

      <div class="context-lists">
        <div class="context-list-block">
          <div class="context-list-title">Top vacancy sectors</div>
          <ul class="context-list">${sectorItems}</ul>
        </div>
        <div class="context-list-block">
          <div class="context-list-title">Top registered-unemployment regions</div>
          <ul class="context-list">${regionItems}</ul>
        </div>
      </div>

      ${linkItems ? `<div class="detail-source">${linkItems}</div>` : ""}
    </section>
  `;
}

function renderDetailPanel() {
  const record = currentRecord(state.selectedId);
  if (!record) {
    els.detailPanel.innerHTML = `<div class="detail-empty">Select a group to inspect its details.</div>`;
    return;
  }

  const totalJobs = resolveTotalJobs();
  const share = resolvedShare(record, totalJobs);
  const groupLabel = record.isco_major_group ? `ISCO major group ${record.isco_major_group}` : record.category;

  els.detailPanel.innerHTML = `
    <article class="detail-card">
      <div class="detail-head">
        <div class="detail-tags">
          <span class="detail-tag">${escapeHtml(groupLabel)}</span>
          <span class="detail-tag">${escapeHtml(record.source_period || "Source period unavailable")}</span>
        </div>
        <h2>${escapeHtml(record.label_el)}</h2>
        <div class="detail-subtitle">${escapeHtml(record.title)}</div>
      </div>

      <div class="detail-stats">
        <div class="detail-stat">
          <span>Employment</span>
          <strong>${formatJobs(record.jobs)}</strong>
        </div>
        <div class="detail-stat">
          <span>Share</span>
          <strong>${share != null ? formatShare(share) : "—"}</strong>
        </div>
        <div class="detail-stat">
          <span>YoY</span>
          <strong>${formatSignedPercent(record.yoy_pct ?? record.derived_yoy_pct)}</strong>
        </div>
        <div class="detail-stat">
          <span>Five years</span>
          <strong>${formatSignedPercent(record.five_year_pct ?? record.derived_five_year_pct)}</strong>
        </div>
        <div class="detail-stat">
          <span>AI exposure</span>
          <strong>${formatExposure(record.exposure)}</strong>
        </div>
        <div class="detail-stat">
          <span>Current color</span>
          <strong>${escapeHtml(metricNote(record))}</strong>
        </div>
      </div>

      ${renderHistory(record)}

      <div class="detail-body">
        <p class="detail-description">${escapeHtml(record.description || "No description provided.")}</p>
        <p class="detail-rationale">${escapeHtml(record.exposure_rationale || "No AI exposure rationale provided.")}</p>
        <div class="detail-source">
          <span>Source period: <strong>${escapeHtml(record.source_period || "—")}</strong></span>
          ${record.url ? `<a class="detail-link" href="${escapeHtml(record.url)}" target="_blank" rel="noreferrer">Open source link</a>` : ""}
        </div>
      </div>

      ${renderSourceContext()}
    </article>
  `;
}

function showTooltip(record, clientX, clientY) {
  if (!hoverMedia.matches || !record) return;

  const totalJobs = resolveTotalJobs();
  const share = resolvedShare(record, totalJobs);

  els.tooltip.innerHTML = `
    <h3>${escapeHtml(record.label_el)}</h3>
    <p>${escapeHtml(record.title)}</p>
    <div class="tooltip-grid">
      <span>Employment</span><strong>${formatJobs(record.jobs)}</strong>
      <span>Share</span><strong>${share != null ? formatShare(share) : "—"}</strong>
      <span>${escapeHtml(state.changeLabel)}</span><strong>${formatSignedPercent(metricValue(record, "change"))}</strong>
      <span>AI exposure</span><strong>${formatExposure(record.exposure)}</strong>
    </div>
  `;

  els.tooltip.hidden = false;
  const offset = 16;
  let left = clientX + offset;
  let top = clientY + offset;
  const bounds = els.tooltip.getBoundingClientRect();

  if (left + bounds.width > window.innerWidth - 12) {
    left = clientX - bounds.width - offset;
  }
  if (top + bounds.height > window.innerHeight - 12) {
    top = clientY - bounds.height - offset;
  }

  els.tooltip.style.left = `${left}px`;
  els.tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
}

function selectRecord(recordId) {
  if (!recordId || recordId === state.selectedId) return;
  state.selectedId = recordId;
  renderRecordList();
  renderDetailPanel();
  layoutAndDraw();
}

function initializeSelection() {
  if (!state.records.length) {
    state.selectedId = null;
    return;
  }

  if (state.selectedId && currentRecord(state.selectedId)) return;
  state.selectedId = state.records[0].id;
}

function renderAll() {
  hideTooltip();
  renderStats();
  drawLegend();
  updatePanelSubline();
  initializeSelection();
  renderRecordList();
  renderDetailPanel();
  layoutAndDraw();
}

async function loadData() {
  setCanvasMessage("Loading data…", true);

  const [dataResult, metaResult] = await Promise.allSettled([
    fetch("data.json", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`data.json returned ${response.status}`);
      return response.json();
    }),
    fetch("_meta.json", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`_meta.json returned ${response.status}`);
      return response.json();
    }),
  ]);

  if (dataResult.status !== "fulfilled") {
    state.records = [];
    state.meta = null;
    setCanvasMessage("Could not load data.json. If you opened the page directly from disk, serve /site over HTTP so fetch() can read the JSON file.", true);
    els.panelSubline.textContent = "No data loaded.";
    renderStats();
    renderRecordList();
    renderDetailPanel();
    return;
  }

  const fallbackMeta = metaResult.status === "fulfilled" ? metaResult.value : null;
  const extracted = extractRecordsAndMeta(dataResult.value, fallbackMeta);
  state.meta = extracted.meta ?? null;
  state.records = extracted.records
    .map(normalizeRecord)
    .filter((record) => record.jobs > 0)
    .sort((left, right) => right.jobs - left.jobs);

  const changeMetric = pickChangeMetric(state.records);
  state.changeKey = changeMetric.key;
  state.changeLabel = changeMetric.label;

  if (!state.records.length) {
    setCanvasMessage("data.json loaded, but no records with positive jobs were found.", true);
    els.panelSubline.textContent = "No visible records.";
    renderStats();
    renderRecordList();
    renderDetailPanel();
    return;
  }

  setCanvasMessage("", false);
  renderAll();
}

els.modeToggle.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;

  state.mode = button.dataset.mode;
  els.modeToggle.querySelectorAll("button").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });

  renderAll();
});

els.themeButton?.addEventListener("click", () => {
  applyTheme(isDarkTheme() ? "light" : "dark");
  renderAll();
});

function handleSystemThemeChange(event) {
  if (readStoredThemeChoice()) return;
  applyTheme(event.matches ? "dark" : "light", { persist: false });
  renderAll();
}

if (systemThemeMedia) {
  if (typeof systemThemeMedia.addEventListener === "function") {
    systemThemeMedia.addEventListener("change", handleSystemThemeChange);
  } else if (typeof systemThemeMedia.addListener === "function") {
    systemThemeMedia.addListener(handleSystemThemeChange);
  }
}

els.recordList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-record-id]");
  if (!button) return;
  selectRecord(button.dataset.recordId);
});

els.canvas.addEventListener("pointermove", (event) => {
  if (!state.rects.length || !hoverMedia.matches) return;

  const hit = hitTest(event.clientX, event.clientY);
  const hoveredId = hit?.id ?? null;

  if (hoveredId !== state.hoveredId) {
    state.hoveredId = hoveredId;
    layoutAndDraw();
  }

  if (hit) {
    showTooltip(hit, event.clientX, event.clientY);
    els.canvas.style.cursor = "pointer";
  } else {
    hideTooltip();
    els.canvas.style.cursor = "default";
  }
});

els.canvas.addEventListener("pointerleave", () => {
  state.hoveredId = null;
  hideTooltip();
  els.canvas.style.cursor = "default";
  layoutAndDraw();
});

els.canvas.addEventListener("click", (event) => {
  const hit = hitTest(event.clientX, event.clientY);
  if (hit) selectRecord(hit.id);
});

window.addEventListener("resize", () => layoutAndDraw());

if (resizeObserver) {
  resizeObserver.observe(els.canvasShell);
}

applyTheme(resolvedThemeChoice(), { persist: false });
renderAll();
loadData();
