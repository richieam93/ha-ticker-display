/**
 * Ticker Display Panel – Enhanced Admin UI v2
 * Complete rewrite with fixes, improvements and extensions.
 * Drop-in replacement for frontend/dist/ticker-display-panel.js
 */

/* ══════════════════════════════════════════════════════════
   FRAMEWORK DETECTION
   ══════════════════════════════════════════════════════════ */

const LitElement = window.LitElement || Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace") ||
  customElements.get("home-assistant-main") ||
  HTMLElement
);
const html = window.html || LitElement.prototype.html;
const css  = window.css  || LitElement.prototype.css;

/* ══════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════ */

const API = "/ticker-display";

const TD_CHART_WIDGETS = [
  ["mini-graph",           "📉", "Mini Graph"],
  ["sparkline",            "〰️", "Sparkline"],
  ["line-chart",           "📈", "Line Chart"],
  ["bar-chart",            "📊", "Balken"],
  ["area-chart",           "🌊", "Area Chart"],
  ["multi-line-chart",     "📈", "Multi-Line"],
  ["stacked-bar-chart",    "🧱", "Stacked Bar"],
  ["horizontal-bar-chart", "↔️", "Horizontal Bar"],
  ["donut-chart",          "🍩", "Donut"],
  ["pie-chart",            "🥧", "Pie"],
  ["radar-chart",          "🕸️", "Radar"],
  ["heatmap-mini",         "🔥", "Heatmap Mini"],
  ["timeline-chart",       "🕒", "Timeline"],
  ["scatter-chart",        "✳️", "Scatter"],
  ["bubble-chart",         "🫧", "Bubble"],
  ["polar-area-chart",     "🧿", "Polar Area"],
  ["forecast-chart",       "🔮", "Forecast"],
  ["energy-flow-mini",     "⚡", "Energy Flow"],
  ["comparison-chart",     "⚖️", "Comparison"],
  ["radial-gauge-advanced","🎛️", "Radial Gauge"],
  ["bullet-chart",         "🎯", "Bullet"],
];

const TD_CHART_TYPES = new Set(TD_CHART_WIDGETS.map((x) => x[0]));

const TD_CAMERA_SOURCES = [
  ["auto",                 "Auto (Snapshot → entity_picture → camera_proxy → stream)"],
  ["snapshot",             "Snapshot"],
  ["entity_picture",       "entity_picture"],
  ["camera_proxy",         "camera_proxy"],
  ["camera_proxy_stream",  "camera_proxy_stream"],
];

const TD_VALUE_STATUS_WIDGETS = [
  ["simple-value",  "🔢", "Wert",          "Klassische Zahl oder Sensorwert"],
  ["icon-value",    "ℹ️", "Icon+Wert",     "Wert mit Symbol und Titel"],
  ["trend-arrow",   "📈", "Trend",         "Tendenz nach oben oder unten"],
  ["status-dot",    "🟢", "Status",        "Kompakter Zustand mit Farbe"],
  ["gauge",         "🎯", "Gauge",         "Runder Füllstand / Prozentwert"],
  ["progress-bar",  "📊", "Fortschritt",   "Horizontaler Fortschrittsbalken"],
];

const TD_SMART_HOME_WIDGETS = [
  ["media-player-control", "🎵", "Media Player", "Cover, Titel und Transport"],
  ["switch-control",       "🎚️", "Schalter",     "Ein/Aus für Switch, Fan oder Input Boolean"],
  ["light-control",        "💡", "Licht",        "Status und Helligkeit"],
  ["climate-control",      "🌡️", "Klima",        "Ist-/Sollwert und HVAC-Modus"],
  ["cover-control",        "🪟", "Rollladen",    "Position und Schnellaktionen"],
];

const TD_WIDGET_TYPE_ICONS = {
  "simple-value": "🔢", "icon-value": "ℹ️", "trend-arrow": "📈",
  "status-dot": "🟢", "gauge": "🎯", "progress-bar": "📊",
  "media-player-control": "🎵", "switch-control": "🎚️", "light-control": "💡",
  "climate-control": "🌡️", "cover-control": "🪟",
  "camera": "📹", "image": "🖼️", "clock": "🕐", "weather": "🌦️",
  "countdown": "⏱️", "button": "🔘", "color-block": "🟦",
  "qr-code": "🔳",
  ...Object.fromEntries(TD_CHART_WIDGETS.map(([t, i]) => [t, i])),
};

const TD_TRANSITIONS = [
  { v: "fade",  l: "Fade"  },
  { v: "slide", l: "Slide" },
  { v: "flip",  l: "Flip"  },
  { v: "zoom",  l: "Zoom"  },
  { v: "none",  l: "Kein"  },
];

const TD_THEMES = [
  { v: "dark",          l: "🌙 Dark"          },
  { v: "light",         l: "☀️ Light"          },
  { v: "high-contrast", l: "🔲 High Contrast"  },
  { v: "night",         l: "🌃 Nachtmodus"     },
];

const TD_SCREEN_TYPES = [
  { v: "dashboard", l: "Dashboard" },
  { v: "clock",     l: "Uhr"      },
  { v: "weather",   l: "Wetter"   },
  { v: "camera",    l: "Kamera"   },
  { v: "image",     l: "Bild"     },
];

const TD_SCREEN_TYPE_LABELS = {
  dashboard: "📊 Dashboard", weather: "🌤️ Wetter", camera: "📹 Kamera",
  graph: "📈 Graph", clock: "🕐 Uhr", "single-value": "🔢 Einzelwert",
  "status-board": "🚪 Status Board", image: "🖼️ Bild",
};

const TD_WIDGET_TYPES_ALL = [
  ...TD_VALUE_STATUS_WIDGETS.map(([v, , l]) => ({ v, l })),
  ...TD_CHART_WIDGETS.map(([v, , l]) => ({ v, l })),
  ...TD_SMART_HOME_WIDGETS.map(([v, , l]) => ({ v, l })),
  { v: "camera",      l: "Kamera" },
  { v: "clock",       l: "Uhr" },
  { v: "weather",     l: "Wetter" },
  { v: "image",       l: "Bild" },
  { v: "color-block", l: "Farbblock" },
  { v: "countdown",   l: "Countdown" },
  { v: "button",      l: "Button" },
  { v: "qr-code",     l: "QR-Code" },
].filter((item, index, arr) => arr.findIndex((x) => x.v === item.v) === index);

const TD_WIDGET_SETTINGS_GROUPS = [
  { label: "Werte & Status", items: TD_VALUE_STATUS_WIDGETS.map(([type, icon, name]) => ({ type, icon, name })) },
  { label: "Graphen & Charts", items: TD_CHART_WIDGETS.map(([type, icon, name]) => ({ type, icon, name })) },
  { label: "Steuerung & Smart Home", items: TD_SMART_HOME_WIDGETS.map(([type, icon, name]) => ({ type, icon, name })) },
  { label: "Medien & Info", items: [
    { type: "camera", icon: "📹", name: "Kamera" },
    { type: "weather", icon: "🌦️", name: "Wetter" },
    { type: "clock", icon: "🕐", name: "Uhr" },
    { type: "image", icon: "🖼️", name: "Bild" },
    { type: "countdown", icon: "⏱️", name: "Countdown" },
    { type: "button", icon: "🔘", name: "Button" },
    { type: "color-block", icon: "🟦", name: "Farbblock" },
    { type: "qr-code", icon: "🔳", name: "QR-Code" },
  ] },
];

const TD_NO_MULTI_ENTITY = new Set([
  "camera", "weather", "clock", "countdown", "qr-code", "button", "color-block",
  "media-player-control", "switch-control", "light-control", "climate-control", "cover-control",
]);

const TD_NO_VALUE_FORMAT = new Set([
  "camera", "weather", "clock", "countdown", "qr-code", "button", "color-block", "image",
  "media-player-control", "switch-control", "light-control", "climate-control", "cover-control",
]);

function tdNormalizedWidgetFeatureFlags(settings = {}) {
  return {
    ...Object.fromEntries(TD_WIDGET_TYPES_ALL.map((item) => [item.v, true])),
    ...(settings.widget_feature_flags || {}),
  };
}

function tdWidgetEnabled(settings = {}, type = "") {
  return tdNormalizedWidgetFeatureFlags(settings)[type] !== false;
}

function tdVisibleWidgetOptions(settings = {}, currentType = "") {
  return TD_WIDGET_TYPES_ALL.filter((item) => item.v === currentType || tdWidgetEnabled(settings, item.v));
}

/* ══════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ══════════════════════════════════════════════════════════ */

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch { /* fallback below */ }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  Object.assign(ta.style, { position: "fixed", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand("copy"); } catch { /* ignore */ }
  document.body.removeChild(ta);
}

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function getAllEntities(hass, domain = "") {
  if (!hass?.states) return [];
  return Object.values(hass.states)
    .filter((s) => !domain || s.entity_id.startsWith(domain + "."))
    .map((s) => ({
      entity_id: s.entity_id,
      friendly_name: s.attributes?.friendly_name || s.entity_id,
      state: s.state,
      domain: s.entity_id.split(".")[0],
      icon: s.attributes?.icon || "",
      unit: s.attributes?.unit_of_measurement || "",
      device_class: s.attributes?.device_class || "",
    }))
    .sort((a, b) => {
      const an = `${a.friendly_name} ${a.entity_id}`.toLowerCase();
      const bn = `${b.friendly_name} ${b.entity_id}`.toLowerCase();
      return an.localeCompare(bn, "de");
    });
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `item-${Date.now()}`;
}

function deepClone(obj) {
  try { return JSON.parse(JSON.stringify(obj)); }
  catch { return {}; }
}

function uniqueId(prefix = "w") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function downloadJson(filename, data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function lsGet(key, fallback = null) {
  return safeJsonParse(localStorage.getItem(key), fallback);
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

function tdColorWithAlpha(color, alpha = null) {
  if (color == null || color === "") return "";
  if (alpha === null || alpha === undefined || alpha === "") return String(color);
  const a = Math.max(0, Math.min(1, Number(alpha)));
  const raw = String(color).trim();
  const hex = raw.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = hex.split("").map((c) => parseInt(c + c, 16));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  if (/^[0-9a-f]{8}$/i.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const rgba = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(",").map((part) => part.trim());
    if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
  }
  return raw;
}

function tdWidgetPreviewStyle(widget = {}) {
  const bg = tdColorWithAlpha(widget.bgColor || widget.background_color || "#1E1E1E", widget.bgOpacity ?? widget.background_opacity ?? 0.75);
  const radius = Number(widget.borderRadius ?? widget.border_radius ?? 12);
  const blur = Number(widget.blur || 0);
  const text = widget.textColor || widget.text_color || "";
  return `${bg ? `background:${bg};` : ""}${Number.isFinite(radius) ? `border-radius:${radius}px;` : ""}${blur ? `backdrop-filter:blur(${blur}px);-webkit-backdrop-filter:blur(${blur}px);` : ""}${text ? `color:${text};` : ""}`;
}

/* ══════════════════════════════════════════════════════════
   DEFAULT SETTINGS & FACTORY FUNCTIONS
   ══════════════════════════════════════════════════════════ */

function tdNormalizedDefaults(settings = {}) {
  return {
    default_theme:             settings.default_theme             || "dark",
    default_transition:        settings.default_transition        || "fade",
    default_screen_duration:   Number(settings.default_screen_duration || 15),
    default_camera_source:     settings.default_camera_source     || "auto",
    default_chart_hours:       Number(settings.default_chart_hours || 24),
    default_chart_widget_animations: settings.default_chart_widget_animations !== false,
    default_widget_opacity:    settings.default_widget_opacity    ?? 0.75,
    default_widget_blur:       Number(settings.default_widget_blur || 0),
    default_widget_radius:     Number(settings.default_widget_radius || 12),
    default_background_color:  settings.default_background_color || "#121212",
    default_ticker_height:     Number(settings.default_ticker_height || 36),
    widget_feature_flags:      tdNormalizedWidgetFeatureFlags(settings),
  };
}

function tdDefaultTapActionForWidget(type = "") {
  if (["media-player-control", "switch-control", "light-control", "climate-control", "cover-control"].includes(type)) return "popup";
  return "none";
}

function tdCreateWidget(type, col, row, settings = {}) {
  const d = tdNormalizedDefaults(settings);
  const tapAction = tdDefaultTapActionForWidget(type);
  const isChart = TD_CHART_TYPES.has(type);
  const isToggleWidget = ["switch-control", "light-control"].includes(type);
  return {
    id: uniqueId("w"),
    type,
    col,
    row,
    colspan: 1,
    rowspan: 1,
    entity_id: "",
    name: "",
    icon: "",
    bgOpacity: d.default_widget_opacity,
    blur: d.default_widget_blur,
    borderRadius: d.default_widget_radius,
    bgColor: "#1E1E1E",
    animations: isChart ? d.default_chart_widget_animations !== false : true,
    animation_style: "auto",
    tap_action: tapAction,
    toggle_badge: isToggleWidget,
    locked: false,
    config: {
      camera_source: d.default_camera_source,
      hours: d.default_chart_hours,
      chart_use_history: true,
      chart_animation: d.default_chart_widget_animations !== false,
      chart_max_points: 48,
      value_decimals: 1,
      extra_value_decimals: 1,
      trim_trailing_zeros: false,
      show_name: true,
      control_layout: "compact",
      control_show_icon: true,
      control_show_name: true,
      control_show_value: true,
      control_show_sub: true,
      control_show_meter: true,
      control_show_status_chip: true,
      control_show_toggle_badge: true,
      control_show_popup_colors: true,
      control_show_popup_effects: true,
      control_show_popup_position_presets: true,
      control_show_popup_tilt: true,
      control_show_popup_modes: true,
      control_show_popup_presets: true,
      control_show_popup_fan_modes: true,
    },
  };
}

function tdNormalizeWidgetRuntime(widget = {}) {
  const w = deepClone(widget);
  w.config = { ...(w.config || {}) };

  if (w.bgColor != null && w.background_color == null) w.background_color = w.bgColor;
  if (w.bgOpacity != null && w.background_opacity == null) w.background_opacity = Number(w.bgOpacity);
  if (w.textColor != null && w.text_color == null) w.text_color = w.textColor;
  if (w.borderRadius != null && w.border_radius == null) w.border_radius = Number(w.borderRadius);
  if (w.fontSize != null && w.font_size == null) w.font_size = Number(w.fontSize);
  if (w.customCss != null && w.custom_css == null) w.custom_css = w.customCss;
  if (w.imageUrl && !w.image_url) w.image_url = w.imageUrl;
  if (w.type === "camera") {
    const cameraEntity = w.entity_id || w.config?.camera_entity || "";
    if (cameraEntity) {
      w.entity_id = cameraEntity;
      w.config.camera_entity = cameraEntity;
    }
  }
  if (!w.tap_action) w.tap_action = tdDefaultTapActionForWidget(w.type);
  if (["switch-control", "light-control"].includes(w.type) && w.toggle_badge == null) w.toggle_badge = true;
  if (["media-player-control", "switch-control", "light-control", "climate-control", "cover-control"].includes(w.type)) {
    if (w.config.control_layout == null) w.config.control_layout = "compact";
    if (w.config.control_show_icon == null) w.config.control_show_icon = true;
    if (w.config.control_show_name == null) w.config.control_show_name = w.config.show_name !== false;
    if (w.config.control_show_value == null) w.config.control_show_value = true;
    if (w.config.control_show_sub == null) w.config.control_show_sub = true;
    if (w.config.control_show_meter == null) w.config.control_show_meter = w.type !== "switch-control";
    if (w.config.control_show_status_chip == null) w.config.control_show_status_chip = w.type !== "media-player-control";
    if (w.config.control_show_toggle_badge == null) w.config.control_show_toggle_badge = true;
    if (w.config.control_show_popup_colors == null) w.config.control_show_popup_colors = true;
    if (w.config.control_show_popup_effects == null) w.config.control_show_popup_effects = true;
    if (w.config.control_show_popup_position_presets == null) w.config.control_show_popup_position_presets = true;
    if (w.config.control_show_popup_tilt == null) w.config.control_show_popup_tilt = true;
    if (w.config.control_show_popup_modes == null) w.config.control_show_popup_modes = true;
    if (w.config.control_show_popup_presets == null) w.config.control_show_popup_presets = true;
    if (w.config.control_show_popup_fan_modes == null) w.config.control_show_popup_fan_modes = true;
    if (w.config.control_layout === "compact" && (!w.tap_action || ["none", "toggle"].includes(w.tap_action))) w.tap_action = "popup";
  }
  if (["simple-value", "icon-value", "trend-arrow", "status-dot", "gauge", "progress-bar"].includes(w.type)) {
    if (w.config.metric_graph == null) w.config.metric_graph = true;
    if (w.config.metric_graph_hours == null && w.config.hours != null) w.config.metric_graph_hours = w.config.hours;
    if (w.config.metric_graph_points == null) w.config.metric_graph_points = 18;
  }
  return w;
}

function tdNormalizeScreenRuntime(screen = {}) {
  const s = deepClone(screen);
  s.widgets = (s.widgets || []).map((widget) => tdNormalizeWidgetRuntime(widget));
  return s;
}

function tdNormalizeDeviceRuntime(device = {}) {
  const d = deepClone(device);
  d.screens = (d.screens || []).map((screen) => tdNormalizeScreenRuntime(screen));
  return d;
}

function tdFindEntitiesForPreset(hass, kind = "blank") {
  const all = getAllEntities(hass);
  const pick = (fn) => all.filter(fn);
  return {
    weather: pick((e) => e.domain === "weather"),
    camera:  pick((e) => e.domain === "camera"),
    sensors: pick((e) => e.domain === "sensor"),
    numeric: pick((e) =>
      ["sensor", "number", "input_number"].includes(e.domain) &&
      /^[-+]?\d+(?:[.,]\d+)?$/.test(String(e.state || "").replace(",", "."))
    ),
    power: pick((e) =>
      /power|energy|leistung|verbrauch|solar|pv|battery|akku/i
        .test(`${e.entity_id} ${e.friendly_name} ${e.unit}`)
    ),
    temp: pick((e) =>
      /temp|temperature|temperatur/i.test(`${e.entity_id} ${e.friendly_name}`)
    ),
    lights:  pick((e) => e.domain === "light"),
    covers:  pick((e) => e.domain === "cover"),
    binary:  pick((e) => e.domain === "binary_sensor"),
    persons: pick((e) => e.domain === "person"),
    media:   pick((e) => e.domain === "media_player"),
    climate: pick((e) => e.domain === "climate"),
  };
}

function tdHydrateScreenPresetEntities(screen, hass) {
  const sc = deepClone(screen || {});
  const found = tdFindEntitiesForPreset(hass, sc.type || "dashboard");
  (sc.widgets || []).forEach((w) => {
    if (w.type === "weather" && !w.entity_id)
      w.entity_id = found.weather[0]?.entity_id || "";
    if (w.type === "camera" && !w.entity_id) {
      const id = found.camera[0]?.entity_id || "";
      w.entity_id = id;
      w.config = { ...(w.config || {}), camera_entity: id };
    }
    if (
      ["simple-value", "icon-value", "trend-arrow", "gauge", "progress-bar", "status-dot"].includes(w.type) &&
      !w.entity_id
    ) {
      const list = (w.name && /temp/i.test(w.name))
        ? found.temp
        : (found.numeric.length ? found.numeric : found.sensors);
      w.entity_id = list[0]?.entity_id || found.sensors[0]?.entity_id || "";
      if ((w.config?.entities || []).length) {
        w.config = { ...(w.config || {}), entities: list.slice(1, 5).map((e) => e.entity_id) };
      }
    }
    if (TD_CHART_TYPES.has(w.type)) {
      const list = found.power.length
        ? found.power
        : (found.numeric.length ? found.numeric : found.sensors);
      if (!w.entity_id) w.entity_id = list[0]?.entity_id || "";
      w.config = {
        ...(w.config || {}),
        chart_use_history: w.config?.chart_use_history !== false,
        hours: w.config?.hours || 24,
        chart_max_points: w.config?.chart_max_points || 48,
        entities: (w.config?.entities?.length ? w.config.entities : list.slice(1, 4).map((e) => e.entity_id)),
      };
    }
  });
  return sc;
}

function tdCreateScreenPreset(kind = "blank", index = 0, settings = {}) {
  const d = tdNormalizedDefaults(settings);
  const base = {
    id: uniqueId("screen"),
    name: `Screen ${index + 1}`,
    type: "dashboard",
    duration: d.default_screen_duration,
    transition: d.default_transition,
    grid: { columns: 3, rows: 2 },
    widgets: [],
    background_color: d.default_background_color,
    background_image: "",
    background_image_size: "cover",
    background_overlay_opacity: 1,
  };

  const mk = (type, col, row, extra = {}) =>
    Object.assign(tdCreateWidget(type, col, row, settings), extra);

  switch (kind) {
    case "weather":
      return {
        ...base,
        name: `Wetter ${index + 1}`,
        widgets: [
          mk("weather", 0, 0, { colspan: 2, rowspan: 2, name: "Wetter" }),
          mk("clock",   2, 0, { name: "Uhr" }),
          mk("simple-value", 2, 1, { name: "Temperatur" }),
        ],
      };
    case "camera":
      return {
        ...base,
        name: `Kamera ${index + 1}`,
        grid: { columns: 2, rows: 2 },
        widgets: [
          mk("camera", 0, 0, { colspan: 2, rowspan: 2, name: "Kamera" }),
        ],
      };
    case "charts":
      return {
        ...base,
        name: `Charts ${index + 1}`,
        widgets: [
          mk("multi-line-chart",  0, 0, { colspan: 2, rowspan: 2, name: "Verlauf" }),
          mk("donut-chart",       2, 0, { name: "Verteilung" }),
          mk("comparison-chart",  2, 1, { name: "Vergleich" }),
        ],
      };
    case "energy":
      return {
        ...base,
        name: `Energie ${index + 1}`,
        widgets: [
          mk("comparison-chart", 0, 0, { colspan: 2, name: "Energie" }),
          mk("progress-bar",    2, 0, { name: "Batterie" }),
          mk("gauge",           0, 1, { name: "Solar" }),
          mk("simple-value",    1, 1, { name: "Verbrauch" }),
          mk("trend-arrow",     2, 1, { name: "Trend" }),
        ],
      };
    case "security":
      return {
        ...base,
        name: `Sicherheit ${index + 1}`,
        widgets: [
          mk("status-dot", 0, 0, { name: "Alarm", icon: "🛡️" }),
          mk("camera",     1, 0, { colspan: 2, rowspan: 2, name: "Kamera" }),
          mk("status-dot", 0, 1, { name: "Kontakte", icon: "🚪" }),
        ],
      };
    default:
      return base;
  }
}

/* ══════════════════════════════════════════════════════════
   SHARED COMPONENT: TOAST NOTIFICATION
   ══════════════════════════════════════════════════════════ */

class TdToast extends LitElement {
  static get properties() {
    return {
      _msg: { type: String },
      _vis: { type: Boolean },
      _type: { type: String },
    };
  }

  constructor() {
    super();
    this._msg = "";
    this._vis = false;
    this._type = "info";
    this._timer = null;
  }

  show(msg, duration = 3000, type = "info") {
    this._msg = msg;
    this._vis = true;
    this._type = type;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => (this._vis = false), duration);
  }

  success(msg, duration = 3000) { this.show(msg, duration, "success"); }
  error(msg, duration = 4000)   { this.show(msg, duration, "error"); }
  warn(msg, duration = 3500)    { this.show(msg, duration, "warning"); }

  static get styles() {
    return css`
      :host {
        position: fixed; bottom: 24px; left: 50%;
        transform: translateX(-50%); z-index: 10000;
        pointer-events: none;
      }
      .t {
        padding: 12px 24px; border-radius: 12px; font-size: 14px;
        box-shadow: 0 4px 16px rgba(0,0,0,.35);
        opacity: 0; transform: translateY(20px);
        transition: all .3s cubic-bezier(.4,0,.2,1);
        pointer-events: auto; display: flex; align-items: center; gap: 6px;
        backdrop-filter: blur(12px);
      }
      .t.v { opacity: 1; transform: translateY(0); }
      .t.info    { background: rgba(50,50,50,.95); color: #fff; }
      .t.success { background: rgba(46,125,50,.95); color: #fff; }
      .t.error   { background: rgba(198,40,40,.95); color: #fff; }
      .t.warning { background: rgba(230,130,0,.95); color: #fff; }
    `;
  }

  render() {
    return html`<div class="t ${this._vis ? "v" : ""} ${this._type}">${this._msg}</div>`;
  }
}
customElements.define("td-toast", TdToast);

/* ══════════════════════════════════════════════════════════
   SHARED COMPONENT: CONFIRM DIALOG
   ══════════════════════════════════════════════════════════ */

class TdConfirm extends LitElement {
  static get properties() {
    return {
      _open: { type: Boolean },
      _title: { type: String },
      _message: { type: String },
      _confirmLabel: { type: String },
      _destructive: { type: Boolean },
    };
  }

  constructor() {
    super();
    this._open = false;
    this._resolve = null;
    this._confirmLabel = "Bestätigen";
    this._destructive = true;
  }

  async show(title, message, opts = {}) {
    this._title = title;
    this._message = message;
    this._confirmLabel = opts.confirmLabel || "Bestätigen";
    this._destructive = opts.destructive !== false;
    this._open = true;
    return new Promise((r) => { this._resolve = r; });
  }

  static get styles() {
    return css`
      .ov {
        position: fixed; inset: 0; background: rgba(0,0,0,.6);
        z-index: 10000; display: flex; align-items: center;
        justify-content: center; animation: fadeIn .15s ease;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .dl {
        background: var(--card-background-color, #1e1e1e);
        border-radius: 16px; padding: 24px; max-width: 420px;
        width: 92%; box-shadow: 0 8px 32px rgba(0,0,0,.4);
        animation: scaleIn .2s cubic-bezier(.4,0,.2,1);
      }
      @keyframes scaleIn { from { transform: scale(.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      .dl h3 { margin: 0 0 12px; font-size: 18px; }
      .dl p { margin: 0 0 20px; font-size: 14px; color: var(--secondary-text-color); line-height: 1.5; }
      .acts { display: flex; justify-content: flex-end; gap: 10px; }
      .b {
        padding: 10px 20px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: none;
        color: var(--primary-text-color); font-size: 14px; cursor: pointer;
        transition: all .15s;
      }
      .b:hover { background: rgba(255,255,255,.05); }
      .b.d { background: #F44336; border-color: #F44336; color: #fff; }
      .b.d:hover { background: #D32F2F; }
      .b.p { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
      .b.p:hover { filter: brightness(1.1); }
    `;
  }

  render() {
    if (!this._open) return html``;
    return html`
      <div class="ov" @click=${() => this._close(false)}>
        <div class="dl" @click=${(e) => e.stopPropagation()}>
          <h3>${this._title}</h3>
          <p>${this._message}</p>
          <div class="acts">
            <button class="b" @click=${() => this._close(false)}>Abbrechen</button>
            <button class="b ${this._destructive ? "d" : "p"}" @click=${() => this._close(true)}>
              ${this._confirmLabel}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _close(result) {
    this._open = false;
    if (this._resolve) this._resolve(result);
  }
}
customElements.define("td-confirm", TdConfirm);

/* ══════════════════════════════════════════════════════════
   SHARED COMPONENT: ENTITY PICKER (Single)
   ══════════════════════════════════════════════════════════ */

class TdEntityPicker extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      value: { type: String },
      domain: { type: String },
      label: { type: String },
      placeholder: { type: String },
      _search: { type: String },
      _open: { type: Boolean },
      _highlightIdx: { type: Number },
    };
  }

  constructor() {
    super();
    this._search = "";
    this._open = false;
    this._highlightIdx = -1;
    this.placeholder = "Entity suchen...";
  }

  static get styles() {
    return css`
      :host { display: block; position: relative; }
      label { display: block; font-size: 12px; color: var(--secondary-text-color); margin-bottom: 4px; }
      input {
        width: 100%; padding: 8px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 13px;
        outline: none; transition: border-color .15s;
      }
      input:focus { border-color: var(--primary-color); }
      .clear {
        position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
        border: none; background: none; color: var(--secondary-text-color);
        cursor: pointer; font-size: 16px; padding: 4px; line-height: 1;
      }
      .clear:hover { color: var(--primary-text-color); }
      .dd {
        position: absolute; top: 100%; left: 0; right: 0;
        max-height: 300px; overflow-y: auto;
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.35);
        z-index: 100; margin-top: 2px;
      }
      .op {
        padding: 8px 12px; cursor: pointer; font-size: 13px;
        display: flex; flex-direction: column; gap: 2px;
        border-bottom: 1px solid rgba(255,255,255,.04);
        transition: background .1s;
      }
      .op:hover, .op.hl { background: rgba(255,255,255,.06); }
      .op.hl { border-left: 3px solid var(--primary-color); }
      .top { display: flex; justify-content: space-between; gap: 6px; }
      .fn { font-weight: 500; }
      .id { font-family: monospace; font-size: 11px; color: var(--secondary-text-color); }
      .meta { display: flex; gap: 6px; font-size: 11px; color: var(--secondary-text-color); }
      .empty { padding: 16px; text-align: center; color: var(--secondary-text-color); font-size: 13px; }
    `;
  }

  render() {
    const ents = this._filter();
    const current = this._currentLabel();
    const showClear = !this._open && this.value;

    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <div style="position:relative">
        <input
          .value=${this._open ? this._search : current}
          placeholder=${this.placeholder || "Entity suchen..."}
          @focus=${this._onFocus}
          @input=${this._onInput}
          @blur=${() => setTimeout(() => { this._open = false; this._highlightIdx = -1; }, 200)}
          @keydown=${this._onKeydown}
        >
        ${showClear ? html`<button class="clear" @click=${this._onClear}>✕</button>` : ""}
      </div>
      ${this._open ? html`
        <div class="dd">
          ${ents.length === 0
            ? html`<div class="empty">Keine Entities gefunden</div>`
            : ents.slice(0, 150).map((e, idx) => html`
              <div class="op ${this._highlightIdx === idx ? "hl" : ""}"
                   @mousedown=${() => this._select(e.entity_id)}>
                <div class="top">
                  <span class="fn">${e.friendly_name}</span>
                  <span>${e.state}${e.unit ? ` ${e.unit}` : ""}</span>
                </div>
                <div class="id">${e.entity_id}</div>
                <div class="meta">
                  <span>${e.domain}</span>
                  ${e.device_class ? html`<span>${e.device_class}</span>` : ""}
                </div>
              </div>
            `)
          }
        </div>
      ` : ""}
    `;
  }

  _entities() { return getAllEntities(this.hass, this.domain || ""); }

  _filter() {
    const s = (this._search || "").toLowerCase().trim();
    const ents = this._entities();
    if (!s) return ents;
    return ents.filter((e) =>
      e.entity_id.toLowerCase().includes(s) ||
      (e.friendly_name || "").toLowerCase().includes(s) ||
      (e.domain || "").toLowerCase().includes(s)
    );
  }

  _currentLabel() {
    if (this._open) return this._search || "";
    if (!this.value) return "";
    const hit = this._entities().find((e) => e.entity_id === this.value);
    return hit ? `${hit.friendly_name} (${hit.entity_id})` : this.value;
  }

  _onFocus() {
    this._open = true;
    this._search = this.value || "";
    this._highlightIdx = -1;
  }

  _onInput(e) {
    this._search = e.target.value;
    this._open = true;
    this._highlightIdx = -1;
  }

  _onKeydown(e) {
    const ents = this._filter().slice(0, 150);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this._highlightIdx = Math.min(this._highlightIdx + 1, ents.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this._highlightIdx = Math.max(this._highlightIdx - 1, 0);
    } else if (e.key === "Enter" && this._highlightIdx >= 0 && ents[this._highlightIdx]) {
      e.preventDefault();
      this._select(ents[this._highlightIdx].entity_id);
    } else if (e.key === "Escape") {
      this._open = false;
      this._highlightIdx = -1;
    }
  }

  _onClear() {
    this.value = "";
    this._search = "";
    this._fire("");
  }

  _select(id) {
    this.value = id;
    this._search = "";
    this._open = false;
    this._highlightIdx = -1;
    this._fire(id);
  }

  _fire(value) {
    this.dispatchEvent(new CustomEvent("value-changed", {
      detail: { value }, bubbles: true, composed: true,
    }));
  }
}
customElements.define("td-entity-picker", TdEntityPicker);

/* ══════════════════════════════════════════════════════════
   SHARED COMPONENT: ENTITY PICKER (Multi)
   ══════════════════════════════════════════════════════════ */

class TdEntityMultiPicker extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      value: { type: Array },
      domain: { type: String },
      label: { type: String },
      placeholder: { type: String },
      _search: { type: String },
      _open: { type: Boolean },
    };
  }

  constructor() {
    super();
    this.value = [];
    this._search = "";
    this._open = false;
    this.placeholder = "Weitere Sensoren hinzufügen...";
  }

  static get styles() {
    return css`
      :host { display: block; position: relative; }
      label { display: block; font-size: 12px; color: var(--secondary-text-color); margin-bottom: 4px; }
      input {
        width: 100%; padding: 8px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 13px; outline: none;
      }
      input:focus { border-color: var(--primary-color); }
      .chips { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin: 0 0 8px; }
      .chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px; border-radius: 999px;
        background: rgba(255,255,255,.08); font-size: 12px;
        border: 1px solid rgba(255,255,255,.1);
        transition: background .15s;
      }
      .chip:hover { background: rgba(255,255,255,.12); }
      .chip button {
        border: none; background: none; color: inherit;
        cursor: pointer; font-size: 12px; padding: 0;
        opacity: .6; transition: opacity .15s;
      }
      .chip button:hover { opacity: 1; }
      .dd {
        position: absolute; top: 100%; left: 0; right: 0;
        max-height: 280px; overflow-y: auto;
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.3);
        z-index: 100; margin-top: 2px;
      }
      .op {
        padding: 8px 12px; cursor: pointer; font-size: 13px;
        display: flex; flex-direction: column; gap: 2px;
        border-bottom: 1px solid rgba(255,255,255,.04);
      }
      .op:hover { background: rgba(255,255,255,.06); }
      .top { display: flex; justify-content: space-between; gap: 6px; }
      .fn { font-weight: 500; }
      .id { font-family: monospace; font-size: 11px; color: var(--secondary-text-color); }
      .cnt { font-size: 11px; color: var(--secondary-text-color); margin-top: 4px; }
    `;
  }

  render() {
    const values = Array.isArray(this.value) ? this.value : [];
    const ents = this._filter();
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      ${values.length ? html`
        <div class="chips">
          ${values.map((id) => html`
            <span class="chip">
              ${id}
              <button @click=${() => this._remove(id)} title="Entfernen">✕</button>
            </span>
          `)}
        </div>
      ` : ""}
      <input
        .value=${this._search}
        placeholder=${this.placeholder}
        @focus=${() => this._open = true}
        @input=${(e) => { this._search = e.target.value; this._open = true; }}
        @blur=${() => setTimeout(() => { this._open = false; }, 200)}
      >
      <div class="cnt">${values.length} ausgewählt</div>
      ${this._open && ents.length ? html`
        <div class="dd">${ents.slice(0, 150).map((e) => html`
          <div class="op" @mousedown=${() => this._add(e.entity_id)}>
            <div class="top">
              <span class="fn">${e.friendly_name}</span>
              <span>${e.state}${e.unit ? ` ${e.unit}` : ""}</span>
            </div>
            <div class="id">${e.entity_id}</div>
          </div>
        `)}</div>
      ` : ""}
    `;
  }

  _entities() { return getAllEntities(this.hass, this.domain || ""); }

  _filter() {
    const selected = new Set(Array.isArray(this.value) ? this.value : []);
    const s = (this._search || "").toLowerCase().trim();
    return this._entities()
      .filter((e) => !selected.has(e.entity_id))
      .filter((e) =>
        !s ||
        e.entity_id.toLowerCase().includes(s) ||
        (e.friendly_name || "").toLowerCase().includes(s)
      );
  }

  _emit(next) {
    this.value = next;
    this.dispatchEvent(new CustomEvent("value-changed", {
      detail: { value: next }, bubbles: true, composed: true,
    }));
  }

  _add(id) {
    const next = [...new Set([...(Array.isArray(this.value) ? this.value : []), id])];
    this._search = "";
    this._emit(next);
  }

  _remove(id) {
    this._emit((Array.isArray(this.value) ? this.value : []).filter((x) => x !== id));
  }
}
customElements.define("td-entity-multi-picker", TdEntityMultiPicker);

/* ══════════════════════════════════════════════════════════
   SHARED COMPONENT: HA MEDIA PICKER
   ══════════════════════════════════════════════════════════ */

class TdHaMediaPicker extends LitElement {
  static get properties() {
    return {
      value: { type: String },
      items: { type: Array },
      label: { type: String },
      placeholder: { type: String },
    };
  }

  constructor() {
    super();
    this.items = [];
    this.value = "";
    this.placeholder = "Home Assistant Medien auswählen";
  }

  static get styles() {
    return css`
      :host { display: block; }
      label { display: block; font-size: 12px; color: var(--secondary-text-color); margin-bottom: 4px; }
      select {
        width: 100%; padding: 8px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 13px;
      }
      .meta {
        margin-top: 4px; font-size: 11px;
        color: var(--secondary-text-color);
        font-family: monospace; word-break: break-all;
      }
    `;
  }

  render() {
    const current = (this.items || []).find((i) => i.url === this.value);
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <select .value=${this.value || ""} @change=${(e) => this._emit(e.target.value)}>
        <option value="">${this.placeholder || "Auswählen..."}</option>
        ${(this.items || []).map((item) => html`
          <option value=${item.url} ?selected=${this.value === item.url}>
            ${item.path || item.title || item.url}
          </option>
        `)}
      </select>
      ${current ? html`<div class="meta">${current.url}</div>` : ""}
    `;
  }

  _emit(value) {
    this.value = value;
    this.dispatchEvent(new CustomEvent("value-changed", {
      detail: { value, item: (this.items || []).find((i) => i.url === value) || null },
      bubbles: true, composed: true,
    }));
  }
}
customElements.define("td-ha-media-picker", TdHaMediaPicker);

/* ══════════════════════════════════════════════════════════
   SHARED COMPONENT: ICON PICKER
   ══════════════════════════════════════════════════════════ */

class TdIconPicker extends LitElement {
  static get properties() {
    return {
      value: { type: String },
      label: { type: String },
      _open: { type: Boolean },
      _search: { type: String },
    };
  }

  constructor() {
    super();
    this._open = false;
    this._search = "";
  }

  static get styles() {
    return css`
      :host { display: block; position: relative; }
      label { display: block; font-size: 12px; color: var(--secondary-text-color); margin-bottom: 4px; }
      .w { display: flex; gap: 6px; align-items: center; }
      .pv { font-size: 24px; display: flex; align-items: center; min-width: 32px; justify-content: center; }
      input {
        flex: 1; padding: 8px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 13px;
      }
      .g {
        position: absolute; top: 100%; left: 0; right: 0;
        padding: 8px; background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.35);
        z-index: 100; display: grid; grid-template-columns: repeat(8, 1fr);
        gap: 4px; max-height: 220px; overflow-y: auto; margin-top: 2px;
      }
      .ib {
        padding: 8px; border: none; background: none; font-size: 20px;
        cursor: pointer; border-radius: 6px; text-align: center;
        transition: background .1s;
      }
      .ib:hover { background: rgba(255,255,255,.1); }
      .si {
        grid-column: 1 / -1; padding: 4px 8px;
        border: 1px solid var(--divider-color); border-radius: 6px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 12px;
        margin-bottom: 4px;
      }
    `;
  }

  render() {
    const allIcons = [
      "🏠","🌡️","💡","🔌","🔋","📹","🔒","🚪","💧","🌤️","⚡","🎵","📊","⏰","🔔",
      "📱","🚗","👤","❤️","🌙","☀️","🔥","❄️","💨","🧊","🪴","🐕","👶","🧹","🎮",
      "📺","🖥️","🔊","🔇","⬆️","⬇️","✅","❌","⚠️","ℹ️","🛡️","🪟","🌊","⛈️","🌧️",
      "🌨️","🌫️","🌈","🎯","📈","📉","🔢","🕐","⏱️","🔘","🟢","🟡","🔴","🟠","🔵",
    ];
    const filtered = this._search
      ? allIcons.filter(() => true) // emojis can't be text-searched easily, show all
      : allIcons;

    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <div class="w">
        <span class="pv">${this.value || "📊"}</span>
        <input
          .value=${this.value || ""}
          placeholder="Emoji oder Text"
          @focus=${() => this._open = true}
          @input=${(e) => { this.value = e.target.value; this._fire(); }}
          @blur=${() => setTimeout(() => { this._open = false; }, 200)}
        >
      </div>
      ${this._open ? html`
        <div class="g">
          ${filtered.map((i) => html`
            <button class="ib" @mousedown=${() => { this.value = i; this._open = false; this._fire(); }}>${i}</button>
          `)}
        </div>
      ` : ""}
    `;
  }

  _fire() {
    this.dispatchEvent(new CustomEvent("value-changed", {
      detail: { value: this.value }, bubbles: true, composed: true,
    }));
  }
}
customElements.define("td-icon-picker", TdIconPicker);

/* ══════════════════════════════════════════════════════════
   SHARED COMPONENT: COLOR PICKER
   ══════════════════════════════════════════════════════════ */

class TdColorPicker extends LitElement {
  static get properties() {
    return { value: { type: String }, label: { type: String } };
  }

  static get styles() {
    return css`
      :host { display: block; }
      label { display: block; font-size: 12px; color: var(--secondary-text-color); margin-bottom: 4px; }
      .w { display: flex; gap: 6px; align-items: center; }
      input[type=color] {
        width: 40px; height: 34px; padding: 2px;
        border: 1px solid var(--divider-color); border-radius: 6px;
        cursor: pointer; background: none;
      }
      input[type=text] {
        flex: 1; padding: 8px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 13px; font-family: monospace;
      }
      .ps { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
      .p {
        width: 22px; height: 22px; border-radius: 50%;
        border: 2px solid transparent; cursor: pointer;
        transition: border-color .15s, transform .1s;
      }
      .p:hover { border-color: #fff; transform: scale(1.15); }
    `;
  }

  render() {
    const presets = [
      "#2196F3", "#4CAF50", "#FF9800", "#F44336", "#9C27B0",
      "#00BCD4", "#FF5722", "#607D8B", "#E91E63", "#CDDC39",
      "#795548", "#3F51B5", "#009688", "#FFC107", "#8BC34A",
    ];
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <div class="w">
        <input type="color" .value=${this._safeHex(this.value)} @input=${(e) => this._set(e.target.value)}>
        <input type="text" .value=${this.value || ""} @input=${(e) => this._set(e.target.value)} placeholder="#RRGGBB oder rgba(...)">
      </div>
      <div class="ps">
        ${presets.map((c) => html`<div class="p" style="background:${c}" @click=${() => this._set(c)}></div>`)}
      </div>
    `;
  }

  _safeHex(v) {
    if (!v || !v.startsWith("#")) return "#2196F3";
    return v.length >= 7 ? v.substring(0, 7) : v;
  }

  _set(v) {
    this.value = v;
    this.dispatchEvent(new CustomEvent("value-changed", {
      detail: { value: v }, bubbles: true, composed: true,
    }));
  }
}
customElements.define("td-color-picker", TdColorPicker);

/* ══════════════════════════════════════════════════════════
   SHARED COMPONENT: FONT PICKER
   ══════════════════════════════════════════════════════════ */

class TdFontPicker extends LitElement {
  static get properties() {
    return { value: { type: String }, fonts: { type: Array }, label: { type: String } };
  }

  static get styles() {
    return css`
      :host { display: block; }
      label { display: block; font-size: 12px; color: var(--secondary-text-color); margin-bottom: 4px; }
      select {
        width: 100%; padding: 8px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 14px;
      }
    `;
  }

  render() {
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <select .value=${this.value || ""} @change=${(e) => this._fire(e.target.value)}>
        <option value="">Standard (Theme)</option>
        ${(this.fonts || []).map((f) => html`
          <option value=${f.id} ?selected=${this.value === f.id}>
            ${f.name} ${f.builtin ? "(eingebaut)" : ""}
          </option>
        `)}
      </select>
    `;
  }

  _fire(v) {
    this.value = v;
    this.dispatchEvent(new CustomEvent("value-changed", {
      detail: { value: v }, bubbles: true, composed: true,
    }));
  }
}
customElements.define("td-font-picker", TdFontPicker);

/* ══════════════════════════════════════════════════════════
   SHARED COMPONENT: SOUND PICKER
   ══════════════════════════════════════════════════════════ */

class TdSoundPicker extends LitElement {
  static get properties() {
    return {
      value: { type: String },
      sounds: { type: Array },
      label: { type: String },
      _playing: { type: Boolean },
    };
  }

  constructor() {
    super();
    this._playing = false;
    this._audio = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopAudio();
  }

  static get styles() {
    return css`
      :host { display: block; }
      label { display: block; font-size: 12px; color: var(--secondary-text-color); margin-bottom: 4px; }
      .w { display: flex; gap: 6px; }
      select {
        flex: 1; padding: 8px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 14px;
      }
      .pb {
        padding: 8px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: none; color: var(--primary-text-color);
        cursor: pointer; font-size: 16px; transition: all .15s;
        display: flex; align-items: center; justify-content: center;
        min-width: 40px;
      }
      .pb:hover { background: rgba(255,255,255,.05); }
      .pb.active { background: rgba(244,67,54,.15); border-color: #F44336; }
    `;
  }

  render() {
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <div class="w">
        <select .value=${this.value || ""} @change=${(e) => this._fire(e.target.value)}>
          <option value="">Kein Sound</option>
          ${(this.sounds || []).map((s) => html`
            <option value=${s.id} ?selected=${this.value === s.id}>
              ${s.name} (${s.category})
            </option>
          `)}
        </select>
        <button class="pb ${this._playing ? "active" : ""}"
                @click=${() => this._togglePreview()}
                title="Vorhören">
          ${this._playing ? "⏹" : "▶"}
        </button>
      </div>
    `;
  }

  _fire(v) {
    this.value = v;
    this.dispatchEvent(new CustomEvent("value-changed", {
      detail: { value: v }, bubbles: true, composed: true,
    }));
  }

  _togglePreview() {
    if (this._playing) {
      this._stopAudio();
      return;
    }
    const s = (this.sounds || []).find((s) => s.id === this.value);
    if (!s?.url) return;
    this._audio = new Audio(s.url);
    this._audio.onended = () => { this._playing = false; this._audio = null; };
    this._audio.onerror = () => { this._playing = false; this._audio = null; };
    this._audio.play().catch(() => { this._playing = false; });
    this._playing = true;
  }

  _stopAudio() {
    if (this._audio) {
      this._audio.pause();
      this._audio = null;
    }
    this._playing = false;
  }
}
customElements.define("td-sound-picker", TdSoundPicker);

/* ══════════════════════════════════════════════════════════
   DEVICE LIST
   ══════════════════════════════════════════════════════════ */

class TdDeviceList extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      devices: { type: Array },
      _filter: { type: String },
      _sortBy: { type: String },
    };
  }

  constructor() {
    super();
    this._filter = "";
    this._sortBy = "name";
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; }

      .hdr {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 20px; flex-wrap: wrap; gap: 12px;
      }
      .hdr h2 { margin: 0; font-size: 22px; font-weight: 500; }
      .hdr-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

      .filter-bar {
        display: flex; gap: 6px; margin-bottom: 16px; align-items: center;
      }
      .filter-bar input {
        flex: 1; max-width: 320px; padding: 8px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 13px;
      }
      .filter-bar select {
        padding: 8px 10px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 13px;
      }
      .filter-bar .count {
        font-size: 12px; color: var(--secondary-text-color); white-space: nowrap;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: 16px;
      }

      .card {
        background: var(--card-background-color, #1e1e1e);
        border-radius: 14px; padding: 20px;
        box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,.15));
        border: 1px solid transparent;
        transition: all .2s ease;
      }
      .card:hover {
        box-shadow: 0 4px 16px rgba(0,0,0,.25);
        border-color: rgba(255,255,255,.08);
      }

      .ch {
        display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
      }
      .ci {
        width: 44px; height: 44px; border-radius: 12px;
        background: rgba(33,150,243,.1); display: flex;
        align-items: center; justify-content: center;
        font-size: 22px; flex-shrink: 0;
      }
      .cn { font-size: 18px; font-weight: 500; flex: 1; min-width: 0; }
      .cn .did {
        font-size: 11px; color: var(--secondary-text-color);
        font-family: monospace; display: block; margin-top: 2px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }

      .sb {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 10px; border-radius: 12px;
        font-size: 12px; font-weight: 500; flex-shrink: 0;
      }
      .sb.on { background: rgba(76,175,80,.15); color: #4CAF50; }
      .sb.off { background: rgba(244,67,54,.1); color: #F44336; }
      .sd {
        width: 7px; height: 7px; border-radius: 50%;
        background: currentColor;
      }

      .di {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 6px 16px; margin-bottom: 16px;
        font-size: 13px; color: var(--secondary-text-color);
      }
      .di .v { font-weight: 500; color: var(--primary-text-color); }

      .da { display: flex; gap: 6px; flex-wrap: wrap; }
      .ab {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 14px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: none;
        color: var(--primary-text-color); font-size: 13px;
        cursor: pointer; transition: all .15s;
      }
      .ab:hover {
        background: rgba(255,255,255,.05);
        border-color: rgba(255,255,255,.15);
      }
      .ab.p {
        background: var(--primary-color);
        border-color: var(--primary-color); color: #fff;
      }
      .ab.p:hover { filter: brightness(1.1); }
      .ab.danger {
        border-color: rgba(244,67,54,.3); color: #ef5350;
      }
      .ab.danger:hover {
        background: rgba(244,67,54,.1);
        border-color: #F44336;
      }

      .empty {
        text-align: center; padding: 80px 20px;
        color: var(--secondary-text-color);
      }
      .empty .ei { font-size: 72px; margin-bottom: 20px; opacity: .25; }
      .empty p { margin: 8px 0; }
      .empty .title { font-size: 20px; font-weight: 500; color: var(--primary-text-color); }

      .screen-chips {
        display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px;
      }
      .screen-chip {
        font-size: 10px; padding: 2px 6px; border-radius: 4px;
        background: rgba(255,255,255,.06); color: var(--secondary-text-color);
      }
    `;
  }

  render() {
    const filtered = this._getFilteredDevices();
    const online = this.devices.filter((d) => d.online).length;

    return html`
      <div class="hdr">
        <h2>📱 Meine Geräte</h2>
        <div class="hdr-actions">
          <button class="ab p" @click=${() => this._emit("create-virtual-device", {})}>➕ Virtuelles Gerät</button>
          <button class="ab" @click=${() => this._emit("refresh", {})}>🔄 Aktualisieren</button>
        </div>
      </div>

      ${this.devices.length > 0 ? html`
        <div class="filter-bar">
          <input
            .value=${this._filter}
            placeholder="Gerät suchen..."
            @input=${(e) => this._filter = e.target.value}
          >
          <select .value=${this._sortBy} @change=${(e) => this._sortBy = e.target.value}>
            <option value="name">Name</option>
            <option value="status">Status</option>
            <option value="screens">Screens</option>
          </select>
          <span class="count">
            ${filtered.length} von ${this.devices.length} Geräten · ${online} online
          </span>
        </div>
      ` : ""}

      ${filtered.length === 0 && this.devices.length === 0 ? html`
        <div class="empty">
          <div class="ei">📱</div>
          <p class="title">Noch keine Geräte registriert</p>
          <p>Installiere die Ticker Display App auf einem Tablet oder Smartphone<br>
             und öffne die Display-URL, um das Gerät automatisch zu registrieren.</p>
        </div>
      ` : ""}

      ${filtered.length === 0 && this.devices.length > 0 ? html`
        <div class="empty">
          <div class="ei">🔍</div>
          <p class="title">Keine Geräte gefunden</p>
          <p>Ändere den Suchbegriff oder lösche den Filter.</p>
        </div>
      ` : ""}

      ${filtered.length > 0 ? html`
        <div class="grid">${filtered.map((d) => this._renderDevice(d))}</div>
      ` : ""}
    `;
  }

  _getFilteredDevices() {
    let list = [...(this.devices || [])];

    // Filter
    const q = (this._filter || "").toLowerCase().trim();
    if (q) {
      list = list.filter((d) =>
        (d.name || "").toLowerCase().includes(q) ||
        (d.id || "").toLowerCase().includes(q) ||
        (d.model || "").toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      switch (this._sortBy) {
        case "status":
          return (b.online ? 1 : 0) - (a.online ? 1 : 0);
        case "screens":
          return (b.screens?.length || 0) - (a.screens?.length || 0);
        default:
          return (a.name || a.id || "").localeCompare(b.name || b.id || "", "de");
      }
    });

    return list;
  }

  _renderDevice(d) {
    const on = d.online || false;
    const screenCount = d.screens?.length || 0;
    const widgetCount = (d.screens || []).reduce((sum, s) => sum + (s.widgets?.length || 0), 0);
    const linkUrl = d.display_url || `${window.location.origin}${API}/${d.id}`;

    return html`
      <div class="card">
        <div class="ch">
          <div class="ci">${d.virtual ? "🌐" : (on ? "📱" : "📴")}</div>
          <div class="cn">
            ${d.name || d.id}
            <span class="did">${d.id}</span>
          </div>
          <span class="sb ${on ? "on" : "off"}">
            <span class="sd"></span>${on ? "Online" : (d.virtual ? "Virtuell" : "Offline")}
          </span>
        </div>

        <div class="di">
          <span>Modell:</span><span class="v">${d.model || (d.virtual ? "Browser / Web" : "—")}</span>
          <span>Typ:</span><span class="v">${d.virtual ? "Virtuelles Gerät" : "Android / App"}</span>
          <span>Auflösung:</span><span class="v">${d.screen_resolution || "—"}</span>
          <span>Screens:</span><span class="v">${screenCount} (${widgetCount} Widgets)</span>
          <span>Theme:</span><span class="v">${d.theme || "dark"}</span>
          <span>Font:</span><span class="v">${d.font || "roboto"}</span>
        </div>

        ${screenCount > 0 ? html`
          <div class="screen-chips">
            ${(d.screens || []).slice(0, 6).map((s) => html`
              <span class="screen-chip">${s.name || s.type || "Screen"}</span>
            `)}
            ${screenCount > 6 ? html`<span class="screen-chip">+${screenCount - 6}</span>` : ""}
          </div>
        ` : ""}

        <div class="da" style="margin-top:12px">
          <button class="ab p" @click=${() => this._emit("edit-device", { deviceId: d.id })}>
            🧱 Editor
          </button>
          <button class="ab" @click=${() => this._emit("copy-link", { deviceId: d.id, url: linkUrl })}
                  title="Display-Link kopieren">
            🔗 Link-Kopieren
          </button>
          <button class="ab" @click=${() => this._emit("preview-device", { deviceId: d.id })}
                  title="Vorschau öffnen">
            👁️
          </button>
          <button class="ab" @click=${() => this._emit("reload-device", { deviceId: d.id })}
                  title="Seite neu laden">
            🔄
          </button>
          <button class="ab" @click=${() => this._emit("identify-device", { deviceId: d.id })}
                  title="Gerät identifizieren">
            💡
          </button>
          <button class="ab danger" @click=${() => this._emit("delete-device", { deviceId: d.id })}
                  title="Gerät löschen">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-device-list", TdDeviceList);

/* ══════════════════════════════════════════════════════════
   DEVICE EDITOR
   ══════════════════════════════════════════════════════════ */

class TdDeviceEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      device: { type: Object },
      sounds: { type: Array },
      fonts: { type: Array },
      templates: { type: Object },
      globalSettings: { type: Object },
      _ed: { type: Object },
      _dragIdx: { type: Number },
      _dragOverIdx: { type: Number },
      _screenTemplateToImport: { type: String },
      _expandedSections: { type: Object },
    };
  }

  constructor() {
    super();
    this._ed = null;
    this._dragIdx = -1;
    this._dragOverIdx = -1;
    this._screenTemplateToImport = "";
    this._expandedSections = { info: true, screens: true, rotation: false, ticker: false };
  }

  updated(changed) {
    if (changed.has("device") && this.device) {
      this._ed = deepClone(this.device);
    }
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; max-width: 920px; margin: 0 auto; }

      /* ── Sections ── */
      .sec {
        background: var(--card-background-color, #1e1e1e);
        border-radius: 14px; margin-bottom: 16px;
        box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,.15));
        overflow: hidden; border: 1px solid rgba(255,255,255,.04);
      }
      .sec-header {
        display: flex; align-items: center; gap: 10px;
        padding: 16px 20px; cursor: pointer;
        transition: background .15s; user-select: none;
      }
      .sec-header:hover { background: rgba(255,255,255,.02); }
      .sec-header h3 {
        margin: 0; font-size: 16px; font-weight: 500; flex: 1;
        display: flex; align-items: center; gap: 6px;
      }
      .sec-header .arrow {
        font-size: 12px; opacity: .5; transition: transform .2s;
      }
      .sec-header .arrow.open { transform: rotate(90deg); }
      .sec-body { padding: 4px 20px 20px; }
      .sec-body.collapsed { display: none; }

      /* ── Fields ── */
      .f { margin-bottom: 16px; }
      .f label {
        display: block; font-size: 13px;
        color: var(--secondary-text-color); margin-bottom: 6px;
      }
      .f input, .f select {
        width: 100%; padding: 10px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 14px; outline: none;
        transition: border-color .15s;
      }
      .f input:focus, .f select:focus { border-color: var(--primary-color); }
      .f .hint {
        font-size: 11px; color: var(--secondary-text-color);
        margin-top: 4px; line-height: 1.4;
      }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

      /* ── Screen List ── */
      .sl { list-style: none; padding: 0; margin: 0; }
      .si {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 16px; margin-bottom: 8px;
        background: var(--primary-background-color);
        border-radius: 10px;
        border: 1px solid var(--divider-color);
        transition: all .2s;
      }
      .si:hover { border-color: rgba(255,255,255,.15); }
      .si.drag-over {
        border-color: var(--primary-color);
        background: rgba(33,150,243,.05);
      }
      .si.dragging { opacity: .4; }

      .sdh {
        cursor: grab; opacity: .3; font-size: 18px;
        user-select: none; transition: opacity .15s;
      }
      .sdh:hover { opacity: .7; }
      .si:active .sdh { cursor: grabbing; }

      .sinfo { flex: 1; min-width: 0; }
      .sn {
        font-weight: 500; font-size: 15px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .sm {
        font-size: 12px; color: var(--secondary-text-color);
        margin-top: 3px; display: flex; gap: 6px; flex-wrap: wrap;
      }
      .sm .badge {
        padding: 1px 6px; border-radius: 4px;
        background: rgba(255,255,255,.06); font-size: 11px;
      }

      .sa { display: flex; gap: 4px; }
      .ib {
        padding: 6px; border: none; background: none;
        color: var(--secondary-text-color); cursor: pointer;
        border-radius: 6px; font-size: 16px;
        transition: all .15s;
      }
      .ib:hover {
        background: rgba(255,255,255,.08);
        color: var(--primary-text-color);
      }

      /* ── Add Buttons ── */
      .add-row {
        display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap;
      }
      .add-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 14px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: none;
        color: var(--primary-text-color); font-size: 13px;
        cursor: pointer; transition: all .15s;
      }
      .add-btn:hover {
        background: rgba(255,255,255,.05);
        border-color: var(--primary-color);
      }
      .add-btn.large {
        display: flex; align-items: center; justify-content: center;
        gap: 6px; width: 100%; padding: 14px;
        border: 2px dashed var(--divider-color);
        border-radius: 10px; font-size: 14px;
        color: var(--secondary-text-color);
      }
      .add-btn.large:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
        background: rgba(33,150,243,.04);
      }

      /* ── Template Import ── */
      .import-row {
        display: flex; gap: 6px; margin-bottom: 14px;
        align-items: center;
      }
      .import-row select {
        flex: 1; padding: 8px 10px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 13px;
      }

      /* ── Ticker Config Grid ── */
      .ticker-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
      }
      .ticker-grid .full { grid-column: 1 / -1; }

      /* ── Save Bar ── */
      .savebar {
        position: sticky; bottom: 0; z-index: 10;
        background: var(--card-background-color);
        padding: 16px 20px; display: flex;
        justify-content: space-between; align-items: center;
        gap: 12px; margin: 0 -16px;
        border-top: 1px solid var(--divider-color);
        border-radius: 0 0 12px 12px;
        backdrop-filter: blur(8px);
      }
      .savebar .info {
        font-size: 12px; color: var(--secondary-text-color);
      }
      .savebar .actions { display: flex; gap: 6px; }
      .sbtn {
        padding: 10px 24px; border: none; border-radius: 8px;
        font-size: 14px; font-weight: 500; cursor: pointer;
        transition: all .15s;
      }
      .sbtn.p { background: var(--primary-color); color: #fff; }
      .sbtn.p:hover { filter: brightness(1.1); }
      .sbtn.s {
        background: none;
        border: 1px solid var(--divider-color);
        color: var(--primary-text-color);
      }
      .sbtn.s:hover { background: rgba(255,255,255,.05); }
    `;
  }

  render() {
    if (!this._ed) return html`<div style="padding:40px;text-align:center;color:var(--secondary-text-color)">Laden...</div>`;
    const d = this._ed;
    const screenCount = (d.screens || []).length;
    const widgetCount = (d.screens || []).reduce((sum, s) => sum + (s.widgets?.length || 0), 0);

    return html`
      <!-- ═══ Device Info ═══ -->
      ${this._renderSection("info", "📱 Geräte-Info", html`
        <div class="f">
          <label>Gerätename</label>
          <input .value=${d.name || ""}
                 @input=${(e) => this._set("name", e.target.value)}
                 placeholder="z.B. Küchen-Tablet">
        </div>
        <div class="row">
          <div class="f">
            <label>Theme</label>
            <select .value=${d.theme || "dark"}
                    @change=${(e) => this._set("theme", e.target.value)}>
              ${TD_THEMES.map((t) => html`<option value=${t.v}>${t.l}</option>`)}
            </select>
          </div>
          <div class="f">
            <label>Schriftart</label>
            <select .value=${d.font || "roboto"}
                    @change=${(e) => this._set("font", e.target.value)}>
              ${(this.fonts || []).map((f) => html`
                <option value=${f.id}>${f.name} ${f.builtin ? "(eingebaut)" : ""}</option>
              `)}
            </select>
          </div>
        </div>
      `)}

      <!-- ═══ Screens ═══ -->
      ${this._renderSection("screens", `📺 Screens (${screenCount})`, html`
        <p style="font-size:13px;color:var(--secondary-text-color);margin:0 0 16px;line-height:1.5">
          Reihenfolge per Drag & Drop ändern. Über die Schnellstart-Buttons legst du fertige Grundlayouts an.
        </p>

        <!-- Preset Buttons -->
        <div class="add-row">
          ${[
            ["blank",    "➕ Leer"],
            ["weather",  "🌤️ Wetter"],
            ["camera",   "📹 Kamera"],
            ["charts",   "📈 Charts"],
            ["energy",   "⚡ Energie"],
            ["security", "🛡️ Sicherheit"],
          ].map(([preset, label]) => html`
            <button class="add-btn"
                    @click=${() => this._emit("add-screen-preset", { preset })}>
              ${label}
            </button>
          `)}
        </div>

        <!-- Template Import -->
        ${this._renderTemplateImport()}

        <!-- Screen List -->
        <ul class="sl">
          ${(d.screens || []).map((s, i) => this._renderScreenItem(s, i))}
        </ul>

        <button class="add-btn large"
                @click=${() => this._emit("add-screen-preset", { preset: "blank" })}>
          ➕ Screen hinzufügen
        </button>
      `)}

      <!-- ═══ Rotation ═══ -->
      ${this._renderSection("rotation", "🔄 Rotation", html`
        <div class="row">
          <div class="f">
            <label>Übergang</label>
            <select .value=${d.rotation?.transition || "fade"}
                    @change=${(e) => this._setNested("rotation", "transition", e.target.value)}>
              ${TD_TRANSITIONS.map((t) => html`<option value=${t.v}>${t.l}</option>`)}
            </select>
          </div>
          <div class="f">
            <label>Auto-Rotation</label>
            <select .value=${d.rotation?.enabled !== false ? "on" : "off"}
                    @change=${(e) => this._setNested("rotation", "enabled", e.target.value === "on")}>
              <option value="on">Aktiviert</option>
              <option value="off">Deaktiviert</option>
            </select>
            <div class="hint">
              Wenn deaktiviert, bleibt der aktuelle Screen stehen.
              Die Rotation kann auch per Service gesteuert werden.
            </div>
          </div>
        </div>
      `)}

      <!-- ═══ Ticker ═══ -->
      ${this._renderSection("ticker", "📰 Ticker-Leiste", html`
        ${this._renderTickerConfig()}
      `)}

      <!-- ═══ Save Bar ═══ -->
      <div class="savebar">
        <div class="info">
          ${screenCount} Screen${screenCount !== 1 ? "s" : ""} · ${widgetCount} Widgets
        </div>
        <div class="actions">
          <button class="sbtn s" @click=${() => this._emit("back", {})}>Abbrechen</button>
          <button class="sbtn p" @click=${() => this._emit("save", this._ed)}>💾 Speichern</button>
        </div>
      </div>
    `;
  }

  /* ────── Collapsible Section ────── */
  _renderSection(id, title, content) {
    const open = this._expandedSections[id] !== false;
    return html`
      <div class="sec">
        <div class="sec-header" @click=${() => this._toggleSection(id)}>
          <h3>${title}</h3>
          <span class="arrow ${open ? "open" : ""}">▶</span>
        </div>
        <div class="sec-body ${open ? "" : "collapsed"}">${content}</div>
      </div>
    `;
  }

  _toggleSection(id) {
    this._expandedSections = {
      ...this._expandedSections,
      [id]: !this._expandedSections[id],
    };
  }

  /* ────── Screen Item ────── */
  _renderScreenItem(s, i) {
    const type = TD_SCREEN_TYPE_LABELS[s.type] || s.type || "Dashboard";
    const wCount = s.widgets?.length || 0;
    const dur = s.duration || 15;

    return html`
      <li class="si ${this._dragIdx === i ? "dragging" : ""} ${this._dragOverIdx === i ? "drag-over" : ""}"
          draggable="true"
          @dragstart=${(e) => this._onScreenDragStart(e, i)}
          @dragover=${(e) => this._onScreenDragOver(e, i)}
          @dragleave=${() => this._dragOverIdx = -1}
          @drop=${(e) => this._onScreenDrop(e, i)}
          @dragend=${() => { this._dragIdx = -1; this._dragOverIdx = -1; }}
      >
        <span class="sdh" title="Reihenfolge ändern">⠿</span>
        <div class="sinfo">
          <div class="sn">${s.name || `Screen ${i + 1}`}</div>
          <div class="sm">
            <span class="badge">${type}</span>
            <span>${dur}s</span>
            <span>${wCount} Widget${wCount !== 1 ? "s" : ""}</span>
            ${s.transition ? html`<span class="badge">${s.transition}</span>` : ""}
          </div>
        </div>
        <div class="sa">
          <button class="ib" @click=${() => this._emit("edit-screen", { screenIndex: i })}
                  title="Bearbeiten">✏️</button>
          <button class="ib" @click=${() => this._saveScreenAsTemplate(i)}
                  title="Als Vorlage speichern">📚</button>
          <button class="ib" @click=${() => this._duplicateScreen(i)}
                  title="Duplizieren">📋</button>
          <button class="ib" @click=${() => this._emit("delete-screen", { screenIndex: i })}
                  title="Löschen">🗑️</button>
        </div>
      </li>
    `;
  }

  /* ────── Screen Drag & Drop ────── */
  _onScreenDragStart(e, i) {
    this._dragIdx = i;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
  }

  _onScreenDragOver(e, i) {
    e.preventDefault();
    if (this._dragIdx === i) return;
    this._dragOverIdx = i;
  }

  _onScreenDrop(e, targetIdx) {
    e.preventDefault();
    this._dragOverIdx = -1;
    if (this._dragIdx < 0 || this._dragIdx === targetIdx) return;

    const screens = [...(this._ed.screens || [])];
    const [moved] = screens.splice(this._dragIdx, 1);
    screens.splice(targetIdx, 0, moved);
    this._ed = { ...this._ed, screens };
    this._dragIdx = -1;
  }

  /* ────── Screen Actions ────── */
  _duplicateScreen(i) {
    const screens = [...(this._ed.screens || [])];
    const copy = deepClone(screens[i]);
    copy.id = uniqueId("screen");
    copy.name = `${copy.name || `Screen ${i + 1}`} (Kopie)`;
    screens.splice(i + 1, 0, copy);
    this._ed = { ...this._ed, screens };
  }

  _saveScreenAsTemplate(i) {
    const name = prompt(
      "Vorlagenname:",
      this._ed.screens?.[i]?.name || `Screen ${i + 1}`
    );
    if (name) {
      this._emit("save-screen-as-template", { screenIndex: i, name });
    }
  }

  /* ────── Template Import ────── */
  _renderTemplateImport() {
    const templateEntries = Object.entries(this.templates || {})
      .filter(([, t]) => t?.screen_config);

    if (!templateEntries.length) return html``;

    return html`
      <div class="import-row">
        <select .value=${this._screenTemplateToImport || ""}
                @change=${(e) => this._screenTemplateToImport = e.target.value}>
          <option value="">📥 Vorlage importieren…</option>
          ${templateEntries.map(([id, t]) => html`
            <option value=${id}>${t.name || id} (${(t.screen_config?.widgets?.length || 0)} Widgets)</option>
          `)}
        </select>
        <button class="add-btn"
                ?disabled=${!this._screenTemplateToImport}
                @click=${() => {
                  if (this._screenTemplateToImport) {
                    this._emit("import-screen-template", { templateId: this._screenTemplateToImport });
                    this._screenTemplateToImport = "";
                  }
                }}>
          📚 Einfügen
        </button>
      </div>
    `;
  }

  /* ────── Ticker Config ────── */
  _renderTickerConfig() {
    const d = this._ed;
    const t = d.ticker || {};

    return html`
      <div class="ticker-grid">
        <div class="f">
          <label>Ticker</label>
          <select .value=${t.enabled !== false ? "on" : "off"}
                  @change=${(e) => this._setNested("ticker", "enabled", e.target.value === "on")}>
            <option value="on">Aktiviert</option>
            <option value="off">Deaktiviert</option>
          </select>
        </div>
        <div class="f">
          <label>Geschwindigkeit</label>
          <select .value=${t.speed || "normal"}
                  @change=${(e) => this._setNested("ticker", "speed", e.target.value)}>
            <option value="slow">Langsam</option>
            <option value="normal">Normal</option>
            <option value="fast">Schnell</option>
          </select>
        </div>
        <div class="f">
          <label>Position</label>
          <select .value=${t.position || "bottom"}
                  @change=${(e) => this._setNested("ticker", "position", e.target.value)}>
            <option value="bottom">Unten</option>
            <option value="top">Oben</option>
          </select>
        </div>
        <div class="f">
          <label>Höhe (px)</label>
          <input type="number" min="24" max="120"
                 .value=${t.height || 36}
                 @change=${(e) => this._setNested("ticker", "height", +e.target.value)}>
        </div>
        <div class="f">
          <label>Schriftgröße (px)</label>
          <input type="number" min="10" max="40"
                 .value=${t.font_size || 14}
                 @change=${(e) => this._setNested("ticker", "font_size", +e.target.value)}>
        </div>
        <div class="f">
          <label>Padding X (px)</label>
          <input type="number" min="4" max="40"
                 .value=${t.item_padding_x || 22}
                 @change=${(e) => this._setNested("ticker", "item_padding_x", +e.target.value)}>
        </div>
        <div class="f">
          <label>Transparenz</label>
          <input type="number" min="0.1" max="1" step="0.05"
                 .value=${t.opacity || 1}
                 @change=${(e) => this._setNested("ticker", "opacity", +e.target.value)}>
        </div>
        <div class="f">
          <label>Trennzeichen</label>
          <input .value=${t.separator || "│"}
                 @change=${(e) => this._setNested("ticker", "separator", e.target.value || "│")}>
        </div>
        <div class="f">
          <label>Textfarbe</label>
          <input .value=${t.text_color || "#e8eef7"}
                 @change=${(e) => this._setNested("ticker", "text_color", e.target.value)}>
        </div>
        <div class="f">
          <label>Hintergrund</label>
          <input .value=${t.background_color || "rgba(12,18,28,.72)"}
                 @change=${(e) => this._setNested("ticker", "background_color", e.target.value)}>
        </div>
        <div class="f">
          <label>Akzentfarbe</label>
          <input .value=${t.accent_color || "#4fc3f7"}
                 @change=${(e) => this._setNested("ticker", "accent_color", e.target.value)}>
        </div>
        <div class="f">
          <label>Radius (px)</label>
          <input type="number" min="0" max="40"
                 .value=${t.border_radius || 0}
                 @change=${(e) => this._setNested("ticker", "border_radius", +e.target.value)}>
        </div>
        <div class="f full">
          <label>Feste Meldungen</label>
          <input .value=${(t.fixed_messages || []).join(" | ")}
                 placeholder="Text 1 | Text 2 | Text 3"
                 @change=${(e) => this._setNested("ticker", "fixed_messages",
                   String(e.target.value || "").split("|").map((x) => x.trim()).filter(Boolean)
                 )}>
          <div class="hint">Mehrere Meldungen mit | trennen</div>
        </div>
        <div class="f full">
          <label>Stil-Vorlage</label>
          <select .value=${t.style_template || "classic"}
                  @change=${(e) => this._applyTickerTemplate(e.target.value)}>
            <option value="classic">Classic</option>
            <option value="glass">Glass</option>
            <option value="alert">Alert</option>
            <option value="minimal">Minimal</option>
          </select>
          <div class="hint">Setzt passende Farben, Radius und Gewicht</div>
        </div>
      </div>
    `;
  }

  _applyTickerTemplate(name) {
    const presets = {
      classic: {
        background_color: "rgba(12,18,28,.78)", text_color: "#e8eef7",
        accent_color: "#40c4ff", border_radius: 0, font_weight: 600,
      },
      glass: {
        background_color: "rgba(20,24,32,.45)", text_color: "#ffffff",
        accent_color: "#7dd3fc", border_radius: 14, font_weight: 600, opacity: 0.92,
      },
      alert: {
        background_color: "rgba(120,8,8,.85)", text_color: "#fff5f5",
        accent_color: "#ffd54f", border_radius: 0, font_weight: 700,
      },
      minimal: {
        background_color: "rgba(0,0,0,.22)", text_color: "#f3f4f6",
        accent_color: "#9ca3af", border_radius: 10, font_weight: 500,
      },
    };

    const preset = presets[name] || {};
    const ticker = { ...(this._ed.ticker || {}), style_template: name, ...preset };
    this._ed = { ...this._ed, ticker };
  }

  /* ────── State Helpers ────── */
  _set(key, value) {
    this._ed = { ...this._ed, [key]: value };
  }

  _setNested(section, key, value) {
    const current = { ...(this._ed[section] || {}) };
    current[key] = value;
    this._ed = { ...this._ed, [section]: current };
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-device-editor", TdDeviceEditor);
/* ══════════════════════════════════════════════════════════
   SCREEN EDITOR
   ══════════════════════════════════════════════════════════ */

class TdScreenEditor extends LitElement {
  static get properties() {
    return {
      hass:           { type: Object },
      deviceId:       { type: String },
      device:         { type: Object },
      screenIndex:    { type: Number },
      screenConfig:   { type: Object },
      fonts:          { type: Array },
      sounds:         { type: Array },
      templates:      { type: Object },
      images:         { type: Array },
      haImages:       { type: Array },
      globalSettings: { type: Object },

      // Internal state
      _cfg:            { type: Object },
      _sel:            { type: Number },
      _selMulti:       { type: Array },
      _prev:           { type: String },
      _grid:           { type: Boolean },
      _snap:           { type: Boolean },
      _undo:           { type: Array },
      _redo:           { type: Array },
      _dwt:            { type: String },
      _pt:             { type: Number },
      _paletteQuery:   { type: String },
      _paletteFilter:  { type: String },
      _paletteFolders: { type: Object },
      _favoriteWidgets:{ type: Array },
      _recentWidgets:  { type: Array },
      _toolsOpen:      { type: Boolean },
      _dragState:      { type: Object },
      _resizeState:    { type: Object },
    };
  }

  constructor() {
    super();
    this._cfg = null;
    this._sel = -1;
    this._selMulti = [];
    this._prev = "landscape";
    this._grid = true;
    this._snap = true;
    this._undo = [];
    this._redo = [];
    this._dwt = null;
    this._pt = 0;
    this._paletteQuery = "";
    this._paletteFilter = "all";
    this._paletteFolders = lsGet("td_palette_folders", {});
    this._favoriteWidgets = lsGet("td_widget_favorites", []);
    this._recentWidgets = lsGet("td_widget_recent", []);
    this._toolsOpen = false;
    this._dragState = null;
    this._resizeState = null;
    this._metricPreviewCache = {};
    this._metricPreviewInflight = {};
    this._keyHandler = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._keyHandler = (e) => this._onGlobalKey(e);
    window.addEventListener("keydown", this._keyHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._keyHandler) {
      window.removeEventListener("keydown", this._keyHandler);
      this._keyHandler = null;
    }
  }

  updated(changed) {
    if (changed.has("screenConfig") && this.screenConfig) {
      this._cfg = deepClone(this.screenConfig);
    }
  }

  /* ────── Keyboard Shortcuts ────── */
  _onGlobalKey(e) {
    if (!this._cfg) return;
    const tag = (e.target?.tagName || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) return;

    const ctrl = e.ctrlKey || e.metaKey;

    // Ctrl+Z = Undo
    if (ctrl && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      this._doUndo();
      return;
    }
    // Ctrl+Shift+Z or Ctrl+Y = Redo
    if ((ctrl && e.shiftKey && e.key === "z") || (ctrl && e.key === "y")) {
      e.preventDefault();
      this._doRedo();
      return;
    }
    // Entf/Delete = Delete selected (Backspace bleibt fürs Tippen frei)
    if (e.key === "Delete" && this._sel >= 0) {
      e.preventDefault();
      this._deleteSelected();
      return;
    }
    // Ctrl+D = Duplicate
    if (ctrl && e.key === "d" && this._sel >= 0) {
      e.preventDefault();
      this._duplicateSelected();
      return;
    }
    // Ctrl+A = Select all
    if (ctrl && e.key === "a") {
      e.preventDefault();
      const ws = this._cfg.widgets || [];
      this._selMulti = ws.map((_, i) => i);
      this._sel = ws.length ? ws.length - 1 : -1;
      return;
    }
    // Escape = Deselect
    if (e.key === "Escape") {
      this._sel = -1;
      this._selMulti = [];
      this._toolsOpen = false;
      return;
    }
    // Arrow keys = Nudge
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && this._sel >= 0) {
      e.preventDefault();
      const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      this._nudgeSelected(dx, dy);
      return;
    }
    // Ctrl+S = Save
    if (ctrl && e.key === "s") {
      e.preventDefault();
      this._emit("save", { screenConfig: this._cfg });
      return;
    }
  }

  static get styles() {
    return css`
      :host {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr) 400px;
        grid-template-rows: auto 1fr;
        height: 100vh; overflow: hidden;
      }

      /* ══════ TOOLBAR ══════ */
      .tb {
        grid-column: 1 / -1; display: flex; flex-wrap: wrap;
        align-items: center; gap: 6px; padding: 6px 12px;
        background: var(--app-header-background-color, #1e1e1e);
        border-bottom: 1px solid var(--divider-color);
        position: relative; z-index: 30;
      }
      .tb button {
        padding: 5px 10px; border: 1px solid var(--divider-color);
        border-radius: 6px; background: none;
        color: var(--primary-text-color); font-size: 12px;
        cursor: pointer; white-space: nowrap;
        display: flex; align-items: center; gap: 4px;
        transition: all .12s;
      }
      .tb button:hover { background: rgba(255,255,255,.05); }
      .tb button.p {
        background: var(--primary-color);
        border-color: var(--primary-color); color: #fff;
      }
      .tb button.p:hover { filter: brightness(1.1); }
      .tb button:disabled { opacity: .3; cursor: not-allowed; }
      .tb button.active {
        background: rgba(255,255,255,.08);
        border-color: var(--primary-color);
      }
      .tb input {
        padding: 5px 10px; border: 1px solid var(--divider-color);
        border-radius: 6px; background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 12px; width: 150px;
      }
      .tb select {
        padding: 5px 8px; border: 1px solid var(--divider-color);
        border-radius: 6px; background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 12px;
      }
      .tb .sp { flex: 1; }
      .tb .lb {
        font-size: 11px; color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .tb .sep {
        width: 1px; height: 20px; background: var(--divider-color);
        margin: 0 2px;
      }

      /* ── Tools Popup ── */
      .tools-wrap { position: relative; display: inline-block; }
      .tools-popup {
        position: absolute; top: calc(100% + 6px); left: 0;
        min-width: 340px; max-width: min(92vw, 520px);
        max-height: min(70vh, 560px); overflow: auto;
        padding: 12px; border: 1px solid var(--divider-color);
        border-radius: 12px; background: var(--card-background-color);
        box-shadow: 0 12px 40px rgba(0,0,0,.35);
        z-index: 80; display: grid; gap: 12px;
      }
      .tools-section { display: grid; gap: 6px; }
      .tools-label {
        font-size: 10px; font-weight: 600;
        text-transform: uppercase; letter-spacing: .06em;
        color: var(--secondary-text-color);
      }
      .tools-row {
        display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 5px;
      }
      .tools-row button { justify-content: center; font-size: 11px; }

      /* ══════ PALETTE ══════ */
      .pal {
        overflow-y: auto; padding: 10px;
        border-right: 1px solid var(--divider-color);
        background: var(--sidebar-background-color, #111);
      }
      .pal-tools {
        display: grid; gap: 6px; margin-bottom: 10px;
        position: sticky; top: 0; z-index: 1;
        background: linear-gradient(180deg,
          var(--sidebar-background-color, #111) 80%,
          rgba(17,17,17,0));
        padding-bottom: 8px;
      }
      .pal-tools input, .pal-tools select {
        width: 100%; padding: 8px 10px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 13px;
      }
      .pal-chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .pal-chip {
        padding: 5px 10px; border-radius: 999px;
        border: 1px solid var(--divider-color); background: none;
        color: var(--secondary-text-color); cursor: pointer;
        font-size: 11px; transition: all .12s;
      }
      .pal-chip.a {
        color: var(--primary-text-color);
        border-color: var(--primary-color);
        background: rgba(33,150,243,.12);
      }
      .pal-count {
        font-size: 11px; color: var(--secondary-text-color);
      }

      /* ── Palette Folders ── */
      .folder {
        border: 1px solid rgba(255,255,255,.05);
        border-radius: 10px; margin-bottom: 8px;
        overflow: hidden; background: rgba(255,255,255,.01);
      }
      .folder summary {
        list-style: none; cursor: pointer;
        padding: 8px 10px; display: flex;
        align-items: center; justify-content: space-between;
        gap: 6px; font-size: 13px;
        transition: background .12s; user-select: none;
      }
      .folder summary::-webkit-details-marker { display: none; }
      .folder summary:hover { background: rgba(255,255,255,.03); }
      .folder .f-left {
        display: flex; align-items: center; gap: 6px; min-width: 0;
      }
      .folder .f-meta {
        font-size: 10px; color: var(--secondary-text-color);
      }
      .folder .f-icons {
        display: flex; gap: 3px;
      }
      .folder .f-icons span {
        width: 16px; height: 16px; border-radius: 4px;
        background: rgba(255,255,255,.08);
        display: flex; align-items: center; justify-content: center;
        font-size: 10px;
      }
      .folder .body { padding: 4px 8px 8px; }

      /* ── Palette Items ── */
      .p-grid { display: grid; gap: 6px; }
      .p-item {
        display: grid;
        grid-template-columns: 24px 1fr auto;
        gap: 6px; align-items: center;
        padding: 8px 10px;
        border: 1px solid rgba(255,255,255,.05);
        border-radius: 10px; cursor: grab;
        font-size: 12px; color: var(--primary-text-color);
        transition: all .12s;
        background: rgba(255,255,255,.015);
      }
      .p-item:hover {
        background: rgba(255,255,255,.05);
        border-color: rgba(255,255,255,.1);
        transform: translateY(-1px);
      }
      .p-item:active { cursor: grabbing; opacity: .5; }
      .p-item .p-icon { font-size: 16px; text-align: center; }
      .p-item .p-name { font-weight: 500; }
      .p-item .p-desc {
        font-size: 10px; color: var(--secondary-text-color);
        margin-top: 1px;
      }
      .fav-btn {
        border: none; background: none;
        color: var(--secondary-text-color);
        cursor: pointer; font-size: 14px; padding: 2px;
        transition: color .12s;
      }
      .fav-btn.a { color: #f6c344; }
      .fav-btn:hover { color: #fdd835; }

      /* ══════ PREVIEW AREA ══════ */
      .pva {
        display: flex; align-items: center; justify-content: center;
        background: #0a0a0a; padding: 16px; overflow: hidden;
      }
      .pf {
        background: #121212; border-radius: 8px;
        box-shadow: 0 4px 24px rgba(0,0,0,.5);
        display: flex; flex-direction: column;
        overflow: hidden; position: relative;
      }
      .pf.l { width: min(100%, 720px); aspect-ratio: 16/10; }
      .pf.p { height: min(100%, 520px); aspect-ratio: 10/16; }

      .pg {
        display: grid; gap: 6px; padding: 6px;
        flex: 1; min-height: 0;
      }

      .ptk {
        height: 28px; background: rgba(255,255,255,.03);
        border-top: 1px solid rgba(255,255,255,.05);
        display: flex; align-items: center; padding: 0 10px;
        font-size: 11px; color: rgba(255,255,255,.3);
        flex-shrink: 0;
      }

      /* ── Grid cells ── */
      .gc {
        border: 1px dashed transparent;
        border-radius: 6px; transition: all .12s; min-height: 40px;
      }
      .gc.sg { border-color: rgba(255,255,255,.05); }
      .gc.drop-over {
        border-color: var(--primary-color);
        background: rgba(33,150,243,.08);
      }

      /* ── Widget boxes ── */
      .wb {
        background: rgba(255,255,255,.06);
        border-radius: 8px; padding: 8px;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        cursor: pointer; position: relative; overflow: hidden;
        border: 2px solid transparent;
        transition: border-color .12s, box-shadow .12s;
      }
      .wb:hover { border-color: rgba(255,255,255,.12); }
      .wb.sel {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 1px rgba(33,150,243,.2), 0 8px 20px rgba(0,0,0,.25);
      }
      .wb.ms { border-color: #8BC34A; }
      .wb.locked { outline: 1px dashed rgba(255,193,7,.6); }

      .wb .wi { font-size: 18px; opacity: .5; }
      .wb .wv {
        font-size: 18px; font-weight: 500; color: #fff; margin: 2px 0;
        max-width: 100%; overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap;
      }
      .wb .wn {
        font-size: 9px; color: rgba(255,255,255,.45);
        text-align: center; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap;
        max-width: 100%;
      }
      .wb .wx {
        font-size: 8px; color: rgba(255,255,255,.3);
        margin-top: 1px; text-align: center; max-width: 100%;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .wb .pv {
        width: 100%; height: 100%; display: flex; flex-direction: column;
        justify-content: center; gap: 6px; position: relative; z-index: 1;
      }
      .wb .pv-head {
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
        min-width: 0;
      }
      .wb .pv-title {
        font-size: 9px; color: rgba(255,255,255,.62);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
      }
      .wb .pv-icon { font-size: 16px; opacity: .9; flex-shrink: 0; }
      .wb .pv-value {
        font-size: 18px; font-weight: 700; color: #fff; line-height: 1.05;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .wb .pv-sub {
        font-size: 9px; color: rgba(255,255,255,.5);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .wb .pv-meter {
        width: 100%; height: 8px; border-radius: 999px;
        background: rgba(255,255,255,.12); overflow: hidden;
      }
      .wb .pv-meter > span {
        display: block; height: 100%; border-radius: inherit;
        background: linear-gradient(90deg, rgba(64,196,255,.92), rgba(126,87,194,.95));
      }
      .wb .pv-dot {
        width: 18px; height: 18px; border-radius: 999px;
        box-shadow: 0 0 0 6px rgba(76,175,80,.12);
      }
      .wb .pv-dot.off {
        background: rgba(255,255,255,.26); box-shadow: none;
      }
      .wb .pv-dot.on {
        background: #4caf50;
      }
      .wb .pv-trend {
        display: inline-flex; align-items: center; gap: 4px;
        font-size: 11px; font-weight: 600; color: #8bc34a;
      }
      .wb .pv-trend.down { color: #ef5350; }
      .wb .pv-trend.flat { color: #ffca28; }
      .wb .pv-cam {
        position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: cover; z-index: 0;
      }
      .wb .pv-cam-fade {
        position: absolute; inset: 0; z-index: 0;
        background: linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.52));
      }
      .wb .pv-overlay {
        position: absolute; left: 8px; right: 8px; bottom: 8px;
        z-index: 1; padding: 6px 8px; border-radius: 8px;
        background: rgba(0,0,0,.45); backdrop-filter: blur(6px);
      }
      .wb .pv-placeholder {
        display: grid; place-items: center; height: 100%;
        font-size: 28px; opacity: .34;
      }
      .wb .pv-chart-lines {
        width: 100%; height: 42px; border-radius: 10px;
        min-height: 42px;
        background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01));
        position: relative; overflow: hidden;
      }
      .wb .pv-chart-lines::before,
      .wb .pv-chart-lines::after {
        content: ""; position: absolute; left: 6px; right: 6px; border-radius: 999px;
      }
      .wb .pv-chart-lines::before {
        top: 11px; height: 2px;
        background: linear-gradient(90deg, rgba(64,196,255,.0), rgba(64,196,255,.95) 25%, rgba(126,87,194,.95) 70%, rgba(255,255,255,.0));
        transform: rotate(-6deg);
      }
      .wb .pv-chart-lines::after {
        top: 22px; height: 2px;
        background: linear-gradient(90deg, rgba(255,255,255,.0), rgba(255,193,7,.85) 30%, rgba(76,175,80,.85) 75%, rgba(255,255,255,.0));
        transform: rotate(7deg);
      }
      .wb .pv-chart-live::before,
      .wb .pv-chart-live::after {
        display: none;
      }
      .wb .pv-chart-svg {
        width: 100%; height: 100%; display: block;
      }
      .wb .pv-chart-grid {
        fill: rgba(255,255,255,.18);
      }
      .wb .pv-chart-fill {
        fill: rgba(64,196,255,.18);
      }
      .wb .pv-chart-line {
        fill: none; stroke: rgba(64,196,255,.95); stroke-width: 2.1; stroke-linecap: round; stroke-linejoin: round;
      }
      .wb .pv-chart-dot {
        fill: rgba(126,87,194,.98); stroke: rgba(255,255,255,.9); stroke-width: 1.2;
      }
      .wb .pv-control-compact {
        align-items: center; justify-content: center;
      }
      .wb .pv-compact-shell {
        display:flex; flex-direction:column; justify-content:center; gap:8px; height:100%; text-align:left;
      }
      .wb .pv-compact-icon {
        width: 36px; height: 36px; border-radius: 12px; display:grid; place-items:center; font-size:19px;
        background: linear-gradient(135deg, rgba(64,196,255,.22), rgba(126,87,194,.18)); box-shadow: 0 8px 18px rgba(0,0,0,.2); overflow: hidden;
      }
      .wb .pv-compact-icon img {
        width: 100%; height: 100%; object-fit: cover;
      }
      .wb .pv-compact-chip {
        padding: 4px 10px; border-radius: 999px; font-size: 9px; font-weight: 700; letter-spacing: .04em;
        background: rgba(255,255,255,.12); color: rgba(255,255,255,.82);
      }
      .wb .pv-media-cover {
        width: 50px; height: 50px; border-radius: 12px; flex-shrink: 0;
        background: rgba(255,255,255,.08); display: flex; align-items: center; justify-content: center;
        font-size: 24px; overflow: hidden;
      }
      .wb .pv-media-cover img { width: 100%; height: 100%; object-fit: cover; }
      .wb .pv-split {
        display: flex; align-items: center; gap: 10px; min-width: 0;
      }
      .wb .pv-control-card {
        gap: 6px;
      }
      .wb .pv-control-card .pv-title {
        font-size: 10px; color: rgba(255,255,255,.66);
      }
      .wb .pv-control-top {
        display: flex; align-items: flex-start; gap: 10px; min-width: 0;
      }
      .wb .pv-control-icon {
        width: 44px; height: 44px; border-radius: 14px; flex: none;
        display: grid; place-items: center; font-size: 22px;
        background: linear-gradient(135deg, rgba(64,196,255,.22), rgba(126,87,194,.18));
        overflow: hidden;
      }
      .wb .pv-control-icon img { width: 100%; height: 100%; object-fit: cover; }
      .wb .pv-control-main {
        flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;
      }
      .wb .pv-chip {
        padding: 4px 8px; border-radius: 999px; font-size: 9px; font-weight: 700;
        background: rgba(255,255,255,.12); color: rgba(255,255,255,.82);
        align-self: flex-start;
      }
      .wb .pv-chip.on { background: rgba(76,175,80,.2); color: #c8facc; }
      .wb .pv-chip.off { background: rgba(255,255,255,.08); color: rgba(255,255,255,.7); }
      .wb .pv-action-row {
        display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px;
      }
      .wb .pv-action {
        min-height: 28px; padding: 0 8px; border-radius: 10px; font-size: 9px; font-weight: 700;
        display: inline-flex; align-items: center; justify-content: center;
        background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.08);
      }
      .wb .pv-action.primary { background: linear-gradient(135deg, rgba(64,196,255,.3), rgba(126,87,194,.24)); }
      .wb .pv-action.grow { flex: 1 1 56px; }

      /* ── Widget badges ── */
      .wb .layer-badge {
        position: absolute; top: 4px; right: 4px;
        font-size: 8px; padding: 1px 4px;
        border-radius: 999px; background: rgba(0,0,0,.4);
        color: #fff;
      }
      .wb .group-badge {
        position: absolute; top: 4px; left: 4px;
        font-size: 8px; padding: 1px 4px;
        border-radius: 999px; background: rgba(33,150,243,.25);
        color: #fff; max-width: 45%;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }

      /* ── Resize handles ── */
      .rh {
        position: absolute; width: 10px; height: 10px;
        border-radius: 50%; background: var(--primary-color);
        border: 2px solid #fff;
        box-shadow: 0 1px 4px rgba(0,0,0,.4);
        z-index: 5; opacity: 0;
        transition: opacity .12s;
      }
      .wb.sel .rh, .wb:hover .rh { opacity: 1; }
      .rh.se { right: 3px; bottom: 3px; cursor: nwse-resize; }
      .rh.e  { right: 3px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
      .rh.s  { left: 50%; bottom: 3px; transform: translateX(-50%); cursor: ns-resize; }

      /* ── Snap guides ── */
      .guides { position: absolute; inset: 0; pointer-events: none; }
      .g-v {
        position: absolute; top: 0; bottom: 28px; width: 1px;
        background: rgba(33,150,243,.2);
      }
      .g-h {
        position: absolute; left: 0; right: 0; height: 1px;
        background: rgba(33,150,243,.18);
      }

      /* ══════ PROPERTIES PANEL ══════ */
      .props {
        overflow-y: auto; padding: 14px 16px 80px;
        border-left: 1px solid var(--divider-color);
        background: var(--sidebar-background-color, #111);
        min-width: 0;
      }
      /* Properties styles continued in Part 4 */
    `;
  }

  render() {
    if (!this._cfg) return html``;
    return html`
      ${this._renderToolbar()}
      ${this._renderPalette()}
      ${this._renderPreview()}
      ${this._renderProperties()}
    `;
  }

  /* ══════════════════════════════════════════════════════════
     TOOLBAR
     ══════════════════════════════════════════════════════════ */

  _renderToolbar() {
    const multiCount = (this._selMulti || []).length;
    const widgetCount = (this._cfg.widgets || []).length;

    return html`
      <div class="tb">
        <!-- Back -->
        <button @click=${() => this._emit("back", {})}>← Zurück</button>
        <span class="sep"></span>

        <!-- Screen name -->
        <input .value=${this._cfg.name || ""}
               placeholder="Screen Name"
               @input=${(e) => (this._cfg = { ...this._cfg, name: e.target.value })}>

        <!-- Grid controls -->
        <span class="lb">Grid:</span>
        <select .value=${String(this._cfg.grid?.columns || 3)}
                @change=${(e) => this._setGrid("columns", +e.target.value)}>
          ${[1,2,3,4,5,6].map((n) => html`<option value=${n}>${n}</option>`)}
        </select>
        <span class="lb">×</span>
        <select .value=${String(this._cfg.grid?.rows || 2)}
                @change=${(e) => this._setGrid("rows", +e.target.value)}>
          ${[1,2,3,4,5].map((n) => html`<option value=${n}>${n}</option>`)}
        </select>

        <span class="sep"></span>

        <!-- View toggles -->
        <button class="${this._grid ? "active" : ""}"
                @click=${() => this._grid = !this._grid}
                title="Grid anzeigen">
          ${this._grid ? "▦" : "▢"}
        </button>
        <button class="${this._snap ? "active" : ""}"
                @click=${() => this._snap = !this._snap}
                title="Snap-Hilfslinien">
          #
        </button>

        <span class="sep"></span>

        <!-- Widget actions -->
        <button ?disabled=${this._sel < 0}
                @click=${() => this._duplicateSelected()}
                title="Duplizieren (Ctrl+D)">⧉</button>
        <button ?disabled=${this._sel < 0}
                @click=${() => this._deleteSelected()}
                title="Löschen (Del)">🗑</button>

        <!-- Tools menu -->
        <div class="tools-wrap">
          <button class="${this._toolsOpen ? "active" : ""}"
                  @click=${() => this._toolsOpen = !this._toolsOpen}>
            🧰 Werkzeuge ▾
          </button>
          ${this._toolsOpen ? this._renderToolsPopup() : ""}
        </div>

        <span class="sp"></span>

        <!-- Status -->
        <span class="lb">
          ${multiCount > 1
            ? `${multiCount} Widgets`
            : this._sel >= 0
              ? `Widget ${this._sel + 1}/${widgetCount}`
              : `${widgetCount} Widgets`
          }
        </span>

        <span class="sep"></span>

        <!-- Undo/Redo -->
        <button ?disabled=${!this._undo.length}
                @click=${() => this._doUndo()}
                title="Rückgängig (Ctrl+Z)">↩</button>
        <button ?disabled=${!this._redo.length}
                @click=${() => this._doRedo()}
                title="Wiederholen (Ctrl+Y)">↪</button>

        <span class="sep"></span>

        <!-- Preview orientation -->
        <button @click=${() => this._prev = this._prev === "landscape" ? "portrait" : "landscape"}
                title="Vorschau drehen">
          ${this._prev === "landscape" ? "🖥" : "📱"}
        </button>

        <!-- Duration -->
        <select .value=${String(this._cfg.duration || 15)}
                @change=${(e) => this._cfg = { ...this._cfg, duration: +e.target.value }}>
          ${[5,10,15,20,30,45,60,120].map((n) => html`<option value=${n}>${n}s</option>`)}
        </select>

        <!-- Preview / Template / Save -->
        <button @click=${() => this._openDraftPreview()} title="Live-Vorschau">👁️</button>
        <button @click=${() => this._saveAsTemplate()} title="Als Vorlage">📋</button>
        <button class="p"
                @click=${() => this._emit("save", { screenConfig: this._cfg })}
                title="Speichern (Ctrl+S)">
          💾 Speichern
        </button>
      </div>
    `;
  }

  /* ────── Tools Popup ────── */
  _renderToolsPopup() {
    const multi = (this._selMulti || []).length;
    const hasSel = this._sel >= 0;

    return html`
      <div class="tools-popup" @click=${(e) => e.stopPropagation()}>
        <div class="tools-section">
          <div class="tools-label">Bewegen</div>
          <div class="tools-row">
            <button ?disabled=${!hasSel} @click=${() => this._nudgeSelected(-1, 0)}>← Links</button>
            <button ?disabled=${!hasSel} @click=${() => this._nudgeSelected(1, 0)}>→ Rechts</button>
            <button ?disabled=${!hasSel} @click=${() => this._nudgeSelected(0, -1)}>↑ Hoch</button>
            <button ?disabled=${!hasSel} @click=${() => this._nudgeSelected(0, 1)}>↓ Runter</button>
          </div>
        </div>

        <div class="tools-section">
          <div class="tools-label">Größe ändern</div>
          <div class="tools-row">
            <button ?disabled=${!hasSel} @click=${() => this._resizeSelected(1, 0)}>＋ W</button>
            <button ?disabled=${!hasSel} @click=${() => this._resizeSelected(-1, 0)}>－ W</button>
            <button ?disabled=${!hasSel} @click=${() => this._resizeSelected(0, 1)}>＋ H</button>
            <button ?disabled=${!hasSel} @click=${() => this._resizeSelected(0, -1)}>－ H</button>
          </div>
        </div>

        <div class="tools-section">
          <div class="tools-label">Ausrichten (2+ Widgets)</div>
          <div class="tools-row">
            <button ?disabled=${multi < 2} @click=${() => this._alignEdge("left")}>⇤ Links</button>
            <button ?disabled=${multi < 2} @click=${() => this._alignEdge("center-x")}>↔ Mitte</button>
            <button ?disabled=${multi < 2} @click=${() => this._alignEdge("right")}>⇥ Rechts</button>
            <button ?disabled=${multi < 2} @click=${() => this._alignEdge("top")}>⇡ Oben</button>
            <button ?disabled=${multi < 2} @click=${() => this._alignEdge("center-y")}>↕ Mitte</button>
            <button ?disabled=${multi < 2} @click=${() => this._alignEdge("bottom")}>⇣ Unten</button>
          </div>
        </div>

        <div class="tools-section">
          <div class="tools-label">Größe angleichen / Verteilen</div>
          <div class="tools-row">
            <button ?disabled=${multi < 2} @click=${() => this._alignSize("width")}>▭ Breite</button>
            <button ?disabled=${multi < 2} @click=${() => this._alignSize("height")}>▯ Höhe</button>
            <button ?disabled=${multi < 3} @click=${() => this._distribute("x")}>⋯ X</button>
            <button ?disabled=${multi < 3} @click=${() => this._distribute("y")}>⋮ Y</button>
          </div>
        </div>

        <div class="tools-section">
          <div class="tools-label">Ebenen</div>
          <div class="tools-row">
            <button ?disabled=${!hasSel} @click=${() => this._changeLayer(1)}>↑ Vor</button>
            <button ?disabled=${!hasSel} @click=${() => this._changeLayer(-1)}>↓ Zurück</button>
            <button ?disabled=${!hasSel} @click=${() => this._setLock(true)}>🔒 Sperren</button>
            <button ?disabled=${!hasSel} @click=${() => this._setLock(false)}>🔓 Entsperren</button>
          </div>
        </div>

        <div class="tools-section">
          <div class="tools-label">Tastenkürzel</div>
          <div style="font-size:11px;color:var(--secondary-text-color);line-height:1.6">
            <div>Ctrl+Z Rückgängig · Ctrl+Y Wiederholen</div>
            <div>Ctrl+D Duplizieren · Del Löschen</div>
            <div>Ctrl+A Alle auswählen · Esc Abwählen</div>
            <div>Pfeiltasten Bewegen · Ctrl+S Speichern</div>
            <div>Ctrl/Cmd+Klick Mehrfachauswahl</div>
          </div>
        </div>
      </div>
    `;
  }

  /* ══════════════════════════════════════════════════════════
     PALETTE
     ══════════════════════════════════════════════════════════ */

  _renderPalette() {
    const categories = this._getPaletteCategories();
    const total = categories.reduce((sum, c) => sum + c.items.length, 0);

    return html`
      <div class="pal">
        <div class="pal-tools">
          <input .value=${this._paletteQuery}
                 placeholder="Widget suchen..."
                 @input=${(e) => this._paletteQuery = e.target.value}>
          <div class="pal-chips">
            ${[
              ["all",       "Alle"],
              ["favorites", "★ Favoriten"],
              ["recent",    "⏱ Zuletzt"],
            ].map(([id, label]) => html`
              <button class="pal-chip ${this._paletteFilter === id ? "a" : ""}"
                      @click=${() => this._paletteFilter = id}>
                ${label}
              </button>
            `)}
          </div>
          <div class="pal-count">${total} Widgets</div>
        </div>

        ${categories.map((cat) => html`
          <details class="folder"
                   ?open=${this._paletteFolders[cat.name] !== false}
                   @toggle=${(e) => this._toggleFolder(cat.name, e.currentTarget.open)}>
            <summary>
              <div class="f-left">
                <span>${cat.name}</span>
                <span class="f-meta">${cat.items.length}</span>
              </div>
              <div class="f-icons">
                ${cat.items.slice(0, 4).map((it) => html`<span>${it.icon}</span>`)}
              </div>
            </summary>
            <div class="body">
              <div class="p-grid">
                ${cat.items.map((it) => html`
                  <div class="p-item"
                       draggable="true"
                       @dragstart=${(e) => {
                         this._dwt = it.type;
                         e.dataTransfer.setData("text/plain", it.type);
                         e.dataTransfer.effectAllowed = "copy";
                       }}
                       @dragend=${() => this._dwt = null}
                       @dblclick=${() => this._quickAddWidget(it.type)}>
                    <span class="p-icon">${it.icon}</span>
                    <div>
                      <div class="p-name">${it.label}</div>
                      <div class="p-desc">${it.desc}</div>
                    </div>
                    <button class="fav-btn ${this._isFavorite(it.type) ? "a" : ""}"
                            @click=${(e) => { e.stopPropagation(); this._toggleFavorite(it.type); }}>
                      ${this._isFavorite(it.type) ? "★" : "☆"}
                    </button>
                  </div>
                `)}
              </div>
            </div>
          </details>
        `)}
      </div>
    `;
  }

  _getPaletteCategories() {
    const settings = tdNormalizedDefaults(this.globalSettings || {});
    const uniqueByType = (items = []) => items.filter((item, index, arr) => arr.findIndex((x) => x.type === item.type) === index);
    const enabled = (items = []) => uniqueByType(items.filter((item) => item.type.startsWith("saved-template:") || tdWidgetEnabled(settings, item.type)));

    const userTemplates = Object.entries(this.templates || {})
      .filter(([, t]) => t?.screen_config)
      .map(([id, t]) => ({
        type: `saved-template:${id}`, icon: "📋",
        label: t.name || id,
        desc: `${t.category || "custom"} · ${(t.screen_config?.widgets?.length || 0)} Widgets`,
      }));

    const raw = [
      { name: "📁 Werte & Status", items: enabled(
        TD_VALUE_STATUS_WIDGETS.map(([type, icon, label, desc]) => ({ type, icon, label, desc }))
      )},
      { name: "📁 Graphen & Charts", items: enabled(
        TD_CHART_WIDGETS.map(([type, icon, label]) => ({ type, icon, label, desc: "Chart.js Widget" }))
      )},
      { name: "📁 Steuerung & Smart Home", items: enabled(
        TD_SMART_HOME_WIDGETS.map(([type, icon, label, desc]) => ({ type, icon, label, desc }))
      )},
      { name: "📁 Medien & Kamera", items: enabled([
        { type: "camera", icon: "📹", label: "Kamera", desc: "Snapshot, Proxy oder Stream" },
        { type: "image",  icon: "🖼️", label: "Bild",   desc: "Lokale oder HA-Medienbilder" },
      ])},
      { name: "📁 Uhr, Wetter & Info", items: enabled([
        { type: "clock",     icon: "🕐", label: "Uhr",       desc: "Zeit und Datum" },
        { type: "weather",   icon: "🌦️", label: "Wetter",    desc: "Wetter-Entity mit Übersicht" },
        { type: "countdown", icon: "⏱️", label: "Countdown", desc: "Ereignis oder Zielzeit" },
        { type: "qr-code",   icon: "🔳", label: "QR-Code",   desc: "Link, Text oder WLAN" },
        { type: "button",    icon: "🔘", label: "Button",    desc: "Touch-Aktion, Screen oder URL" },
        { type: "color-block", icon: "🟦", label: "Farbblock", desc: "Dekorativer Block / Platzhalter" },
      ])},
      { name: "📁 HA Presets", items: [
        { type: "preset-energy",  icon: "⚡", label: "Energie",  desc: "Leistungs- oder Energiesensor" },
        { type: "preset-person",  icon: "👤", label: "Personen", desc: "Anwesenheit und Status" },
        { type: "preset-doors",   icon: "🚪", label: "Türen",    desc: "Öffnungssensoren" },
        { type: "preset-battery", icon: "🔋", label: "Batterie", desc: "Akkustand" },
        { type: "preset-media",   icon: "🎵", label: "Medien",   desc: "Titel und Wiedergabe" },
        { type: "preset-climate", icon: "🌡️", label: "Klima",    desc: "Thermostat / Temperatur" },
        { type: "preset-light",   icon: "💡", label: "Licht",    desc: "Lichtstatus und Helligkeit" },
        { type: "preset-alarm",   icon: "🛡️", label: "Alarm",    desc: "Sicherheitsstatus" },
        { type: "preset-cover",   icon: "🪟", label: "Rollladen",desc: "Cover-Position" },
        { type: "preset-vacuum",  icon: "🧹", label: "Sauger",   desc: "Roboterstatus" },
        { type: "preset-network", icon: "📶", label: "Netzwerk", desc: "WLAN, Ping, Router" },
      ]},
      { name: "📁 Screen-Vorlagen", items: [
        { type: "ha-template-home",     icon: "🏠", label: "Home",       desc: "Wetter, Uhr, Status" },
        { type: "ha-template-energy",   icon: "⚡", label: "Energie",    desc: "Verbrauchsübersicht" },
        { type: "ha-template-security", icon: "🚨", label: "Sicherheit", desc: "Kontakte, Alarm" },
        { type: "ha-template-family",   icon: "👨‍👩‍👧", label: "Familie",  desc: "Personen, Kalender" },
        { type: "ha-template-media",    icon: "📺", label: "Medien",     desc: "Player und Cover" },
      ]},
    ];

    if (userTemplates.length) {
      raw.unshift({ name: "📁 Gespeicherte Templates", items: userTemplates });
    }

    return raw
      .map((cat) => ({ ...cat, items: uniqueByType(cat.items) }))
      .filter((cat) => cat.items.length > 0);
  }

  _isFavorite(type) { return (this._favoriteWidgets || []).includes(type); }
  _isRecent(type) { return (this._recentWidgets || []).includes(type); }

  _toggleFavorite(type) {
    const set = new Set(this._favoriteWidgets || []);
    if (set.has(type)) set.delete(type); else set.add(type);
    this._favoriteWidgets = [...set];
    lsSet("td_widget_favorites", this._favoriteWidgets);
  }

  _rememberWidget(type) {
    const list = [type, ...(this._recentWidgets || []).filter((x) => x !== type)].slice(0, 10);
    this._recentWidgets = list;
    lsSet("td_widget_recent", list);
  }

  _toggleFolder(name, open) {
    this._paletteFolders = { ...(this._paletteFolders || {}), [name]: open };
    lsSet("td_palette_folders", this._paletteFolders);
  }

  /* ══════════════════════════════════════════════════════════
     PREVIEW
     ══════════════════════════════════════════════════════════ */

  _renderPreview() {
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    const widgets = this._cfg.widgets || [];

    // Track occupied cells
    const occupied = new Set();
    for (const w of widgets) {
      for (let r = w.row || 0; r < (w.row || 0) + (w.rowspan || 1); r++) {
        for (let c = w.col || 0; c < (w.col || 0) + (w.colspan || 1); c++) {
          occupied.add(`${c},${r}`);
        }
      }
    }

    // Build elements
    const elements = [];

    // Widgets
    for (let i = 0; i < widgets.length; i++) {
      elements.push(this._renderWidgetBox(widgets[i], i));
    }

    // Empty cells (drop targets)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!occupied.has(`${c},${r}`)) {
          elements.push(html`
            <div class="gc ${this._grid ? "sg" : ""}"
                 style="grid-column:${c + 1};grid-row:${r + 1}"
                 @dragover=${(e) => { e.preventDefault(); e.currentTarget.classList.add("drop-over"); }}
                 @dragleave=${(e) => e.currentTarget.classList.remove("drop-over")}
                 @drop=${(e) => { e.preventDefault(); e.currentTarget.classList.remove("drop-over"); this._onCellDrop(c, r); }}>
            </div>
          `);
        }
      }
    }

    // Snap guides
    const guides = [];
    if (this._snap) {
      for (let c = 1; c < cols; c++) {
        guides.push(html`<div class="g-v" style="left:${(c / cols) * 100}%"></div>`);
      }
      for (let r = 1; r < rows; r++) {
        guides.push(html`<div class="g-h" style="top:${(r / rows) * 100}%"></div>`);
      }
    }

    // Background style
    const bgStyle = this._getScreenBgStyle();

    // Ticker preview
    const tickerStyle = this._cfg.ticker_style || {};

    return html`
      <div class="pva"
           @click=${(e) => {
             if (e.target.classList.contains("pva") || e.target.classList.contains("pg")) {
               this._sel = -1;
               this._selMulti = [];
             }
           }}>
        <div class="pf ${this._prev === "landscape" ? "l" : "p"}" style="${bgStyle}">
          <div class="pg"
               style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">
            ${elements}
          </div>
          ${this._snap ? html`<div class="guides">${guides}</div>` : ""}
          <div class="ptk"
               style="height:${tickerStyle.height || this.globalSettings?.default_ticker_height || 36}px;
                      font-size:${tickerStyle.font_size || 12}px;
                      background:${tickerStyle.background_color || "rgba(12,18,28,.72)"};
                      color:${tickerStyle.text_color || "#e8eef7"};
                      opacity:${tickerStyle.opacity || 1};
                      border-radius:${tickerStyle.border_radius || 0}px">
            ${(tickerStyle.fixed_messages || ["Ticker-Leiste"]).slice(0, 2)
              .join(` ${tickerStyle.separator || "│"} `)}
          </div>
        </div>
      </div>
    `;
  }

  _renderWidgetBox(w, i) {
    const st = this.hass?.states?.[w.entity_id] || {};
    const value = st?.state || "—";
    const unit = st?.attributes?.unit_of_measurement || "";
    const name = w.name || st?.attributes?.friendly_name || w.type || "";
    const icon = TD_WIDGET_TYPE_ICONS[w.type] || "📊";
    const isSel = this._sel === i;
    const isMulti = (this._selMulti || []).includes(i) && !isSel;
    const extras = (w.config?.entities || []).slice(0, 3);

    return html`
      <div class="wb ${isSel ? "sel" : ""} ${isMulti ? "ms" : ""} ${w.locked ? "locked" : ""}"
           style="grid-column:${(w.col || 0) + 1}/span ${w.colspan || 1};
                  grid-row:${(w.row || 0) + 1}/span ${w.rowspan || 1};
                  ${tdWidgetPreviewStyle(w)}
                  z-index:${w.z_index || i + 1};"
           @click=${(e) => this._onWidgetClick(i, e)}
           @pointerdown=${(e) => this._onWidgetPointerDown(e, i)}
           draggable="${!w.locked ? "true" : "false"}"
           @dragstart=${(e) => {
             if (w.locked) { e.preventDefault(); return; }
             e.dataTransfer.setData("widget-index", String(i));
             e.dataTransfer.effectAllowed = "move";
           }}>

        ${w.group ? html`<span class="group-badge">${w.group}</span>` : ""}
        <span class="layer-badge">
          L${w.z_index || i + 1}${w.locked ? " 🔒" : ""}
        </span>

        ${this._renderEditorWidgetPreview(w, st, value, unit, name, icon, extras)}

        ${isSel && !w.locked ? html`
          <span class="rh e"  @pointerdown=${(e) => this._onResizeStart(e, i, "e")}></span>
          <span class="rh s"  @pointerdown=${(e) => this._onResizeStart(e, i, "s")}></span>
          <span class="rh se" @pointerdown=${(e) => this._onResizeStart(e, i, "se")}></span>
        ` : ""}
      </div>
    `;
  }

  _getScreenBgStyle() {
    const cfg = this._cfg;
    let style = `background-color:${cfg.background_color || "#121212"};`;
    if (cfg.background_image) {
      const shade = Math.max(0, Math.min(1, 1 - Number(cfg.background_overlay_opacity ?? 1)));
      style += `background-image:linear-gradient(rgba(0,0,0,${shade}),rgba(0,0,0,${shade})),url(${cfg.background_image});`;
      style += `background-size:100% 100%,${cfg.background_image_size || "cover"};`;
      style += `background-position:center;background-repeat:no-repeat;`;
    }
    return style;
  }

  _editorCameraPreviewUrl(w) {
    const entityId = w.entity_id || w.config?.camera_entity || "";
    if (!entityId) return "";
    const preferred = w.config?.camera_source || this.globalSettings?.default_camera_source || "auto";
    const liveMode = (w.config?.camera_view || "still") === "live";
    const mode = liveMode
      ? (preferred === "auto" ? "camera_proxy_stream" : preferred)
      : (preferred === "auto" ? "camera_proxy" : preferred);
    return `${API}/api/image/camera/${encodeURIComponent(entityId)}?mode=${encodeURIComponent(mode)}&t=${Date.now()}`;
  }

  _editorWidgetNumeric(value, fallback = 0) {
    const n = Number.parseFloat(String(value).replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }


  _editorMetricPreviewKey(w) {
    const entityId = w?.entity_id || "";
    const hours = Number(w?.config?.metric_graph_hours || w?.config?.hours || this.globalSettings?.default_chart_hours || 24);
    const points = Math.max(8, Math.min(32, Number(w?.config?.metric_graph_points || 18)));
    return `${entityId}|${hours}|${points}`;
  }

  _editorMetricPreviewPoints(raw) {
    const arr = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw?.[0]) ? raw[0] : (Array.isArray(raw) ? raw : []));
    return (arr || []).map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      if (entry.y != null) {
        const y = Number(entry.y);
        return Number.isFinite(y) ? { x: entry.x || entry.last_changed || entry.last_updated || "", y } : null;
      }
      const y = Number(String(entry.state ?? "").replace(",", "."));
      return Number.isFinite(y) ? { x: entry.last_changed || entry.last_updated || "", y } : null;
    }).filter(Boolean);
  }

  async _fetchEditorMetricPreview(w) {
    const entityId = w?.entity_id || "";
    if (!entityId) return;
    const key = this._editorMetricPreviewKey(w);
    const cached = this._metricPreviewCache?.[key];
    if (this._metricPreviewInflight?.[key]) return;
    if (cached?.t && Date.now() - cached.t < 60000) return;
    const hours = Number(w?.config?.metric_graph_hours || w?.config?.hours || this.globalSettings?.default_chart_hours || 24);
    this._metricPreviewInflight[key] = true;
    try {
      const resp = await fetch(`${API}/api/history/${encodeURIComponent(entityId)}?hours=${encodeURIComponent(hours)}`, { credentials: "same-origin" });
      const raw = resp.ok ? await resp.json() : { data: [] };
      const pts = this._editorMetricPreviewPoints(raw).slice(-Math.max(8, Math.min(32, Number(w?.config?.metric_graph_points || 18))));
      this._metricPreviewCache = { ...(this._metricPreviewCache || {}), [key]: { t: Date.now(), data: pts } };
    } catch (err) {
      this._metricPreviewCache = { ...(this._metricPreviewCache || {}), [key]: { t: Date.now(), data: [] } };
      console.warn("metric preview history failed", entityId, err);
    } finally {
      delete this._metricPreviewInflight[key];
      this.requestUpdate();
    }
  }

  _editorMetricPreviewSvg(w) {
    if (w?.config?.metric_graph === false) return "";
    const key = this._editorMetricPreviewKey(w);
    const cached = this._metricPreviewCache?.[key];
    if (!cached && w?.entity_id) this._fetchEditorMetricPreview(w);
    const values = (cached?.data || []).map((entry) => Number(entry?.y)).filter((value) => Number.isFinite(value));
    const width = 180;
    const height = 42;
    const pad = 4;
    if (!values.length) {
      return `<svg class="pv-chart-svg is-placeholder" viewBox="0 0 ${width} ${height}" aria-hidden="true"><rect class="pv-chart-grid" x="${pad}" y="12" width="${width - (pad * 2)}" height="2" rx="2"></rect><rect class="pv-chart-grid" x="${pad}" y="26" width="${Math.round((width - (pad * 2)) * 0.72)}" height="2" rx="2"></rect></svg>`;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = (max - min) || 1;
    const coords = values.map((value, index) => {
      const x = pad + ((width - (pad * 2)) * (index / Math.max(1, values.length - 1)));
      const y = (height - pad) - (((value - min) / span) * (height - (pad * 2)));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const fill = [`${pad},${height - pad}`, ...coords, `${width - pad},${height - pad}`].join(" ");
    const [lastX, lastY] = coords[coords.length - 1].split(",");
    return `<svg class="pv-chart-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polygon class="pv-chart-fill" points="${fill}"></polygon><polyline class="pv-chart-line" points="${coords.join(" ")}"></polyline><circle class="pv-chart-dot" cx="${lastX}" cy="${lastY}" r="2.8"></circle></svg>`;
  }

  _renderEditorMetricChart(w) {
    if (w?.config?.metric_graph === false) return html``;
    return html`<div class="pv-chart-lines pv-chart-live" .innerHTML=${this._editorMetricPreviewSvg(w)}></div>`;
  }

  _renderEditorWidgetPreview(w, st, value, unit, name, icon, extras = []) {
    const attrs = st?.attributes || {};
    const valText = `${value}${unit ? ` ${unit}` : ""}`;
    const fallbackTitle = name || w.type || "Widget";

    if (w.type === "camera") {
      const src = this._editorCameraPreviewUrl(w);
      return html`
        <div class="pv">
          ${src ? html`<img class="pv-cam" src=${src} alt="Kamera" @error=${(e) => {
            const entityId = w.entity_id || w.config?.camera_entity || "";
            if (!entityId || e.currentTarget.dataset.fallback === "1") return;
            e.currentTarget.dataset.fallback = "1";
            e.currentTarget.src = `${API}/api/image/camera/${encodeURIComponent(entityId)}?mode=camera_proxy&t=${Date.now()}`;
          }}>` : html`<div class="pv-placeholder">📹</div>`}
          <div class="pv-cam-fade"></div>
          <div class="pv-overlay">
            <div class="pv-title">${fallbackTitle}</div>
            <div class="pv-sub">${w.entity_id || w.config?.camera_entity || "Keine Kamera"}</div>
          </div>
        </div>
      `;
    }

    if (w.type === "gauge") {
      const min = Number(w.config?.min ?? 0);
      const max = Number(w.config?.max ?? 100);
      const pct = Math.max(0, Math.min(100, ((this._editorWidgetNumeric(value, 0) - min) / Math.max(1, max - min)) * 100));
      return html`<div class="pv"><div class="pv-head"><span class="pv-title">${fallbackTitle}</span><span class="pv-icon">${icon}</span></div><div class="pv-value">${valText}</div><div class="pv-meter"><span style="width:${pct}%"></span></div>${this._renderEditorMetricChart(w)}<div class="pv-sub">Gauge ${Math.round(pct)}%</div></div>`;
    }

    if (w.type === "progress-bar") {
      const min = Number(w.config?.min ?? 0);
      const max = Number(w.config?.max ?? 100);
      const pct = Math.max(0, Math.min(100, ((this._editorWidgetNumeric(value, 0) - min) / Math.max(1, max - min)) * 100));
      return html`<div class="pv"><div class="pv-head"><span class="pv-title">${fallbackTitle}</span><span class="pv-icon">${icon}</span></div><div class="pv-value">${valText}</div><div class="pv-meter"><span style="width:${pct}%"></span></div>${this._renderEditorMetricChart(w)}<div class="pv-sub">Fortschritt ${Math.round(pct)}%</div></div>`;
    }

    if (w.type === "status-dot") {
      const isOn = ["on","open","home","playing","true","1","heat","cool"].includes(String(value).toLowerCase());
      return html`<div class="pv"><div class="pv-head"><span class="pv-title">${fallbackTitle}</span><span class="pv-dot ${isOn ? "on" : "off"}"></span></div><div class="pv-value">${isOn ? "Aktiv" : "Inaktiv"}</div>${this._renderEditorMetricChart(w)}<div class="pv-sub">${String(value || "—")}</div></div>`;
    }

    if (w.type === "trend-arrow") {
      const numeric = this._editorWidgetNumeric(value, 0);
      const direction = numeric > 0 ? "up" : numeric < 0 ? "down" : "flat";
      const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "▶";
      return html`<div class="pv"><div class="pv-head"><span class="pv-title">${fallbackTitle}</span><span class="pv-icon">${icon}</span></div><div class="pv-value">${valText}</div><div class="pv-trend ${direction}">${arrow} Trend</div>${this._renderEditorMetricChart(w)}</div>`;
    }

    if (w.type === "simple-value" || w.type === "icon-value") {
      return html`<div class="pv"><div class="pv-head"><span class="pv-title">${fallbackTitle}</span><span class="pv-icon">${icon}</span></div><div class="pv-value">${valText}</div>${this._renderEditorMetricChart(w)}<div class="pv-sub">${extras.length ? `+ ${extras.join(" · ")}` : (attrs.friendly_name || w.entity_id || "")}</div></div>`;
    }

    if (w.type === "media-player-control") {
      const compact = (w.config?.control_layout || "compact") !== "card";
      const showIcon = w.config?.control_show_icon !== false;
      const showName = w.config?.control_show_name !== false;
      const showValue = w.config?.control_show_value !== false;
      const showSub = w.config?.control_show_sub !== false;
      const showMeter = w.config?.control_show_meter !== false;
      const showChip = w.config?.control_show_status_chip !== false;
      const cover = attrs.entity_picture || "";
      const title = attrs.media_title || value || "—";
      const artist = attrs.media_artist || attrs.source || attrs.friendly_name || "";
      const vol = Math.round(Number(attrs.volume_level || 0) * 100);
      const actions = compact ? ["Play", "Öffnen"] : ["Play", "Weiter", "Öffnen"];
      if (compact) {
        return html`<div class="pv pv-control-card pv-control-compact"><div class="pv-compact-shell">${showIcon ? html`<div class="pv-compact-icon">${cover ? html`<img src=${cover} alt="Cover">` : "🎵"}</div>` : ""}${showName ? html`<div class="pv-title">${fallbackTitle}</div>` : ""}${showValue ? html`<div class="pv-value">${title}</div>` : ""}${showChip ? html`<div class="pv-compact-chip">🔊 ${vol}%</div>` : html`<div class="pv-sub">Touch-Steuerung</div>`}<div class="pv-action-row">${actions.map((label, index) => html`<span class="pv-action ${index === 0 ? 'primary grow' : 'grow'}">${label}</span>`)}</div></div></div>`;
      }
      return html`<div class="pv pv-control-card"><div class="pv-control-top">${showIcon ? html`<div class="pv-control-icon">${cover ? html`<img src=${cover} alt="Cover">` : "🎵"}</div>` : ""}<div class="pv-control-main">${showName ? html`<div class="pv-title">${fallbackTitle}</div>` : ""}${showValue ? html`<div class="pv-value">${title}</div>` : ""}${showSub ? html`<div class="pv-sub">${artist}</div>` : ""}</div>${showChip ? html`<div class="pv-chip on">🔊 ${vol}%</div>` : ""}</div>${showMeter ? html`<div class="pv-meter"><span style="width:${vol}%"></span></div>` : ""}<div class="pv-action-row">${actions.map((label, index) => html`<span class="pv-action ${index === 1 ? 'primary' : ''}">${label}</span>`)}</div></div>`;
    }

    if (w.type === "switch-control" || w.type === "light-control" || w.type === "climate-control" || w.type === "cover-control") {
      const compact = (w.config?.control_layout || "compact") !== "card";
      const showIcon = w.config?.control_show_icon !== false;
      const showName = w.config?.control_show_name !== false;
      const showValue = w.config?.control_show_value !== false;
      const showSub = w.config?.control_show_sub !== false;
      const showMeter = w.config?.control_show_meter !== false;
      const showChip = w.config?.control_show_status_chip !== false;
      let main = valText;
      let sub = attrs.friendly_name || w.entity_id || "";
      let pct = 0;
      let chip = String(value || "—");
      let chipClass = "off";
      let actions = ["Details"];
      if (w.type === "light-control") {
        pct = attrs.brightness == null ? 0 : Math.round((Number(attrs.brightness || 0) / 255) * 100);
        main = (String(value).toLowerCase() === "on") ? `${pct || 100}%` : "Aus";
        sub = attrs.color_mode || "Licht";
        chip = String(value).toLowerCase() === "on" ? "Licht an" : "Aus";
        chipClass = String(value).toLowerCase() === "on" ? "on" : "off";
        actions = compact ? [chipClass === 'on' ? 'Aus' : 'Ein', 'Öffnen'] : [chipClass === 'on' ? 'Aus' : 'Ein', '+', 'Öffnen'];
      } else if (w.type === "climate-control") {
        main = `${attrs.current_temperature ?? "—"}°C`;
        sub = `Soll ${attrs.temperature ?? "—"}°C · ${value || "—"}`;
        pct = Number.isFinite(Number(attrs.temperature)) ? Math.max(0, Math.min(100, (Number(attrs.temperature) / 30) * 100)) : 0;
        chip = String(value || "Klima");
        chipClass = String(value || '').toLowerCase() === 'off' ? 'off' : 'on';
        actions = compact ? ['+1°', 'Öffnen'] : ['−1°', '+1°', 'Öffnen'];
      } else if (w.type === "cover-control") {
        pct = Number(attrs.current_position ?? 0);
        main = Number.isFinite(pct) ? `${pct}%` : String(value || "—");
        sub = String(value || "Rollladen");
        chip = pct > 10 ? "Offen" : "Zu";
        chipClass = pct > 10 ? 'on' : 'off';
        actions = compact ? ['Stopp', 'Öffnen'] : ['Öffnen', 'Stopp', 'Öffnen'];
      } else {
        const on = ["on","open","home","playing","true","1"].includes(String(value).toLowerCase());
        main = on ? "Ein" : "Aus";
        pct = on ? 100 : 0;
        sub = String(value || "Schalter");
        chip = on ? "Aktiv" : "Aus";
        chipClass = on ? 'on' : 'off';
        actions = compact ? [on ? 'Aus' : 'Ein', 'Öffnen'] : [on ? 'Ausschalten' : 'Einschalten', 'Öffnen'];
      }
      if (compact) {
        return html`<div class="pv pv-control-card pv-control-compact"><div class="pv-compact-shell">${showIcon ? html`<div class="pv-compact-icon">${icon}</div>` : ""}${showName ? html`<div class="pv-title">${fallbackTitle}</div>` : ""}${showValue ? html`<div class="pv-value">${main}</div>` : ""}${showChip ? html`<div class="pv-compact-chip">${chip}</div>` : html`<div class="pv-sub">Touch-Steuerung</div>`}<div class="pv-action-row">${actions.map((label, index) => html`<span class="pv-action ${index === 0 ? 'primary grow' : 'grow'}">${label}</span>`)}</div></div></div>`;
      }
      return html`<div class="pv pv-control-card"><div class="pv-control-top">${showIcon ? html`<div class="pv-control-icon">${icon}</div>` : ""}<div class="pv-control-main">${showName ? html`<div class="pv-title">${fallbackTitle}</div>` : ""}${showValue ? html`<div class="pv-value">${main}</div>` : ""}${showSub ? html`<div class="pv-sub">${sub}</div>` : ""}</div>${showChip ? html`<div class="pv-chip ${chipClass}">${chip}</div>` : ""}</div>${showMeter ? html`<div class="pv-meter"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>` : ""}<div class="pv-action-row">${actions.map((label, index) => html`<span class="pv-action ${index === 0 ? 'primary' : ''} ${label.length > 7 ? 'grow' : ''}">${label}</span>`)}</div></div>`;
    }

    return html`
      <div class="pv">
        <div class="pv-head"><span class="pv-title">${fallbackTitle}</span><span class="pv-icon">${icon}</span></div>
        <div class="pv-value">${valText}</div>
        <div class="pv-sub">${extras.length ? `+ ${extras.join(" · ")}` : (attrs.friendly_name || w.entity_id || "")}</div>
      </div>
    `;
  }

  /* ══════════════════════════════════════════════════════════
     WIDGET INTERACTION (Preview)
     ══════════════════════════════════════════════════════════ */

  _onWidgetClick(i, e) {
    if (e.ctrlKey || e.metaKey) {
      const set = new Set(this._selMulti || []);
      if (set.has(i)) set.delete(i); else set.add(i);
      this._selMulti = [...set].sort((a, b) => a - b);
      this._sel = this._selMulti.length ? this._selMulti[this._selMulti.length - 1] : -1;
    } else {
      this._sel = i;
      this._selMulti = [i];
    }
  }

  _onWidgetPointerDown(e, index) {
    if (e.target?.classList?.contains("rh")) return;
    const w = this._cfg?.widgets?.[index];
    if (!w || w.locked || e.button !== 0) return;

    const grid = this.renderRoot?.querySelector(".pg");
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    const cw = rect.width / cols;
    const ch = rect.height / rows;

    const idxs = this._getSelectedIndices();
    const base = idxs.map((idx) => ({
      idx,
      col: this._cfg.widgets[idx]?.col || 0,
      row: this._cfg.widgets[idx]?.row || 0,
    }));
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const onMove = (ev) => {
      const dc = Math.round((ev.clientX - startX) / cw);
      const dr = Math.round((ev.clientY - startY) / ch);
      if (dc === 0 && dr === 0 && !moved) return;
      if (!moved) { this._pushUndo(); moved = true; }

      const ws = [...(this._cfg.widgets || [])];
      for (const item of base) {
        const src = ws[item.idx];
        if (!src || src.locked) continue;
        ws[item.idx] = {
          ...src,
          col: Math.max(0, Math.min(cols - (src.colspan || 1), item.col + dc)),
          row: Math.max(0, Math.min(rows - (src.rowspan || 1), item.row + dr)),
        };
      }
      this._cfg = { ...this._cfg, widgets: ws };
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  _onResizeStart(e, index, direction) {
    e.stopPropagation();
    e.preventDefault();
    const w = this._cfg?.widgets?.[index];
    if (!w || w.locked) return;

    const grid = this.renderRoot?.querySelector(".pg");
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    const cw = rect.width / cols;
    const ch = rect.height / rows;
    const startX = e.clientX;
    const startY = e.clientY;
    const base = { colspan: w.colspan || 1, rowspan: w.rowspan || 1 };
    let resized = false;

    const onMove = (ev) => {
      const dc = Math.round((ev.clientX - startX) / cw);
      const dr = Math.round((ev.clientY - startY) / ch);
      if (!resized) { this._pushUndo(); resized = true; }

      const ws = [...(this._cfg.widgets || [])];
      const cur = { ...ws[index] };
      if (direction === "e" || direction === "se") {
        cur.colspan = Math.max(1, Math.min(cols - (cur.col || 0), base.colspan + dc));
      }
      if (direction === "s" || direction === "se") {
        cur.rowspan = Math.max(1, Math.min(rows - (cur.row || 0), base.rowspan + dr));
      }
      ws[index] = cur;
      this._cfg = { ...this._cfg, widgets: ws };
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /* ══════════════════════════════════════════════════════════
     WIDGET OPERATIONS
     ══════════════════════════════════════════════════════════ */

  _getSelectedIndices() {
    if ((this._selMulti || []).length > 0) {
      return [...new Set(this._selMulti)].sort((a, b) => a - b);
    }
    return this._sel >= 0 ? [this._sel] : [];
  }

  _findNextFreeCell() {
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    const widgets = this._cfg.widgets || [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const taken = widgets.some((w) =>
          c >= (w.col || 0) && c < (w.col || 0) + (w.colspan || 1) &&
          r >= (w.row || 0) && r < (w.row || 0) + (w.rowspan || 1)
        );
        if (!taken) return { c, r };
      }
    }
    return { c: 0, r: 0 };
  }

  _quickAddWidget(type) {
    if (type.startsWith("preset-")) return this._applyPreset(type);
    if (type.startsWith("ha-template-")) return this._applyTemplate(type);
    if (type.startsWith("saved-template:")) return this._applySavedTemplate(type.split(":").slice(1).join(":"));

    const { c, r } = this._findNextFreeCell();
    this._pushUndo();
    const ws = [...(this._cfg.widgets || [])];
    const nw = tdCreateWidget(type, c, r, this.globalSettings || {});
    if (TD_CHART_TYPES.has(type)) {
      nw.config = { ...(nw.config || {}), chart_use_history: true, hours: 24, chart_max_points: 48 };
    }
    ws.push(nw);
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = ws.length - 1;
    this._selMulti = [this._sel];
    this._rememberWidget(type);
  }

  _onCellDrop(col, row) {
    if (!this._dwt) return;
    if (this._dwt.startsWith("preset-") || this._dwt.startsWith("ha-template-") || this._dwt.startsWith("saved-template:")) {
      this._quickAddWidget(this._dwt);
      this._dwt = null;
      return;
    }
    this._pushUndo();
    const ws = [...(this._cfg.widgets || [])];
    const nw = tdCreateWidget(this._dwt, col, row, this.globalSettings || {});
    if (TD_CHART_TYPES.has(this._dwt)) {
      nw.config = { ...(nw.config || {}), chart_use_history: true, hours: 24, chart_max_points: 48 };
    }
    ws.push(nw);
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = ws.length - 1;
    this._selMulti = [this._sel];
    this._rememberWidget(this._dwt);
    this._dwt = null;
  }

  _duplicateSelected() {
    const idxs = this._getSelectedIndices();
    if (!idxs.length) return;
    this._pushUndo();
    const ws = [...(this._cfg.widgets || [])];
    const newIdxs = [];
    for (const idx of idxs) {
      const src = ws[idx];
      if (!src) continue;
      const copy = deepClone(src);
      copy.id = uniqueId("w");
      copy.col = Math.max(0, (src.col || 0) + 1);
      copy.row = Math.max(0, (src.row || 0));
      ws.push(copy);
      newIdxs.push(ws.length - 1);
      this._rememberWidget(copy.type);
    }
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = newIdxs.length ? newIdxs[newIdxs.length - 1] : -1;
    this._selMulti = newIdxs;
  }

  _deleteSelected() {
    const idxs = this._getSelectedIndices();
    if (!idxs.length) return;
    this._pushUndo();
    const ws = (this._cfg.widgets || []).filter((_, i) => !idxs.includes(i));
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = -1;
    this._selMulti = [];
  }

  _nudgeSelected(dx, dy) {
    const idxs = this._getSelectedIndices();
    if (!idxs.length) return;
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    this._pushUndo();
    const ws = [...(this._cfg.widgets || [])];
    for (const i of idxs) {
      const w = ws[i];
      if (!w || w.locked) continue;
      ws[i] = {
        ...w,
        col: Math.max(0, Math.min(cols - (w.colspan || 1), (w.col || 0) + dx)),
        row: Math.max(0, Math.min(rows - (w.rowspan || 1), (w.row || 0) + dy)),
      };
    }
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _resizeSelected(dw, dh) {
    const idxs = this._getSelectedIndices();
    if (!idxs.length) return;
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    this._pushUndo();
    const ws = [...(this._cfg.widgets || [])];
    for (const i of idxs) {
      const w = ws[i];
      if (!w || w.locked) continue;
      ws[i] = {
        ...w,
        colspan: Math.max(1, Math.min(cols - (w.col || 0), (w.colspan || 1) + dw)),
        rowspan: Math.max(1, Math.min(rows - (w.row || 0), (w.rowspan || 1) + dh)),
      };
    }
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _alignEdge(mode) {
    const idxs = this._getSelectedIndices();
    if (idxs.length < 2) return;
    this._pushUndo();
    const ws = [...(this._cfg.widgets || [])];
    const ref = ws[idxs[0]];
    const refL = ref.col || 0;
    const refR = refL + (ref.colspan || 1);
    const refT = ref.row || 0;
    const refB = refT + (ref.rowspan || 1);
    const refCx = refL + (ref.colspan || 1) / 2;
    const refCy = refT + (ref.rowspan || 1) / 2;

    for (const i of idxs) {
      const w = ws[i];
      const sx = w.colspan || 1;
      const sy = w.rowspan || 1;
      switch (mode) {
        case "left":     ws[i] = { ...w, col: refL }; break;
        case "right":    ws[i] = { ...w, col: Math.max(0, refR - sx) }; break;
        case "top":      ws[i] = { ...w, row: refT }; break;
        case "bottom":   ws[i] = { ...w, row: Math.max(0, refB - sy) }; break;
        case "center-x": ws[i] = { ...w, col: Math.max(0, Math.round(refCx - sx / 2)) }; break;
        case "center-y": ws[i] = { ...w, row: Math.max(0, Math.round(refCy - sy / 2)) }; break;
      }
    }
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _alignSize(kind) {
    const idxs = this._getSelectedIndices();
    if (idxs.length < 2) return;
    this._pushUndo();
    const ws = [...(this._cfg.widgets || [])];
    const key = kind === "width" ? "colspan" : "rowspan";
    const value = ws[idxs[0]]?.[key] || 1;
    for (const i of idxs) ws[i] = { ...ws[i], [key]: value };
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _distribute(axis) {
    const idxs = this._getSelectedIndices();
    if (idxs.length < 3) return;
    this._pushUndo();
    const ws = [...(this._cfg.widgets || [])];
    const key = axis === "x" ? "col" : "row";
    const ordered = [...idxs].sort((a, b) => (ws[a][key] || 0) - (ws[b][key] || 0));
    const first = ws[ordered[0]][key] || 0;
    const last = ws[ordered[ordered.length - 1]][key] || 0;
    const step = (last - first) / (ordered.length - 1 || 1);
    ordered.forEach((idx, pos) => {
      ws[idx] = { ...ws[idx], [key]: Math.max(0, Math.round(first + step * pos)) };
    });
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _changeLayer(delta) {
    const idxs = this._getSelectedIndices();
    if (!idxs.length) return;
    this._pushUndo();
    const ws = [...(this._cfg.widgets || [])];
    for (const i of idxs) {
      ws[i] = { ...ws[i], z_index: Math.max(1, (ws[i].z_index || (i + 1)) + delta) };
    }
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _setLock(locked) {
    const idxs = this._getSelectedIndices();
    if (!idxs.length) return;
    this._pushUndo();
    const ws = [...(this._cfg.widgets || [])];
    for (const i of idxs) ws[i] = { ...ws[i], locked };
    this._cfg = { ...this._cfg, widgets: ws };
  }

  /* ══════════════════════════════════════════════════════════
     PRESETS & TEMPLATES
     ══════════════════════════════════════════════════════════ */

  _applyPreset(type) {
    const presetMap = {
      "preset-energy":  { widget: "comparison-chart", domain: "sensor",    match: ["power","energy","verbrauch","leistung"] },
      "preset-person":  { widget: "status-dot",       domain: "person",    match: ["person"] },
      "preset-doors":   { widget: "status-dot",       domain: "binary_sensor", match: ["door","window","fenster","tuer"] },
      "preset-battery": { widget: "progress-bar",     domain: "sensor",    match: ["battery","akku"] },
      "preset-media":   { widget: "icon-value",       domain: "media_player",  match: ["media_player"] },
      "preset-climate": { widget: "simple-value",     domain: "climate",   match: ["climate","thermostat"] },
      "preset-light":   { widget: "status-dot",       domain: "light",     match: ["light","licht"] },
      "preset-alarm":   { widget: "status-dot",       domain: "alarm_control_panel", match: ["alarm"] },
      "preset-cover":   { widget: "progress-bar",     domain: "cover",     match: ["cover","rollladen"] },
      "preset-vacuum":  { widget: "icon-value",       domain: "vacuum",    match: ["vacuum","staubsauger"] },
      "preset-network": { widget: "status-dot",       domain: "sensor",    match: ["wifi","ping","router"] },
    };

    const spec = presetMap[type];
    if (!spec) return;

    const entities = getAllEntities(this.hass, spec.domain);
    const hit = entities.find((e) =>
      spec.match.some((m) => `${e.entity_id} ${e.friendly_name}`.toLowerCase().includes(m))
    ) || entities[0];

    const { c, r } = this._findNextFreeCell();
    this._pushUndo();
    const w = tdCreateWidget(spec.widget, c, r, this.globalSettings || {});
    w.entity_id = hit?.entity_id || "";
    w.name = hit?.friendly_name || spec.widget;
    if (["preset-energy", "preset-doors", "preset-media", "preset-light", "preset-network"].includes(type)) {
      w.config = { ...(w.config || {}), entities: entities.slice(0, 6).map((e) => e.entity_id) };
    }
    if (type === "preset-energy") w.colspan = 2;

    const ws = [...(this._cfg.widgets || []), w];
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = ws.length - 1;
    this._selMulti = [this._sel];
    this._rememberWidget(spec.widget);
  }

  _applyTemplate(type) {
    this._pushUndo();
    const mk = (kind, col, row, extra = {}) =>
      Object.assign(tdCreateWidget(kind, col, row, this.globalSettings || {}), extra);

    const widgetSets = {
      "ha-template-home": [
        mk("weather", 0, 0, { colspan: 2, rowspan: 2, name: "Wetter" }),
        mk("clock", 2, 0, { name: "Uhr" }),
        mk("trend-arrow", 2, 1, { name: "Trend" }),
      ],
      "ha-template-energy": [
        mk("comparison-chart", 0, 0, { colspan: 2, name: "Energie" }),
        mk("progress-bar", 2, 0, { name: "Batterie" }),
        mk("simple-value", 2, 1, { name: "Verbrauch" }),
      ],
      "ha-template-security": [
        mk("status-dot", 0, 0, { name: "Alarm", icon: "🛡️" }),
        mk("camera", 1, 0, { colspan: 2, rowspan: 2, name: "Kamera" }),
        mk("status-dot", 0, 1, { name: "Kontakte", icon: "🚪" }),
      ],
      "ha-template-family": [
        mk("status-dot", 0, 0, { name: "Person 1", icon: "👤" }),
        mk("status-dot", 1, 0, { name: "Person 2", icon: "👤" }),
        mk("countdown", 2, 0, { name: "Nächster Termin" }),
        mk("weather", 0, 1, { colspan: 2, name: "Wetter" }),
      ],
      "ha-template-media": [
        mk("icon-value", 0, 0, { colspan: 2, name: "Medien", icon: "🎵" }),
        mk("image", 2, 0, { rowspan: 2, name: "Cover" }),
        mk("progress-bar", 0, 1, { colspan: 2, name: "Lautstärke" }),
      ],
    };

    const newWidgets = widgetSets[type];
    if (!newWidgets) return;

    const hydrated = tdHydrateScreenPresetEntities(
      { ...this._cfg, widgets: [...(this._cfg.widgets || []), ...newWidgets] },
      this.hass
    );
    this._cfg = hydrated;
    this._sel = (this._cfg.widgets || []).length - newWidgets.length;
    this._selMulti = [this._sel];
  }

  _applySavedTemplate(templateId) {
    const tpl = (this.templates || {})[templateId];
    if (!tpl?.screen_config) return;
    this._pushUndo();
    const currentId = this._cfg.id;
    this._cfg = {
      ...tdHydrateScreenPresetEntities(deepClone(tpl.screen_config), this.hass),
      id: currentId,
      name: tpl.name || this._cfg.name || "Screen",
    };
    this._sel = -1;
    this._selMulti = [];
  }

  /* ══════════════════════════════════════════════════════════
     UNDO / REDO
     ══════════════════════════════════════════════════════════ */

  _pushUndo() {
    this._undo = [...this._undo.slice(-30), JSON.stringify(this._cfg)];
    this._redo = [];
  }

  _doUndo() {
    if (!this._undo.length) return;
    this._redo = [...this._redo, JSON.stringify(this._cfg)];
    this._cfg = JSON.parse(this._undo[this._undo.length - 1]);
    this._undo = this._undo.slice(0, -1);
    this._sel = -1;
    this._selMulti = [];
  }

  _doRedo() {
    if (!this._redo.length) return;
    this._undo = [...this._undo, JSON.stringify(this._cfg)];
    this._cfg = JSON.parse(this._redo[this._redo.length - 1]);
    this._redo = this._redo.slice(0, -1);
    this._sel = -1;
    this._selMulti = [];
  }

  /* ══════════════════════════════════════════════════════════
     HELPERS
     ══════════════════════════════════════════════════════════ */

  _setGrid(key, value) {
    this._cfg = {
      ...this._cfg,
      grid: { ...(this._cfg.grid || { columns: 3, rows: 2 }), [key]: value },
    };
  }

  _openDraftPreview() {
    const key = `td_preview_${this.deviceId || "device"}_${this.screenIndex ?? 0}`;
    const payload = {
      screens: [deepClone(this._cfg)],
      ticker: { ...(this.globalSettings?.ticker || {}), ...(this._cfg.ticker_style || {}) },
      rotation: { transition: this._cfg.transition || "fade" },
    };
    lsSet(key, payload);
    window.open(
      `/ticker-display/preview/${this.deviceId}?td_preview_key=${encodeURIComponent(key)}`,
      "_blank"
    );
  }

  _saveAsTemplate() {
    const name = prompt("Vorlagenname:", this._cfg.name || "Vorlage");
    if (name) {
      this._emit("save-as-template", { name, screenConfig: this._cfg });
    }
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  // Properties panel will be in Part 4
  _renderProperties() {
    return html`<div class="props">[Properties – siehe Teil 4]</div>`;
  }
}
customElements.define("td-screen-editor", TdScreenEditor);

/* ══════════════════════════════════════════════════════════
   SCREEN EDITOR – PROPERTIES PANEL (replaces placeholder)
   Add these methods to the TdScreenEditor class from Part 3
   ══════════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────────
// Replace the _renderProperties() stub in Part 3 with:
// ──────────────────────────────────────────────────────

TdScreenEditor.prototype._renderProperties = function () {
  if (this._sel < 0 || !this._cfg.widgets?.[this._sel]) {
    return this._renderScreenProperties();
  }
  return this._renderWidgetProperties();
};

/* ══════════════════════════════════════════════════════════
   SCREEN PROPERTIES (when no widget selected)
   ══════════════════════════════════════════════════════════ */

TdScreenEditor.prototype._renderScreenProperties = function () {
  const cfg = this._cfg;
  return html`
    <div class="props">
      <div class="props-header">
        <strong class="props-title">Screen Einstellungen</strong>
      </div>

      <!-- Screen Type -->
      <div class="pg4">Screen-Grundlagen</div>
      <div class="pf2">
        <label>Screen-Typ</label>
        <select .value=${cfg.type || "dashboard"}
                @change=${(e) => this._setScreen("type", e.target.value)}>
          ${TD_SCREEN_TYPES.map((t) => html`<option value=${t.v}>${t.l}</option>`)}
        </select>
      </div>
      <div class="pf2">
        <label>Übergang</label>
        <select .value=${cfg.transition || "fade"}
                @change=${(e) => this._setScreen("transition", e.target.value)}>
          ${TD_TRANSITIONS.map((t) => html`<option value=${t.v}>${t.l}</option>`)}
        </select>
      </div>

      <!-- Background -->
      <div class="pg4">Hintergrund</div>
      <div class="pf2">
        <td-color-picker
          .value=${cfg.background_color || "#121212"}
          label="Hintergrundfarbe"
          @value-changed=${(e) => this._setScreen("background_color", e.detail.value)}>
        </td-color-picker>
      </div>

      ${this._renderBackgroundImagePicker()}

      <div class="pf2-row">
        <div class="pf2">
          <label>Bildgröße</label>
          <select .value=${cfg.background_image_size || "cover"}
                  @change=${(e) => this._setScreen("background_image_size", e.target.value)}>
            <option value="cover">cover</option>
            <option value="contain">contain</option>
            <option value="auto">auto</option>
          </select>
        </div>
        <div class="pf2">
          <label>Overlay: ${Math.round(Number(cfg.background_overlay_opacity ?? 1) * 100)}%</label>
          <input type="range" min="0" max="1" step="0.05"
                 .value=${cfg.background_overlay_opacity ?? 1}
                 @input=${(e) => this._setScreen("background_overlay_opacity", +e.target.value)}>
        </div>
      </div>

      ${cfg.background_image ? html`
        <div class="pf2">
          <button class="prop-btn" @click=${() => this._setScreen("background_image", "")}>
            ✕ Hintergrundbild entfernen
          </button>
        </div>
      ` : ""}

      <!-- Weather FX -->
      <div class="pg4">Wettereffekt</div>
      <div class="tog">
        <input type="checkbox"
               .checked=${cfg.screen_weather_fx === true}
               @change=${(e) => this._setScreen("screen_weather_fx", e.target.checked)}>
        <span>Wettereffekt über ganzen Screen</span>
      </div>
      ${cfg.screen_weather_fx ? html`
        <div class="pf2-row">
          <div class="pf2">
            <label>Intensität</label>
            <select .value=${cfg.screen_weather_fx_intensity || "normal"}
                    @change=${(e) => this._setScreen("screen_weather_fx_intensity", e.target.value)}>
              <option value="soft">Sanft</option>
              <option value="normal">Normal</option>
              <option value="strong">Stark</option>
            </select>
          </div>
          <div class="pf2">
            <label>Layer</label>
            <input type="number" min="1" max="4"
                   .value=${cfg.screen_weather_fx_layers || 1}
                   @change=${(e) => this._setScreen("screen_weather_fx_layers", +e.target.value)}>
          </div>
        </div>
        <div class="pf2-hint">
          Nutzt bei Wetter-Screens die Screen-Entity und bei Dashboards das erste Wetter-Widget.
        </div>
      ` : ""}

      <!-- Motion -->
      <div class="pg4">Lebendige Bewegung</div>
      <div class="tog">
        <input type="checkbox"
               .checked=${cfg.screen_motion_enabled === true}
               @change=${(e) => this._setScreen("screen_motion_enabled", e.target.checked)}>
        <span>Widgets leicht bewegen lassen</span>
      </div>
      ${cfg.screen_motion_enabled ? html`
        <div class="pf2-row">
          <div class="pf2">
            <label>Stärke</label>
            <select .value=${cfg.screen_motion_strength || "soft"}
                    @change=${(e) => this._setScreen("screen_motion_strength", e.target.value)}>
              <option value="soft">Sanft</option>
              <option value="normal">Normal</option>
              <option value="lively">Lebendig</option>
            </select>
          </div>
          <div class="pf2">
            <label>Zyklus (s)</label>
            <input type="number" min="8" max="60"
                   .value=${cfg.screen_motion_cycle || 18}
                   @change=${(e) => this._setScreen("screen_motion_cycle", +e.target.value)}>
          </div>
        </div>
      ` : ""}

      <!-- Screen Ticker Override -->
      ${this._renderScreenTickerConfig()}

      <!-- Empty hint -->
      <div class="props-empty">
        <span style="font-size:28px;opacity:.25">👆</span>
        <span>Widget auswählen<br>oder aus Palette ziehen</span>
      </div>
    </div>
  `;
};

/* ══════════════════════════════════════════════════════════
   WIDGET PROPERTIES (when widget selected)
   ══════════════════════════════════════════════════════════ */

TdScreenEditor.prototype._renderWidgetProperties = function () {
  const w = this._cfg.widgets[this._sel];
  if (!w) return html`<div class="props"></div>`;

  return html`
    <div class="props">
      <div class="props-header">
        <strong class="props-title">
          ${TD_WIDGET_TYPE_ICONS[w.type] || "📊"} Widget
        </strong>
        <button class="props-del" @click=${() => this._deleteWidget()}
                title="Widget löschen">🗑️</button>
      </div>

      <!-- Tabs -->
      <div class="ptabs">
        ${[
          [0, "Allgemein"],
          [1, "Style"],
          [2, "Erweitert"],
        ].map(([idx, label]) => html`
          <button class="ptab ${this._pt === idx ? "a" : ""}"
                  @click=${() => this._pt = idx}>
            ${label}
          </button>
        `)}
      </div>

      ${this._pt === 0 ? this._renderPropsGeneral(w) : ""}
      ${this._pt === 1 ? this._renderPropsStyle(w) : ""}
      ${this._pt === 2 ? this._renderPropsAdvanced(w) : ""}
    </div>
  `;
};

/* ──────────────────────────────────────────────────────
   TAB 0: General
   ────────────────────────────────────────────────────── */

TdScreenEditor.prototype._renderPropsGeneral = function (w) {
  return html`
    <!-- Widget Type -->
    <div class="pg4">Grundeinstellungen</div>
    <div class="pf2">
      <label>Widget-Typ</label>
      <select .value=${w.type || "simple-value"}
              @change=${(e) => this._setWidget("type", e.target.value)}>
        ${tdVisibleWidgetOptions(this.globalSettings || {}, w.type).map((t) => html`<option value=${t.v}>${t.l}</option>`)}
      </select>
    </div>

    <!-- Entity -->
    <div class="pf2">
      <td-entity-picker
        .hass=${this.hass}
        .value=${w.entity_id || ""}
        .domain=${this._domainForType(w.type)}
        label="Entity"
        @value-changed=${(e) => this._setWidget("entity_id", e.detail.value)}>
      </td-entity-picker>
    </div>

    <!-- Multi-Entity -->
    ${this._supportsMulti(w.type) ? html`
      <div class="pf2">
        <td-entity-multi-picker
          .hass=${this.hass}
          .value=${(w.config?.entities || []).filter((id) => id !== w.entity_id)}
          .domain=${this._domainForType(w.type)}
          label="Zusätzliche Sensoren"
          @value-changed=${(e) => this._setWidgetConfig("entities", e.detail.value)}>
        </td-entity-multi-picker>
      </div>
      ${this._renderEntityMetaEditor(w)}
    ` : ""}

    <!-- Value Formatting -->
    ${this._supportsFormat(w.type) ? html`
      <div class="pg4">Wertformat</div>
      <div class="pf2-row">
        <div class="pf2">
          <label>Dezimalstellen</label>
          <input type="number" min="0" max="6"
                 .value=${w.config?.value_decimals ?? 1}
                 @change=${(e) => this._setWidgetConfig("value_decimals", +e.target.value)}>
        </div>
        <div class="pf2">
          <label>Extra-Dezimalstellen</label>
          <input type="number" min="0" max="6"
                 .value=${w.config?.extra_value_decimals ?? w.config?.value_decimals ?? 1}
                 @change=${(e) => this._setWidgetConfig("extra_value_decimals", +e.target.value)}>
        </div>
      </div>
      <div class="tog">
        <input type="checkbox"
               .checked=${w.config?.trim_trailing_zeros === true}
               @change=${(e) => this._setWidgetConfig("trim_trailing_zeros", e.target.checked)}>
        <span>Überflüssige Nullen entfernen (25.0 → 25)</span>
      </div>
    ` : ""}

    <!-- Name & Icon -->
    <div class="pg4">Beschriftung</div>
    <div class="pf2">
      <label>Name</label>
      <input .value=${w.name || ""}
             placeholder="Auto oder eigener Name"
             @input=${(e) => this._setWidget("name", e.target.value)}>
    </div>
    <div class="pf2-row">
      <div class="pf2">
        <label>Name anzeigen</label>
        <select .value=${w.config?.show_name === false ? "off" : "on"}
                @change=${(e) => this._setWidgetConfig("show_name", e.target.value !== "off")}>
          <option value="on">Ja</option>
          <option value="off">Ausblenden</option>
        </select>
      </div>
      <div class="pf2">
        <label>Kürzen (Zeichen)</label>
        <input type="number" min="0" max="60"
               .value=${w.config?.name_max_length ?? 0}
               placeholder="0 = auto"
               @change=${(e) => this._setWidgetConfig("name_max_length", +e.target.value)}>
      </div>
    </div>
    <div class="pf2">
      <td-icon-picker
        .value=${w.icon || ""}
        label="Icon"
        @value-changed=${(e) => this._setWidget("icon", e.detail.value)}>
      </td-icon-picker>
    </div>

    <!-- Interaction -->
    ${this._renderInteractionConfig(w)}

    <!-- Position & Size -->
    <div class="pg4">Position & Größe</div>
    <div class="pf2-row">
      <div class="pf2">
        <label>Spalte</label>
        <input type="number" min="0"
               .value=${w.col || 0}
               @change=${(e) => this._setWidget("col", +e.target.value)}>
      </div>
      <div class="pf2">
        <label>Zeile</label>
        <input type="number" min="0"
               .value=${w.row || 0}
               @change=${(e) => this._setWidget("row", +e.target.value)}>
      </div>
      <div class="pf2">
        <label>Breite</label>
        <input type="number" min="1"
               .value=${w.colspan || 1}
               @change=${(e) => this._setWidget("colspan", +e.target.value)}>
      </div>
      <div class="pf2">
        <label>Höhe</label>
        <input type="number" min="1"
               .value=${w.rowspan || 1}
               @change=${(e) => this._setWidget("rowspan", +e.target.value)}>
      </div>
    </div>

    <!-- Grouping & Layers -->
    ${this._renderGroupConfig(w)}

    <!-- Type-specific settings -->
    ${this._renderTypeSpecific(w)}
  `;
};

/* ──────────────────────────────────────────────────────
   TAB 1: Style
   ────────────────────────────────────────────────────── */

TdScreenEditor.prototype._renderPropsStyle = function (w) {
  return html`
    <div class="pg4">Darstellung</div>

    <div class="pf2">
      <td-font-picker
        .value=${w.font || ""}
        .fonts=${this.fonts || []}
        label="Schriftart"
        @value-changed=${(e) => this._setWidget("font", e.detail.value)}>
      </td-font-picker>
    </div>

    <div class="pf2">
      <label>Schriftgröße: ${w.fontSize || 28}px</label>
      <input type="range" min="12" max="72" step="2"
             .value=${w.fontSize || 28}
             @input=${(e) => this._setWidget("fontSize", +e.target.value)}>
    </div>

    <div class="pf2">
      <td-color-picker
        .value=${w.textColor || "#FFFFFF"}
        label="Textfarbe"
        @value-changed=${(e) => this._setWidget("textColor", e.detail.value)}>
      </td-color-picker>
    </div>

    <div class="pf2">
      <td-color-picker
        .value=${w.bgColor || "#1E1E1E"}
        label="Hintergrundfarbe"
        @value-changed=${(e) => this._setWidget("bgColor", e.detail.value)}>
      </td-color-picker>
    </div>

    <div class="pf2">
      <label>Transparenz: ${(w.bgOpacity ?? 0.75).toFixed(2)}</label>
      <input type="range" min="0" max="1" step="0.05"
             .value=${w.bgOpacity ?? 0.75}
             @input=${(e) => this._setWidget("bgOpacity", +e.target.value)}>
    </div>

    <div class="pf2">
      <label>Blur: ${w.blur || 0}px</label>
      <input type="range" min="0" max="20" step="1"
             .value=${w.blur || 0}
             @input=${(e) => this._setWidget("blur", +e.target.value)}>
    </div>

    <div class="pf2">
      <label>Ecken-Radius: ${w.borderRadius || 12}px</label>
      <input type="range" min="0" max="32" step="2"
             .value=${w.borderRadius || 12}
             @input=${(e) => this._setWidget("borderRadius", +e.target.value)}>
    </div>

    <div class="pg4">Animationen</div>
    <div class="pf2-row">
      <div class="pf2">
        <label>Animationen</label>
        <select .value=${w.animations === false ? "off" : "on"}
                @change=${(e) => this._setWidget("animations", e.target.value !== "off")}>
          <option value="on">Aktiv</option>
          <option value="off">Aus</option>
        </select>
      </div>
      <div class="pf2">
        <label>Animationsstil</label>
        <select .value=${w.animation_style || "auto"}
                @change=${(e) => this._setWidget("animation_style", e.target.value)}>
          <option value="auto">Automatisch</option>
          <option value="soft">Sanft</option>
          <option value="lively">Lebendig</option>
          <option value="pulse">Pulse</option>
        </select>
      </div>
    </div>
  `;
};

/* ──────────────────────────────────────────────────────
   TAB 2: Advanced
   ────────────────────────────────────────────────────── */

TdScreenEditor.prototype._renderPropsAdvanced = function (w) {
  return html`
    <div class="pg4">Benutzerdefiniert</div>

    <div class="pf2">
      <label>Benutzerdefiniertes CSS</label>
      <textarea rows="4"
                .value=${w.customCss || ""}
                @input=${(e) => this._setWidget("customCss", e.target.value)}
                placeholder="box-shadow: 0 0 10px #2196F3;"></textarea>
    </div>

    <div class="pg4">Widget JSON</div>
    <div class="pf2">
      <textarea rows="12"
                .value=${JSON.stringify(w, null, 2)}
                @change=${(e) => this._applyWidgetJson(e.target.value)}></textarea>
      <div class="pf2-hint">
        Änderungen am JSON werden erst beim Verlassen des Feldes übernommen.
        Ungültiges JSON wird ignoriert.
      </div>
    </div>

    <div class="pg4">Aktionen</div>
    <div class="pf2-row">
      <button class="prop-btn" @click=${() => this._duplicateSelected()}>
        📋 Duplizieren
      </button>
      <button class="prop-btn" @click=${async () => {
        try {
          await copyToClipboard(JSON.stringify(w, null, 2));
        } catch {}
      }}>
        📄 JSON kopieren
      </button>
    </div>

    <button class="prop-btn-danger" @click=${() => this._deleteWidget()}>
      🗑️ Widget löschen
    </button>
  `;
};

/* ══════════════════════════════════════════════════════════
   SUB-RENDERERS
   ══════════════════════════════════════════════════════════ */

/* ────── Interaction Config ────── */
TdScreenEditor.prototype._renderInteractionConfig = function (w) {
  return html`
    <div class="pg4">Interaktion auf dem Display</div>
    <div class="pf2">
      <label>Touch-Aktion</label>
      <select .value=${w.tap_action || "none"}
              @change=${(e) => this._setWidget("tap_action", e.target.value)}>
        <option value="none">Keine</option>
        <option value="expand">Widget vergrößern</option>
        <option value="popup">Vollbild-Popup</option>
        <option value="toggle">Schalter ein/aus</option>
        <option value="goto_screen">Zu Screen wechseln</option>
        <option value="open_url">URL öffnen</option>
      </select>
    </div>

    ${["expand", "popup"].includes(w.tap_action) ? html`
      <div class="pf2-row">
        <div class="pf2">
          <label>Auto schließen (s)</label>
          <input type="number" min="0" max="120"
                 .value=${w.tap_autoclose || 10}
                 @change=${(e) => this._setWidget("tap_autoclose", +e.target.value)}>
        </div>
        <div class="pf2">
          <label>Skalierung</label>
          <input type="number" min="1" max="2.4" step="0.1"
                 .value=${w.tap_scale || 1.45}
                 @change=${(e) => this._setWidget("tap_scale", +e.target.value)}>
        </div>
      </div>
    ` : ""}

    ${w.tap_action === "toggle" ? html`
      <div class="pf2">
        <td-entity-picker
          .hass=${this.hass}
          .value=${w.tap_target_entity || w.entity_id || ""}
          label="Schalt-Entity"
          placeholder="Leer = Haupt-Entity"
          @value-changed=${(e) => this._setWidget("tap_target_entity", e.detail.value)}>
        </td-entity-picker>
      </div>
      <div class="pf2-row">
        <div class="pf2">
          <label>Schaltmodus</label>
          <select .value=${w.toggle_mode || "toggle"}
                  @change=${(e) => this._setWidget("toggle_mode", e.target.value)}>
            <option value="toggle">Umschalten</option>
            <option value="on">Nur Ein</option>
            <option value="off">Nur Aus</option>
          </select>
        </div>
        <div class="pf2">
          <label>Statuspunkt</label>
          <select .value=${w.toggle_badge !== false ? "on" : "off"}
                  @change=${(e) => this._setWidget("toggle_badge", e.target.value === "on")}>
            <option value="on">Ja</option>
            <option value="off">Nein</option>
          </select>
        </div>
      </div>
      <div class="pf2-hint">
        Geeignet für switch.*, light.*, input_boolean.*, fan.*, cover.*, valve.*
      </div>
    ` : ""}

    ${w.tap_action === "goto_screen" ? html`
      <div class="pf2">
        <label>Ziel-Screen</label>
        <select .value=${w.tap_screen_id || ""}
                @change=${(e) => this._setWidget("tap_screen_id", e.target.value)}>
          <option value="">— wählen —</option>
          ${(this.device?.screens || []).map((s) => html`
            <option value=${s.id || s.name}>${s.name || s.id}</option>
          `)}
        </select>
      </div>
    ` : ""}

    ${w.tap_action === "open_url" ? html`
      <div class="pf2">
        <label>Ziel-URL</label>
        <input .value=${w.tap_url || ""}
               placeholder="https://..."
               @input=${(e) => this._setWidget("tap_url", e.target.value)}>
      </div>
    ` : ""}
  `;
};

/* ────── Group Config ────── */
TdScreenEditor.prototype._renderGroupConfig = function (w) {
  return html`
    <div class="pg4">Gruppierung & Ebenen</div>
    <div class="pf2">
      <label>Gruppe</label>
      <input .value=${w.group || ""}
             placeholder="z. B. header / energie / fenster"
             @input=${(e) => this._setWidget("group", e.target.value)}>
    </div>

    ${w.group ? html`
      <div class="tog">
        <input type="checkbox"
               .checked=${w.group_touch_enabled === true}
               @change=${(e) => this._setWidget("group_touch_enabled", e.target.checked)}>
        <span>Gemeinsame Touch-Aktion für Gruppe</span>
      </div>

      ${w.group_touch_enabled ? html`
        <div class="pf2">
          <label>Gruppen-Aktion</label>
          <select .value=${w.group_tap_action || "popup"}
                  @change=${(e) => this._setWidget("group_tap_action", e.target.value)}>
            <option value="popup">Popup</option>
            <option value="toggle">Schalter</option>
            <option value="goto_screen">Screen wechseln</option>
            <option value="open_url">URL öffnen</option>
            <option value="expand">Vergrößern</option>
          </select>
        </div>

        ${(w.group_tap_action || "popup") === "toggle" ? html`
          <div class="pf2-row">
            <div class="pf2">
              <td-entity-picker
                .hass=${this.hass}
                .value=${w.group_tap_target_entity || w.entity_id || ""}
                label="Gruppen-Entity"
                @value-changed=${(e) => this._setWidget("group_tap_target_entity", e.detail.value)}>
              </td-entity-picker>
            </div>
            <div class="pf2">
              <label>Modus</label>
              <select .value=${w.group_toggle_mode || "toggle"}
                      @change=${(e) => this._setWidget("group_toggle_mode", e.target.value)}>
                <option value="toggle">Umschalten</option>
                <option value="on">Nur Ein</option>
                <option value="off">Nur Aus</option>
              </select>
            </div>
          </div>
        ` : ""}

        <div class="pf2-hint">
          Widgets ohne eigene Touch-Aktion in derselben Gruppe übernehmen diese Einstellung.
        </div>
      ` : ""}
    ` : ""}

    <div class="pf2-row">
      <div class="pf2">
        <label>Ebene (z-index)</label>
        <input type="number" min="1" max="999"
               .value=${w.z_index || (this._sel + 1)}
               @change=${(e) => this._setWidget("z_index", +e.target.value)}>
      </div>
      <div class="pf2">
        <label>Schnellaktionen</label>
        <div style="display:flex;gap:6px">
          <button class="prop-btn-sm" @click=${() => this._changeLayer(1)}>↑ Vor</button>
          <button class="prop-btn-sm" @click=${() => this._changeLayer(-1)}>↓ Zurück</button>
        </div>
      </div>
    </div>

    <div class="tog">
      <input type="checkbox"
             .checked=${w.locked || false}
             @change=${(e) => this._setLock(e.target.checked)}>
      <span>Sperren (Drag/Resize deaktiviert)</span>
    </div>
  `;
};

/* ────── Type-Specific Settings ────── */
TdScreenEditor.prototype._renderTypeSpecific = function (w) {
  const parts = [];

  // Gauge
  if (w.type === "gauge") {
    parts.push(html`
      <div class="pg4">Gauge</div>
      <div class="pf2-row">
        <div class="pf2">
          <label>Min</label>
          <input type="number" .value=${w.config?.min || 0}
                 @change=${(e) => this._setWidgetConfig("min", +e.target.value)}>
        </div>
        <div class="pf2">
          <label>Max</label>
          <input type="number" .value=${w.config?.max || 100}
                 @change=${(e) => this._setWidgetConfig("max", +e.target.value)}>
        </div>
      </div>
    `);
  }

  // Camera
  if (w.type === "camera") {
    parts.push(html`
      <div class="pg4">Kamera</div>
      <div class="pf2">
        <td-entity-picker
          .hass=${this.hass}
          .value=${w.entity_id || w.config?.camera_entity || ""}
          domain="camera"
          label="Kamera-Entity"
          @value-changed=${(e) => {
            this._setWidget("entity_id", e.detail.value);
            this._setWidgetConfig("camera_entity", e.detail.value);
          }}>
        </td-entity-picker>
      </div>
      <div class="pf2">
        <label>Kamera-Quelle</label>
        <select .value=${w.config?.camera_source || "auto"}
                @change=${(e) => this._setWidgetConfig("camera_source", e.target.value)}>
          ${TD_CAMERA_SOURCES.map(([v, l]) => html`<option value=${v}>${l}</option>`)}
        </select>
      </div>
      <div class="pf2-row">
        <div class="pf2">
          <label>Ansicht</label>
          <select .value=${w.config?.camera_view || "still"}
                  @change=${(e) => this._setWidgetConfig("camera_view", e.target.value)}>
            <option value="still">Stillbild / Refresh</option>
            <option value="live">Live / Stream</option>
          </select>
        </div>
        <div class="pf2">
          <label>Objektfit</label>
          <select .value=${w.config?.camera_fit || "cover"}
                  @change=${(e) => this._setWidgetConfig("camera_fit", e.target.value)}>
            <option value="cover">cover</option>
            <option value="contain">contain</option>
          </select>
        </div>
      </div>
      <div class="pf2-row">
        <div class="pf2">
          <label>Titel</label>
          <select .value=${w.config?.camera_show_title === false ? "off" : "on"}
                  @change=${(e) => this._setWidgetConfig("camera_show_title", e.target.value !== "off")}>
            <option value="on">Anzeigen</option>
            <option value="off">Ausblenden</option>
          </select>
        </div>
        <div class="pf2">
          <label>Refresh (s)</label>
          <input type="number" min="1"
                 .value=${w.config?.refresh_interval || 5}
                 @change=${(e) => this._setWidgetConfig("refresh_interval", +e.target.value)}>
        </div>
      </div>
      <div class="tog">
        <input type="checkbox"
               .checked=${w.config?.camera_tap_fullscreen === true}
               @change=${(e) => this._setWidgetConfig("camera_tap_fullscreen", e.target.checked)}>
        <span>Tap = Vollbild</span>
      </div>
    `);
  }

  // Charts
  if (TD_CHART_TYPES.has(w.type)) {
    parts.push(this._renderChartConfig(w));
  }

  if (["simple-value", "icon-value", "trend-arrow", "status-dot", "gauge", "progress-bar"].includes(w.type)) {
    parts.push(html`
      <div class="pg4">Mini-Grafik</div>
      <div class="tog">
        <input type="checkbox"
               .checked=${w.config?.metric_graph !== false}
               @change=${(e) => this._setWidgetConfig("metric_graph", e.target.checked)}>
        <span>Verlaufsgrafik anzeigen</span>
      </div>
      <div class="pf2-row">
        <div class="pf2">
          <label>Verlauf (h)</label>
          <input type="number" min="1" max="168"
                 .value=${w.config?.metric_graph_hours || w.config?.hours || 24}
                 @change=${(e) => this._setWidgetConfig("metric_graph_hours", +e.target.value)}>
        </div>
        <div class="pf2">
          <label>Punkte</label>
          <input type="number" min="8" max="32"
                 .value=${w.config?.metric_graph_points || 18}
                 @change=${(e) => this._setWidgetConfig("metric_graph_points", +e.target.value)}>
        </div>
      </div>
    `);
  }

  // Weather
  if (w.type === "weather") {
    parts.push(html`
      <div class="pg4">Wetter</div>
      <div class="tog">
        <input type="checkbox"
               .checked=${w.config?.weather_animation !== false}
               @change=${(e) => this._setWidgetConfig("weather_animation", e.target.checked)}>
        <span>Animationen</span>
      </div>
      <div class="pf2">
        <label>Stil</label>
        <select .value=${w.config?.weather_style || "modern"}
                @change=${(e) => this._setWidgetConfig("weather_style", e.target.value)}>
          <option value="modern">Modern</option>
          <option value="glass">Glass</option>
          <option value="minimal">Minimal</option>
        </select>
      </div>
    `);
  }

  // Image
  if (w.type === "image") {
    parts.push(html`
      <div class="pg4">Bild</div>
      <div class="pf2">
        <label>Bild-URL</label>
        <input .value=${w.imageUrl || w.image_url || ""}
               placeholder="/ticker-display/media/images/xyz.png"
               @input=${(e) => this._setWidget("imageUrl", e.target.value)}>
      </div>
      ${(this.images || []).length ? html`
        <div class="pf2">
          <label>Lokales Bild</label>
          <select .value=${w.imageUrl || w.image_url || ""}
                  @change=${(e) => this._setWidget("imageUrl", e.target.value)}>
            <option value="">—</option>
            ${(this.images || []).map((img) => html`
              <option value=${img.url || `/ticker-display/media/images/${img.filename || img.name}`}>
                ${img.filename || img.name}
              </option>
            `)}
          </select>
        </div>
      ` : ""}
      ${(this.haImages || []).length ? html`
        <div class="pf2">
          <td-ha-media-picker
            .items=${this.haImages || []}
            .value=${w.imageUrl || w.image_url || ""}
            label="HA Medienbild"
            @value-changed=${(e) => this._setWidget("imageUrl", e.detail.value)}>
          </td-ha-media-picker>
        </div>
      ` : ""}
    `);
  }

  // Smart-Home Control Widgets
  if (["media-player-control", "switch-control", "light-control", "climate-control", "cover-control"].includes(w.type)) {
    const defaultAction = tdDefaultTapActionForWidget(w.type) || "popup";
    const compact = (w.config?.control_layout || "compact") !== "card";
    parts.push(html`
      <div class="pg4">Steuerung</div>
      <div class="pf2-row">
        <div class="pf2">
          <label>Layout</label>
          <select .value=${w.config?.control_layout || "compact"}
                  @change=${(e) => this._setWidgetConfig("control_layout", e.target.value)}>
            <option value="compact">Kleine Karte</option>
            <option value="card">Große Karte</option>
          </select>
        </div>
        <div class="pf2">
          <label>Standardaktion</label>
          <select .value=${w.tap_action || (compact ? "popup" : defaultAction)}
                  @change=${(e) => this._setWidget("tap_action", e.target.value)}>
            <option value="none">Keine</option>
            <option value="toggle">Toggle</option>
            <option value="popup">Popup</option>
            <option value="expand">Expand</option>
          </select>
        </div>
      </div>

      <div class="pf2-hint">Kleine Karte ist jetzt der Standard: kompakt, gut für Browser und Handy und mit Popup samt Schließen-Button.</div>

      <div class="tog-grid">
        ${[
          ["control_show_icon", "Icon", true],
          ["control_show_name", "Name", true],
          ["control_show_value", "Wert", true],
          ["control_show_sub", "Untertitel", true],
          ["control_show_meter", "Balken", w.type !== "switch-control"],
          ["control_show_status_chip", "Status-Chip", w.type !== "media-player-control"],
        ].map(([key, label, defaultVal]) => html`
          <label class="tog">
            <input type="checkbox"
                   .checked=${w.config?.[key] !== undefined ? w.config[key] : defaultVal}
                   @change=${(e) => this._setWidgetConfig(key, e.target.checked)}>
            <span>${label}</span>
          </label>
        `)}
      </div>

      ${["switch-control", "light-control"].includes(w.type) ? html`
        <label class="tog">
          <input type="checkbox"
                 .checked=${w.toggle_badge !== false && w.config?.control_show_toggle_badge !== false}
                 @change=${(e) => {
                   this._setWidget("toggle_badge", e.target.checked);
                   this._setWidgetConfig("control_show_toggle_badge", e.target.checked);
                 }}>
          <span>Status-Badge anzeigen</span>
        </label>
      ` : ""}

      ${w.type === "light-control" ? html`
        <div class="pg4">Licht-Popup</div>
        <div class="tog-grid">
          ${[
            ["control_show_popup_colors", "Farben", true],
            ["control_show_popup_effects", "Effekte", true],
            ["control_show_popup_position_presets", "Helligkeits-Presets", true],
          ].map(([key, label, defaultVal]) => html`
            <label class="tog">
              <input type="checkbox"
                     .checked=${w.config?.[key] !== undefined ? w.config[key] : defaultVal}
                     @change=${(e) => this._setWidgetConfig(key, e.target.checked)}>
              <span>${label}</span>
            </label>
          `)}
        </div>
      ` : ""}

      ${w.type === "cover-control" ? html`
        <div class="pg4">Cover-Popup</div>
        <div class="tog-grid">
          ${[
            ["control_show_popup_position_presets", "Positions-Presets", true],
            ["control_show_popup_tilt", "Lamellen / Tilt", true],
          ].map(([key, label, defaultVal]) => html`
            <label class="tog">
              <input type="checkbox"
                     .checked=${w.config?.[key] !== undefined ? w.config[key] : defaultVal}
                     @change=${(e) => this._setWidgetConfig(key, e.target.checked)}>
              <span>${label}</span>
            </label>
          `)}
        </div>
      ` : ""}

      ${w.type === "climate-control" ? html`
        <div class="pg4">Klima-Popup</div>
        <div class="tog-grid">
          ${[
            ["control_show_popup_modes", "HVAC-Modi", true],
            ["control_show_popup_presets", "Preset-Modi", true],
            ["control_show_popup_fan_modes", "Lüfter-Modi", true],
          ].map(([key, label, defaultVal]) => html`
            <label class="tog">
              <input type="checkbox"
                     .checked=${w.config?.[key] !== undefined ? w.config[key] : defaultVal}
                     @change=${(e) => this._setWidgetConfig(key, e.target.checked)}>
              <span>${label}</span>
            </label>
          `)}
        </div>
      ` : ""}
    `);
  }

  // Countdown
  if (w.type === "countdown") {
    parts.push(html`
      <div class="pg4">Countdown</div>
      <div class="pf2">
        <label>Zieldatum</label>
        <input type="datetime-local"
               .value=${w.target_date || w.targetDate || ""}
               @change=${(e) => this._setWidget("target_date", e.target.value)}>
      </div>
    `);
  }

  return parts;
};

/* ────── Chart Config ────── */
TdScreenEditor.prototype._renderChartConfig = function (w) {
  return html`
    <div class="pg4">Chart</div>

    <!-- Time range -->
    <div class="pf2-row">
      <div class="pf2">
        <label>Zeitraum (h)</label>
        <input type="number" min="1" max="168"
               .value=${w.config?.hours || 24}
               @change=${(e) => this._setWidgetConfig("hours", +e.target.value)}>
      </div>
      <div class="pf2">
        <label>Max. Punkte</label>
        <input type="number" min="8" max="120"
               .value=${w.config?.chart_max_points || 36}
               @change=${(e) => this._setWidgetConfig("chart_max_points", +e.target.value)}>
      </div>
    </div>
    <div class="chip-row">
      ${[[6,"6h"],[12,"12h"],[24,"24h"],[72,"3d"],[168,"7d"]].map(([v, l]) => html`
        <button class="pal-chip ${Number(w.config?.hours || 24) === v ? "a" : ""}"
                @click=${() => this._setWidgetConfig("hours", v)}>
          ${l}
        </button>
      `)}
    </div>

    <!-- Extra entities for chart -->
    <div class="pf2">
      <td-entity-multi-picker
        .hass=${this.hass}
        .value=${w.config?.entities || []}
        label="Chart-Entities"
        @value-changed=${(e) => this._setWidgetConfig("entities", e.detail.value)}>
      </td-entity-multi-picker>
    </div>

    <div class="tog">
      <input type="checkbox"
             .checked=${w.config?.chart_use_history !== false}
             @change=${(e) => this._setWidgetConfig("chart_use_history", e.target.checked)}>
      <span>History verwenden</span>
    </div>

    <!-- Visual -->
    <div class="pf2-row">
      <div class="pf2">
        <label>Farbpalette</label>
        <select .value=${w.config?.chart_palette || "default"}
                @change=${(e) => this._setWidgetConfig("chart_palette", e.target.value)}>
          ${["default","ocean","sunset","neon","mono"].map((p) => html`
            <option value=${p}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>
          `)}
        </select>
      </div>
      <div class="pf2">
        <label>Linienstärke</label>
        <input type="number" min="1" max="8"
               .value=${w.config?.chart_line_width || 2}
               @change=${(e) => this._setWidgetConfig("chart_line_width", +e.target.value)}>
      </div>
    </div>
    <div class="pf2-row">
      <div class="pf2">
        <label>Glättung</label>
        <input type="number" min="0" max="0.9" step="0.05"
               .value=${w.config?.chart_tension ?? 0.35}
               @change=${(e) => this._setWidgetConfig("chart_tension", +e.target.value)}>
      </div>
      <div class="pf2">
        <label>Flächenfüllung</label>
        <input type="number" min="0" max="0.8" step="0.05"
               .value=${w.config?.chart_fill_opacity ?? 0.22}
               @change=${(e) => this._setWidgetConfig("chart_fill_opacity", +e.target.value)}>
      </div>
    </div>
    <div class="pf2-row">
      <div class="pf2">
        <label>Kurvenmodus</label>
        <select .value=${w.config?.chart_curve_mode || "default"}
                @change=${(e) => this._setWidgetConfig("chart_curve_mode", e.target.value)}>
          <option value="default">Standard</option>
          <option value="stepped">Treppen</option>
          <option value="monotone">Monoton</option>
        </select>
      </div>
      <div class="pf2">
        <label>Punktstil</label>
        <select .value=${w.config?.chart_point_style || "circle"}
                @change=${(e) => this._setWidgetConfig("chart_point_style", e.target.value)}>
          <option value="circle">Kreis</option>
          <option value="rectRounded">Rounded</option>
          <option value="triangle">Dreieck</option>
          <option value="cross">Kreuz</option>
        </select>
      </div>
    </div>
    <div class="pf2-row">
      <div class="pf2">
        <label>Y bei 0 starten</label>
        <select .value=${w.config?.chart_begin_at_zero ? "on" : "off"}
                @change=${(e) => this._setWidgetConfig("chart_begin_at_zero", e.target.value === "on")}>
          <option value="off">Auto</option>
          <option value="on">Ja</option>
        </select>
      </div>
      <div class="pf2">
        <label>Legende</label>
        <select .value=${w.config?.chart_legend_position || "top"}
                @change=${(e) => this._setWidgetConfig("chart_legend_position", e.target.value)}>
          <option value="top">Oben</option>
          <option value="bottom">Unten</option>
          <option value="left">Links</option>
          <option value="right">Rechts</option>
        </select>
      </div>
    </div>

    <!-- Toggle grid -->
    <div class="tog-grid">
      ${[
        ["chart_animation",   "Animation", true],
        ["chart_show_legend", "Legende", true],
        ["chart_show_axes",   "Achsen",  true],
        ["chart_show_grid",   "Grid",    true],
        ["chart_show_points", "Punkte",  true],
        ["chart_stacked",     "Gestapelt", false],
        ["chart_mobile_compact", "Kompakt", false],
      ].map(([key, label, defaultVal]) => html`
        <label class="tog">
          <input type="checkbox"
                 .checked=${w.config?.[key] !== undefined ? w.config[key] : defaultVal}
                 @change=${(e) => this._setWidgetConfig(key, e.target.checked)}>
          <span>${label}</span>
        </label>
      `)}
    </div>

    <!-- Type-specific chart options -->
    ${w.type === "radial-gauge-advanced" || w.type === "bullet-chart" ? html`
      <div class="pf2-row">
        <div class="pf2">
          <label>Min</label>
          <input type="number" .value=${w.config?.min || 0}
                 @change=${(e) => this._setWidgetConfig("min", +e.target.value)}>
        </div>
        <div class="pf2">
          <label>Max</label>
          <input type="number" .value=${w.config?.max || 100}
                 @change=${(e) => this._setWidgetConfig("max", +e.target.value)}>
        </div>
      </div>
    ` : ""}

    ${w.type === "heatmap-mini" ? html`
      <div class="pf2">
        <label>Heatmap-Modus</label>
        <select .value=${w.config?.heatmap_mode || "intensity"}
                @change=${(e) => this._setWidgetConfig("heatmap_mode", e.target.value)}>
          <option value="intensity">Intensität</option>
          <option value="zones">Zonen</option>
        </select>
      </div>
    ` : ""}
  `;
};

/* ────── Entity Meta Editor ────── */
TdScreenEditor.prototype._renderEntityMetaEditor = function (w) {
  const ids = [
    w.entity_id,
    ...(w.config?.entities || []),
  ].filter(Boolean).map((id) => typeof id === "string" ? id : id?.entity_id || "").filter(Boolean);

  if (!ids.length) return html``;

  const meta = w.config?.entity_meta || {};

  return html`
    <div class="pg4">Sensoren-Details</div>
    <div class="tog">
      <input type="checkbox"
             .checked=${w.config?.show_extra_entity_names !== false}
             @change=${(e) => this._setWidgetConfig("show_extra_entity_names", e.target.checked)}>
      <span>Namen standardmäßig anzeigen</span>
    </div>

    <div class="entity-meta-list">
      ${ids.map((id, idx) => {
        const m = meta[id] || {};
        const isPrimary = idx === 0 && id === w.entity_id;
        return html`
          <div class="entity-meta-card">
            <div class="entity-meta-header">
              <span class="entity-meta-id">${id}</span>
              <span class="entity-meta-badge ${isPrimary ? "primary" : ""}">
                ${isPrimary ? "Haupt" : "Extra"}
              </span>
            </div>
            <div class="pf2-row">
              <input .value=${m.alias || ""}
                     placeholder="${isPrimary ? "Anzeigename" : "Kurzer Name"}"
                     @input=${(e) => this._setEntityMeta(id, { alias: e.target.value })}>
              <label class="tog-inline">
                <input type="checkbox"
                       .checked=${m.hide_name || false}
                       @change=${(e) => this._setEntityMeta(id, { hide_name: e.target.checked })}>
                <span>Verstecken</span>
              </label>
            </div>
            ${TD_CHART_TYPES.has(w.type) ? html`
              <div class="pf2" style="margin-top:6px">
                <td-color-picker
                  .value=${m.color || ""}
                  label="Serienfarbe"
                  @value-changed=${(e) => this._setEntityMeta(id, { color: e.detail.value })}>
                </td-color-picker>
              </div>
            ` : ""}
          </div>
        `;
      })}
    </div>
  `;
};

/* ────── Background Image Picker ────── */
TdScreenEditor.prototype._renderBackgroundImagePicker = function () {
  const cfg = this._cfg;
  return html`
    ${(this.images || []).length ? html`
      <div class="pf2">
        <label>Lokales Hintergrundbild</label>
        <select .value=${cfg.background_image || ""}
                @change=${(e) => this._setScreen("background_image", e.target.value)}>
          <option value="">— Kein Bild —</option>
          ${(this.images || []).map((img) => html`
            <option value=${img.url || `/ticker-display/media/images/${img.filename || img.name}`}>
              ${img.filename || img.name}
            </option>
          `)}
        </select>
      </div>
    ` : ""}

    ${(this.haImages || []).length ? html`
      <div class="pf2">
        <td-ha-media-picker
          .items=${this.haImages || []}
          .value=${cfg.background_image || ""}
          label="HA Medienbild"
          @value-changed=${(e) => this._setScreen("background_image", e.detail.value)}>
        </td-ha-media-picker>
      </div>
    ` : ""}

    <div class="pf2">
      <label>Bild-URL (direkt)</label>
      <input .value=${cfg.background_image || ""}
             placeholder="/ticker-display/media/images/bild.png"
             @input=${(e) => this._setScreen("background_image", e.target.value)}>
    </div>
  `;
};

/* ────── Screen Ticker Override ────── */
TdScreenEditor.prototype._renderScreenTickerConfig = function () {
  const ts = this._cfg.ticker_style || {};
  return html`
    <div class="pg4">Ticker-Leiste (Screen-Override)</div>

    <div class="pf2">
      <label>Stil-Vorlage</label>
      <select .value=${ts.style_template || "classic"}
              @change=${(e) => this._setScreen("ticker_style", {
                ...ts,
                style_template: e.target.value,
                ...this._tickerPreset(e.target.value),
              })}>
        <option value="classic">Classic</option>
        <option value="glass">Glass</option>
        <option value="alert">Alert</option>
        <option value="minimal">Minimal</option>
      </select>
    </div>

    <div class="pf2-row">
      <div class="pf2">
        <label>Höhe</label>
        <input type="number" min="24" max="120"
               .value=${ts.height || this.globalSettings?.default_ticker_height || 36}
               @change=${(e) => this._setScreen("ticker_style", { ...ts, height: +e.target.value })}>
      </div>
      <div class="pf2">
        <label>Schriftgröße</label>
        <input type="number" min="10" max="40"
               .value=${ts.font_size || 12}
               @change=${(e) => this._setScreen("ticker_style", { ...ts, font_size: +e.target.value })}>
      </div>
    </div>

    <div class="pf2-row">
      <div class="pf2">
        <td-color-picker
          .value=${ts.text_color || "#e8eef7"}
          label="Textfarbe"
          @value-changed=${(e) => this._setScreen("ticker_style", { ...ts, text_color: e.detail.value })}>
        </td-color-picker>
      </div>
      <div class="pf2">
        <td-color-picker
          .value=${ts.accent_color || "#40c4ff"}
          label="Akzent"
          @value-changed=${(e) => this._setScreen("ticker_style", { ...ts, accent_color: e.detail.value })}>
        </td-color-picker>
      </div>
    </div>

    <div class="pf2">
      <label>Feste Meldungen</label>
      <textarea rows="3"
                .value=${(ts.fixed_messages || []).join("\n")}
                @change=${(e) => this._setScreen("ticker_style", {
                  ...ts,
                  fixed_messages: String(e.target.value || "").split(/\n+/).map((x) => x.trim()).filter(Boolean),
                })}
                placeholder="Eine Meldung pro Zeile"></textarea>
    </div>

    <div class="pf2">
      <label>Ticker-Regeln (JSON)</label>
      <textarea rows="5"
                .value=${JSON.stringify(ts.rules || [], null, 2)}
                @change=${(e) => {
                  const parsed = safeJsonParse(e.target.value, null);
                  if (parsed) this._setScreen("ticker_style", { ...ts, rules: parsed });
                }}
                placeholder='[{"priority":10,"domain":"binary_sensor","condition":"state=on","template":"⚠️ {friendly_name}"}]'></textarea>
    </div>
  `;
};

/* ══════════════════════════════════════════════════════════
   PROPERTIES HELPER METHODS
   ══════════════════════════════════════════════════════════ */

TdScreenEditor.prototype._setScreen = function (key, value) {
  this._pushUndo();
  this._cfg = { ...this._cfg, [key]: value };
  this.requestUpdate();
};

TdScreenEditor.prototype._setWidget = function (key, value) {
  this._pushUndo();
  const ws = [...(this._cfg.widgets || [])];
  const current = ws[this._sel] || {};
  const next = { ...current, [key]: value };

  // Sync camera entity
  if (key === "entity_id" && current.type === "camera") {
    next.config = { ...(current.config || {}), camera_entity: value };
  }

  // Keep legacy and canonical image keys aligned
  if (key === "imageUrl" || key === "image_url") {
    next.imageUrl = value;
    next.image_url = value;
  }

  ws[this._sel] = next;
  this._cfg = { ...this._cfg, widgets: ws };
  this.requestUpdate();
};

TdScreenEditor.prototype._setWidgetConfig = function (key, value) {
  this._pushUndo();
  const ws = [...(this._cfg.widgets || [])];
  const w = ws[this._sel];
  let finalValue = value;
  if (key === "entities") {
    finalValue = [...new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => typeof item === "string" ? item : item?.entity_id || "")
        .filter(Boolean)
    )];
  }
  const next = { ...w, config: { ...(w.config || {}), [key]: finalValue } };
  if (key === "control_layout" && finalValue === "compact" && ["switch-control", "light-control", "climate-control", "cover-control", "media-player-control"].includes(next.type) && (!next.tap_action || ["none", "toggle"].includes(next.tap_action))) {
    next.tap_action = "popup";
  }
  ws[this._sel] = next;
  this._cfg = { ...this._cfg, widgets: ws };
  this.requestUpdate();
};

TdScreenEditor.prototype._setEntityMeta = function (entityId, patch) {
  this._pushUndo();
  const ws = [...(this._cfg.widgets || [])];
  const w = ws[this._sel] || {};
  const cfg = { ...(w.config || {}) };
  const meta = { ...(cfg.entity_meta || {}) };
  meta[entityId] = { ...(meta[entityId] || {}), ...patch };
  cfg.entity_meta = meta;
  ws[this._sel] = { ...w, config: cfg };
  this._cfg = { ...this._cfg, widgets: ws };
  this.requestUpdate();
};

TdScreenEditor.prototype._deleteWidget = function () {
  if (this._sel < 0) return;
  this._pushUndo();
  const ws = [...(this._cfg.widgets || [])];
  ws.splice(this._sel, 1);
  this._cfg = { ...this._cfg, widgets: ws };
  this._sel = -1;
  this._selMulti = [];
  this.requestUpdate();
};

TdScreenEditor.prototype._applyWidgetJson = function (jsonStr) {
  const parsed = safeJsonParse(jsonStr, null);
  if (!parsed) return;
  this._pushUndo();
  const ws = [...(this._cfg.widgets || [])];
  ws[this._sel] = parsed;
  this._cfg = { ...this._cfg, widgets: ws };
};

TdScreenEditor.prototype._domainForType = function (type) {
  if (type === "camera") return "camera";
  if (type === "weather") return "weather";
  if (type === "media-player-control") return "media_player";
  if (type === "light-control") return "light";
  if (type === "climate-control") return "climate";
  if (type === "cover-control") return "cover";
  return "";
};

TdScreenEditor.prototype._supportsMulti = function (type) {
  return !TD_NO_MULTI_ENTITY.has(type);
};

TdScreenEditor.prototype._supportsFormat = function (type) {
  return !TD_NO_VALUE_FORMAT.has(type);
};

TdScreenEditor.prototype._tickerPreset = function (name) {
  const presets = {
    classic: { background_color: "rgba(12,18,28,.78)", text_color: "#e8eef7", accent_color: "#40c4ff", border_radius: 0 },
    glass:   { background_color: "rgba(20,24,32,.45)", text_color: "#ffffff", accent_color: "#7dd3fc", border_radius: 14, opacity: 0.92 },
    alert:   { background_color: "rgba(120,8,8,.85)",  text_color: "#fff5f5", accent_color: "#ffd54f", border_radius: 0 },
    minimal: { background_color: "rgba(0,0,0,.22)",    text_color: "#f3f4f6", accent_color: "#9ca3af", border_radius: 10 },
  };
  return presets[name] || {};
};

/* ══════════════════════════════════════════════════════════
   PROPERTIES PANEL – Additional Styles
   Append to the static styles in Part 3's TdScreenEditor
   ══════════════════════════════════════════════════════════ */

const propsStyles = css`
  /* Properties header */
  .props-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 14px;
  }
  .props-title { font-size: 15px; }
  .props-del {
    padding: 4px 8px; border: none; background: none;
    color: var(--secondary-text-color); cursor: pointer;
    font-size: 14px; border-radius: 6px;
  }
  .props-del:hover { background: rgba(244,67,54,.1); color: #F44336; }

  .props-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 160px;
    color: var(--secondary-text-color); text-align: center;
    font-size: 14px; gap: 6px;
  }

  /* Tabs */
  .ptabs {
    display: flex; border-bottom: 1px solid var(--divider-color);
    margin-bottom: 14px;
  }
  .ptab {
    flex: 1; padding: 8px 4px; text-align: center;
    font-size: 12px; font-weight: 500; cursor: pointer;
    border-bottom: 2px solid transparent;
    color: var(--secondary-text-color); background: none;
    border-top: none; border-left: none; border-right: none;
    transition: all .15s;
  }
  .ptab:hover { color: var(--primary-text-color); }
  .ptab.a {
    color: var(--primary-color);
    border-bottom-color: var(--primary-color);
  }

  /* Section headers */
  .pg4 {
    font-size: 11px; text-transform: uppercase; letter-spacing: .5px;
    color: var(--secondary-text-color); margin: 16px 0 8px;
    padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,.05);
  }

  /* Fields */
  .pf2 { margin-bottom: 10px; }
  .pf2 label {
    display: block; font-size: 12px;
    color: var(--secondary-text-color); margin-bottom: 4px;
  }
  .pf2 input, .pf2 select {
    width: 100%; padding: 7px 10px;
    border: 1px solid var(--divider-color); border-radius: 6px;
    background: var(--primary-background-color);
    color: var(--primary-text-color); font-size: 13px;
    outline: none; transition: border-color .12s;
  }
  .pf2 input:focus, .pf2 select:focus { border-color: var(--primary-color); }
  .pf2 input[type=color] { height: 36px; padding: 2px; cursor: pointer; }
  .pf2 textarea {
    width: 100%; font-family: monospace; font-size: 12px;
    background: var(--primary-background-color);
    color: var(--primary-text-color);
    border: 1px solid var(--divider-color); border-radius: 6px;
    padding: 8px; resize: vertical; outline: none;
  }
  .pf2 textarea:focus { border-color: var(--primary-color); }

  .pf2-row {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 6px; margin-bottom: 10px;
  }
  .pf2-row .pf2 { margin-bottom: 0; }

  .pf2-hint {
    font-size: 11px; color: var(--secondary-text-color);
    margin: 4px 0 10px; line-height: 1.4;
  }

  /* Toggles */
  .tog {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 0; font-size: 13px;
  }
  .tog input[type=checkbox] {
    width: 16px; height: 16px;
    accent-color: var(--primary-color);
    flex-shrink: 0;
  }
  .tog-inline {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; cursor: pointer;
  }
  .tog-inline input { width: 14px; height: 14px; accent-color: var(--primary-color); }

  .tog-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 4px 12px; margin: 8px 0;
  }

  /* Chip row */
  .chip-row {
    display: flex; gap: 6px; flex-wrap: wrap;
    margin: 6px 0 12px;
  }

  /* Buttons */
  .prop-btn {
    padding: 8px 14px; border: 1px solid var(--divider-color);
    border-radius: 8px; background: none;
    color: var(--primary-text-color); font-size: 13px;
    cursor: pointer; transition: all .12s; width: 100%;
    text-align: center;
  }
  .prop-btn:hover {
    background: rgba(255,255,255,.05);
    border-color: rgba(255,255,255,.15);
  }
  .prop-btn-sm {
    padding: 5px 10px; border: 1px solid var(--divider-color);
    border-radius: 6px; background: none;
    color: var(--primary-text-color); font-size: 12px;
    cursor: pointer;
  }
  .prop-btn-sm:hover { background: rgba(255,255,255,.05); }
  .prop-btn-danger {
    width: 100%; padding: 10px; margin-top: 20px;
    border: 1px solid #F44336; border-radius: 8px;
    background: none; color: #F44336;
    cursor: pointer; font-size: 13px;
    transition: all .15s;
  }
  .prop-btn-danger:hover { background: rgba(244,67,54,.1); }

  /* Entity meta */
  .entity-meta-list {
    display: flex; flex-direction: column; gap: 6px; margin-top: 8px;
  }
  .entity-meta-card {
    border: 1px solid rgba(255,255,255,.06);
    border-radius: 10px; padding: 10px;
    background: rgba(255,255,255,.02);
  }
  .entity-meta-header {
    display: flex; justify-content: space-between;
    align-items: center; margin-bottom: 8px; gap: 6px;
  }
  .entity-meta-id {
    font-size: 11px; opacity: .7; word-break: break-all;
    font-family: monospace;
  }
  .entity-meta-badge {
    font-size: 9px; padding: 2px 8px; border-radius: 999px;
    background: rgba(255,255,255,.06); color: var(--secondary-text-color);
    white-space: nowrap; flex-shrink: 0;
  }
  .entity-meta-badge.primary {
    background: rgba(33,150,243,.12); color: #64b5f6;
  }
`;

// Merge styles into TdScreenEditor
const origStyles = TdScreenEditor.styles;
Object.defineProperty(TdScreenEditor, 'styles', {
  get() { return [origStyles, propsStyles]; },
});

/* ══════════════════════════════════════════════════════════
   TEMPLATE GALLERY
   ══════════════════════════════════════════════════════════ */

class TdTemplateGallery extends LitElement {
  static get properties() {
    return {
      hass:       { type: Object },
      templates:  { type: Object },
      devices:    { type: Array },
      _showImport:{ type: Boolean },
      _importJson:{ type: String },
      _filter:    { type: String },
      _category:  { type: String },
    };
  }

  constructor() {
    super();
    this._showImport = false;
    this._importJson = "";
    this._filter = "";
    this._category = "all";
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; }

      .hdr {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 16px; flex-wrap: wrap; gap: 10px;
      }
      .hdr h2 { margin: 0; font-size: 22px; font-weight: 500; }
      .hdr-actions { display: flex; gap: 6px; }

      .desc {
        margin: 0 0 16px; color: var(--secondary-text-color);
        font-size: 13px; line-height: 1.5;
      }

      /* Filters */
      .filter-bar {
        display: flex; gap: 6px; margin-bottom: 16px;
        align-items: center; flex-wrap: wrap;
      }
      .filter-bar input {
        flex: 1; min-width: 180px; max-width: 320px;
        padding: 8px 12px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 13px;
      }
      .cat-chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .cat-chip {
        padding: 5px 12px; border-radius: 999px;
        border: 1px solid var(--divider-color); background: none;
        color: var(--secondary-text-color); cursor: pointer;
        font-size: 12px; transition: all .12s;
      }
      .cat-chip.a {
        color: var(--primary-text-color);
        border-color: var(--primary-color);
        background: rgba(33,150,243,.1);
      }
      .cat-chip:hover { background: rgba(255,255,255,.04); }

      /* Import section */
      .import-sec {
        background: var(--card-background-color); border-radius: 12px;
        padding: 16px; margin-bottom: 20px;
        border: 1px solid var(--divider-color);
      }
      .import-sec strong { font-size: 14px; }
      .import-sec textarea {
        width: 100%; height: 120px; margin: 10px 0;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-family: monospace;
        font-size: 12px; padding: 10px; resize: vertical;
      }

      /* Grid */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 16px;
      }

      /* Card */
      .card {
        background: var(--card-background-color); border-radius: 14px;
        overflow: hidden; border: 1px solid var(--divider-color);
        transition: all .2s;
      }
      .card:hover {
        border-color: rgba(255,255,255,.15);
        box-shadow: 0 4px 16px rgba(0,0,0,.2);
      }
      .card-preview {
        height: 100px; background: #0a0a0a;
        display: flex; align-items: center; justify-content: center;
        font-size: 42px; opacity: .25; position: relative;
        overflow: hidden;
      }
      .card-preview .widget-dots {
        position: absolute; bottom: 8px; right: 8px;
        display: flex; gap: 3px;
      }
      .card-preview .widget-dot {
        width: 8px; height: 8px; border-radius: 3px;
        background: rgba(255,255,255,.15);
      }
      .card-body { padding: 14px; }
      .card-name { font-size: 16px; font-weight: 500; margin-bottom: 4px; }
      .card-desc {
        font-size: 13px; color: var(--secondary-text-color);
        margin-bottom: 10px; line-height: 1.4;
        display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden;
      }
      .card-meta {
        font-size: 12px; color: var(--secondary-text-color);
        margin-bottom: 12px; display: flex; gap: 6px; flex-wrap: wrap;
      }
      .card-meta .badge {
        padding: 2px 8px; border-radius: 4px;
        background: rgba(255,255,255,.06);
      }
      .card-actions { display: flex; gap: 6px; flex-wrap: wrap; }

      /* Buttons */
      .btn {
        padding: 7px 14px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: none;
        color: var(--primary-text-color); font-size: 12px;
        cursor: pointer; transition: all .12s;
      }
      .btn:hover { background: rgba(255,255,255,.05); }
      .btn.p {
        background: var(--primary-color);
        border-color: var(--primary-color); color: #fff;
      }
      .btn.p:hover { filter: brightness(1.1); }
      .btn.danger { border-color: rgba(244,67,54,.3); color: #ef5350; }
      .btn.danger:hover { background: rgba(244,67,54,.08); }

      /* Empty */
      .empty {
        text-align: center; padding: 60px 20px;
        color: var(--secondary-text-color);
      }
      .empty .icon { font-size: 52px; opacity: .2; margin-bottom: 16px; }
      .empty .title { font-size: 18px; font-weight: 500; color: var(--primary-text-color); }
      .empty p { margin: 6px 0; }
    `;
  }

  render() {
    const allEntries = Object.entries(this.templates || {});
    const filtered = this._filterTemplates(allEntries);
    const categories = this._getCategories(allEntries);
    const categoryIcons = {
      dashboard: "📊", weather: "🌤️", energy: "⚡",
      security: "🔒", media: "🎵", custom: "📋",
    };

    return html`
      <div class="hdr">
        <h2>📚 Screen-Bibliothek</h2>
        <div class="hdr-actions">
          <button class="btn" @click=${() => this._showImport = !this._showImport}>
            📥 Importieren
          </button>
          <button class="btn p" @click=${() => this._emit("create-template", {})}>
            ➕ Neue Vorlage
          </button>
        </div>
      </div>

      <p class="desc">
        Speichere Screens als wiederverwendbare Vorlagen.
        Beim Anlegen neuer Screens oder Geräte lassen sie sich direkt einfügen.
      </p>

      <!-- Import -->
      ${this._showImport ? html`
        <div class="import-sec">
          <strong>JSON importieren:</strong>
          <textarea .value=${this._importJson}
                    @input=${(e) => this._importJson = e.target.value}
                    placeholder='{"name":"Meine Vorlage","screen_config":{...}}'></textarea>
          <div style="display:flex;gap:8px">
            <button class="btn p" @click=${() => {
              this._emit("import-template", { json: this._importJson });
              this._importJson = "";
              this._showImport = false;
            }}>📥 Importieren</button>
            <button class="btn" @click=${() => { this._showImport = false; this._importJson = ""; }}>
              Abbrechen
            </button>
          </div>
        </div>
      ` : ""}

      <!-- Filters -->
      ${allEntries.length > 3 ? html`
        <div class="filter-bar">
          <input .value=${this._filter}
                 placeholder="Vorlage suchen..."
                 @input=${(e) => this._filter = e.target.value}>
          <div class="cat-chips">
            <button class="cat-chip ${this._category === "all" ? "a" : ""}"
                    @click=${() => this._category = "all"}>
              Alle (${allEntries.length})
            </button>
            ${categories.map(([cat, count]) => html`
              <button class="cat-chip ${this._category === cat ? "a" : ""}"
                      @click=${() => this._category = cat}>
                ${categoryIcons[cat] || "📋"} ${cat} (${count})
              </button>
            `)}
          </div>
        </div>
      ` : ""}

      <!-- Grid -->
      ${filtered.length === 0 ? html`
        <div class="empty">
          <div class="icon">📋</div>
          ${allEntries.length === 0
            ? html`<p class="title">Noch keine Vorlagen</p><p>Speichere einen Screen als Vorlage, um hier loszulegen.</p>`
            : html`<p class="title">Keine Treffer</p><p>Ändere den Filter oder die Kategorie.</p>`
          }
        </div>
      ` : html`
        <div class="grid">
          ${filtered.map(([id, t]) => {
            const wCount = t.screen_config?.widgets?.length || 0;
            const screenType = t.screen_config?.type || "dashboard";
            return html`
              <div class="card">
                <div class="card-preview">
                  ${categoryIcons[t.category] || "📋"}
                  ${wCount > 0 ? html`
                    <div class="widget-dots">
                      ${Array.from({ length: Math.min(wCount, 6) }).map(() => html`
                        <div class="widget-dot"></div>
                      `)}
                    </div>
                  ` : ""}
                </div>
                <div class="card-body">
                  <div class="card-name">${t.name || id}</div>
                  <div class="card-desc">${t.description || "Keine Beschreibung"}</div>
                  <div class="card-meta">
                    <span class="badge">${t.category || "custom"}</span>
                    <span class="badge">${screenType}</span>
                    <span>${wCount} Widget${wCount !== 1 ? "s" : ""}</span>
                    ${(t.variables || []).length ? html`
                      <span>${t.variables.length} Variable${t.variables.length !== 1 ? "n" : ""}</span>
                    ` : ""}
                  </div>
                  <div class="card-actions">
                    <button class="btn" @click=${() => this._emit("edit-template", { templateId: id })}>
                      ✏️ Bearbeiten
                    </button>
                    <button class="btn" @click=${() => this._exportTemplate(id)}>
                      📤 Exportieren
                    </button>
                    <button class="btn danger" @click=${() => this._emit("delete-template", { templateId: id })}>
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            `;
          })}
        </div>
      `}
    `;
  }

  _filterTemplates(entries) {
    let list = entries;
    if (this._category !== "all") {
      list = list.filter(([, t]) => (t.category || "custom") === this._category);
    }
    const q = (this._filter || "").toLowerCase().trim();
    if (q) {
      list = list.filter(([id, t]) =>
        (t.name || id).toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q)
      );
    }
    return list.sort(([, a], [, b]) => (a.name || "").localeCompare(b.name || "", "de"));
  }

  _getCategories(entries) {
    const counts = {};
    for (const [, t] of entries) {
      const cat = t.category || "custom";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  }

  async _exportTemplate(id) {
    try {
      await copyToClipboard(JSON.stringify(this.templates[id], null, 2));
      this._emit("toast", { message: "📋 In Zwischenablage kopiert" });
    } catch {
      this._emit("toast", { message: "❌ Kopieren fehlgeschlagen", type: "error" });
    }
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-template-gallery", TdTemplateGallery);

/* ══════════════════════════════════════════════════════════
   TEMPLATE EDITOR
   ══════════════════════════════════════════════════════════ */

class TdTemplateEditor extends LitElement {
  static get properties() {
    return {
      hass:       { type: Object },
      template:   { type: Object },
      templateId: { type: String },
      fonts:      { type: Array },
      _cfg:       { type: Object },
      _jsonValid: { type: Boolean },
    };
  }

  constructor() {
    super();
    this._cfg = null;
    this._jsonValid = true;
  }

  updated(changed) {
    if (changed.has("template")) {
      this._cfg = this.template ? deepClone(this.template) : {
        name: "",
        description: "",
        category: "custom",
        screen_config: {
          type: "dashboard",
          grid: { columns: 3, rows: 2 },
          widgets: [],
          duration: 15,
          background_color: "#121212",
          background_image: "",
          background_image_size: "cover",
        },
        variables: [],
      };
      this._jsonValid = true;
    }
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; max-width: 800px; margin: 0 auto; }

      .page-header {
        display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
      }
      .page-header button {
        font-size: 20px; padding: 8px; border: none;
        background: none; color: var(--primary-text-color);
        cursor: pointer; border-radius: 8px;
      }
      .page-header button:hover { background: rgba(255,255,255,.05); }
      .page-header span { font-size: 20px; font-weight: 500; }

      .sec {
        background: var(--card-background-color); border-radius: 14px;
        padding: 20px; margin-bottom: 16px;
        border: 1px solid rgba(255,255,255,.04);
      }
      .sec h3 {
        margin: 0 0 16px; font-size: 16px; font-weight: 500;
        display: flex; align-items: center; gap: 6px;
      }

      .f { margin-bottom: 14px; }
      .f label {
        display: block; font-size: 13px;
        color: var(--secondary-text-color); margin-bottom: 6px;
      }
      .f input, .f select, .f textarea {
        width: 100%; padding: 10px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 14px; outline: none;
      }
      .f input:focus, .f select:focus, .f textarea:focus {
        border-color: var(--primary-color);
      }
      .f textarea { font-family: inherit; resize: vertical; min-height: 60px; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

      /* Variables */
      .var-list { list-style: none; padding: 0; margin: 0; }
      .var-item {
        display: flex; gap: 6px; align-items: center;
        padding: 10px 12px; background: var(--primary-background-color);
        border-radius: 8px; margin-bottom: 6px;
        border: 1px solid var(--divider-color);
      }
      .var-item input {
        flex: 1; padding: 6px 8px; font-size: 13px;
        border: 1px solid var(--divider-color); border-radius: 6px;
        background: var(--primary-background-color);
        color: var(--primary-text-color);
      }
      .var-del {
        padding: 4px 8px; border: none; background: none;
        color: var(--secondary-text-color); cursor: pointer;
        font-size: 14px; border-radius: 4px;
      }
      .var-del:hover { color: #F44336; background: rgba(244,67,54,.08); }

      .add-btn {
        width: 100%; padding: 12px; border: 2px dashed var(--divider-color);
        border-radius: 8px; background: none;
        color: var(--secondary-text-color); cursor: pointer;
        font-size: 13px; transition: all .15s;
      }
      .add-btn:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
      }

      /* JSON editor */
      .json-editor {
        width: 100%; min-height: 240px; padding: 10px;
        font-family: monospace; font-size: 12px;
        resize: vertical; background: var(--primary-background-color);
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color); border-radius: 8px;
        outline: none; transition: border-color .12s;
      }
      .json-editor:focus { border-color: var(--primary-color); }
      .json-editor.invalid { border-color: #F44336; }
      .json-status {
        font-size: 11px; margin-top: 4px;
        color: var(--secondary-text-color);
      }
      .json-status.error { color: #F44336; }

      /* Save bar */
      .savebar {
        position: sticky; bottom: 0; padding: 16px;
        display: flex; justify-content: flex-end; gap: 12px;
        background: var(--card-background-color);
        border-top: 1px solid var(--divider-color);
        border-radius: 0 0 12px 12px;
      }
      .btn {
        padding: 10px 24px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: none;
        color: var(--primary-text-color); font-size: 14px; cursor: pointer;
      }
      .btn:hover { background: rgba(255,255,255,.05); }
      .btn.p { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
      .btn.p:hover { filter: brightness(1.1); }
    `;
  }

  render() {
    if (!this._cfg) return html``;
    const c = this._cfg;

    return html`
      <div class="page-header">
        <button @click=${() => this._emit("back", {})}>←</button>
        <span>📋 Vorlage ${this.templateId ? "bearbeiten" : "erstellen"}</span>
      </div>

      <!-- General -->
      <div class="sec">
        <h3>📝 Allgemein</h3>
        <div class="f">
          <label>Name</label>
          <input .value=${c.name || ""}
                 placeholder="Meine Vorlage"
                 @input=${(e) => this._set("name", e.target.value)}>
        </div>
        <div class="f">
          <label>Beschreibung</label>
          <textarea .value=${c.description || ""}
                    placeholder="Kurze Beschreibung..."
                    @input=${(e) => this._set("description", e.target.value)}></textarea>
        </div>
        <div class="row">
          <div class="f">
            <label>Kategorie</label>
            <select .value=${c.category || "custom"}
                    @change=${(e) => this._set("category", e.target.value)}>
              <option value="dashboard">📊 Dashboard</option>
              <option value="weather">🌤️ Wetter</option>
              <option value="energy">⚡ Energie</option>
              <option value="security">🔒 Sicherheit</option>
              <option value="media">🎵 Medien</option>
              <option value="custom">📋 Benutzerdefiniert</option>
            </select>
          </div>
          <div class="f">
            <label>Screen-Typ</label>
            <select .value=${c.screen_config?.type || "dashboard"}
                    @change=${(e) => this._setScreenConfig("type", e.target.value)}>
              ${TD_SCREEN_TYPES.map((t) => html`<option value=${t.v}>${t.l}</option>`)}
            </select>
          </div>
        </div>
      </div>

      <!-- Variables -->
      <div class="sec">
        <h3>🔀 Variablen</h3>
        <p style="font-size:12px;color:var(--secondary-text-color);margin:0 0 12px">
          Variablen ermöglichen es, beim Importieren Entity-IDs oder Texte anpassen zu können.
        </p>
        <ul class="var-list">
          ${(c.variables || []).map((v, i) => html`
            <li class="var-item">
              <input .value=${v.key || ""}
                     placeholder="key"
                     @input=${(e) => this._setVar(i, "key", e.target.value)}>
              <input .value=${v.label || ""}
                     placeholder="Anzeigename"
                     @input=${(e) => this._setVar(i, "label", e.target.value)}>
              <input .value=${v.default || ""}
                     placeholder="Standard"
                     @input=${(e) => this._setVar(i, "default", e.target.value)}>
              <button class="var-del" @click=${() => this._removeVar(i)}>🗑️</button>
            </li>
          `)}
        </ul>
        <button class="add-btn" @click=${() => this._addVar()}>
          ➕ Variable hinzufügen
        </button>
      </div>

      <!-- JSON -->
      <div class="sec">
        <h3>🔧 Screen-Konfiguration (JSON)</h3>
        <textarea class="json-editor ${this._jsonValid ? "" : "invalid"}"
                  .value=${JSON.stringify(c.screen_config || {}, null, 2)}
                  @input=${(e) => this._onJsonInput(e.target.value)}></textarea>
        <div class="json-status ${this._jsonValid ? "" : "error"}">
          ${this._jsonValid ? "✓ Gültiges JSON" : "✕ Ungültiges JSON – Änderungen werden nicht übernommen"}
        </div>
      </div>

      <!-- Save -->
      <div class="savebar">
        <button class="btn" @click=${() => this._emit("back", {})}>Abbrechen</button>
        <button class="btn p" @click=${() => this._save()}>💾 Speichern</button>
      </div>
    `;
  }

  _set(key, value) { this._cfg = { ...this._cfg, [key]: value }; }

  _setScreenConfig(key, value) {
    const sc = { ...(this._cfg.screen_config || {}) };
    sc[key] = value;
    this._cfg = { ...this._cfg, screen_config: sc };
  }

  _setVar(index, key, value) {
    const vars = [...(this._cfg.variables || [])];
    vars[index] = { ...vars[index], [key]: value };
    this._cfg = { ...this._cfg, variables: vars };
  }

  _addVar() {
    this._cfg = {
      ...this._cfg,
      variables: [...(this._cfg.variables || []), { key: "", label: "", default: "" }],
    };
  }

  _removeVar(index) {
    const vars = [...(this._cfg.variables || [])];
    vars.splice(index, 1);
    this._cfg = { ...this._cfg, variables: vars };
  }

  _onJsonInput(text) {
    const parsed = safeJsonParse(text, null);
    if (parsed && typeof parsed === "object") {
      this._jsonValid = true;
      this._cfg = { ...this._cfg, screen_config: parsed };
    } else {
      this._jsonValid = false;
    }
  }

  _save() {
    this._emit("save", {
      id: this.templateId || uniqueId("template"),
      ...this._cfg,
    });
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-template-editor", TdTemplateEditor);

/* ══════════════════════════════════════════════════════════
   ALERT LIST
   ══════════════════════════════════════════════════════════ */

class TdAlertList extends LitElement {
  static get properties() {
    return {
      hass:           { type: Object },
      alertTemplates: { type: Object },
      sounds:         { type: Array },
      _filter:        { type: String },
    };
  }

  constructor() {
    super();
    this._filter = "";
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; }

      .hdr {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 16px; flex-wrap: wrap; gap: 10px;
      }
      .hdr h2 { margin: 0; font-size: 22px; font-weight: 500; }

      .desc {
        margin: 0 0 16px; color: var(--secondary-text-color);
        font-size: 13px; line-height: 1.5;
      }

      .filter-bar {
        display: flex; gap: 6px; margin-bottom: 16px;
      }
      .filter-bar input {
        flex: 1; max-width: 320px; padding: 8px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 13px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
      }

      .card {
        background: var(--card-background-color); border-radius: 14px;
        padding: 18px; border: 1px solid var(--divider-color);
        transition: all .2s;
      }
      .card:hover { border-color: rgba(255,255,255,.12); }

      .card-top {
        display: flex; justify-content: space-between;
        align-items: center; margin-bottom: 12px;
      }
      .card-title {
        font-size: 16px; font-weight: 500;
        display: flex; align-items: center; gap: 6px;
      }

      .sev-badge {
        padding: 3px 10px; border-radius: 12px;
        font-size: 11px; font-weight: 600;
        text-transform: uppercase; letter-spacing: .03em;
      }
      .sev-badge.info { background: rgba(33,150,243,.12); color: #42A5F5; }
      .sev-badge.warning { background: rgba(255,152,0,.12); color: #FFA726; }
      .sev-badge.critical { background: rgba(244,67,54,.12); color: #EF5350; }

      .card-meta {
        font-size: 13px; color: var(--secondary-text-color);
        margin-bottom: 14px; line-height: 1.6;
      }
      .card-meta span { display: block; }

      .card-actions { display: flex; gap: 6px; flex-wrap: wrap; }

      .btn {
        padding: 7px 14px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: none;
        color: var(--primary-text-color); font-size: 12px;
        cursor: pointer; transition: all .12s;
      }
      .btn:hover { background: rgba(255,255,255,.05); }
      .btn.p { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
      .btn.test { border-color: rgba(76,175,80,.3); color: #66BB6A; }
      .btn.test:hover { background: rgba(76,175,80,.08); }
      .btn.danger { border-color: rgba(244,67,54,.3); color: #ef5350; }
      .btn.danger:hover { background: rgba(244,67,54,.08); }

      .empty {
        text-align: center; padding: 60px 20px;
        color: var(--secondary-text-color);
      }
      .empty .icon { font-size: 52px; opacity: .2; margin-bottom: 16px; }
      .empty .title { font-size: 18px; font-weight: 500; color: var(--primary-text-color); }
    `;
  }

  render() {
    const entries = Object.entries(this.alertTemplates || {});
    const filtered = this._filterAlerts(entries);
    const modeLabels = {
      fullscreen: "Vollbild", banner: "Banner",
      toast: "Toast", pip: "PIP",
    };

    return html`
      <div class="hdr">
        <h2>🔔 Alert-Studio</h2>
        <button class="btn p" @click=${() => this._emit("create-alert", {})}>
          ➕ Neue Vorlage
        </button>
      </div>

      <p class="desc">
        Erstelle Alert-Vorlagen für Fullscreen, Banner, Toast und PIP.
        Sounds und Vibration lassen sich direkt testen und über Automationen wiederverwenden.
      </p>

      ${entries.length > 3 ? html`
        <div class="filter-bar">
          <input .value=${this._filter}
                 placeholder="Alert suchen..."
                 @input=${(e) => this._filter = e.target.value}>
        </div>
      ` : ""}

      ${filtered.length === 0 ? html`
        <div class="empty">
          <div class="icon">🔔</div>
          <p class="title">${entries.length ? "Keine Treffer" : "Keine Alert-Vorlagen"}</p>
          <p>${entries.length ? "Ändere den Suchbegriff." : "Erstelle eine neue Vorlage, um loszulegen."}</p>
        </div>
      ` : html`
        <div class="grid">
          ${filtered.map(([id, a]) => html`
            <div class="card">
              <div class="card-top">
                <span class="card-title">
                  ${a.icon || "🔔"} ${a.title || a.name || id}
                </span>
                <span class="sev-badge ${a.severity || "info"}">
                  ${a.severity || "info"}
                </span>
              </div>
              <div class="card-meta">
                <span>Modus: ${modeLabels[a.mode] || a.mode || "fullscreen"}</span>
                <span>Dauer: ${a.duration || "∞"}s</span>
                ${a.message ? html`<span>„${a.message.substring(0, 60)}${a.message.length > 60 ? "…" : ""}"</span>` : ""}
                ${a.sound || a.sound_url ? html`<span>🔊 Sound konfiguriert</span>` : ""}
              </div>
              <div class="card-actions">
                <button class="btn" @click=${() => this._emit("edit-alert", { alertId: id })}>
                  ✏️ Bearbeiten
                </button>
                <button class="btn test" @click=${() => this._testAlert(a)}
                        title="Alert auf allen Geräten testen">
                  👁️ Testen
                </button>
                <button class="btn" @click=${() => this._previewSound(a)}
                        title="Sound vorhören">
                  🔊
                </button>
                <button class="btn danger" @click=${() => this._emit("delete-alert", { alertId: id })}>
                  🗑️
                </button>
              </div>
            </div>
          `)}
        </div>
      `}
    `;
  }

  _filterAlerts(entries) {
    const q = (this._filter || "").toLowerCase().trim();
    if (!q) return entries;
    return entries.filter(([id, a]) =>
      (a.title || a.name || id).toLowerCase().includes(q) ||
      (a.message || "").toLowerCase().includes(q) ||
      (a.severity || "").toLowerCase().includes(q)
    );
  }

  _testAlert(alert) {
    if (this.hass) {
      this.hass.callService("ticker_display", "show_alert", {
        device: "all", ...alert,
      });
    }
  }

  _previewSound(alert) {
    let url = alert.sound_url || "";
    if (!url && alert.sound && Array.isArray(this.sounds)) {
      const hit = this.sounds.find((s) => s.id === alert.sound);
      if (hit?.url) url = hit.url;
    }
    if (!url) return;
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, (alert.volume || 100) / 100));
    audio.play().catch(() => {});
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-alert-list", TdAlertList);

/* ══════════════════════════════════════════════════════════
   ALERT EDITOR
   ══════════════════════════════════════════════════════════ */

class TdAlertEditor extends LitElement {
  static get properties() {
    return {
      hass:    { type: Object },
      alert:   { type: Object },
      alertId: { type: String },
      sounds:  { type: Array },
      haAudio: { type: Array },
      _cfg:    { type: Object },
      _audio:  { type: Object },
    };
  }

  constructor() {
    super();
    this._cfg = null;
    this._audio = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._audio) { this._audio.pause(); this._audio = null; }
  }

  updated(changed) {
    if (changed.has("alert")) {
      this._cfg = this.alert ? deepClone(this.alert) : {
        name: "", title: "", message: "",
        severity: "info", mode: "fullscreen",
        icon: "", sound: "", sound_url: "",
        duration: 10, flash_screen: false,
        vibrate: false, persistent: false,
        color: "", volume: 100,
      };
    }
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; max-width: 720px; margin: 0 auto; }

      .sec {
        background: var(--card-background-color); border-radius: 14px;
        padding: 20px; margin-bottom: 16px;
        border: 1px solid rgba(255,255,255,.04);
      }
      .sec h3 {
        margin: 0 0 16px; font-size: 16px; font-weight: 500;
        display: flex; align-items: center; gap: 6px;
      }

      .f { margin-bottom: 14px; }
      .f label {
        display: block; font-size: 13px;
        color: var(--secondary-text-color); margin-bottom: 6px;
      }
      .f input, .f select, .f textarea {
        width: 100%; padding: 10px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 14px; outline: none;
      }
      .f input:focus, .f select:focus, .f textarea:focus {
        border-color: var(--primary-color);
      }
      .f textarea { resize: vertical; min-height: 60px; font-family: inherit; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

      .tog {
        display: flex; align-items: center; gap: 10px; padding: 6px 0;
        font-size: 13px;
      }
      .tog input[type=checkbox] {
        width: 18px; height: 18px; accent-color: var(--primary-color);
      }

      /* Preview */
      .preview {
        background: #121212; border-radius: 14px; padding: 32px;
        text-align: center; margin-top: 16px;
        border: 2px solid var(--divider-color);
        transition: border-color .3s;
      }
      .preview.info { border-color: rgba(33,150,243,.4); }
      .preview.warning { border-color: rgba(255,152,0,.4); }
      .preview.critical { border-color: rgba(244,67,54,.4); animation: pulse-border 2s ease infinite; }
      @keyframes pulse-border {
        0%, 100% { border-color: rgba(244,67,54,.4); }
        50% { border-color: rgba(244,67,54,.8); }
      }
      .preview-icon { font-size: 52px; margin-bottom: 14px; }
      .preview-title { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 8px; }
      .preview-message { font-size: 16px; color: rgba(255,255,255,.7); line-height: 1.5; }

      /* Savebar */
      .savebar {
        position: sticky; bottom: 0; display: flex;
        justify-content: flex-end; gap: 10px; padding: 16px;
        background: var(--card-background-color);
        border-top: 1px solid var(--divider-color);
      }
      .btn {
        padding: 10px 24px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: none;
        color: var(--primary-text-color); font-size: 14px; cursor: pointer;
        transition: all .12s;
      }
      .btn:hover { background: rgba(255,255,255,.05); }
      .btn.p { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
      .btn.p:hover { filter: brightness(1.1); }
      .btn.test { background: #388E3C; border-color: #388E3C; color: #fff; }
      .btn.test:hover { filter: brightness(1.1); }
    `;
  }

  render() {
    if (!this._cfg) return html``;
    const c = this._cfg;
    const sevIcons = { info: "ℹ️", warning: "⚠️", critical: "🚨" };

    return html`
      <!-- Content -->
      <div class="sec">
        <h3>📝 Alert-Inhalt</h3>
        <div class="f">
          <label>Name (intern)</label>
          <input .value=${c.name || ""}
                 @input=${(e) => this._set("name", e.target.value)}
                 placeholder="z.B. Türklingel">
        </div>
        <div class="row">
          <div class="f">
            <label>Schweregrad</label>
            <select .value=${c.severity || "info"}
                    @change=${(e) => this._set("severity", e.target.value)}>
              <option value="info">ℹ️ Info</option>
              <option value="warning">⚠️ Warnung</option>
              <option value="critical">🚨 Kritisch</option>
            </select>
          </div>
          <div class="f">
            <label>Modus</label>
            <select .value=${c.mode || "fullscreen"}
                    @change=${(e) => this._set("mode", e.target.value)}>
              <option value="fullscreen">Vollbild</option>
              <option value="banner">Banner</option>
              <option value="toast">Toast</option>
              <option value="pip">PIP</option>
            </select>
          </div>
        </div>
        <div class="f">
          <label>Icon</label>
          <input .value=${c.icon || ""}
                 @input=${(e) => this._set("icon", e.target.value)}
                 placeholder="🔔 oder leer für Standard">
        </div>
        <div class="f">
          <label>Titel</label>
          <input .value=${c.title || ""}
                 @input=${(e) => this._set("title", e.target.value)}
                 placeholder="Achtung!">
        </div>
        <div class="f">
          <label>Nachricht</label>
          <textarea .value=${c.message || ""}
                    @input=${(e) => this._set("message", e.target.value)}
                    placeholder="Jemand steht vor der Tür..."></textarea>
        </div>
      </div>

      <!-- Sound & Behaviour -->
      <div class="sec">
        <h3>🔊 Sound & Verhalten</h3>
        <p style="margin:0 0 12px;font-size:12px;color:var(--secondary-text-color)">
          Du kannst interne Sounds oder Audio aus dem HA-Medienbrowser verwenden.
        </p>
        <div class="row">
          <div class="f">
            <td-sound-picker
              .value=${c.sound || ""}
              .sounds=${this.sounds || []}
              label="Interner Sound"
              @value-changed=${(e) => {
                this._set("sound", e.detail.value);
                if (e.detail.value) this._set("sound_url", "");
              }}>
            </td-sound-picker>
          </div>
          <div class="f">
            <label>Lautstärke: ${c.volume || 100}%</label>
            <input type="range" min="0" max="100"
                   .value=${c.volume || 100}
                   @input=${(e) => this._set("volume", +e.target.value)}>
          </div>
        </div>

        ${(this.haAudio || []).length ? html`
          <div class="f">
            <td-ha-media-picker
              .items=${this.haAudio || []}
              .value=${c.sound_url || ""}
              label="HA Audio"
              @value-changed=${(e) => {
                this._set("sound_url", e.detail.value);
                if (e.detail.value) this._set("sound", "");
              }}>
            </td-ha-media-picker>
          </div>
        ` : ""}

        <div class="row">
          <div class="f">
            <label>Dauer (0 = manuell schließen)</label>
            <input type="number" min="0" max="300"
                   .value=${c.duration || 10}
                   @change=${(e) => this._set("duration", +e.target.value)}>
          </div>
          <div class="f">
            <td-color-picker
              .value=${c.color || "#2196F3"}
              label="Farbe (Banner)"
              @value-changed=${(e) => this._set("color", e.detail.value)}>
            </td-color-picker>
          </div>
        </div>

        <div class="tog">
          <input type="checkbox" .checked=${c.flash_screen || false}
                 @change=${(e) => this._set("flash_screen", e.target.checked)}>
          <span>Bildschirm blinken</span>
        </div>
        <div class="tog">
          <input type="checkbox" .checked=${c.vibrate || false}
                 @change=${(e) => this._set("vibrate", e.target.checked)}>
          <span>Vibration</span>
        </div>
        <div class="tog">
          <input type="checkbox" .checked=${c.persistent || false}
                 @change=${(e) => this._set("persistent", e.target.checked)}>
          <span>Dauerhaft (kein Auto-Close)</span>
        </div>
      </div>

      <!-- PIP -->
      ${c.mode === "pip" ? html`
        <div class="sec">
          <h3>📹 PIP-Einstellungen</h3>
          <div class="f">
            <td-entity-picker
              .hass=${this.hass}
              .value=${c.entity_id || ""}
              domain="camera"
              label="Kamera-Entity"
              @value-changed=${(e) => this._set("entity_id", e.detail.value)}>
            </td-entity-picker>
          </div>
          <div class="row">
            <div class="f">
              <label>Position</label>
              <select .value=${c.pip_position || "top-right"}
                      @change=${(e) => this._set("pip_position", e.target.value)}>
                <option value="top-right">Oben rechts</option>
                <option value="top-left">Oben links</option>
                <option value="bottom-right">Unten rechts</option>
                <option value="bottom-left">Unten links</option>
              </select>
            </div>
            <div class="f">
              <label>Größe</label>
              <select .value=${c.pip_size || "medium"}
                      @change=${(e) => this._set("pip_size", e.target.value)}>
                <option value="small">Klein</option>
                <option value="medium">Mittel</option>
                <option value="large">Groß</option>
              </select>
            </div>
          </div>
        </div>
      ` : ""}

      <!-- Preview -->
      <div class="sec">
        <h3>👁️ Vorschau</h3>
        <div class="preview ${c.severity || "info"}">
          <div class="preview-icon">${c.icon || sevIcons[c.severity] || "ℹ️"}</div>
          <div class="preview-title">${c.title || "Alert"}</div>
          <div class="preview-message">${c.message || "Nachricht..."}</div>
        </div>
      </div>

      <!-- Save -->
      <div class="savebar">
        <button class="btn" @click=${() => this._emit("back", {})}>Abbrechen</button>
        <button class="btn" @click=${() => this._testSound()}>🔊 Sound</button>
        <button class="btn test" @click=${() => this._testAlert()}>👁️ Testen</button>
        <button class="btn p" @click=${() => this._save()}>💾 Speichern</button>
      </div>
    `;
  }

  _set(key, value) { this._cfg = { ...this._cfg, [key]: value }; }

  _testAlert() {
    if (this.hass) {
      this.hass.callService("ticker_display", "show_alert", {
        device: "all", ...this._cfg,
      });
    }
  }

  _testSound() {
    if (this._audio) { this._audio.pause(); this._audio = null; }
    let url = this._cfg?.sound_url || "";
    if (!url) {
      const hit = (this.sounds || []).find((s) => s.id === this._cfg?.sound);
      if (hit?.url) url = hit.url;
    }
    if (!url) return;
    this._audio = new Audio(url);
    this._audio.volume = Math.max(0, Math.min(1, (this._cfg?.volume || 100) / 100));
    this._audio.play().catch(() => {});
  }

  _save() {
    this._emit("save", {
      id: this.alertId || uniqueId("alert"),
      ...this._cfg,
    });
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-alert-editor", TdAlertEditor);

/* ══════════════════════════════════════════════════════════
   THEME LIST
   ══════════════════════════════════════════════════════════ */

class TdThemeList extends LitElement {
  static get properties() {
    return {
      hass:         { type: Object },
      customThemes: { type: Object },
      _preview:     { type: String },
    };
  }

  constructor() {
    super();
    this._preview = null;
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; }

      .hdr {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 16px; flex-wrap: wrap; gap: 10px;
      }
      .hdr h2 { margin: 0; font-size: 22px; font-weight: 500; }

      .desc {
        margin: 0 0 20px; color: var(--secondary-text-color);
        font-size: 13px; line-height: 1.5;
      }

      .cat-label {
        font-size: 14px; font-weight: 600; text-transform: uppercase;
        letter-spacing: .5px; color: var(--secondary-text-color);
        margin: 24px 0 12px; padding-bottom: 8px;
        border-bottom: 1px solid var(--divider-color);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 16px;
      }

      .card {
        background: var(--card-background-color); border-radius: 14px;
        overflow: hidden; border: 1px solid var(--divider-color);
        cursor: default; transition: all .2s;
      }
      .card:hover { border-color: rgba(255,255,255,.15); }
      .card.interactive { cursor: pointer; }
      .card.interactive:hover {
        box-shadow: 0 4px 16px rgba(0,0,0,.2);
        transform: translateY(-2px);
      }

      .swatch {
        height: 80px; display: flex; align-items: flex-end;
        padding: 10px; gap: 6px; position: relative;
      }
      .swatch .color-row {
        display: flex; gap: 4px;
      }
      .dot {
        width: 14px; height: 14px; border-radius: 50%;
        border: 1px solid rgba(255,255,255,.15);
        transition: transform .12s;
      }
      .dot:hover { transform: scale(1.3); }
      .swatch .name-overlay {
        position: absolute; top: 8px; left: 10px;
        font-size: 11px; color: rgba(255,255,255,.5);
        font-weight: 500;
      }

      .card-body { padding: 12px 14px; }
      .card-name { font-size: 14px; font-weight: 500; }
      .card-meta {
        font-size: 11px; color: var(--secondary-text-color);
        margin-top: 4px;
      }

      .card-actions {
        display: flex; gap: 6px; padding: 8px 14px 14px;
      }
      .btn {
        padding: 5px 12px; border: 1px solid var(--divider-color);
        border-radius: 6px; background: none;
        color: var(--primary-text-color); font-size: 12px;
        cursor: pointer; transition: all .12s;
      }
      .btn:hover { background: rgba(255,255,255,.05); }
      .btn.p { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
      .btn.danger { border-color: rgba(244,67,54,.3); color: #ef5350; }
      .btn.danger:hover { background: rgba(244,67,54,.08); }

      /* Theme preview overlay */
      .preview-overlay {
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,.7); display: flex;
        align-items: center; justify-content: center;
        animation: fadeIn .15s ease;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .preview-card {
        border-radius: 16px; padding: 24px; width: min(480px, 90vw);
        box-shadow: 0 12px 48px rgba(0,0,0,.5);
      }
      .preview-widgets {
        display: grid; grid-template-columns: 1fr 1fr 1fr;
        gap: 10px; margin-bottom: 16px;
      }
      .preview-widget {
        border-radius: 10px; padding: 14px; text-align: center;
      }
      .preview-widget .val { font-size: 22px; font-weight: 600; }
      .preview-widget .lbl { font-size: 11px; margin-top: 4px; }
      .preview-ticker {
        padding: 10px; border-radius: 8px; text-align: center;
        font-size: 12px;
      }
      .preview-close {
        margin-top: 16px; width: 100%; padding: 10px;
        border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
        background: none; color: inherit; cursor: pointer;
        font-size: 13px;
      }
      .preview-close:hover { background: rgba(255,255,255,.05); }
    `;
  }

  render() {
    const builtins = [
      { id: "dark",          n: "🌙 Dark",          bg: "#121212", card: "#1E1E1E", accent: "#2196F3", positive: "#4CAF50", negative: "#F44336", text: "#FFFFFF", textSec: "rgba(255,255,255,0.6)" },
      { id: "light",         n: "☀️ Light",          bg: "#FAFAFA", card: "#FFFFFF", accent: "#1976D2", positive: "#388E3C", negative: "#D32F2F", text: "#212121", textSec: "rgba(0,0,0,0.54)" },
      { id: "high-contrast", n: "🔲 High Contrast",  bg: "#000",    card: "#1A1A1A", accent: "#00BFFF", positive: "#0F0",    negative: "#F00",    text: "#FFFFFF", textSec: "#CCCCCC" },
      { id: "night",         n: "🌃 Night",          bg: "#0A0000", card: "#1A0505", accent: "#CC3333", positive: "#664444", negative: "#CC2222", text: "#FF6666", textSec: "rgba(255,100,100,0.5)" },
      { id: "glass-blue",    n: "🧊 Glass Blue",     bg: "#0C1420", card: "rgba(255,255,255,0.08)", accent: "#57B8FF", positive: "#60E3A1", negative: "#FF6B6B", text: "#FFFFFF", textSec: "rgba(255,255,255,0.5)" },
      { id: "oled",          n: "🖤 OLED",           bg: "#000000", card: "#0A0A0A", accent: "#35A7FF", positive: "#7CFC00", negative: "#FF5050", text: "#FFFFFF", textSec: "rgba(255,255,255,0.5)" },
    ];

    const customs = Object.entries(this.customThemes || {});

    return html`
      <div class="hdr">
        <h2>🎨 Theme-Studio</h2>
        <button class="btn p" @click=${() => this._emit("create-theme", {})}>
          ➕ Neues Theme
        </button>
      </div>

      <p class="desc">
        Themes steuern Farben, Abstände und Schriften für Display, Widgets und Ticker.
        Screens können zusätzlich eigene Werte überschreiben.
      </p>

      <div class="cat-label">Eingebaut (${builtins.length})</div>
      <div class="grid">
        ${builtins.map((t) => this._renderThemeCard(t, false))}
      </div>

      ${customs.length > 0 ? html`
        <div class="cat-label">Benutzerdefiniert (${customs.length})</div>
        <div class="grid">
          ${customs.map(([id, t]) => this._renderCustomThemeCard(id, t))}
        </div>
      ` : ""}

      ${this._preview ? this._renderPreviewOverlay() : ""}
    `;
  }

  _renderThemeCard(t, editable) {
    return html`
      <div class="card interactive" @click=${() => this._preview = t.id}>
        <div class="swatch" style="background:${t.bg}">
          <span class="name-overlay">${t.id}</span>
          <div class="color-row">
            <div class="dot" style="background:${t.accent}" title="Akzent"></div>
            <div class="dot" style="background:${t.positive}" title="Positiv"></div>
            <div class="dot" style="background:${t.negative}" title="Negativ"></div>
            <div class="dot" style="background:${t.card}" title="Karte"></div>
          </div>
        </div>
        <div class="card-body">
          <div class="card-name">${t.n}</div>
          <div class="card-meta">Klick für Vorschau</div>
        </div>
      </div>
    `;
  }

  _renderCustomThemeCard(id, t) {
    const v = t.vars || {};
    return html`
      <div class="card">
        <div class="swatch" style="background:${v.bg || "#121212"}"
             @click=${() => this._showCustomPreview(id, t)}>
          <span class="name-overlay">${id}</span>
          <div class="color-row">
            <div class="dot" style="background:${v.accent || "#2196F3"}" title="Akzent"></div>
            <div class="dot" style="background:${v.positive || "#4CAF50"}" title="Positiv"></div>
            <div class="dot" style="background:${v.negative || v["negative"] || "#F44336"}" title="Negativ"></div>
            <div class="dot" style="background:${v["card-bg"] || "#1E1E1E"}" title="Karte"></div>
          </div>
        </div>
        <div class="card-body">
          <div class="card-name">${t.name || id}</div>
          <div class="card-meta">${Object.keys(v).length} Variablen</div>
        </div>
        <div class="card-actions">
          <button class="btn" @click=${() => this._emit("edit-theme", { themeId: id })}>✏️</button>
          <button class="btn danger" @click=${() => this._emit("delete-theme", { themeId: id })}>🗑️</button>
        </div>
      </div>
    `;
  }

  _renderPreviewOverlay() {
    const builtins = {
      dark:            { bg: "#121212", card: "#1E1E1E", text: "#FFF", textSec: "#999", accent: "#2196F3", positive: "#4CAF50", ticker: "rgba(255,255,255,.03)" },
      light:           { bg: "#FAFAFA", card: "#FFF",    text: "#212121", textSec: "#666", accent: "#1976D2", positive: "#388E3C", ticker: "rgba(0,0,0,.03)" },
      "high-contrast": { bg: "#000",    card: "#1A1A1A", text: "#FFF", textSec: "#CCC", accent: "#00BFFF", positive: "#0F0",    ticker: "#111" },
      night:           { bg: "#0A0000", card: "#1A0505", text: "#F66", textSec: "#944", accent: "#C33",    positive: "#644",    ticker: "rgba(255,0,0,.03)" },
      "glass-blue":    { bg: "#0C1420", card: "rgba(255,255,255,.08)", text: "#FFF", textSec: "#89A", accent: "#57B8FF", positive: "#60E3A1", ticker: "rgba(255,255,255,.04)" },
      oled:            { bg: "#000",    card: "#0A0A0A", text: "#FFF", textSec: "#888", accent: "#35A7FF", positive: "#7CFC00", ticker: "rgba(255,255,255,.02)" },
    };

    let v = builtins[this._preview];

    if (!v) {
      const custom = (this.customThemes || {})[this._preview];
      if (custom?.vars) {
        const cv = custom.vars;
        v = {
          bg: cv.bg || "#121212", card: cv["card-bg"] || "#1E1E1E",
          text: cv["text-primary"] || "#FFF", textSec: cv["text-secondary"] || "#999",
          accent: cv.accent || "#2196F3", positive: cv.positive || "#4CAF50",
          ticker: cv["ticker-bg"] || "rgba(255,255,255,.03)",
        };
      }
    }

    if (!v) { this._preview = null; return html``; }

    return html`
      <div class="preview-overlay" @click=${() => this._preview = null}>
        <div class="preview-card" style="background:${v.bg}" @click=${(e) => e.stopPropagation()}>
          <div class="preview-widgets">
            <div class="preview-widget" style="background:${v.card}">
              <div class="val" style="color:${v.text}">21.5°C</div>
              <div class="lbl" style="color:${v.textSec}">Temperatur</div>
            </div>
            <div class="preview-widget" style="background:${v.card}">
              <div class="val" style="color:${v.accent}">85%</div>
              <div class="lbl" style="color:${v.textSec}">Feuchte</div>
            </div>
            <div class="preview-widget" style="background:${v.card}">
              <div class="val" style="color:${v.positive}">ON</div>
              <div class="lbl" style="color:${v.textSec}">Status</div>
            </div>
          </div>
          <div class="preview-ticker" style="background:${v.ticker};color:${v.textSec}">
            ▶ Ticker-Vorschau · ${this._preview}
          </div>
          <button class="preview-close" style="color:${v.text}"
                  @click=${() => this._preview = null}>
            Schließen
          </button>
        </div>
      </div>
    `;
  }

  _showCustomPreview(id, theme) {
    this._preview = id;
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-theme-list", TdThemeList);

/* ══════════════════════════════════════════════════════════
   THEME EDITOR
   ══════════════════════════════════════════════════════════ */

class TdThemeEditor extends LitElement {
  static get properties() {
    return {
      hass:    { type: Object },
      theme:   { type: Object },
      themeId: { type: String },
      fonts:   { type: Array },
      _cfg:    { type: Object },
    };
  }

  constructor() {
    super();
    this._cfg = null;
  }

  updated(changed) {
    if (changed.has("theme")) {
      this._cfg = this.theme ? deepClone(this.theme) : {
        name: "",
        vars: {
          bg: "#121212", "card-bg": "#1E1E1E",
          "text-primary": "#FFFFFF", "text-secondary": "rgba(255,255,255,0.6)",
          accent: "#2196F3", positive: "#4CAF50",
          warning: "#FF9800", negative: "#F44336",
          info: "#2196F3", "ticker-bg": "rgba(255,255,255,0.03)",
          "widget-gap": "8px", "widget-padding": "12px",
          "widget-radius": "12px", "ticker-height": "36px",
        },
      };
    }
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; max-width: 720px; margin: 0 auto; }

      .sec {
        background: var(--card-background-color); border-radius: 14px;
        padding: 20px; margin-bottom: 16px;
        border: 1px solid rgba(255,255,255,.04);
      }
      .sec h3 {
        margin: 0 0 16px; font-size: 16px; font-weight: 500;
        display: flex; align-items: center; gap: 6px;
      }

      .f { margin-bottom: 14px; }
      .f label {
        display: block; font-size: 13px;
        color: var(--secondary-text-color); margin-bottom: 6px;
      }
      .f input {
        width: 100%; padding: 10px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 14px; outline: none;
      }
      .f input:focus { border-color: var(--primary-color); }

      .color-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
      }
      .color-field {
        display: flex; align-items: center; gap: 10px;
      }
      .color-field input[type=color] {
        width: 44px; height: 38px; padding: 2px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        cursor: pointer; background: none; flex-shrink: 0;
      }
      .color-field .color-label { font-size: 13px; flex: 1; }
      .color-field .color-value {
        font-family: monospace; font-size: 11px;
        color: var(--secondary-text-color);
        min-width: 70px; text-align: right;
      }

      .spacing-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
      }

      /* Preview */
      .preview {
        border-radius: 14px; padding: 24px; margin-top: 16px;
        border: 1px solid var(--divider-color);
      }
      .preview-widgets {
        display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;
      }
      .pw {
        border-radius: 10px; padding: 14px; text-align: center;
      }
      .pw .val { font-size: 22px; font-weight: 600; }
      .pw .lbl { font-size: 11px; margin-top: 4px; }
      .preview-ticker {
        margin-top: 14px; padding: 10px; border-radius: 8px;
        text-align: center; font-size: 12px;
      }

      /* Presets */
      .preset-row {
        display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px;
      }
      .preset-btn {
        padding: 6px 14px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: none;
        color: var(--primary-text-color); font-size: 12px;
        cursor: pointer; transition: all .12s;
      }
      .preset-btn:hover { background: rgba(255,255,255,.05); border-color: var(--primary-color); }

      /* Save */
      .savebar {
        position: sticky; bottom: 0; display: flex;
        justify-content: flex-end; gap: 10px; padding: 16px;
        background: var(--card-background-color);
        border-top: 1px solid var(--divider-color);
      }
      .btn {
        padding: 10px 24px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: none;
        color: var(--primary-text-color); font-size: 14px; cursor: pointer;
      }
      .btn:hover { background: rgba(255,255,255,.05); }
      .btn.p { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
      .btn.p:hover { filter: brightness(1.1); }
    `;
  }

  render() {
    if (!this._cfg) return html``;
    const v = this._cfg.vars || {};

    const colorFields = [
      ["bg",             "Hintergrund"],
      ["card-bg",        "Karten-BG"],
      ["text-primary",   "Text primär"],
      ["text-secondary", "Text sekundär"],
      ["accent",         "Akzent"],
      ["positive",       "Positiv"],
      ["warning",        "Warnung"],
      ["negative",       "Negativ"],
      ["info",           "Info"],
      ["ticker-bg",      "Ticker BG"],
    ];

    const spacingFields = [
      ["widget-gap",     "Widget-Abstand"],
      ["widget-padding", "Widget-Padding"],
      ["widget-radius",  "Widget-Radius"],
      ["ticker-height",  "Ticker-Höhe"],
    ];

    return html`
      <!-- Name -->
      <div class="sec">
        <h3>📝 Name & Basis</h3>
        <div class="f">
          <label>Theme-Name</label>
          <input .value=${this._cfg.name || ""}
                 placeholder="Mein Theme"
                 @input=${(e) => this._cfg = { ...this._cfg, name: e.target.value }}>
        </div>
        <div style="font-size:12px;color:var(--secondary-text-color);line-height:1.5">
          Dieses Theme wirkt auf Display, Screens, Widgets und Ticker.
          Screen-Stile können einzelne Werte zusätzlich überschreiben.
        </div>
      </div>

      <!-- Color Presets -->
      <div class="sec">
        <h3>🎨 Farben</h3>
        <div class="preset-row">
          ${[
            ["Dark",     { bg:"#121212", "card-bg":"#1E1E1E", accent:"#2196F3", positive:"#4CAF50", negative:"#F44336", "text-primary":"#FFF", "text-secondary":"rgba(255,255,255,0.6)" }],
            ["Ocean",    { bg:"#0C1420", "card-bg":"#152030", accent:"#57B8FF", positive:"#60E3A1", negative:"#FF6B6B", "text-primary":"#E0F0FF", "text-secondary":"rgba(200,220,255,0.5)" }],
            ["Sunset",   { bg:"#1A0A0A", "card-bg":"#2A1515", accent:"#FF7043", positive:"#AED581", negative:"#E53935", "text-primary":"#FFE0D0", "text-secondary":"rgba(255,200,180,0.5)" }],
            ["Forest",   { bg:"#0A120A", "card-bg":"#152215", accent:"#66BB6A", positive:"#81C784", negative:"#E57373", "text-primary":"#E0F0E0", "text-secondary":"rgba(200,240,200,0.5)" }],
          ].map(([name, preset]) => html`
            <button class="preset-btn" @click=${() => this._applyColorPreset(preset)}>
              ${name}
            </button>
          `)}
        </div>
        <div class="color-grid">
          ${colorFields.map(([key, label]) => html`
            <div class="color-field">
              <input type="color"
                     .value=${this._safeHex(v[key] || "#121212")}
                     @input=${(e) => this._setVar(key, e.target.value)}>
              <span class="color-label">${label}</span>
              <span class="color-value">${v[key] || ""}</span>
            </div>
          `)}
        </div>
      </div>

      <!-- Spacing -->
      <div class="sec">
        <h3>📐 Abstände & Maße</h3>
        <div class="spacing-grid">
          ${spacingFields.map(([key, label]) => html`
            <div class="f">
              <label>${label}</label>
              <input .value=${v[key] || ""}
                     placeholder="8px"
                     @input=${(e) => this._setVar(key, e.target.value)}>
            </div>
          `)}
        </div>
      </div>

      <!-- Preview -->
      <div class="sec">
        <h3>👁️ Live-Vorschau</h3>
        <div class="preview" style="background:${v.bg || "#121212"}">
          <div class="preview-widgets">
            <div class="pw" style="background:${v["card-bg"] || "#1E1E1E"}; border-radius:${v["widget-radius"] || "12px"}; padding:${v["widget-padding"] || "12px"}">
              <div class="val" style="color:${v["text-primary"] || "#FFF"}">21.5°C</div>
              <div class="lbl" style="color:${v["text-secondary"] || "#999"}">Temperatur</div>
            </div>
            <div class="pw" style="background:${v["card-bg"] || "#1E1E1E"}; border-radius:${v["widget-radius"] || "12px"}; padding:${v["widget-padding"] || "12px"}">
              <div class="val" style="color:${v.accent || "#2196F3"}">85%</div>
              <div class="lbl" style="color:${v["text-secondary"] || "#999"}">Feuchte</div>
            </div>
            <div class="pw" style="background:${v["card-bg"] || "#1E1E1E"}; border-radius:${v["widget-radius"] || "12px"}; padding:${v["widget-padding"] || "12px"}">
              <div class="val" style="color:${v.positive || "#4CAF50"}">ON</div>
              <div class="lbl" style="color:${v["text-secondary"] || "#999"}">Status</div>
            </div>
          </div>
          <div class="preview-ticker"
               style="background:${v["ticker-bg"] || "rgba(255,255,255,.03)"};
                      color:${v["text-secondary"] || "#999"};
                      height:${v["ticker-height"] || "36px"};
                      display:flex;align-items:center;justify-content:center">
            ▶ Ticker-Leiste
          </div>
        </div>
      </div>

      <!-- Save -->
      <div class="savebar">
        <button class="btn" @click=${() => this._emit("back", {})}>Abbrechen</button>
        <button class="btn p" @click=${() => this._save()}>💾 Speichern</button>
      </div>
    `;
  }

  _setVar(key, value) {
    const vars = { ...(this._cfg.vars || {}) };
    vars[key] = value;
    this._cfg = { ...this._cfg, vars };
  }

  _applyColorPreset(preset) {
    const vars = { ...(this._cfg.vars || {}), ...preset };
    this._cfg = { ...this._cfg, vars };
  }

  _safeHex(color) {
    if (!color || !color.startsWith("#")) return "#121212";
    const hex = color.replace("#", "");
    if (hex.length >= 6) return `#${hex.substring(0, 6)}`;
    if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    return "#121212";
  }

  _save() {
    this._emit("save", {
      id: this.themeId || uniqueId("theme"),
      ...this._cfg,
    });
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-theme-editor", TdThemeEditor);

/* ══════════════════════════════════════════════════════════
   SOUND MANAGER
   ══════════════════════════════════════════════════════════ */

class TdSoundManager extends LitElement {
  static get properties() {
    return {
      hass:      { type: Object },
      sounds:    { type: Array },
      _playing:  { type: String },
      _dragOver: { type: Boolean },
    };
  }

  constructor() {
    super();
    this._playing = null;
    this._dragOver = false;
    this._audio = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._audio) { this._audio.pause(); this._audio = null; }
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; }

      .hdr { margin-bottom: 20px; }
      .hdr h2 { margin: 0; font-size: 22px; font-weight: 500; }

      .upload {
        border: 2px dashed var(--divider-color); border-radius: 14px;
        padding: 32px; text-align: center; margin-bottom: 24px;
        transition: all .2s; cursor: pointer;
        color: var(--secondary-text-color);
      }
      .upload:hover, .upload.active {
        border-color: var(--primary-color);
        background: rgba(33,150,243,.04);
        color: var(--primary-color);
      }
      .upload input { display: none; }
      .upload-icon { font-size: 36px; margin-bottom: 8px; }
      .upload-hint { font-size: 12px; margin-top: 6px; opacity: .7; }

      .cat-label {
        font-size: 14px; font-weight: 600; text-transform: uppercase;
        letter-spacing: .5px; color: var(--secondary-text-color);
        margin: 24px 0 12px; padding-bottom: 8px;
        border-bottom: 1px solid var(--divider-color);
      }

      .sound-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 12px;
      }

      .sound-card {
        background: var(--card-background-color); border-radius: 12px;
        padding: 14px; display: flex; align-items: center; gap: 12px;
        border: 1px solid var(--divider-color); transition: all .15s;
      }
      .sound-card:hover { border-color: rgba(255,255,255,.1); }

      .play-btn {
        width: 42px; height: 42px; border-radius: 50%; border: none;
        background: var(--primary-color); color: #fff;
        font-size: 18px; cursor: pointer; display: flex;
        align-items: center; justify-content: center;
        flex-shrink: 0; transition: all .12s;
      }
      .play-btn:hover { transform: scale(1.08); }
      .play-btn.active { background: #F44336; }

      .sound-info { flex: 1; min-width: 0; }
      .sound-name {
        font-weight: 500; font-size: 14px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .sound-meta {
        font-size: 12px; color: var(--secondary-text-color); margin-top: 2px;
      }

      .sound-id {
        font-family: monospace; font-size: 11px;
        color: var(--secondary-text-color);
        background: rgba(255,255,255,.05);
        padding: 3px 8px; border-radius: 4px;
        cursor: pointer; white-space: nowrap;
        transition: background .12s;
      }
      .sound-id:hover { background: rgba(255,255,255,.1); }

      .del-btn {
        padding: 6px; border: none; background: none;
        color: var(--secondary-text-color); cursor: pointer;
        font-size: 16px; border-radius: 6px; flex-shrink: 0;
      }
      .del-btn:hover { color: #F44336; background: rgba(244,67,54,.08); }
    `;
  }

  render() {
    const builtin = (this.sounds || []).filter((s) => s.builtin);
    const custom = (this.sounds || []).filter((s) => !s.builtin);

    return html`
      <div class="hdr"><h2>🔊 Sound Manager</h2></div>

      <div class="upload ${this._dragOver ? "active" : ""}"
           @click=${() => this.shadowRoot.querySelector("#file-input").click()}
           @dragover=${(e) => { e.preventDefault(); this._dragOver = true; }}
           @dragleave=${() => this._dragOver = false}
           @drop=${(e) => this._onDrop(e)}>
        <div class="upload-icon">📁</div>
        <div>Klicken oder Datei hierher ziehen</div>
        <div class="upload-hint">MP3, WAV, OGG · max. 5 MB</div>
        <input id="file-input" type="file" accept=".mp3,.wav,.ogg"
               @change=${(e) => this._onFile(e)}>
      </div>

      ${builtin.length ? html`
        <div class="cat-label">Eingebaut (${builtin.length})</div>
        <div class="sound-grid">${builtin.map((s) => this._renderSound(s, false))}</div>
      ` : ""}

      ${custom.length ? html`
        <div class="cat-label">Benutzerdefiniert (${custom.length})</div>
        <div class="sound-grid">${custom.map((s) => this._renderSound(s, true))}</div>
      ` : ""}
    `;
  }

  _renderSound(s, deletable) {
    const kb = Math.round((s.size || 0) / 1024);
    const isPlaying = this._playing === s.id;

    return html`
      <div class="sound-card">
        <button class="play-btn ${isPlaying ? "active" : ""}"
                @click=${() => this._togglePlay(s)}>
          ${isPlaying ? "⏹" : "▶"}
        </button>
        <div class="sound-info">
          <div class="sound-name">${s.name}</div>
          <div class="sound-meta">${s.category} · ${kb} KB</div>
        </div>
        <span class="sound-id" @click=${() => this._copyId(s.id)}
              title="ID kopieren">${s.id}</span>
        ${deletable ? html`
          <button class="del-btn" @click=${() => this._emit("delete-sound", { soundId: s.id })}
                  title="Löschen">🗑️</button>
        ` : ""}
      </div>
    `;
  }

  _togglePlay(s) {
    if (this._playing === s.id) {
      this._audio?.pause();
      this._audio = null;
      this._playing = null;
    } else {
      this._audio?.pause();
      this._audio = new Audio(s.url);
      this._audio.onended = () => { this._playing = null; this._audio = null; };
      this._audio.onerror = () => { this._playing = null; this._audio = null; };
      this._audio.play().catch(() => { this._playing = null; });
      this._playing = s.id;
    }
  }

  async _copyId(id) {
    try { await copyToClipboard(id); } catch {}
  }

  _onFile(e) {
    const f = e.target.files?.[0];
    if (f) this._emit("upload-sound", { file: f, name: f.name, category: "custom" });
    e.target.value = "";
  }

  _onDrop(e) {
    e.preventDefault();
    this._dragOver = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) this._emit("upload-sound", { file: f, name: f.name, category: "custom" });
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-sound-manager", TdSoundManager);

/* ══════════════════════════════════════════════════════════
   FONT MANAGER
   ══════════════════════════════════════════════════════════ */

class TdFontManager extends LitElement {
  static get properties() {
    return {
      hass:      { type: Object },
      fonts:     { type: Array },
      _googleFont: { type: String },
      _dragOver: { type: Boolean },
    };
  }

  constructor() {
    super();
    this._googleFont = "";
    this._dragOver = false;
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; }

      .hdr { margin-bottom: 20px; }
      .hdr h2 { margin: 0; font-size: 22px; font-weight: 500; }

      .upload {
        border: 2px dashed var(--divider-color); border-radius: 14px;
        padding: 26px; text-align: center; margin-bottom: 16px;
        cursor: pointer; color: var(--secondary-text-color);
        transition: all .2s;
      }
      .upload:hover, .upload.active {
        border-color: var(--primary-color); background: rgba(33,150,243,.04);
      }
      .upload input { display: none; }

      .google-sec {
        background: var(--card-background-color); border-radius: 12px;
        padding: 16px; margin-bottom: 24px;
        border: 1px solid rgba(255,255,255,.04);
      }
      .google-sec h3 { margin: 0 0 12px; font-size: 15px; font-weight: 500; }
      .google-row { display: flex; gap: 6px; }
      .google-row input {
        flex: 1; padding: 10px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 14px;
      }
      .google-row button {
        padding: 10px 16px; border: none; border-radius: 8px;
        background: var(--primary-color); color: #fff;
        font-size: 14px; cursor: pointer; white-space: nowrap;
      }
      .google-row button:hover { filter: brightness(1.1); }

      .cat-label {
        font-size: 14px; font-weight: 600; text-transform: uppercase;
        color: var(--secondary-text-color); margin: 24px 0 12px;
        padding-bottom: 8px; border-bottom: 1px solid var(--divider-color);
      }

      .font-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 12px;
      }

      .font-card {
        background: var(--card-background-color); border-radius: 12px;
        padding: 16px; border: 1px solid var(--divider-color);
        transition: border-color .15s;
      }
      .font-card:hover { border-color: rgba(255,255,255,.1); }

      .font-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 12px;
      }
      .font-name { font-weight: 600; font-size: 15px; }
      .font-variants {
        font-size: 12px; color: var(--secondary-text-color); margin-top: 2px;
      }
      .font-del {
        padding: 6px; border: none; background: none;
        color: var(--secondary-text-color); cursor: pointer; font-size: 16px;
      }
      .font-del:hover { color: #F44336; }

      .font-preview {
        padding: 14px; background: var(--primary-background-color);
        border-radius: 10px; font-size: 18px; line-height: 1.5;
      }
    `;
  }

  render() {
    const builtin = (this.fonts || []).filter((f) => f.builtin);
    const custom = (this.fonts || []).filter((f) => !f.builtin);

    return html`
      <div class="hdr"><h2>🔤 Font Manager</h2></div>

      <div class="upload ${this._dragOver ? "active" : ""}"
           @click=${() => this.shadowRoot.querySelector("#font-input").click()}
           @dragover=${(e) => { e.preventDefault(); this._dragOver = true; }}
           @dragleave=${() => this._dragOver = false}
           @drop=${(e) => { e.preventDefault(); this._dragOver = false;
             const f = e.dataTransfer?.files?.[0]; if (f) this._emit("upload-font", { file: f }); }}>
        <div style="font-size:28px;margin-bottom:8px">📁</div>
        <div>Font hochladen (.woff2, .ttf, .otf)</div>
        <input id="font-input" type="file" accept=".woff2,.ttf,.otf"
               @change=${(e) => { const f = e.target.files?.[0]; if (f) this._emit("upload-font", { file: f }); e.target.value = ""; }}>
      </div>

      <div class="google-sec">
        <h3>🔍 Google Font installieren</h3>
        <div class="google-row">
          <input placeholder="z.B. Open Sans, Montserrat, Inter..."
                 .value=${this._googleFont}
                 @input=${(e) => this._googleFont = e.target.value}
                 @keydown=${(e) => { if (e.key === "Enter" && this._googleFont.trim()) { this._emit("install-google-font", { fontName: this._googleFont.trim() }); this._googleFont = ""; } }}>
          <button @click=${() => {
            if (this._googleFont.trim()) {
              this._emit("install-google-font", { fontName: this._googleFont.trim() });
              this._googleFont = "";
            }
          }}>⬇️ Installieren</button>
        </div>
      </div>

      ${builtin.length ? html`
        <div class="cat-label">Eingebaut (${builtin.length})</div>
        <div class="font-grid">${builtin.map((f) => this._renderFont(f, false))}</div>
      ` : ""}

      ${custom.length ? html`
        <div class="cat-label">Benutzerdefiniert (${custom.length})</div>
        <div class="font-grid">${custom.map((f) => this._renderFont(f, true))}</div>
      ` : ""}
    `;
  }

  _renderFont(f, deletable) {
    return html`
      <div class="font-card">
        <div class="font-header">
          <div>
            <div class="font-name">${f.name}</div>
            <div class="font-variants">${(f.variants || []).join(", ") || "regular"}</div>
          </div>
          ${deletable ? html`
            <button class="font-del" @click=${() => this._emit("delete-font", { fontId: f.id })}>🗑️</button>
          ` : ""}
        </div>
        <div class="font-preview" style="font-family:'${f.name}',sans-serif">
          ABCDEFGHIJ abcdefghij 0123456789<br>
          Grüße! Straße → Ärger Über Öl
        </div>
      </div>
    `;
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-font-manager", TdFontManager);

/* ══════════════════════════════════════════════════════════
   IMAGE MANAGER
   ══════════════════════════════════════════════════════════ */

class TdImageManager extends LitElement {
  static get properties() {
    return {
      hass:      { type: Object },
      images:    { type: Array },
      _dragOver: { type: Boolean },
      _lightbox: { type: String },
    };
  }

  constructor() {
    super();
    this._dragOver = false;
    this._lightbox = null;
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; }

      .hdr {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 20px;
      }
      .hdr h2 { margin: 0; font-size: 22px; font-weight: 500; }
      .hdr .count { font-size: 13px; color: var(--secondary-text-color); }

      .upload {
        border: 2px dashed var(--divider-color); border-radius: 14px;
        padding: 32px; text-align: center; margin-bottom: 24px;
        cursor: pointer; color: var(--secondary-text-color);
        transition: all .2s;
      }
      .upload:hover, .upload.active {
        border-color: var(--primary-color); background: rgba(33,150,243,.04);
        color: var(--primary-color);
      }
      .upload input { display: none; }
      .upload-icon { font-size: 36px; margin-bottom: 8px; }
      .upload-hint { font-size: 12px; margin-top: 6px; opacity: .7; }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 14px;
      }

      .img-card {
        background: var(--card-background-color); border-radius: 12px;
        overflow: hidden; border: 1px solid var(--divider-color);
        transition: all .15s;
      }
      .img-card:hover { border-color: rgba(255,255,255,.15); }

      .img-thumb {
        width: 100%; aspect-ratio: 16/10; object-fit: cover;
        display: block; background: #000; cursor: pointer;
      }

      .img-info {
        padding: 10px 12px; display: flex;
        justify-content: space-between; align-items: center;
      }
      .img-name {
        font-size: 13px; font-weight: 500;
        overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; flex: 1;
      }
      .img-size {
        font-size: 11px; color: var(--secondary-text-color);
        flex-shrink: 0; margin-left: 8px;
      }

      .img-actions {
        display: flex; gap: 4px; padding: 0 12px 12px;
      }
      .btn-sm {
        padding: 5px 10px; border: 1px solid var(--divider-color);
        border-radius: 6px; background: none;
        color: var(--primary-text-color); font-size: 11px;
        cursor: pointer; transition: all .12s;
      }
      .btn-sm:hover { background: rgba(255,255,255,.05); }
      .btn-sm.danger { border-color: rgba(244,67,54,.3); color: #ef5350; }
      .btn-sm.danger:hover { background: rgba(244,67,54,.08); }

      .empty {
        text-align: center; padding: 40px;
        color: var(--secondary-text-color);
      }

      /* Lightbox */
      .lightbox {
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,.85); display: flex;
        align-items: center; justify-content: center;
        cursor: pointer; animation: fadeIn .15s ease;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .lightbox img {
        max-width: 90vw; max-height: 90vh; object-fit: contain;
        border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,.5);
      }
    `;
  }

  render() {
    const images = this.images || [];

    return html`
      <div class="hdr">
        <h2>🖼️ Bild Manager</h2>
        ${images.length ? html`<span class="count">${images.length} Bilder</span>` : ""}
      </div>

      <div class="upload ${this._dragOver ? "active" : ""}"
           @click=${() => this.shadowRoot.querySelector("#img-input").click()}
           @dragover=${(e) => { e.preventDefault(); this._dragOver = true; }}
           @dragleave=${() => this._dragOver = false}
           @drop=${(e) => this._onDrop(e)}>
        <div class="upload-icon">🖼️</div>
        <div>Bild hochladen oder hierher ziehen</div>
        <div class="upload-hint">PNG, JPG, SVG, GIF, WebP · max. 10 MB</div>
        <input id="img-input" type="file" accept=".png,.jpg,.jpeg,.svg,.gif,.webp"
               @change=${(e) => this._onFile(e)}>
      </div>

      ${images.length === 0 ? html`
        <div class="empty">Noch keine Bilder hochgeladen.</div>
      ` : html`
        <div class="grid">
          ${images.map((img) => this._renderImage(img))}
        </div>
      `}

      ${this._lightbox ? html`
        <div class="lightbox" @click=${() => this._lightbox = null}>
          <img src=${this._lightbox} alt="Vorschau">
        </div>
      ` : ""}
    `;
  }

  _renderImage(img) {
    const kb = Math.round((img.size || 0) / 1024);
    const url = img.url || "";

    return html`
      <div class="img-card">
        <img class="img-thumb" src=${url} alt=${img.filename || ""}
             loading="lazy"
             @click=${() => this._lightbox = url}>
        <div class="img-info">
          <span class="img-name" title=${img.filename}>${img.filename || img.name || "Bild"}</span>
          <span class="img-size">${kb} KB</span>
        </div>
        <div class="img-actions">
          <button class="btn-sm" @click=${() => this._copyUrl(url)} title="URL kopieren">
            📋 URL
          </button>
          <button class="btn-sm danger" @click=${() => this._emit("delete-image", { imageId: img.id })}
                  title="Löschen">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  async _copyUrl(url) {
    try { await copyToClipboard(url); } catch {}
  }

  _onFile(e) {
    const f = e.target.files?.[0];
    if (f) this._emit("upload-image", { file: f });
    e.target.value = "";
  }

  _onDrop(e) {
    e.preventDefault();
    this._dragOver = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) this._emit("upload-image", { file: f });
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-image-manager", TdImageManager);

/* ══════════════════════════════════════════════════════════
   GLOBAL SETTINGS
   ══════════════════════════════════════════════════════════ */

class TdGlobalSettings extends LitElement {
  static get properties() {
    return {
      hass:     { type: Object },
      settings: { type: Object },
      sounds:   { type: Array },
      fonts:    { type: Array },
      _ed:      { type: Object },
      _dirty:   { type: Boolean },
    };
  }

  constructor() {
    super();
    this._ed = null;
    this._dirty = false;
  }

  updated(changed) {
    if (changed.has("settings") && this.settings) {
      this._ed = tdNormalizedDefaults(this.settings || {});
      this._dirty = false;
    }
  }

  static get styles() {
    return css`
      :host { display: block; padding: 16px; max-width: 720px; margin: 0 auto; }

      .sec {
        background: var(--card-background-color, #1e1e1e);
        border-radius: 14px; padding: 20px; margin-bottom: 16px;
        border: 1px solid rgba(255,255,255,.04);
      }
      .sec h3 {
        margin: 0 0 16px; font-size: 16px; font-weight: 500;
        display: flex; align-items: center; gap: 6px;
      }
      .sec p {
        font-size: 13px; color: var(--secondary-text-color);
        margin: 0 0 16px; line-height: 1.5;
      }

      .f { margin-bottom: 16px; }
      .f label {
        display: block; font-size: 13px;
        color: var(--secondary-text-color); margin-bottom: 6px;
      }
      .f select, .f input {
        width: 100%; padding: 10px 12px;
        border: 1px solid var(--divider-color); border-radius: 8px;
        background: var(--primary-background-color);
        color: var(--primary-text-color); font-size: 14px; outline: none;
        transition: border-color .15s;
      }
      .f select:focus, .f input:focus { border-color: var(--primary-color); }

      .f .hint {
        font-size: 11px; color: var(--secondary-text-color);
        margin-top: 4px;
      }
      .f .value-display {
        font-size: 12px; color: var(--primary-color);
        font-weight: 500; margin-left: 8px;
      }

      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

      .tog {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 0; font-size: 13px;
      }
      .tog input[type=checkbox] {
        width: 18px; height: 18px; accent-color: var(--primary-color);
      }
      .tog-grid {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 8px 12px; margin-top: 10px;
      }
      .widget-flag-group {
        border: 1px solid rgba(255,255,255,.05);
        border-radius: 12px; padding: 14px; margin-top: 14px;
        background: rgba(255,255,255,.02);
      }
      .widget-flag-header {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-bottom: 10px;
      }
      .widget-flag-title { font-size: 14px; font-weight: 600; }
      .widget-flag-meta { font-size: 12px; color: var(--secondary-text-color); }
      .widget-flag-card {
        display: flex; align-items: center; gap: 10px;
        border: 1px solid var(--divider-color); border-radius: 10px;
        padding: 10px 12px; background: rgba(255,255,255,.02);
        cursor: pointer; font-size: 13px;
      }
      .widget-flag-card:hover { background: rgba(255,255,255,.04); }
      .widget-flag-card input { flex-shrink: 0; }

      .slider-field label {
        display: flex; align-items: center; justify-content: space-between;
      }

      /* Buttons */
      .btn-row { display: flex; gap: 10px; flex-wrap: wrap; }
      .btn {
        padding: 10px 20px; border: 1px solid var(--divider-color);
        border-radius: 8px; background: none;
        color: var(--primary-text-color); font-size: 14px;
        cursor: pointer; transition: all .15s;
        display: inline-flex; align-items: center; gap: 6px;
      }
      .btn:hover { background: rgba(255,255,255,.05); }
      .btn.p {
        background: var(--primary-color);
        border-color: var(--primary-color); color: #fff;
      }
      .btn.p:hover { filter: brightness(1.1); }
      .btn.danger {
        border-color: rgba(244,67,54,.3); color: #ef5350;
      }
      .btn.danger:hover { background: rgba(244,67,54,.08); }
      .btn:disabled { opacity: .4; cursor: not-allowed; }

      .file-input { display: none; }

      /* Info grid */
      .info-grid {
        display: grid; grid-template-columns: auto 1fr;
        gap: 6px 16px; font-size: 13px;
      }
      .info-grid .label { color: var(--secondary-text-color); }
      .info-grid .value { font-weight: 500; }

      /* Dirty indicator */
      .dirty-bar {
        position: sticky; bottom: 0; z-index: 5;
        background: var(--card-background-color);
        border-top: 1px solid var(--divider-color);
        padding: 12px 20px; display: flex;
        justify-content: space-between; align-items: center;
        gap: 12px; margin: 0 -16px;
        backdrop-filter: blur(8px);
      }
      .dirty-bar .note {
        font-size: 12px; color: var(--secondary-text-color);
      }
      .dirty-dot {
        display: inline-block; width: 8px; height: 8px;
        border-radius: 50%; background: #FF9800; margin-right: 6px;
      }

      /* Reset section */
      .reset-sec {
        border: 1px solid rgba(244,67,54,.15);
        border-radius: 12px; padding: 16px; margin-top: 12px;
        background: rgba(244,67,54,.03);
      }
      .reset-sec h4 {
        margin: 0 0 8px; font-size: 14px; color: #ef5350;
      }
      .reset-sec p {
        font-size: 12px; color: var(--secondary-text-color);
        margin: 0 0 12px;
      }
    `;
  }

  render() {
    if (!this._ed) return html`<div style="padding:40px;text-align:center;color:var(--secondary-text-color)">Laden...</div>`;
    const d = this._ed;

    return html`
      <!-- Defaults -->
      <div class="sec">
        <h3>⚙️ Standard-Einstellungen</h3>
        <p>Diese Werte werden beim Erstellen neuer Screens und Widgets verwendet.</p>

        <div class="row">
          <div class="f">
            <label>Standard-Theme</label>
            <select .value=${d.default_theme || "dark"}
                    @change=${(e) => this._set("default_theme", e.target.value)}>
              ${TD_THEMES.map((t) => html`<option value=${t.v}>${t.l}</option>`)}
            </select>
          </div>
          <div class="f">
            <label>Standard-Übergang</label>
            <select .value=${d.default_transition || "fade"}
                    @change=${(e) => this._set("default_transition", e.target.value)}>
              ${TD_TRANSITIONS.map((t) => html`<option value=${t.v}>${t.l}</option>`)}
            </select>
          </div>
        </div>

        <div class="row">
          <div class="f">
            <label>Screen-Dauer (Sekunden)</label>
            <input type="number" min="3" max="300"
                   .value=${d.default_screen_duration || 15}
                   @change=${(e) => this._set("default_screen_duration", +e.target.value)}>
          </div>
          <div class="f">
            <label>Standard-Kameraquelle</label>
            <select .value=${d.default_camera_source || "auto"}
                    @change=${(e) => this._set("default_camera_source", e.target.value)}>
              ${TD_CAMERA_SOURCES.map(([v, l]) => html`<option value=${v}>${l}</option>`)}
            </select>
          </div>
        </div>

        <div class="row">
          <div class="f">
            <label>Chart-Zeitraum (Stunden)</label>
            <input type="number" min="1" max="168"
                   .value=${d.default_chart_hours || 24}
                   @change=${(e) => this._set("default_chart_hours", +e.target.value)}>
            <div class="hint">Standard-Verlauf für neue Chart-Widgets</div>
          </div>
          <div class="f">
            <label>Hintergrundfarbe</label>
            <input .value=${d.default_background_color || "#121212"}
                   @input=${(e) => this._set("default_background_color", e.target.value)}>
          </div>
        </div>

        <div class="f slider-field">
          <label>
            Widget-Transparenz
            <span class="value-display">${(d.default_widget_opacity ?? 0.75).toFixed(2)}</span>
          </label>
          <input type="range" min="0" max="1" step="0.05"
                 .value=${d.default_widget_opacity ?? 0.75}
                 @input=${(e) => this._set("default_widget_opacity", +e.target.value)}>
        </div>

        <div class="f slider-field">
          <label>
            Widget-Blur
            <span class="value-display">${d.default_widget_blur || 0}px</span>
          </label>
          <input type="range" min="0" max="20" step="1"
                 .value=${d.default_widget_blur || 0}
                 @input=${(e) => this._set("default_widget_blur", +e.target.value)}>
        </div>

        <div class="f slider-field">
          <label>
            Widget-Radius
            <span class="value-display">${d.default_widget_radius || 12}px</span>
          </label>
          <input type="range" min="0" max="32" step="2"
                 .value=${d.default_widget_radius || 12}
                 @input=${(e) => this._set("default_widget_radius", +e.target.value)}>
        </div>

        <div class="f slider-field">
          <label>
            Ticker-Höhe
            <span class="value-display">${d.default_ticker_height || 36}px</span>
          </label>
          <input type="range" min="24" max="80" step="2"
                 .value=${d.default_ticker_height || 36}
                 @input=${(e) => this._set("default_ticker_height", +e.target.value)}>
        </div>
      </div>

      <div class="sec">
        <h3>🧩 Widgets & Animationen</h3>
        <p>Hier steuerst du, welche Widgets im Editor sichtbar sind und ob neue Chart-Widgets standardmäßig mit Animationen angelegt werden.</p>

        <label class="tog">
          <input type="checkbox"
                 .checked=${d.default_chart_widget_animations !== false}
                 @change=${(e) => this._set("default_chart_widget_animations", e.target.checked)}>
          <span>Chart-Animationen standardmäßig aktivieren</span>
        </label>

        ${TD_WIDGET_SETTINGS_GROUPS.map((group) => {
          const enabledCount = group.items.filter((it) => d.widget_feature_flags?.[it.type] !== false).length;
          return html`
            <div class="widget-flag-group">
              <div class="widget-flag-header">
                <div class="widget-flag-title">${group.label}</div>
                <div class="widget-flag-meta">${enabledCount} / ${group.items.length} aktiv</div>
              </div>
              <div class="tog-grid">
                ${group.items.map((it) => html`
                  <label class="widget-flag-card">
                    <input type="checkbox"
                           .checked=${d.widget_feature_flags?.[it.type] !== false}
                           @change=${(e) => this._setWidgetFlag(it.type, e.target.checked)}>
                    <span>${it.icon} ${it.name}</span>
                  </label>
                `)}
              </div>
            </div>
          `;
        })}
      </div>

      <!-- Backup -->
      <div class="sec">
        <h3>💾 Backup & Restore</h3>
        <p>
          Sichert alle Geräte-Konfigurationen, Vorlagen, Themes und Alert-Vorlagen.
          Mediendateien (Bilder, Sounds, Fonts) sind nicht enthalten.
        </p>
        <div class="btn-row">
          <button class="btn" @click=${() => this._emit("create-backup", {})}>
            📥 Backup herunterladen
          </button>
          <button class="btn" @click=${() => this.shadowRoot.querySelector("#restore-input").click()}>
            📤 Backup wiederherstellen
          </button>
          <input id="restore-input" class="file-input" type="file" accept=".json"
                 @change=${(e) => this._onRestoreFile(e)}>
        </div>
      </div>

      <!-- Info -->
      <div class="sec">
        <h3>ℹ️ Info & Statistik</h3>
        <div class="info-grid">
          <span class="label">Version:</span>
          <span class="value">Ticker Display v2.0</span>
          <span class="label">Sounds:</span>
          <span class="value">${(this.sounds || []).length} (${(this.sounds || []).filter((s) => s.builtin).length} eingebaut)</span>
          <span class="label">Fonts:</span>
          <span class="value">${(this.fonts || []).length} (${(this.fonts || []).filter((f) => f.builtin).length} eingebaut)</span>
          <span class="label">HA-Version:</span>
          <span class="value">${this.hass?.config?.version || "?"}</span>
          <span class="label">Zeitzone:</span>
          <span class="value">${this.hass?.config?.time_zone || "?"}</span>
        </div>
      </div>

      <!-- Reset -->
      <div class="sec">
        <div class="reset-sec">
          <h4>⚠️ Gefahrenzone</h4>
          <p>Alle Einstellungen auf Standardwerte zurücksetzen. Geräte und Vorlagen bleiben erhalten.</p>
          <button class="btn danger" @click=${() => this._resetDefaults()}>
            🔄 Auf Standard zurücksetzen
          </button>
        </div>
      </div>

      <!-- Save bar -->
      ${this._dirty ? html`
        <div class="dirty-bar">
          <div class="note">
            <span class="dirty-dot"></span>
            Ungespeicherte Änderungen
          </div>
          <div class="btn-row">
            <button class="btn" @click=${() => { this._ed = deepClone(this.settings); this._dirty = false; }}>
              Verwerfen
            </button>
            <button class="btn p" @click=${() => this._emit("save-settings", this._ed)}>
              💾 Speichern
            </button>
          </div>
        </div>
      ` : ""}
    `;
  }

  _set(key, value) {
    this._ed = { ...this._ed, [key]: value };
    this._dirty = true;
  }

  _setWidgetFlag(type, enabled) {
    this._ed = {
      ...this._ed,
      widget_feature_flags: {
        ...(this._ed?.widget_feature_flags || {}),
        [type]: enabled,
      },
    };
    this._dirty = true;
  }

  _resetDefaults() {
    this._ed = tdNormalizedDefaults({});
    this._dirty = true;
  }

  _onRestoreFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = safeJsonParse(ev.target.result, null);
      if (data && typeof data === "object") {
        this._emit("restore-backup", { data });
      } else {
        this._emit("toast", { message: "❌ Ungültige Backup-Datei", type: "error" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
customElements.define("td-global-settings", TdGlobalSettings);

/* ══════════════════════════════════════════════════════════
   MAIN PANEL
   ══════════════════════════════════════════════════════════ */

class TickerDisplayPanel extends LitElement {
  static get properties() {
    return {
      hass:            { type: Object },
      narrow:          { type: Boolean },
      panel:           { type: Object },
      _page:           { type: String },
      _tab:            { type: String },
      _libraryTab:     { type: String },
      _mediaTab:       { type: String },
      _devId:          { type: String },
      _scrIdx:         { type: Number },
      _tplId:          { type: String },
      _alertId:        { type: String },
      _themeId:        { type: String },
      _devices:        { type: Array },
      _templates:      { type: Object },
      _alertTemplates: { type: Object },
      _customThemes:   { type: Object },
      _sounds:         { type: Array },
      _fonts:          { type: Array },
      _images:         { type: Array },
      _haMediaImages:  { type: Array },
      _haMediaAudio:   { type: Array },
      _globalSettings: { type: Object },
      _loading:        { type: Boolean },
    };
  }

  constructor() {
    super();
    this._page = "main";
    this._tab = "overview";
    this._libraryTab = "templates";
    this._mediaTab = "images";
    this._devId = null;
    this._scrIdx = -1;
    this._tplId = null;
    this._alertId = null;
    this._themeId = null;
    this._devices = [];
    this._templates = {};
    this._alertTemplates = {};
    this._customThemes = {};
    this._sounds = [];
    this._fonts = [];
    this._images = [];
    this._haMediaImages = [];
    this._haMediaAudio = [];
    this._globalSettings = {};
    this._loading = true;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this._loadAll();
  }

  /* ══════════════════════════════════════════════════════
     API HELPERS
     ══════════════════════════════════════════════════════ */

  _authHeaders() {
    const token = this.hass?.auth?.data?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async _request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      credentials: "same-origin",
      ...options,
      headers: { ...this._authHeaders(), ...(options.headers || {}) },
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");

    if (!response.ok) {
      const message = typeof payload === "object" && payload?.error
        ? payload.error
        : (typeof payload === "string" && payload)
          ? payload
          : `${options.method || "GET"} ${path}: ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  async _get(path) {
    return this._request(path);
  }

  async _post(path, data) {
    return this._request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
    });
  }

  async _del(path) {
    return this._request(path, { method: "DELETE" });
  }

  async _upload(path, file) {
    const fd = new FormData();
    fd.append("file", file);
    return this._request(path, {
      method: "POST",
      body: fd,
    });
  }

  async _loadAll() {
    this._loading = true;
    try {
      const [dv, tp, al, th, so, fo, im, haIm, haAu, gs] = await Promise.all([
        this._get("/api/config/devices").catch(() => []),
        this._get("/api/config/templates").catch(() => ({})),
        this._get("/api/config/alerts").catch(() => ({})),
        this._get("/api/config/themes").catch(() => ({})),
        this._get("/api/media/sounds").catch(() => []),
        this._get("/api/media/fonts").catch(() => []),
        this._get("/api/media/images").catch(() => []),
        this._get("/api/ha-media/items?kind=image").catch(() => []),
        this._get("/api/ha-media/items?kind=audio").catch(() => []),
        this._get("/api/config/global").catch(() => ({})),
      ]);
      this._devices = dv;
      this._templates = tp;
      this._alertTemplates = al;
      this._customThemes = th;
      this._sounds = so;
      this._fonts = fo;
      this._images = im;
      this._haMediaImages = haIm;
      this._haMediaAudio = haAu;
      this._globalSettings = tdNormalizedDefaults(gs || {});
    } catch (e) {
      console.error("Ticker Display: Load failed", e);
    }
    this._loading = false;
  }

  /* ══════════════════════════════════════════════════════
     STYLES
     ══════════════════════════════════════════════════════ */

  static get styles() {
    return css`
      :host {
        display: block; height: 100vh;
        background: var(--primary-background-color);
        color: var(--primary-text-color);
        --td-accent: var(--primary-color, #2196f3);
      }

      /* ── Top Bar ── */
      .top {
        display: flex; align-items: center; height: 56px;
        padding: 0 16px;
        background: var(--app-header-background-color, #1e1e1e);
        color: var(--app-header-text-color, #fff);
        box-shadow: 0 2px 4px rgba(0,0,0,.2);
        z-index: 10; position: relative;
      }
      .top .title { font-size: 20px; font-weight: 500; margin-left: 12px; flex: 1; }
      .top .back-btn {
        cursor: pointer; opacity: .8; font-size: 24px;
        padding: 8px; border-radius: 50%; border: none;
        background: none; color: inherit;
      }
      .top .back-btn:hover { opacity: 1; background: rgba(255,255,255,.1); }

      /* ── Tabs ── */
      .tabs {
        display: flex;
        background: var(--card-background-color, #1e1e1e);
        border-bottom: 1px solid var(--divider-color);
        overflow-x: auto; scrollbar-width: none;
      }
      .tabs::-webkit-scrollbar { display: none; }
      .tab {
        padding: 12px 20px; font-size: 13px; font-weight: 500;
        text-transform: uppercase; letter-spacing: .5px;
        cursor: pointer; white-space: nowrap;
        border-bottom: 2px solid transparent;
        color: var(--secondary-text-color);
        transition: all .15s; background: none;
        border-top: none; border-left: none; border-right: none;
      }
      .tab:hover { color: var(--primary-text-color); background: rgba(255,255,255,.02); }
      .tab.a { color: var(--td-accent); border-bottom-color: var(--td-accent); }

      /* ── Content ── */
      .cnt { height: calc(100vh - 56px - 48px); overflow-y: auto; }
      .cnt.nt { height: calc(100vh - 56px); }

      /* ── Loading ── */
      .loading {
        display: flex; align-items: center; justify-content: center;
        height: 200px; color: var(--secondary-text-color); gap: 12px;
      }
      .spinner {
        width: 32px; height: 32px;
        border: 3px solid rgba(255,255,255,.1);
        border-top-color: var(--td-accent);
        border-radius: 50%; animation: spin .8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* ── Overview ── */
      .wrap { padding: 16px; }
      .hero {
        display: grid; grid-template-columns: 2fr 1fr;
        gap: 16px; margin-bottom: 16px;
      }
      @media (max-width: 900px) { .hero { grid-template-columns: 1fr; } }

      .card {
        background: var(--card-background-color, #1e1e1e);
        border-radius: 16px; padding: 20px;
        box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,.15));
        border: 1px solid rgba(255,255,255,.04);
      }
      .card h3 { margin: 0 0 12px; font-size: 18px; font-weight: 500; }
      .muted { color: var(--secondary-text-color); font-size: 13px; line-height: 1.5; }

      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px; margin-bottom: 16px;
      }
      .stat {
        background: var(--card-background-color, #1e1e1e);
        border-radius: 14px; padding: 16px;
        border: 1px solid rgba(255,255,255,.04);
      }
      .stat .label { font-size: 12px; color: var(--secondary-text-color); }
      .stat .value { font-size: 28px; font-weight: 600; margin-top: 6px; }

      .list { display: grid; gap: 10px; }
      .row-card {
        display: flex; justify-content: space-between; gap: 12px;
        align-items: center; padding: 12px 14px;
        border: 1px solid var(--divider-color); border-radius: 12px;
        background: rgba(255,255,255,.02); transition: all .12s;
      }
      .row-card:hover { border-color: rgba(255,255,255,.08); }
      .row-card .rc-title { font-weight: 600; font-size: 14px; }
      .row-card .rc-meta {
        color: var(--secondary-text-color); font-size: 12px; margin-top: 2px;
      }

      .cta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }

      .btn {
        padding: 10px 16px; border-radius: 10px;
        border: 1px solid var(--divider-color); background: none;
        color: var(--primary-text-color); cursor: pointer;
        font-size: 13px; transition: all .12s;
        display: inline-flex; align-items: center; gap: 6px;
      }
      .btn:hover { background: rgba(255,255,255,.04); }
      .btn.p {
        background: var(--td-accent);
        border-color: var(--td-accent); color: #fff;
      }
      .btn.p:hover { filter: brightness(1.1); }

      /* Subtabs */
      .subtabs {
        display: flex; gap: 6px; flex-wrap: wrap;
        margin-bottom: 16px; padding: 0 16px;
      }
      .chip {
        padding: 8px 14px; border-radius: 999px;
        border: 1px solid var(--divider-color); background: none;
        color: var(--primary-text-color); cursor: pointer;
        font-size: 13px; transition: all .12s;
      }
      .chip.a {
        background: rgba(33,150,243,.1);
        border-color: var(--td-accent);
        color: var(--td-accent);
      }
      .chip:hover { background: rgba(255,255,255,.04); }
    `;
  }

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */

  render() {
    if (this._loading) {
      return html`
        <div class="top"><span class="title">📱 Ticker Display</span></div>
        <div class="loading"><div class="spinner"></div><span>Laden...</span></div>
      `;
    }

    switch (this._page) {
      case "device-editor":   return this._renderDeviceEditor();
      case "screen-editor":   return this._renderScreenEditor();
      case "template-editor": return this._renderTemplateEditor();
      case "alert-editor":    return this._renderAlertEditor();
      case "theme-editor":    return this._renderThemeEditor();
      default:                return this._renderMain();
    }
  }

  /* ────── Main Layout ────── */
  _renderMain() {
    const tabs = [
      { id: "overview", l: "✨ Studio"       },
      { id: "devices",  l: "📱 Geräte"       },
      { id: "library",  l: "🧱 Bibliothek"   },
      { id: "media",    l: "🖼️ Medien"       },
      { id: "settings", l: "⚙️ Einstellungen" },
    ];
    return html`
      <div class="top">
        <span class="title">📱 Ticker Display Studio</span>
      </div>
      <div class="tabs">
        ${tabs.map((t) => html`
          <button class="tab ${this._tab === t.id ? "a" : ""}"
                  @click=${() => this._tab = t.id}>
            ${t.l}
          </button>
        `)}
      </div>
      <div class="cnt">${this._renderTabContent()}</div>
      <td-toast></td-toast>
      <td-confirm></td-confirm>
    `;
  }

  /* ────── Tab Router ────── */
  _renderTabContent() {
    switch (this._tab) {
      case "overview": return this._renderOverview();
      case "devices":  return this._renderDevicesTab();
      case "library":  return this._renderLibraryTab();
      case "media":    return this._renderMediaTab();
      case "settings": return this._renderSettingsTab();
      default:         return html``;
    }
  }

  /* ────── Overview ────── */
  _renderOverview() {
    const s = this._getStats();
    return html`
      <div class="wrap">
        <div class="hero">
          <div class="card">
            <h3>Willkommen im Studio</h3>
            <div class="muted">
              Verwalte Displays, erstelle wiederverwendbare Vorlagen und passe
              Themes an. Alle Änderungen werden in Echtzeit an verbundene Geräte übertragen.
            </div>
            <div class="cta">
              <button class="btn p" @click=${() => this._tab = "devices"}>Geräte verwalten</button>
              <button class="btn" @click=${() => { this._tab = "library"; this._libraryTab = "templates"; }}>Vorlagen</button>
              <button class="btn" @click=${() => this._tab = "settings"}>Einstellungen</button>
            </div>
          </div>
          <div class="card">
            <h3>Schnellzugriff</h3>
            <div class="list">
              ${this._devices.slice(0, 4).map((d) => html`
                <div class="row-card">
                  <div>
                    <div class="rc-title">${d.name || d.id}</div>
                    <div class="rc-meta">${d.online ? "🟢" : "🔴"} ${(d.screens?.length || 0)} Screens</div>
                  </div>
                  <button class="btn" @click=${() => this._openDevice(d.id)}>Öffnen</button>
                </div>
              `)}
              ${!this._devices.length ? html`<div class="muted">Keine Geräte</div>` : ""}
            </div>
          </div>
        </div>
        <div class="stats">
          ${[
            ["Geräte",   s.devices],
            ["Online",   s.online],
            ["Screens",  s.screens],
            ["Widgets",  s.widgets],
            ["Vorlagen", s.templates],
            ["Medien",   s.media],
          ].map(([label, value]) => html`
            <div class="stat">
              <div class="label">${label}</div>
              <div class="value">${value}</div>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  _getStats() {
    const d = this._devices;
    return {
      devices:   d.length,
      online:    d.filter((x) => x.online).length,
      screens:   d.reduce((s, x) => s + (x.screens?.length || 0), 0),
      widgets:   d.reduce((s, x) => s + (x.screens || []).reduce((a, sc) => a + (sc.widgets?.length || 0), 0), 0),
      templates: Object.keys(this._templates || {}).length,
      alerts:    Object.keys(this._alertTemplates || {}).length,
      themes:    Object.keys(this._customThemes || {}).length,
      media:     (this._images?.length || 0) + (this._sounds?.length || 0) + (this._fonts?.length || 0),
    };
  }

  /* ────── Devices Tab ────── */
  _renderDevicesTab() {
    return html`
      <td-device-list .hass=${this.hass} .devices=${this._devices}
        @edit-device=${(e) => this._openDevice(e.detail.deviceId)}
        @preview-device=${(e) => window.open(`${API}/preview/${e.detail.deviceId}`, "_blank")}
        @reload-device=${(e) => this.hass.callService("ticker_display", "reload_page", { device: e.detail.deviceId })}
        @identify-device=${(e) => this.hass.callService("ticker_display", "identify_device", { device: e.detail.deviceId })}
        @delete-device=${(e) => this._deleteDevice(e.detail.deviceId)}
        @copy-link=${(e) => this._copyDeviceLink(e.detail.url || e.detail.deviceId)}
        @create-virtual-device=${() => this._createVirtualDevice()}
        @refresh=${() => this._loadAll()}>
      </td-device-list>
    `;
  }

  /* ────── Library Tab ────── */
  _renderLibraryTab() {
    return html`
      <div class="subtabs">
        ${[
          ["templates", "📋 Vorlagen"],
          ["alerts",    "🔔 Alerts"],
          ["themes",    "🎨 Themes"],
        ].map(([id, label]) => html`
          <button class="chip ${this._libraryTab === id ? "a" : ""}"
                  @click=${() => this._libraryTab = id}>
            ${label}
          </button>
        `)}
      </div>
      <div>${this._renderLibraryContent()}</div>
    `;
  }

  _renderLibraryContent() {
    switch (this._libraryTab) {
      case "alerts": return html`
        <td-alert-list .hass=${this.hass} .alertTemplates=${this._alertTemplates} .sounds=${this._sounds}
          @create-alert=${() => { this._alertId = null; this._page = "alert-editor"; }}
          @edit-alert=${(e) => { this._alertId = e.detail.alertId; this._page = "alert-editor"; }}
          @delete-alert=${(e) => this._deleteAlert(e.detail.alertId)}>
        </td-alert-list>`;

      case "themes": return html`
        <td-theme-list .hass=${this.hass} .customThemes=${this._customThemes}
          @create-theme=${() => { this._themeId = null; this._page = "theme-editor"; }}
          @edit-theme=${(e) => { this._themeId = e.detail.themeId; this._page = "theme-editor"; }}
          @delete-theme=${(e) => this._deleteTheme(e.detail.themeId)}>
        </td-theme-list>`;

      default: return html`
        <td-template-gallery .hass=${this.hass} .templates=${this._templates} .devices=${this._devices}
          @create-template=${() => { this._tplId = null; this._page = "template-editor"; }}
          @edit-template=${(e) => { this._tplId = e.detail.templateId; this._page = "template-editor"; }}
          @export-template=${(e) => this._exportTemplate(e.detail.templateId)}
          @delete-template=${(e) => this._deleteTemplate(e.detail.templateId)}
          @import-template=${(e) => this._importTemplate(e.detail.json)}
          @toast=${(e) => this._toast(e.detail.message, e.detail.type)}>
        </td-template-gallery>`;
    }
  }

  /* ────── Media Tab ────── */
  _renderMediaTab() {
    return html`
      <div class="subtabs">
        ${[
          ["images", "🖼️ Bilder"],
          ["sounds", "🔊 Sounds"],
          ["fonts",  "🔤 Fonts"],
        ].map(([id, label]) => html`
          <button class="chip ${this._mediaTab === id ? "a" : ""}"
                  @click=${() => this._mediaTab = id}>
            ${label}
          </button>
        `)}
      </div>
      <div>${this._renderMediaContent()}</div>
    `;
  }

  _renderMediaContent() {
    switch (this._mediaTab) {
      case "sounds": return html`
        <td-sound-manager .hass=${this.hass} .sounds=${this._sounds}
          @upload-sound=${(e) => this._uploadMedia("sound", e.detail.file)}
          @delete-sound=${(e) => this._deleteMedia("sound", e.detail.soundId)}>
        </td-sound-manager>`;

      case "fonts": return html`
        <td-font-manager .hass=${this.hass} .fonts=${this._fonts}
          @upload-font=${(e) => this._uploadMedia("font", e.detail.file)}
          @delete-font=${(e) => this._deleteMedia("font", e.detail.fontId)}
          @install-google-font=${(e) => this._toast(`ℹ️ Google Font "${e.detail.fontName}" – Serverseitig noch nicht implementiert`, "warning")}>
        </td-font-manager>`;

      default: return html`
        <td-image-manager .hass=${this.hass} .images=${this._images}
          @upload-image=${(e) => this._uploadMedia("image", e.detail.file)}
          @delete-image=${(e) => this._deleteMedia("image", e.detail.imageId)}>
        </td-image-manager>`;
    }
  }

  /* ────── Settings Tab ────── */
  _renderSettingsTab() {
    return html`
      <td-global-settings .hass=${this.hass} .settings=${this._globalSettings}
        .sounds=${this._sounds} .fonts=${this._fonts}
        @save-settings=${(e) => this._saveSettings(e.detail)}
        @create-backup=${() => this._createBackup()}
        @restore-backup=${(e) => this._restoreBackup(e.detail.data)}
        @toast=${(e) => this._toast(e.detail.message, e.detail.type)}>
      </td-global-settings>
    `;
  }

  /* ══════════════════════════════════════════════════════
     SUB-PAGE RENDERERS
     ══════════════════════════════════════════════════════ */

  _renderDeviceEditor() {
    const d = this._devices.find((x) => x.id === this._devId);
    return html`
      <div class="top">
        <button class="back-btn" @click=${() => this._page = "main"}>←</button>
        <span class="title">📱 ${d?.name || this._devId}</span>
      </div>
      <div class="cnt nt">
        <td-device-editor .hass=${this.hass} .device=${d}
          .sounds=${this._sounds} .fonts=${this._fonts}
          .templates=${this._templates} .globalSettings=${this._globalSettings}
          @save=${(e) => this._saveDevice(e.detail)}
          @edit-screen=${(e) => { this._scrIdx = e.detail.screenIndex; this._page = "screen-editor"; }}
          @add-screen-preset=${(e) => this._addScreenPreset(d, e.detail.preset)}
          @delete-screen=${(e) => this._deleteScreen(d, e.detail.screenIndex)}
          @save-screen-as-template=${(e) => this._saveScreenAsTemplate(d, e.detail)}
          @import-screen-template=${(e) => this._importScreenTemplate(d, e.detail.templateId)}
          @back=${() => this._page = "main"}>
        </td-device-editor>
      </div>
    `;
  }

  _renderScreenEditor() {
    const d = this._devices.find((x) => x.id === this._devId);
    const sc = d?.screens?.[this._scrIdx] || {
      type: "dashboard", widgets: [], grid: { columns: 3, rows: 2 },
    };
    return html`
      <td-screen-editor .hass=${this.hass} .deviceId=${this._devId}
        .device=${d} .screenIndex=${this._scrIdx} .screenConfig=${sc}
        .fonts=${this._fonts} .sounds=${this._sounds}
        .templates=${this._templates} .images=${this._images}
        .haImages=${this._haMediaImages} .globalSettings=${this._globalSettings}
        @save=${(e) => this._saveScreen(d, e.detail.screenConfig)}
        @save-as-template=${(e) => this._saveAsTemplate(e.detail)}
        @back=${() => this._page = "device-editor"}>
      </td-screen-editor>
    `;
  }

  _renderTemplateEditor() {
    return html`
      <td-template-editor .hass=${this.hass}
        .template=${this._tplId ? this._templates[this._tplId] : null}
        .templateId=${this._tplId} .fonts=${this._fonts}
        @save=${(e) => this._saveTemplate(e.detail)}
        @back=${() => this._page = "main"}>
      </td-template-editor>
    `;
  }

  _renderAlertEditor() {
    return html`
      <div class="top">
        <button class="back-btn" @click=${() => this._page = "main"}>←</button>
        <span class="title">🔔 Alert ${this._alertId ? "bearbeiten" : "erstellen"}</span>
      </div>
      <div class="cnt nt">
        <td-alert-editor .hass=${this.hass}
          .alert=${this._alertId ? this._alertTemplates[this._alertId] : null}
          .alertId=${this._alertId} .sounds=${this._sounds} .haAudio=${this._haMediaAudio}
          @save=${(e) => this._saveAlert(e.detail)}
          @back=${() => this._page = "main"}>
        </td-alert-editor>
      </div>
    `;
  }

  _renderThemeEditor() {
    return html`
      <div class="top">
        <button class="back-btn" @click=${() => this._page = "main"}>←</button>
        <span class="title">🎨 Theme ${this._themeId ? "bearbeiten" : "erstellen"}</span>
      </div>
      <div class="cnt nt">
        <td-theme-editor .hass=${this.hass}
          .theme=${this._themeId ? this._customThemes[this._themeId] : null}
          .themeId=${this._themeId} .fonts=${this._fonts}
          @save=${(e) => this._saveTheme(e.detail)}
          @back=${() => this._page = "main"}>
        </td-theme-editor>
      </div>
    `;
  }

  /* ══════════════════════════════════════════════════════
     ACTIONS (continued in Part 8)
     ══════════════════════════════════════════════════════ */

  _openDevice(id) { this._devId = id; this._page = "device-editor"; }

  _toast(msg, type = "info") {
    const t = this.shadowRoot?.querySelector("td-toast");
    if (t) {
      if (type === "error") t.error(msg);
      else if (type === "success") t.success(msg);
      else if (type === "warning") t.warn(msg);
      else t.show(msg);
    }
  }

  async _confirm(title, message, opts = {}) {
    const d = this.shadowRoot?.querySelector("td-confirm");
    return d ? d.show(title, message, opts) : confirm(message);
  }
}
customElements.define("ticker-display-panel", TickerDisplayPanel);

/* ══════════════════════════════════════════════════════════
   TICKER DISPLAY PANEL – ACTION METHODS
   Append to TickerDisplayPanel class from Part 7
   ══════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────
   DEVICE ACTIONS
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._saveDevice = async function (deviceData) {
  try {
    await this._post(`/api/config/device/${this._devId}`, tdNormalizeDeviceRuntime(deviceData));
    await this._loadAll();
    this._toast("✅ Gerät gespeichert", "success");
  } catch (e) {
    console.error("Save device failed:", e);
    this._toast("❌ Speichern fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._deleteDevice = async function (deviceId) {
  const ok = await this._confirm(
    "Gerät löschen",
    `Gerät "${deviceId}" wirklich löschen? Alle Screens und Widgets gehen verloren.`
  );
  if (!ok) return;
  try {
    await this._del(`/api/device/${deviceId}`);
    await this._loadAll();
    this._toast("🗑️ Gerät gelöscht", "success");
  } catch (e) {
    console.error("Delete device failed:", e);
    this._toast("❌ Löschen fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._absoluteDisplayUrl = function (pathOrDeviceId) {
  if (!pathOrDeviceId) return "";
  const raw = String(pathOrDeviceId);
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${window.location.origin}${raw}`;
  return `${window.location.origin}${API}/${raw}`;
};

TickerDisplayPanel.prototype._copyDeviceLink = async function (urlOrDeviceId) {
  try {
    const url = this._absoluteDisplayUrl(urlOrDeviceId);
    await copyToClipboard(url);
    this._toast("🔗 Display-Link kopiert", "success");
  } catch (e) {
    console.error("Copy device link failed:", e);
    this._toast("❌ Link konnte nicht kopiert werden", "error");
  }
};

TickerDisplayPanel.prototype._createVirtualDevice = async function () {
  try {
    const count = (this._devices || []).filter((d) => d.virtual).length + 1;
    const created = await this._post("/api/config/device/virtual", { name: `Virtuelles Gerät ${count}` });
    await this._loadAll();
    const url = created?.display_url || this._absoluteDisplayUrl(created?.device?.id || created?.id || "");
    if (url) await copyToClipboard(this._absoluteDisplayUrl(url));
    this._toast("🌐 Virtuelles Gerät erstellt – Link wurde kopiert", "success");
  } catch (e) {
    console.error("Create virtual device failed:", e);
    this._toast("❌ Virtuelles Gerät konnte nicht erstellt werden", "error");
  }
};

/* ──────────────────────────────────────────────────────
   SCREEN ACTIONS
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._saveScreen = async function (device, screenConfig) {
  if (!device) return;
  try {
    const screens = [...(device.screens || [])];
    screens[this._scrIdx] = tdNormalizeScreenRuntime(screenConfig);
    await this._post(`/api/config/device/${this._devId}`, tdNormalizeDeviceRuntime({ ...device, screens }));
    await this._loadAll();
    this._toast("✅ Screen gespeichert", "success");
  } catch (e) {
    console.error("Save screen failed:", e);
    this._toast("❌ Screen speichern fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._addScreenPreset = async function (device, preset) {
  if (!device) return;
  try {
    let ns = tdCreateScreenPreset(
      preset || "blank",
      device.screens?.length || 0,
      this._globalSettings
    );
    ns = tdHydrateScreenPresetEntities(ns, this.hass);
    const screens = [...(device.screens || []), ns];
    await this._post(`/api/config/device/${this._devId}`, { ...device, screens });
    await this._loadAll();
    // Open the new screen in editor
    this._scrIdx = screens.length - 1;
    this._page = "screen-editor";
    this._toast("✅ Screen angelegt", "success");
  } catch (e) {
    console.error("Add screen preset failed:", e);
    this._toast("❌ Screen anlegen fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._deleteScreen = async function (device, screenIndex) {
  if (!device) return;
  const screenName = device.screens?.[screenIndex]?.name || `Screen ${screenIndex + 1}`;
  const ok = await this._confirm(
    "Screen löschen",
    `"${screenName}" wirklich löschen? Alle Widgets gehen verloren.`
  );
  if (!ok) return;
  try {
    const screens = [...(device.screens || [])];
    screens.splice(screenIndex, 1);
    await this._post(`/api/config/device/${this._devId}`, { ...device, screens });
    await this._loadAll();
    this._toast("🗑️ Screen gelöscht", "success");
  } catch (e) {
    console.error("Delete screen failed:", e);
    this._toast("❌ Löschen fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._saveScreenAsTemplate = async function (device, detail) {
  const screen = device?.screens?.[detail.screenIndex];
  if (!screen) return;
  try {
    await this._post("/api/config/template", {
      id: uniqueId("template"),
      name: detail.name || screen.name || "Screen Vorlage",
      category: "custom",
      description: `Erstellt aus ${device.name || device.id} – ${screen.name || "Screen"}`,
      screen_config: tdNormalizeScreenRuntime(deepClone(screen)),
      variables: [],
    });
    await this._loadAll();
    this._toast("📚 Als Vorlage gespeichert", "success");
  } catch (e) {
    console.error("Save screen as template failed:", e);
    this._toast("❌ Vorlage speichern fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._importScreenTemplate = async function (device, templateId) {
  const tpl = this._templates?.[templateId];
  if (!tpl?.screen_config || !device) return;
  try {
    const sc = tdNormalizeScreenRuntime(tdHydrateScreenPresetEntities(deepClone(tpl.screen_config), this.hass));
    sc.id = uniqueId("screen");
    sc.name = sc.name || tpl.name || `Screen ${(device.screens?.length || 0) + 1}`;
    const screens = [...(device.screens || []), sc];
    await this._post(`/api/config/device/${this._devId}`, { ...device, screens });
    await this._loadAll();
    this._toast("📥 Vorlage eingefügt", "success");
  } catch (e) {
    console.error("Import screen template failed:", e);
    this._toast("❌ Import fehlgeschlagen", "error");
  }
};

/* ──────────────────────────────────────────────────────
   TEMPLATE ACTIONS
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._saveTemplate = async function (data) {
  try {
    const payload = data?.screen_config ? { ...data, screen_config: tdNormalizeScreenRuntime(data.screen_config) } : data;
    await this._post("/api/config/template", payload);
    await this._loadAll();
    this._page = "main";
    this._tab = "library";
    this._libraryTab = "templates";
    this._toast("✅ Vorlage gespeichert", "success");
  } catch (e) {
    console.error("Save template failed:", e);
    this._toast("❌ Vorlage speichern fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._deleteTemplate = async function (templateId) {
  const tpl = this._templates?.[templateId];
  const name = tpl?.name || templateId;
  const ok = await this._confirm(
    "Vorlage löschen",
    `"${name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`
  );
  if (!ok) return;
  try {
    await this._del(`/api/config/template/${templateId}`);
    await this._loadAll();
    this._toast("🗑️ Vorlage gelöscht", "success");
  } catch (e) {
    console.error("Delete template failed:", e);
    this._toast("❌ Löschen fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._exportTemplate = async function (templateId) {
  const tpl = this._templates?.[templateId];
  if (!tpl) return;
  try {
    await copyToClipboard(JSON.stringify(tpl, null, 2));
    this._toast("📋 JSON in Zwischenablage kopiert", "success");
  } catch (e) {
    console.error("Export template failed:", e);
    this._toast("❌ Kopieren fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._importTemplate = async function (jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid");

    // Ensure unique ID
    parsed.id = parsed.id
      ? `${parsed.id}_imported_${Date.now()}`
      : uniqueId("imported");

    // Preserve or generate name
    if (!parsed.name) parsed.name = `Import ${new Date().toLocaleDateString("de-DE")}`;

    await this._post("/api/config/template", parsed);
    await this._loadAll();
    this._toast("📥 Vorlage importiert", "success");
  } catch (e) {
    console.error("Import template failed:", e);
    this._toast("❌ Ungültiges JSON – Import fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._saveAsTemplate = async function (detail) {
  try {
    await this._post("/api/config/template", {
      id: uniqueId("template"),
      name: detail.name || "Vorlage",
      category: "custom",
      screen_config: tdNormalizeScreenRuntime(detail.screenConfig),
      variables: [],
    });
    await this._loadAll();
    this._toast("📋 Vorlage gespeichert", "success");
  } catch (e) {
    console.error("Save as template failed:", e);
    this._toast("❌ Vorlage speichern fehlgeschlagen", "error");
  }
};

/* ──────────────────────────────────────────────────────
   ALERT ACTIONS
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._saveAlert = async function (data) {
  try {
    await this._post("/api/config/alert", data);
    await this._loadAll();
    this._page = "main";
    this._tab = "library";
    this._libraryTab = "alerts";
    this._toast("✅ Alert gespeichert", "success");
  } catch (e) {
    console.error("Save alert failed:", e);
    this._toast("❌ Alert speichern fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._deleteAlert = async function (alertId) {
  const alert = this._alertTemplates?.[alertId];
  const name = alert?.title || alert?.name || alertId;
  const ok = await this._confirm(
    "Alert löschen",
    `"${name}" wirklich löschen?`
  );
  if (!ok) return;
  try {
    await this._del(`/api/config/alert/${alertId}`);
    await this._loadAll();
    this._toast("🗑️ Alert gelöscht", "success");
  } catch (e) {
    console.error("Delete alert failed:", e);
    this._toast("❌ Löschen fehlgeschlagen", "error");
  }
};

/* ──────────────────────────────────────────────────────
   THEME ACTIONS
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._saveTheme = async function (data) {
  try {
    await this._post("/api/config/theme", data);
    await this._loadAll();
    this._page = "main";
    this._tab = "library";
    this._libraryTab = "themes";
    this._toast("✅ Theme gespeichert", "success");
  } catch (e) {
    console.error("Save theme failed:", e);
    this._toast("❌ Theme speichern fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._deleteTheme = async function (themeId) {
  const theme = this._customThemes?.[themeId];
  const name = theme?.name || themeId;
  const ok = await this._confirm(
    "Theme löschen",
    `"${name}" wirklich löschen?`
  );
  if (!ok) return;
  try {
    await this._del(`/api/config/theme/${themeId}`);
    await this._loadAll();
    this._toast("🗑️ Theme gelöscht", "success");
  } catch (e) {
    console.error("Delete theme failed:", e);
    this._toast("❌ Löschen fehlgeschlagen", "error");
  }
};

/* ──────────────────────────────────────────────────────
   MEDIA ACTIONS
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._uploadMedia = async function (type, file) {
  if (!file) return;

  // Size validation
  const maxSizes = { sound: 5, font: 10, image: 10 };
  const maxMB = maxSizes[type] || 10;
  if (file.size > maxMB * 1024 * 1024) {
    this._toast(`❌ Datei zu groß (max. ${maxMB} MB)`, "error");
    return;
  }

  // Type validation
  const allowedTypes = {
    sound: [".mp3", ".wav", ".ogg"],
    font:  [".woff2", ".ttf", ".otf"],
    image: [".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp"],
  };
  const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (allowedTypes[type] && !allowedTypes[type].includes(ext)) {
    this._toast(`❌ Ungültiger Dateityp. Erlaubt: ${allowedTypes[type].join(", ")}`, "error");
    return;
  }

  const typeIcons = { sound: "🔊", font: "🔤", image: "🖼️" };

  try {
    await this._upload(`/api/media/${type}/upload`, file);
    await this._loadAll();
    this._toast(`${typeIcons[type] || "📁"} ${file.name} hochgeladen`, "success");
  } catch (e) {
    console.error(`Upload ${type} failed:`, e);
    this._toast(`❌ Upload fehlgeschlagen: ${file.name}`, "error");
  }
};

TickerDisplayPanel.prototype._deleteMedia = async function (type, itemId) {
  const ok = await this._confirm(
    `${type === "sound" ? "Sound" : type === "font" ? "Font" : "Bild"} löschen`,
    `"${itemId}" wirklich löschen?`
  );
  if (!ok) return;

  try {
    await this._del(`/api/media/${type}/${itemId}`);
    await this._loadAll();
    this._toast("🗑️ Gelöscht", "success");
  } catch (e) {
    console.error(`Delete ${type} failed:`, e);
    this._toast("❌ Löschen fehlgeschlagen", "error");
  }
};

/* ──────────────────────────────────────────────────────
   SETTINGS ACTIONS
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._saveSettings = async function (settings) {
  try {
    await this._post("/api/config/global", settings);
    await this._loadAll();
    this._toast("✅ Einstellungen gespeichert", "success");
  } catch (e) {
    console.error("Save settings failed:", e);
    this._toast("❌ Speichern fehlgeschlagen", "error");
  }
};

/* ──────────────────────────────────────────────────────
   BACKUP ACTIONS
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._createBackup = async function () {
  try {
    const backup = await this._post("/api/config/backup", {});

    // Enrich with metadata
    const enriched = {
      _ticker_display_backup: true,
      _version: "2.0",
      _created: new Date().toISOString(),
      _ha_version: this.hass?.config?.version || "unknown",
      ...backup,
    };

    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`ticker-display-backup-${date}.json`, enriched);
    this._toast("💾 Backup heruntergeladen", "success");
  } catch (e) {
    console.error("Create backup failed:", e);
    this._toast("❌ Backup fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._restoreBackup = async function (data) {
  if (!data || typeof data !== "object") {
    this._toast("❌ Ungültige Backup-Datei", "error");
    return;
  }

  const ok = await this._confirm(
    "Backup wiederherstellen",
    "Alle aktuellen Einstellungen, Geräte-Konfigurationen, Vorlagen, Themes und Alert-Vorlagen werden überschrieben. Fortfahren?",
    { confirmLabel: "Wiederherstellen", destructive: true }
  );
  if (!ok) return;

  try {
    // Strip metadata before sending
    const payload = { ...data };
    delete payload._ticker_display_backup;
    delete payload._version;
    delete payload._created;
    delete payload._ha_version;

    await this._post("/api/config/restore", payload);
    await this._loadAll();
    this._toast("✅ Backup wiederhergestellt", "success");
  } catch (e) {
    console.error("Restore backup failed:", e);
    this._toast("❌ Wiederherstellen fehlgeschlagen", "error");
  }
};

/* ──────────────────────────────────────────────────────
   UTILITY: PUSH CONFIG TO DEVICE
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._pushConfigToDevice = async function (deviceId) {
  try {
    const device = this._devices.find((d) => d.id === deviceId);
    if (!device) return;

    // The backend handles WebSocket push via the save endpoint
    // This is a convenience method for explicit push scenarios
    await this._post(`/api/config/device/${deviceId}`, device);
  } catch (e) {
    console.error("Push config failed:", e);
  }
};

/* ──────────────────────────────────────────────────────
   UTILITY: BATCH OPERATIONS
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._reloadAllDevices = async function () {
  const online = this._devices.filter((d) => d.online);
  if (!online.length) {
    this._toast("⚠️ Keine Geräte online", "warning");
    return;
  }

  try {
    for (const d of online) {
      await this.hass.callService("ticker_display", "reload_page", { device: d.id });
    }
    this._toast(`🔄 ${online.length} Gerät${online.length !== 1 ? "e" : ""} neu geladen`, "success");
  } catch (e) {
    console.error("Reload all failed:", e);
    this._toast("❌ Reload fehlgeschlagen", "error");
  }
};

TickerDisplayPanel.prototype._exportAllConfig = async function () {
  try {
    const backup = await this._post("/api/config/backup", {});
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`ticker-display-full-export-${date}.json`, {
      _ticker_display_backup: true,
      _version: "2.0",
      _created: new Date().toISOString(),
      _ha_version: this.hass?.config?.version || "unknown",
      devices: this._devices,
      templates: this._templates,
      alerts: this._alertTemplates,
      themes: this._customThemes,
      settings: this._globalSettings,
      ...backup,
    });
    this._toast("📦 Vollständiger Export heruntergeladen", "success");
  } catch (e) {
    console.error("Full export failed:", e);
    this._toast("❌ Export fehlgeschlagen", "error");
  }
};

/* ──────────────────────────────────────────────────────
   UTILITY: DEVICE HEALTH CHECK
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._checkDeviceHealth = function () {
  const issues = [];

  for (const d of this._devices) {
    const screens = d.screens || [];

    // No screens
    if (!screens.length) {
      issues.push({
        device: d.name || d.id,
        level: "warning",
        message: "Keine Screens konfiguriert",
      });
    }

    // Empty screens
    for (const s of screens) {
      if (s.type === "dashboard" && (!s.widgets || !s.widgets.length)) {
        issues.push({
          device: d.name || d.id,
          level: "info",
          message: `Screen "${s.name || "Unbenannt"}" hat keine Widgets`,
        });
      }

      // Widgets without entity
      for (const w of (s.widgets || [])) {
        if (
          ["simple-value", "icon-value", "gauge", "progress-bar", "trend-arrow", "status-dot"].includes(w.type) &&
          !w.entity_id
        ) {
          issues.push({
            device: d.name || d.id,
            level: "warning",
            message: `Widget "${w.name || w.type}" in "${s.name || "Screen"}" hat keine Entity`,
          });
        }

        // Camera without entity
        if (w.type === "camera" && !w.entity_id && !w.config?.camera_entity) {
          issues.push({
            device: d.name || d.id,
            level: "warning",
            message: `Kamera-Widget "${w.name || "Kamera"}" hat keine Entity`,
          });
        }

        // Chart without entity
        if (TD_CHART_TYPES.has(w.type) && !w.entity_id) {
          issues.push({
            device: d.name || d.id,
            level: "info",
            message: `Chart "${w.name || w.type}" hat keine primäre Entity`,
          });
        }

        // Entity doesn't exist in HA
        if (w.entity_id && this.hass?.states && !this.hass.states[w.entity_id]) {
          issues.push({
            device: d.name || d.id,
            level: "error",
            message: `Entity "${w.entity_id}" existiert nicht in HA`,
          });
        }
      }
    }
  }

  return issues;
};

/* ──────────────────────────────────────────────────────
   UTILITY: MIGRATION HELPERS
   ────────────────────────────────────────────────────── */

TickerDisplayPanel.prototype._ensureWidgetIds = function (device) {
  // Ensures all widgets have unique IDs (migration from older versions)
  const updated = deepClone(device);
  let changed = false;

  for (const screen of (updated.screens || [])) {
    if (!screen.id) {
      screen.id = uniqueId("screen");
      changed = true;
    }
    for (const widget of (screen.widgets || [])) {
      if (!widget.id) {
        widget.id = uniqueId("w");
        changed = true;
      }
      // Ensure config object exists
      if (!widget.config) {
        widget.config = {};
        changed = true;
      }
    }
  }

  return { device: updated, changed };
};

TickerDisplayPanel.prototype._migrateDeviceConfig = function (device) {
  // Handles breaking changes between versions
  const { device: migrated, changed } = this._ensureWidgetIds(device);

  // Migrate old camera_entity to entity_id
  for (const screen of (migrated.screens || [])) {
    for (const w of (screen.widgets || [])) {
      if (w.type === "camera" && !w.entity_id && w.config?.camera_entity) {
        w.entity_id = w.config.camera_entity;
      }
      // Migrate old imageUrl to image_url
      if (w.type === "image" && w.imageUrl && !w.image_url) {
        w.image_url = w.imageUrl;
      }
    }
  }

  return migrated;
};

/* ══════════════════════════════════════════════════════════
   END OF TICKER DISPLAY PANEL
   ══════════════════════════════════════════════════════════

   File structure (8 parts):
   ─────────────────────────
   Part 1: Utilities, Constants, Shared Components
           (TdToast, TdConfirm, TdEntityPicker, TdEntityMultiPicker,
            TdHaMediaPicker, TdIconPicker, TdColorPicker,
            TdFontPicker, TdSoundPicker)

   Part 2: TdDeviceList, TdDeviceEditor

   Part 3: TdScreenEditor (Toolbar, Palette, Preview,
           Widget Operations, Presets, Undo/Redo)

   Part 4: TdScreenEditor Properties Panel
           (Screen Props, Widget Props Tabs 0/1/2,
            Interaction, Groups, Type-Specific, Charts,
            Entity Meta, Background, Ticker Override)

   Part 5: TdTemplateGallery, TdTemplateEditor,
           TdAlertList, TdAlertEditor

   Part 6: TdThemeList, TdThemeEditor,
           TdSoundManager, TdFontManager, TdImageManager

   Part 7: TdGlobalSettings, TickerDisplayPanel (Main)

   Part 8: TickerDisplayPanel Action Methods
           (Device, Screen, Template, Alert, Theme,
            Media, Settings, Backup, Health Check,
            Migration)

   Maintenance notes:
   - _confirm now forwards option objects to TdConfirm.show(...),
     so confirmLabel/destructive are effective in restore/delete flows.
   - Image widgets now keep imageUrl and image_url synchronized to
     stay compatible with older configs and newer canonical payloads.
   - The file intentionally stays as a single drop-in replacement for
     frontend/dist/ticker-display-panel.js to preserve deployment flow.
   ══════════════════════════════════════════════════════════ */
