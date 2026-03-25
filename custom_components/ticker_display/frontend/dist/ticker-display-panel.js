/**
 * Ticker Display Panel – Enhanced Admin UI
 * Improved entity pickers, clipboard handling, editor UX, media tools, and stability.
 * Drop-in replacement for frontend/dist/ticker-display-panel.js
 */

const LitElement = window.LitElement || Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace") ||
  customElements.get("home-assistant-main") ||
  HTMLElement
);
const html = window.html || LitElement.prototype.html;
const css = window.css || LitElement.prototype.css;

const API = "/ticker-display";

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getAllEntities(hass, domain = "") {
  if (!hass || !hass.states) return [];
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
      return an.localeCompare(bn);
    });
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `item-${Date.now()}`;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}



const TD_CHART_WIDGETS = [
  ["mini-graph", "📉", "Mini Graph"],
  ["sparkline", "〰️", "Sparkline"],
  ["bar-chart", "📊", "Balken"],
  ["area-chart", "🌊", "Area Chart"],
  ["multi-line-chart", "📈", "Multi-Line"],
  ["stacked-bar-chart", "🧱", "Stacked Bar"],
  ["horizontal-bar-chart", "↔️", "Horizontal Bar"],
  ["donut-chart", "🍩", "Donut"],
  ["pie-chart", "🥧", "Pie"],
  ["radar-chart", "🕸️", "Radar"],
  ["heatmap-mini", "🔥", "Heatmap Mini"],
  ["timeline-chart", "🕒", "Timeline"],
  ["scatter-chart", "✳️", "Scatter"],
  ["forecast-chart", "🔮", "Forecast"],
  ["energy-flow-mini", "⚡", "Energy Flow"],
  ["comparison-chart", "⚖️", "Comparison"],
  ["radial-gauge-advanced", "🎛️", "Radial Gauge"],
  ["bullet-chart", "🎯", "Bullet"],
];
const TD_CHART_TYPES = new Set(TD_CHART_WIDGETS.map((x) => x[0]));
const TD_CAMERA_SOURCES = [
  ["auto", "Auto (Snapshot → entity_picture → camera_proxy → stream)"],
  ["snapshot", "Snapshot"],
  ["entity_picture", "entity_picture"],
  ["camera_proxy", "camera_proxy"],
  ["camera_proxy_stream", "camera_proxy_stream"],
];



function tdNormalizedDefaults(settings = {}) {
  return {
    default_theme: settings.default_theme || "dark",
    default_transition: settings.default_transition || "fade",
    default_screen_duration: Number(settings.default_screen_duration || 15),
    default_camera_source: settings.default_camera_source || "auto",
    default_chart_hours: Number(settings.default_chart_hours || 24),
    default_widget_opacity: settings.default_widget_opacity ?? 0.75,
    default_widget_blur: Number(settings.default_widget_blur || 0),
    default_widget_radius: Number(settings.default_widget_radius || 12),
    default_background_color: settings.default_background_color || "#121212",
  };
}

function tdCreateWidget(type, col, row, settings = {}) {
  const d = tdNormalizedDefaults(settings);
  return {
    id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
    animations: true,
    config: {
      camera_source: d.default_camera_source,
      hours: d.default_chart_hours,
      value_decimals: 1,
      extra_value_decimals: 1,
      trim_trailing_zeros: false,
    },
  };
}

function tdCreateScreenPreset(kind = "blank", index = 0, settings = {}) {
  const d = tdNormalizedDefaults(settings);
  const base = {
    id: `screen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: `Screen ${index + 1}`,
    type: "dashboard",
    duration: d.default_screen_duration,
    transition: d.default_transition,
    grid: { columns: 3, rows: 2 },
    widgets: [],
    background_color: d.default_background_color,
    background_image: "",
    background_image_size: "cover",
  };

  if (kind === "weather") {
    return {
      ...base,
      name: `Wetter ${index + 1}`,
      widgets: [
        { ...tdCreateWidget("weather", 0, 0, settings), colspan: 2, rowspan: 2, name: "Wetter" },
        { ...tdCreateWidget("clock", 2, 0, settings), name: "Uhr" },
        { ...tdCreateWidget("simple-value", 2, 1, settings), name: "Temperatur" },
      ],
    };
  }
  if (kind === "camera") {
    return {
      ...base,
      name: `Kamera ${index + 1}`,
      grid: { columns: 2, rows: 2 },
      widgets: [
        { ...tdCreateWidget("camera", 0, 0, settings), colspan: 2, rowspan: 2, name: "Kamera" },
      ],
    };
  }
  if (kind === "charts") {
    return {
      ...base,
      name: `Charts ${index + 1}`,
      widgets: [
        { ...tdCreateWidget("multi-line-chart", 0, 0, settings), colspan: 2, rowspan: 2, name: "Verlauf" },
        { ...tdCreateWidget("donut-chart", 2, 0, settings), name: "Verteilung" },
        { ...tdCreateWidget("comparison-chart", 2, 1, settings), name: "Vergleich" },
      ],
    };
  }
  return base;
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

/* ══════════════════════════════════════════════════════════
   SHARED: TOAST NOTIFICATION
   ══════════════════════════════════════════════════════════ */

class TdToast extends LitElement {
  static get properties() {
    return { _msg: { type: String }, _vis: { type: Boolean } };
  }
  constructor() {
    super();
    this._msg = "";
    this._vis = false;
    this._t = null;
  }
  show(m, d = 3000) {
    this._msg = m;
    this._vis = true;
    clearTimeout(this._t);
    this._t = setTimeout(() => (this._vis = false), d);
  }
  static get styles() {
    return css`
      :host { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 10000; pointer-events: none; }
      .t {
        background: rgba(50,50,50,.95); color: #fff; padding: 12px 24px; border-radius: 12px; font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,.3); opacity: 0; transform: translateY(20px); transition: all .3s ease; pointer-events: auto;
      }
      .t.v { opacity: 1; transform: translateY(0); }
    `;
  }
  render() {
    return html`<div class="t ${this._vis ? "v" : ""}">${this._msg}</div>`;
  }
}
customElements.define("td-toast", TdToast);

/* ══════════════════════════════════════════════════════════
   SHARED: CONFIRM DIALOG
   ══════════════════════════════════════════════════════════ */

class TdConfirm extends LitElement {
  static get properties() {
    return { _open: { type: Boolean }, _title: { type: String }, _message: { type: String } };
  }
  constructor() {
    super();
    this._open = false;
    this._resolve = null;
  }
  async show(title, message) {
    this._title = title;
    this._message = message;
    this._open = true;
    return new Promise((r) => { this._resolve = r; });
  }
  static get styles() {
    return css`
      .ov { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 10000; display:flex; align-items:center; justify-content:center; }
      .dl { background: var(--card-background-color,#1e1e1e); border-radius: 16px; padding: 24px; max-width: 420px; width: 92%; box-shadow: 0 8px 32px rgba(0,0,0,.4); }
      .dl h3 { margin: 0 0 12px; font-size: 18px; }
      .dl p { margin: 0 0 20px; font-size: 14px; color: var(--secondary-text-color); line-height: 1.45; }
      .acts { display:flex; justify-content:flex-end; gap:10px; }
      .b { padding: 10px 20px; border: 1px solid var(--divider-color); border-radius: 8px; background: none; color: var(--primary-text-color); font-size: 14px; cursor:pointer; }
      .b.d { background:#F44336; border-color:#F44336; color:#fff; }
    `;
  }
  render() {
    if (!this._open) return html``;
    return html`
      <div class="ov" @click=${() => this._c(false)}>
        <div class="dl" @click=${(e) => e.stopPropagation()}>
          <h3>${this._title}</h3>
          <p>${this._message}</p>
          <div class="acts">
            <button class="b" @click=${() => this._c(false)}>Abbrechen</button>
            <button class="b d" @click=${() => this._c(true)}>Bestätigen</button>
          </div>
        </div>
      </div>
    `;
  }
  _c(r) {
    this._open = false;
    if (this._resolve) this._resolve(r);
  }
}
customElements.define("td-confirm", TdConfirm);

/* ══════════════════════════════════════════════════════════
   SHARED: ENTITY PICKER
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
    };
  }

  constructor() {
    super();
    this._search = "";
    this._open = false;
    this.placeholder = "Entity suchen...";
  }

  static get styles() {
    return css`
      :host { display:block; position:relative; }
      label { display:block; font-size:12px; color:var(--secondary-text-color); margin-bottom:4px; }
      input {
        width:100%; padding:8px 12px; border:1px solid var(--divider-color); border-radius:8px;
        background:var(--primary-background-color); color:var(--primary-text-color); font-size:13px;
      }
      input:focus { border-color:var(--primary-color); }
      .dd {
        position:absolute; top:100%; left:0; right:0; max-height:280px; overflow-y:auto;
        background:var(--card-background-color); border:1px solid var(--divider-color);
        border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.3); z-index:100; margin-top:2px;
      }
      .op {
        padding:8px 12px; cursor:pointer; font-size:13px; display:flex; flex-direction:column; gap:2px;
        border-bottom:1px solid rgba(255,255,255,.04);
      }
      .op:hover { background:rgba(255,255,255,.06); }
      .top { display:flex; justify-content:space-between; gap:8px; }
      .fn { font-weight:500; }
      .id { font-family:monospace; font-size:11px; color:var(--secondary-text-color); }
      .meta { display:flex; gap:8px; font-size:11px; color:var(--secondary-text-color); }
    `;
  }

  render() {
    const ents = this._filter();
    const current = this._currentLabel();

    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <input
        .value=${this._open ? this._search : current}
        placeholder=${this.placeholder || "Entity suchen..."}
        @focus=${() => { this._open = true; this._search = this.value || ""; }}
        @input=${(e) => { this._search = e.target.value; this._open = true; }}
        @blur=${() => setTimeout(() => { this._open = false; }, 200)}
      >
      ${this._open && ents.length ? html`
        <div class="dd">
          ${ents.slice(0, 200).map((e) => html`
            <div class="op" @mousedown=${() => this._sel(e.entity_id)}>
              <div class="top">
                <span class="fn">${e.friendly_name}</span>
                <span>${e.state}</span>
              </div>
              <div class="id">${e.entity_id}</div>
              <div class="meta">
                <span>${e.domain}</span>
                ${e.unit ? html`<span>${e.unit}</span>` : ""}
              </div>
            </div>
          `)}
        </div>
      ` : ""}
    `;
  }

  _entities() {
    return getAllEntities(this.hass, this.domain || "");
  }

  _filter() {
    const s = (this._search || "").toLowerCase().trim();
    const ents = this._entities();
    if (!s) return ents;
    return ents.filter((e) => (
      e.entity_id.toLowerCase().includes(s) ||
      (e.friendly_name || "").toLowerCase().includes(s) ||
      (e.domain || "").toLowerCase().includes(s) ||
      (e.state || "").toLowerCase().includes(s)
    ));
  }

  _currentLabel() {
    if (this._open) return this._search || "";
    if (!this.value) return "";
    const hit = this._entities().find((e) => e.entity_id === this.value);
    return hit ? `${hit.friendly_name} (${hit.entity_id})` : this.value;
  }

  _sel(id) {
    this.value = id;
    this._search = "";
    this._open = false;
    this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: id }, bubbles: true, composed: true }));
  }
}
customElements.define("td-entity-picker", TdEntityPicker);

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
      :host { display:block; position:relative; }
      label { display:block; font-size:12px; color:var(--secondary-text-color); margin-bottom:4px; }
      input { width:100%; padding:8px 12px; border:1px solid var(--divider-color); border-radius:8px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:13px; }
      .chips { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 8px; }
      .chip { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; background:rgba(255,255,255,.08); font-size:12px; }
      .chip button { border:none; background:none; color:inherit; cursor:pointer; font-size:12px; padding:0; }
      .dd { position:absolute; top:100%; left:0; right:0; max-height:280px; overflow-y:auto; background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.3); z-index:100; margin-top:2px; }
      .op { padding:8px 12px; cursor:pointer; font-size:13px; display:flex; flex-direction:column; gap:2px; border-bottom:1px solid rgba(255,255,255,.04); }
      .op:hover { background:rgba(255,255,255,.06); }
      .top { display:flex; justify-content:space-between; gap:8px; }
      .fn { font-weight:500; }
      .id { font-family:monospace; font-size:11px; color:var(--secondary-text-color); }
    `;
  }
  render() {
    const values = Array.isArray(this.value) ? this.value : [];
    const ents = this._filter();
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      ${values.length ? html`<div class="chips">${values.map((id) => html`<span class="chip">${id}<button @click=${() => this._remove(id)}>✕</button></span>`)}</div>` : ""}
      <input
        .value=${this._search}
        placeholder=${this.placeholder || "Weitere Sensoren hinzufügen..."}
        @focus=${() => this._open = true}
        @input=${(e) => { this._search = e.target.value; this._open = true; }}
        @blur=${() => setTimeout(() => { this._open = false; }, 200)}
      >
      ${this._open && ents.length ? html`<div class="dd">${ents.slice(0, 200).map((e) => html`
        <div class="op" @mousedown=${() => this._add(e.entity_id)}>
          <div class="top"><span class="fn">${e.friendly_name}</span><span>${e.state}</span></div>
          <div class="id">${e.entity_id}</div>
        </div>
      `)}</div>` : ""}
    `;
  }
  _entities() { return getAllEntities(this.hass, this.domain || ""); }
  _filter() {
    const selected = new Set(Array.isArray(this.value) ? this.value : []);
    const s = (this._search || "").toLowerCase().trim();
    return this._entities().filter((e) => !selected.has(e.entity_id)).filter((e) => !s || e.entity_id.toLowerCase().includes(s) || (e.friendly_name || "").toLowerCase().includes(s));
  }
  _emit(next) {
    this.value = next;
    this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: next }, bubbles: true, composed: true }));
  }
  _add(id) {
    const next = [...new Set([...(Array.isArray(this.value) ? this.value : []), id])];
    this._search = "";
    this._emit(next);
  }
  _remove(id) { this._emit((Array.isArray(this.value) ? this.value : []).filter((x) => x !== id)); }
}
customElements.define("td-entity-multi-picker", TdEntityMultiPicker);

class TdHaMediaPicker extends LitElement {
  static get properties() {
    return { value: { type: String }, items: { type: Array }, label: { type: String }, placeholder: { type: String } };
  }
  constructor() {
    super();
    this.items = [];
    this.value = "";
    this.placeholder = "Home Assistant Medien auswählen";
  }
  static get styles() {
    return css`
      :host { display:block; }
      label { display:block; font-size:12px; color:var(--secondary-text-color); margin-bottom:4px; }
      select { width:100%; padding:8px 12px; border:1px solid var(--divider-color); border-radius:8px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:13px; }
      .meta { margin-top:4px; font-size:11px; color:var(--secondary-text-color); }
    `;
  }
  render() {
    const current = (this.items || []).find((i) => i.url === this.value);
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <select .value=${this.value || ""} @change=${(e) => this._emit(e.target.value)}>
        <option value="">${this.placeholder || "Auswählen..."}</option>
        ${(this.items || []).map((item) => html`<option value=${item.url}>${item.path || item.title || item.url}</option>`)}
      </select>
      ${current ? html`<div class="meta">${current.url}</div>` : ""}
    `;
  }
  _emit(value) {
    this.value = value;
    const item = (this.items || []).find((i) => i.url === value) || null;
    this.dispatchEvent(new CustomEvent("value-changed", { detail: { value, item }, bubbles: true, composed: true }));
  }
}
customElements.define("td-ha-media-picker", TdHaMediaPicker);

/* ══════════════════════════════════════════════════════════
   SHARED: ICON PICKER
   ══════════════════════════════════════════════════════════ */

class TdIconPicker extends LitElement {
  static get properties() {
    return { value: { type: String }, label: { type: String }, _open: { type: Boolean } };
  }
  constructor() {
    super();
    this._open = false;
  }
  static get styles() {
    return css`
      :host { display:block; position:relative; }
      label { display:block; font-size:12px; color:var(--secondary-text-color); margin-bottom:4px; }
      .w { display:flex; gap:8px; }
      .pv { font-size:24px; display:flex; align-items:center; }
      input {
        flex:1; padding:8px 12px; border:1px solid var(--divider-color); border-radius:8px;
        background:var(--primary-background-color); color:var(--primary-text-color); font-size:13px;
      }
      .g {
        position:absolute; top:100%; left:0; right:0; padding:8px; background:var(--card-background-color);
        border:1px solid var(--divider-color); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.3);
        z-index:100; display:grid; grid-template-columns:repeat(8,1fr); gap:4px; max-height:200px; overflow-y:auto; margin-top:2px;
      }
      .ib { padding:8px; border:none; background:none; font-size:20px; cursor:pointer; border-radius:6px; text-align:center; }
      .ib:hover { background:rgba(255,255,255,.08); }
    `;
  }
  render() {
    const icons = ["🏠","🌡️","💡","🔌","🔋","📹","🔒","🚪","💧","🌤️","⚡","🎵","📊","⏰","🔔","📱","🚗","👤","❤️","🌙","☀️","🔥","❄️","💨","🧊","🪴","🐕","👶","🧹","🎮","📺","🖥️","🔊","🔇","⬆️","⬇️","✅","❌","⚠️","ℹ️"];
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <div class="w">
        <span class="pv">${this.value || "📊"}</span>
        <input
          .value=${this.value || ""}
          placeholder="Emoji oder mdi:icon"
          @focus=${() => this._open = true}
          @input=${(e) => { this.value = e.target.value; this._fire(); }}
          @blur=${() => setTimeout(() => { this._open = false; }, 200)}
        >
      </div>
      ${this._open ? html`
        <div class="g">
          ${icons.map((i) => html`<button class="ib" @mousedown=${() => { this.value = i; this._open = false; this._fire(); }}>${i}</button>`)}
        </div>
      ` : ""}
    `;
  }
  _fire() {
    this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: this.value }, bubbles: true, composed: true }));
  }
}
customElements.define("td-icon-picker", TdIconPicker);

/* ══════════════════════════════════════════════════════════
   SHARED: COLOR PICKER
   ══════════════════════════════════════════════════════════ */

class TdColorPicker extends LitElement {
  static get properties() {
    return { value: { type: String }, label: { type: String } };
  }
  static get styles() {
    return css`
      :host { display:block; }
      label { display:block; font-size:12px; color:var(--secondary-text-color); margin-bottom:4px; }
      .w { display:flex; gap:8px; align-items:center; }
      input[type=color] { width:40px; height:34px; padding:2px; border:1px solid var(--divider-color); border-radius:6px; cursor:pointer; background:none; }
      input[type=text] {
        flex:1; padding:8px 12px; border:1px solid var(--divider-color); border-radius:8px;
        background:var(--primary-background-color); color:var(--primary-text-color); font-size:13px; font-family:monospace;
      }
      .ps { display:flex; gap:4px; margin-top:6px; }
      .p { width:24px; height:24px; border-radius:50%; border:2px solid transparent; cursor:pointer; }
      .p:hover { border-color:#fff; }
    `;
  }
  render() {
    const ps = ["#2196F3", "#4CAF50", "#FF9800", "#F44336", "#9C27B0", "#00BCD4", "#FF5722", "#607D8B", "#E91E63", "#CDDC39"];
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <div class="w">
        <input type="color" .value=${this.value || "#2196F3"} @input=${(e) => this._s(e.target.value)}>
        <input type="text" .value=${this.value || ""} @input=${(e) => this._s(e.target.value)} placeholder="#RRGGBB">
      </div>
      <div class="ps">
        ${ps.map((c) => html`<div class="p" style="background:${c}" @click=${() => this._s(c)}></div>`)}
      </div>
    `;
  }
  _s(v) {
    this.value = v;
    this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: v }, bubbles: true, composed: true }));
  }
}
customElements.define("td-color-picker", TdColorPicker);

/* ══════════════════════════════════════════════════════════
   SHARED: FONT PICKER
   ══════════════════════════════════════════════════════════ */

class TdFontPicker extends LitElement {
  static get properties() {
    return { value: { type: String }, fonts: { type: Array }, label: { type: String } };
  }
  static get styles() {
    return css`
      :host { display:block; }
      label { display:block; font-size:12px; color:var(--secondary-text-color); margin-bottom:4px; }
      select {
        width:100%; padding:8px 12px; border:1px solid var(--divider-color); border-radius:8px;
        background:var(--primary-background-color); color:var(--primary-text-color); font-size:14px;
      }
    `;
  }
  render() {
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <select .value=${this.value || ""} @change=${(e) => this._s(e.target.value)}>
        <option value="">Standard (Theme)</option>
        ${(this.fonts || []).map((f) => html`<option value=${f.id}>${f.name} ${f.builtin ? "(eingebaut)" : ""}</option>`) }
      </select>
    `;
  }
  _s(v) {
    this.value = v;
    this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: v }, bubbles: true, composed: true }));
  }
}
customElements.define("td-font-picker", TdFontPicker);

/* ══════════════════════════════════════════════════════════
   SHARED: SOUND PICKER
   ══════════════════════════════════════════════════════════ */

class TdSoundPicker extends LitElement {
  static get properties() {
    return { value: { type: String }, sounds: { type: Array }, label: { type: String }, _playing: { type: Boolean } };
  }
  constructor() {
    super();
    this._playing = false;
    this._audio = null;
  }
  static get styles() {
    return css`
      :host { display:block; }
      label { display:block; font-size:12px; color:var(--secondary-text-color); margin-bottom:4px; }
      .w { display:flex; gap:8px; }
      select {
        flex:1; padding:8px 12px; border:1px solid var(--divider-color); border-radius:8px;
        background:var(--primary-background-color); color:var(--primary-text-color); font-size:14px;
      }
      .pb { padding:8px 12px; border:1px solid var(--divider-color); border-radius:8px; background:none; color:var(--primary-text-color); cursor:pointer; font-size:16px; }
      .pb:hover { background:rgba(255,255,255,.05); }
    `;
  }
  render() {
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <div class="w">
        <select .value=${this.value || ""} @change=${(e) => this._s(e.target.value)}>
          <option value="">Kein Sound</option>
          ${(this.sounds || []).map((s) => html`<option value=${s.id}>${s.name} (${s.category})</option>`) }
        </select>
        <button class="pb" @click=${() => this._pv()} title="Vorhören">${this._playing ? "⏹" : "▶"}</button>
      </div>
    `;
  }
  _s(v) {
    this.value = v;
    this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: v }, bubbles: true, composed: true }));
  }
  _pv() {
    if (this._playing) {
      this._audio?.pause();
      this._audio = null;
      this._playing = false;
      return;
    }
    const s = (this.sounds || []).find((s) => s.id === this.value);
    if (!s?.url) return;
    this._audio = new Audio(s.url);
    this._audio.onended = () => (this._playing = false);
    this._audio.play().catch(() => {});
    this._playing = true;
  }
}
customElements.define("td-sound-picker", TdSoundPicker);

/* ══════════════════════════════════════════════════════════
   DEVICE LIST
   ══════════════════════════════════════════════════════════ */

class TdDeviceList extends LitElement {
  static get properties() {
    return { hass: { type: Object }, devices: { type: Array } };
  }
  static get styles() {
    return css`
      :host { display:block; padding:16px; }
      .hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
      .hdr h2 { margin:0; font-size:22px; font-weight:500; }
      .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:16px; }
      .card { background:var(--card-background-color,#1e1e1e); border-radius:12px; padding:20px; box-shadow:var(--ha-card-box-shadow,0 2px 6px rgba(0,0,0,.15)); }
      .card:hover { box-shadow:0 4px 12px rgba(0,0,0,.25); }
      .ch { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
      .ci { font-size:32px; opacity:.6; }
      .cn { font-size:18px; font-weight:500; flex:1; }
      .sb { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:12px; font-size:12px; font-weight:500; }
      .sb.on { background:rgba(76,175,80,.15); color:#4CAF50; }
      .sb.off { background:rgba(244,67,54,.15); color:#F44336; }
      .sd { width:8px; height:8px; border-radius:50%; background:currentColor; }
      .di { display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; margin-bottom:16px; font-size:13px; color:var(--secondary-text-color); }
      .di .v { font-weight:500; color:var(--primary-text-color); }
      .da { display:flex; gap:8px; flex-wrap:wrap; }
      .ab {
        display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border:1px solid var(--divider-color);
        border-radius:8px; background:none; color:var(--primary-text-color); font-size:13px; cursor:pointer; transition:all .2s;
      }
      .ab:hover { background:rgba(255,255,255,.05); border-color:var(--primary-color); }
      .ab.p { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
      .empty { text-align:center; padding:60px 20px; color:var(--secondary-text-color); }
      .empty .ei { font-size:64px; margin-bottom:16px; opacity:.3; }
    `;
  }

  render() {
    return html`
      <div class="hdr">
        <h2>📱 Meine Geräte</h2>
        <button class="ab" @click=${() => this._e("refresh", {})}>🔄 Aktualisieren</button>
      </div>
      ${this.devices.length === 0 ? html`
        <div class="empty">
          <div class="ei">📱</div>
          <p style="font-size:18px">Noch keine Geräte registriert</p>
          <p>Installiere die Ticker Display App auf einem Tablet oder Smartphone.</p>
        </div>
      ` : html`
        <div class="grid">${this.devices.map((d) => this._rd(d))}</div>
      `}
    `;
  }

  _rd(d) {
    const on = d.online || false;
    return html`
      <div class="card">
        <div class="ch">
          <span class="ci">📱</span>
          <span class="cn">${d.name || d.id}</span>
          <span class="sb ${on ? "on" : "off"}"><span class="sd"></span>${on ? "Online" : "Offline"}</span>
        </div>
        <div class="di">
          <span>ID:</span><span class="v">${d.id}</span>
          <span>Modell:</span><span class="v">${d.model || "—"}</span>
          <span>Android:</span><span class="v">${d.android_version || "—"}</span>
          <span>Auflösung:</span><span class="v">${d.screen_resolution || "—"}</span>
          <span>Screens:</span><span class="v">${d.screens?.length || 0} konfiguriert</span>
          <span>Theme:</span><span class="v">${d.theme || "dark"}</span>
        </div>
        <div class="da">
          <button class="ab p" @click=${() => this._e("edit-device", { deviceId: d.id })}>🧱 Editor</button>
          <button class="ab" @click=${() => this._e("preview-device", { deviceId: d.id })}>👁️</button>
          <button class="ab" @click=${() => this._e("reload-device", { deviceId: d.id })}>🔄</button>
          <button class="ab" @click=${() => this._e("identify-device", { deviceId: d.id })}>💡</button>
          <button class="ab" @click=${() => this._e("delete-device", { deviceId: d.id })}>🗑️</button>
        </div>
      </div>
    `;
  }

  _e(n, d) {
    this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true }));
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
      _di: { type: Number },
    };
  }
  constructor() {
    super();
    this._ed = null;
    this._di = -1;
  }
  updated(c) {
    if (c.has("device") && this.device) this._ed = deepClone(this.device);
  }

  static get styles() {
    return css`
      :host { display:block; padding:16px; max-width:900px; margin:0 auto; }
      .sec { background:var(--card-background-color,#1e1e1e); border-radius:12px; padding:20px; margin-bottom:16px; box-shadow:var(--ha-card-box-shadow); }
      .sec h3 { margin:0 0 16px; font-size:16px; font-weight:500; display:flex; align-items:center; gap:8px; }
      .f { margin-bottom:16px; }
      .f label { display:block; font-size:13px; color:var(--secondary-text-color); margin-bottom:6px; }
      .f input,.f select {
        width:100%; padding:10px 12px; border:1px solid var(--divider-color); border-radius:8px;
        background:var(--primary-background-color); color:var(--primary-text-color); font-size:14px; outline:none;
      }
      .f input:focus,.f select:focus { border-color:var(--primary-color); }
      .row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .sl { list-style:none; padding:0; margin:0; }
      .si {
        display:flex; align-items:center; gap:12px; padding:12px 16px; margin-bottom:8px;
        background:var(--primary-background-color); border-radius:10px; border:1px solid var(--divider-color); cursor:grab; transition:all .2s;
      }
      .si:hover { border-color:var(--primary-color); }
      .si.drag { opacity:.5; }
      .sdh { cursor:grab; opacity:.4; font-size:18px; user-select:none; }
      .sinfo { flex:1; }
      .sn { font-weight:500; font-size:15px; }
      .sm { font-size:12px; color:var(--secondary-text-color); margin-top:2px; }
      .sa { display:flex; gap:4px; }
      .ib { padding:6px; border:none; background:none; color:var(--secondary-text-color); cursor:pointer; border-radius:6px; font-size:16px; }
      .ib:hover { background:rgba(255,255,255,.08); color:var(--primary-text-color); }
      .addb {
        display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:14px;
        border:2px dashed var(--divider-color); border-radius:10px; background:none; color:var(--secondary-text-color); font-size:14px; cursor:pointer; transition:all .2s;
      }
      .addb:hover { border-color:var(--primary-color); color:var(--primary-color); background:rgba(33,150,243,.05); }
      .da { display:flex; gap:8px; flex-wrap:wrap; }
      .ab {
        display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border:1px solid var(--divider-color);
        border-radius:8px; background:none; color:var(--primary-text-color); font-size:13px; cursor:pointer; transition:all .2s;
      }
      .ab:hover { background:rgba(255,255,255,.05); border-color:var(--primary-color); }
      .savebar {
        position:sticky; bottom:0; background:var(--card-background-color); padding:16px; display:flex; justify-content:flex-end; gap:12px;
        margin:0 -16px; border-top:1px solid var(--divider-color); border-radius:0 0 12px 12px;
      }
      .sbtn { padding:10px 24px; border:none; border-radius:8px; font-size:14px; font-weight:500; cursor:pointer; transition:all .2s; }
      .sbtn.p { background:var(--primary-color); color:#fff; }
      .sbtn.p:hover { filter:brightness(1.1); }
      .sbtn.s { background:none; border:1px solid var(--divider-color); color:var(--primary-text-color); }
    `;
  }

  render() {
    if (!this._ed) return html`<div>Laden...</div>`;
    const d = this._ed;
    const tl = { dashboard: "📊 Dashboard", weather: "🌤️ Wetter", camera: "📹 Kamera", graph: "📈 Graph", clock: "🕐 Uhr", "single-value": "🔢 Einzelwert", "status-board": "🚪 Status Board", image: "🖼️ Bild" };
    return html`
      <div class="sec">
        <h3>📱 Geräte-Info</h3>
        <div class="f"><label>Gerätename</label><input .value=${d.name || ""} @input=${(e) => this._u("name", e.target.value)}></div>
        <div class="row">
          <div class="f">
            <label>Theme</label>
            <select .value=${d.theme || "dark"} @change=${(e) => this._u("theme", e.target.value)}>
              <option value="dark">🌙 Dark</option>
              <option value="light">☀️ Light</option>
              <option value="high-contrast">🔲 High Contrast</option>
              <option value="night">🌃 Nachtmodus</option>
            </select>
          </div>
          <div class="f">
            <label>Font</label>
            <select .value=${d.font || "roboto"} @change=${(e) => this._u("font", e.target.value)}>
              ${(this.fonts || []).map((f) => html`<option value=${f.id}>${f.name}</option>`)}
            </select>
          </div>
        </div>
      </div>

      <div class="sec">
        <h3>📺 Screens (Rotation)</h3>
        <p style="font-size:13px;color:var(--secondary-text-color);margin:0 0 16px">Reihenfolge per Drag & Drop ändern. Über Schnellstart legst du fertige Grundlayouts an.</p>
        <div class="da" style="margin-bottom:14px">
          <button class="ab" @click=${() => this._e("add-screen-preset", { preset: "blank" })}>➕ Leer</button>
          <button class="ab" @click=${() => this._e("add-screen-preset", { preset: "weather" })}>🌤️ Wetter</button>
          <button class="ab" @click=${() => this._e("add-screen-preset", { preset: "camera" })}>📹 Kamera</button>
          <button class="ab" @click=${() => this._e("add-screen-preset", { preset: "charts" })}>📈 Charts</button>
        </div>
        <ul class="sl">
          ${(d.screens || []).map((s, i) => html`
            <li class="si ${this._di === i ? "drag" : ""}" draggable="true"
              @dragstart=${(e) => { this._di = i; e.dataTransfer.effectAllowed = "move"; }}
              @dragover=${(e) => {
                e.preventDefault();
                if (this._di === i) return;
                const sc = [...(this._ed.screens || [])];
                const [m] = sc.splice(this._di, 1);
                sc.splice(i, 0, m);
                this._ed = { ...this._ed, screens: sc };
                this._di = i;
              }}
              @dragend=${() => this._di = -1}
            >
              <span class="sdh">⠿</span>
              <div class="sinfo">
                <div class="sn">${s.name || `Screen ${i + 1}`}</div>
                <div class="sm">${tl[s.type] || s.type || "Dashboard"} · ${s.duration || 15}s · ${s.widgets?.length || 0} Widgets</div>
              </div>
              <div class="sa">
                <button class="ib" @click=${() => this._e("edit-screen", { screenIndex: i })}>✏️</button>
                <button class="ib" title="Als Vorlage speichern" @click=${() => { const n = prompt("Vorlagenname:", s.name || `Screen ${i + 1}`); if (n) this._e("save-screen-as-template", { screenIndex: i, name: n }); }}>📚</button>
                <button class="ib" @click=${() => {
                  const sc = [...(this._ed.screens || [])];
                  const c = deepClone(sc[i]);
                  c.id = `screen_${Date.now()}`;
                  c.name = `${c.name || `Screen ${i + 1}`} (Kopie)`;
                  sc.splice(i + 1, 0, c);
                  this._ed = { ...this._ed, screens: sc };
                }}>📋</button>
                <button class="ib" @click=${() => this._e("delete-screen", { screenIndex: i })}>🗑️</button>
              </div>
            </li>
          `)}
        </ul>
        <button class="addb" @click=${() => this._e("add-screen-preset", { preset: "blank" })}>➕ Screen hinzufügen</button>
      </div>

      <div class="sec">
        <h3>🔄 Rotation</h3>
        <div class="row">
          <div class="f">
            <label>Übergang</label>
            <select .value=${d.rotation?.transition || "fade"} @change=${(e) => this._un("rotation", "transition", e.target.value)}>
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="flip">Flip</option>
              <option value="zoom">Zoom</option>
              <option value="none">Kein</option>
            </select>
          </div>
          <div class="f">
            <label>Rotation</label>
            <select .value=${d.rotation?.enabled !== false ? "on" : "off"} @change=${(e) => this._un("rotation", "enabled", e.target.value === "on") }>
              <option value="on">Aktiviert</option>
              <option value="off">Deaktiviert</option>
            </select>
          </div>
        </div>
      </div>

      <div class="sec">
        <h3>📰 Ticker-Leiste</h3>
        <div class="row">
          <div class="f">
            <label>Ticker</label>
            <select .value=${d.ticker?.enabled !== false ? "on" : "off"} @change=${(e) => this._un("ticker", "enabled", e.target.value === "on") }>
              <option value="on">Aktiviert</option>
              <option value="off">Deaktiviert</option>
            </select>
          </div>
          <div class="f">
            <label>Geschwindigkeit</label>
            <select .value=${d.ticker?.speed || "normal"} @change=${(e) => this._un("ticker", "speed", e.target.value)}>
              <option value="slow">Langsam</option>
              <option value="normal">Normal</option>
              <option value="fast">Schnell</option>
            </select>
          </div>
          <div class="f">
            <label>Position</label>
            <select .value=${d.ticker?.position || "bottom"} @change=${(e) => this._un("ticker", "position", e.target.value)}>
              <option value="bottom">Unten</option>
              <option value="top">Oben</option>
            </select>
          </div>
          <div class="f">
            <label>Höhe</label>
            <input type="number" min="24" max="120" .value=${d.ticker?.height || 36} @change=${(e) => this._un("ticker", "height", +e.target.value)}>
          </div>
          <div class="f">
            <label>Schriftgröße</label>
            <input type="number" min="10" max="40" .value=${d.ticker?.font_size || 14} @change=${(e) => this._un("ticker", "font_size", +e.target.value)}>
          </div>
          <div class="f">
            <label>Padding X</label>
            <input type="number" min="4" max="40" .value=${d.ticker?.item_padding_x || 22} @change=${(e) => this._un("ticker", "item_padding_x", +e.target.value)}>
          </div>
          <div class="f">
            <label>Transparenz</label>
            <input type="number" min="0.1" max="1" step="0.05" .value=${d.ticker?.opacity || 1} @change=${(e) => this._un("ticker", "opacity", +e.target.value)}>
          </div>
          <div class="f"><label>Textfarbe</label><input .value=${d.ticker?.text_color || "#e8eef7"} @change=${(e) => this._un("ticker", "text_color", e.target.value)}></div>
          <div class="f"><label>Hintergrund</label><input .value=${d.ticker?.background_color || "rgba(12,18,28,.72)"} @change=${(e) => this._un("ticker", "background_color", e.target.value)}></div>
          <div class="f"><label>Akzent/Separator</label><input .value=${d.ticker?.accent_color || "#4fc3f7"} @change=${(e) => this._un("ticker", "accent_color", e.target.value)}></div>
          <div class="f"><label>Trennzeichen</label><input .value=${d.ticker?.separator || "│"} @change=${(e) => this._un("ticker", "separator", e.target.value || "│")}></div>
          <div class="f"><label>Radius</label><input type="number" min="0" max="40" .value=${d.ticker?.border_radius || 0} @change=${(e) => this._un("ticker", "border_radius", +e.target.value)}></div>
          <div class="f"><label>Feste Meldungen</label><input .value=${(d.ticker?.fixed_messages || []).join(" | ")} placeholder="Text 1 | Text 2" @change=${(e) => this._un("ticker", "fixed_messages", String(e.target.value || "").split("|").map((x) => x.trim()).filter(Boolean))}></div>
        </div>
      </div>

      <div class="savebar">
        <button class="sbtn s" @click=${() => this._e("back", {})}>Abbrechen</button>
        <button class="sbtn p" @click=${() => this._e("save", this._ed)}>💾 Speichern</button>
      </div>
    `;
  }
  _u(k, v) { this._ed = { ...this._ed, [k]: v }; }
  _un(s, k, v) { const c = { ...(this._ed[s] || {}) }; c[k] = v; this._ed = { ...this._ed, [s]: c }; }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-device-editor", TdDeviceEditor);

/* ══════════════════════════════════════════════════════════
   SCREEN EDITOR
   ══════════════════════════════════════════════════════════ */

class TdScreenEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      deviceId: { type: String },
      screenIndex: { type: Number },
      screenConfig: { type: Object },
      fonts: { type: Array },
      sounds: { type: Array },
      templates: { type: Object },
      images: { type: Array },
      haImages: { type: Array },
      globalSettings: { type: Object },
      _cfg: { type: Object },
      _sel: { type: Number },
      _prev: { type: String },
      _grid: { type: Boolean },
      _undo: { type: Array },
      _redo: { type: Array },
      _dwt: { type: String },
      _pt: { type: Number },
      _paletteQuery: { type: String },
      _paletteFilter: { type: String },
      _favoriteWidgets: { type: Array },
      _recentWidgets: { type: Array },
      _selMulti: { type: Array },
      _snap: { type: Boolean },
      _dragState: { type: Object },
      _resizeState: { type: Object },
      _toolMenuOpen: { type: Boolean },
    };
  }
  constructor() {
    super();
    this._cfg = null;
    this._sel = -1;
    this._prev = "landscape";
    this._grid = true;
    this._undo = [];
    this._redo = [];
    this._dwt = null;
    this._pt = 0;
    this._paletteQuery = "";
    this._paletteFilter = "all";
    this._favoriteWidgets = safeJsonParse(localStorage.getItem("td_widget_favorites"), []) || [];
    this._recentWidgets = safeJsonParse(localStorage.getItem("td_widget_recent"), []) || [];
    this._selMulti = [];
    this._snap = true;
    this._toolMenuOpen = false;
    this._dragState = null;
    this._resizeState = null;
  }
  updated(c) {
    if (c.has("screenConfig") && this.screenConfig) this._cfg = deepClone(this.screenConfig);
  }

  static get styles() {
    return css`
      :host { display:grid; grid-template-columns:280px 1fr 340px; grid-template-rows:auto 1fr; height:100vh; overflow:hidden; }
      .tb { grid-column:1/-1; display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:8px 12px; background:var(--app-header-background-color,#1e1e1e); border-bottom:1px solid var(--divider-color); overflow:visible; position:relative; z-index:30; }
      .tb button { padding:6px 12px; border:1px solid var(--divider-color); border-radius:6px; background:none; color:var(--primary-text-color); font-size:13px; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:4px; }
      .tb button:hover { background:rgba(255,255,255,.05); }
      .tb button.p { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
      .tb button:disabled { opacity:.3; cursor:not-allowed; }
      .tb input { padding:6px 10px; border:1px solid var(--divider-color); border-radius:6px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:13px; width:160px; }
      .tb select { padding:6px 8px; border:1px solid var(--divider-color); border-radius:6px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:13px; }
      .tb .sp { flex:1; }
      .tb .lb { font-size:12px; color:var(--secondary-text-color); white-space:nowrap; }
      .tb .tmenu-wrap { position:relative; display:inline-block; }
      .tb .tmenu-btn { padding:6px 12px; border:1px solid var(--divider-color); border-radius:6px; cursor:pointer; white-space:nowrap; background:none; color:var(--primary-text-color); }
      .tb .tmenu-btn.a { background:rgba(255,255,255,.06); }
      .tpop { position:absolute; top:calc(100% + 6px); left:0; min-width:320px; max-width:min(92vw, 520px); max-height:min(70vh, 560px); overflow:auto; padding:10px; border:1px solid var(--divider-color); border-radius:10px; background:var(--card-background-color); box-shadow:0 10px 30px rgba(0,0,0,.28); z-index:80; display:grid; gap:10px; }
      .folder { border:1px solid rgba(255,255,255,.06); border-radius:12px; margin-bottom:10px; overflow:hidden; background:rgba(255,255,255,.02); }
      .folder summary { list-style:none; cursor:pointer; padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .folder summary::-webkit-details-marker { display:none; }
      .folder .fleft { display:flex; align-items:center; gap:10px; min-width:0; }
      .folder .fmeta { font-size:11px; color:var(--secondary-text-color); }
      .folder .fpreview { display:flex; gap:4px; }
      .folder .fpreview span { width:18px; height:18px; border-radius:6px; background:rgba(255,255,255,.12); display:flex; align-items:center; justify-content:center; font-size:11px; }
      .folder .body { padding:0 10px 10px; }
      .tsect { display:grid; gap:6px; }
      .tsect .tl { font-size:11px; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.04em; }
      .trow { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
      .trow button { justify-content:center; }
      .pal { overflow-y:auto; padding:10px; border-right:1px solid var(--divider-color); background:var(--sidebar-background-color,#111); }
      .paltools { display:grid; gap:8px; margin-bottom:10px; position:sticky; top:0; background:linear-gradient(180deg,var(--sidebar-background-color,#111) 80%, rgba(17,17,17,0)); padding-bottom:8px; z-index:1; }
      .paltools input, .paltools select { width:100%; padding:8px 10px; border:1px solid var(--divider-color); border-radius:8px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:13px; }
      .chips { display:flex; gap:6px; flex-wrap:wrap; }
      .chip2 { padding:6px 10px; border-radius:999px; border:1px solid var(--divider-color); background:none; color:var(--secondary-text-color); cursor:pointer; font-size:12px; }
      .chip2.a { color:var(--primary-text-color); border-color:var(--primary-color); background:rgba(33,150,243,.12); }
      .pc { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--secondary-text-color); padding:12px 8px 6px; }
      .pgrid { display:grid; gap:8px; }
      .pi { display:grid; grid-template-columns:28px 1fr auto; gap:8px; align-items:center; padding:10px; border:1px solid rgba(255,255,255,.06); margin:0; border-radius:12px; cursor:grab; font-size:13px; color:var(--primary-text-color); transition:background .15s,border-color .15s,transform .15s; background:rgba(255,255,255,.02); }
      .pi:hover { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.12); transform:translateY(-1px); }
      .pi:active { cursor:grabbing; opacity:.6; }
      .pi .pp { font-size:18px; opacity:.8; width:22px; text-align:center; }
      .pi .meta { font-size:11px; color:var(--secondary-text-color); }
      .favb { border:none; background:none; color:var(--secondary-text-color); cursor:pointer; font-size:16px; }
      .favb.a { color:#f6c344; }
      .pva { display:flex; align-items:center; justify-content:center; background:#0a0a0a; padding:20px; overflow:hidden; }
      .pf { background:#121212; border-radius:8px; box-shadow:0 4px 24px rgba(0,0,0,.5); display:flex; flex-direction:column; overflow:hidden; position:relative; }
      .pf.l { width:min(100%,720px); aspect-ratio:16/10; }
      .pf.p { height:min(100%,520px); aspect-ratio:10/16; }
      .pg { display:grid; gap:6px; padding:6px; flex:1; min-height:0; }
      .ptk { height:28px; background:rgba(255,255,255,.03); border-top:1px solid rgba(255,255,255,.05); display:flex; align-items:center; padding:0 10px; font-size:11px; color:rgba(255,255,255,.3); flex-shrink:0; }
      .gc { border:1px dashed transparent; border-radius:6px; transition:all .15s; min-height:40px; }
      .gc.sg { border-color:rgba(255,255,255,.06); }
      .gc.do { border-color:var(--primary-color); background:rgba(33,150,243,.08); }
      .wb {
        background:rgba(255,255,255,.06); border-radius:8px; padding:8px; display:flex; flex-direction:column;
        align-items:center; justify-content:center; cursor:pointer; position:relative; overflow:hidden; border:2px solid transparent; transition:border-color .15s;
      }
      .wb:hover { border-color:rgba(255,255,255,.15); }
      .wb.sel { border-color:var(--primary-color); box-shadow:0 0 0 1px rgba(33,150,243,.2), 0 10px 24px rgba(0,0,0,.25); }
      .wb.ms { border-color:#8BC34A; }
      .wb.locked { outline:1px dashed rgba(255,193,7,.7); }
      .wb .wi { font-size:20px; opacity:.5; }
      .wb .layerb { position:absolute; top:6px; right:6px; font-size:9px; padding:2px 4px; border-radius:999px; background:rgba(0,0,0,.35); color:#fff; }
      .wb .groupb { position:absolute; top:6px; left:6px; font-size:9px; padding:2px 4px; border-radius:999px; background:rgba(33,150,243,.22); color:#fff; max-width:50%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wbh { position:absolute; width:12px; height:12px; border-radius:50%; background:var(--primary-color); border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.35); z-index:5; }
      .wbh.se { right:4px; bottom:4px; cursor:nwse-resize; }
      .wbh.e { right:4px; top:50%; transform:translateY(-50%); cursor:ew-resize; }
      .wbh.s { left:50%; bottom:4px; transform:translateX(-50%); cursor:ns-resize; }
      .wb .wv { font-size:22px; font-weight:500; color:#fff; margin:2px 0; }
      .wb .wn { font-size:10px; color:rgba(255,255,255,.5); text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }
      .wb .wx { font-size:9px; color:rgba(255,255,255,.38); margin-top:2px; text-align:center; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .guides { position:absolute; inset:0; pointer-events:none; }
      .gvl, .ghl { position:absolute; pointer-events:none; }
      .gvl { top:0; bottom:28px; width:1px; background:rgba(33,150,243,.28); }
      .ghl { left:0; right:0; height:1px; background:rgba(33,150,243,.24); }
      .pvm { display:flex; align-items:center; justify-content:center; width:54px; height:38px; border-radius:10px; background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)); border:1px solid rgba(255,255,255,.05); overflow:hidden; }
      .pvm .lc { width:34px; height:20px; border-radius:6px; background:rgba(255,255,255,.09); display:flex; align-items:center; justify-content:center; font-size:12px; color:#fff; }
      .pvm .ln { width:36px; height:3px; border-radius:999px; background:rgba(255,255,255,.18); margin-top:3px; }
      .pvm .bars { display:flex; align-items:flex-end; gap:3px; height:20px; }
      .pvm .bars span { width:5px; border-radius:3px 3px 0 0; background:rgba(33,150,243,.75); }
      .pvm .ring { width:20px; height:20px; border-radius:50%; border:4px solid rgba(33,150,243,.65); border-right-color:rgba(255,255,255,.15); }
      .pvm .cam { font-size:16px; }
      .pvm .weather { font-size:16px; }
      .presetgrid { display:grid; gap:8px; margin-bottom:12px; }
      .presetb { display:flex; align-items:center; gap:8px; padding:9px 10px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:rgba(255,255,255,.03); color:var(--primary-text-color); cursor:pointer; }
      .presetb:hover { background:rgba(255,255,255,.06); }
      .msinfo { margin-left:8px; font-size:12px; color:var(--secondary-text-color); }
      .props { overflow-y:auto; padding:12px; border-left:1px solid var(--divider-color); background:var(--sidebar-background-color,#111); }
      .pe { display:flex; flex-direction:column; align-items:center; justify-content:center; height:200px; color:var(--secondary-text-color); text-align:center; font-size:14px; gap:8px; }
      .ptabs { display:flex; border-bottom:1px solid var(--divider-color); margin-bottom:12px; }
      .ptab { flex:1; padding:8px 4px; text-align:center; font-size:12px; font-weight:500; cursor:pointer; border-bottom:2px solid transparent; color:var(--secondary-text-color); background:none; border-top:none; border-left:none; border-right:none; }
      .ptab.a { color:var(--primary-color); border-bottom-color:var(--primary-color); }
      .pg4 { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--secondary-text-color); margin:0 0 8px; }
      .pf2 { margin-bottom:10px; }
      .pf2 label { display:block; font-size:12px; color:var(--secondary-text-color); margin-bottom:4px; }
      .pf2 input,.pf2 select {
        width:100%; padding:7px 10px; border:1px solid var(--divider-color); border-radius:6px;
        background:var(--primary-background-color); color:var(--primary-text-color); font-size:13px;
      }
      .pf2 input[type=color] { height:36px; padding:2px; cursor:pointer; }
      .delb { width:100%; padding:10px; border:1px solid #F44336; border-radius:8px; background:none; color:#F44336; cursor:pointer; font-size:13px; margin-top:16px; }
      .delb:hover { background:rgba(244,67,54,.1); }
      textarea {
        width:100%; font-family:monospace; font-size:12px; background:var(--primary-background-color); color:var(--primary-text-color);
        border:1px solid var(--divider-color); border-radius:6px; padding:8px; resize:vertical;
      }
    `;
  }

  render() {
    if (!this._cfg) return html``;
    return html`${this._toolbar()}${this._palette()}${this._preview()}${this._properties()}`;
  }

  _toolbar() {
    const multiCount = (this._selMulti || []).length;
    return html`
      <div class="tb">
        <button @click=${() => this._e("back", {})}>← Zurück</button>
        <input .value=${this._cfg.name || ""} placeholder="Screen Name" @input=${(e) => (this._cfg = { ...this._cfg, name: e.target.value })}>
        <span class="lb">Grid:</span>
        <select .value=${String(this._cfg.grid?.columns || 3)} @change=${(e) => this._sg("columns", +e.target.value)}>${[1,2,3,4,5].map((n) => html`<option value=${n}>${n}</option>`)}</select>
        <span>×</span>
        <select .value=${String(this._cfg.grid?.rows || 2)} @change=${(e) => this._sg("rows", +e.target.value)}>${[1,2,3,4].map((n) => html`<option value=${n}>${n}</option>`)}</select>
        <button @click=${() => this._grid = !this._grid}>${this._grid ? "▦" : "▢"}</button>
        <button ?disabled=${this._sel < 0} @click=${() => this._duplicateSelected()}>⧉</button>
        <button ?disabled=${this._sel < 0} @click=${() => this._deleteSelected()}>🗑</button>
        <div class="tmenu-wrap">
          <button class="tmenu-btn ${this._toolsOpen ? "a" : ""}" @click=${() => this._toolsOpen = !this._toolsOpen}>🧰 Werkzeuge ▾</button>
          ${this._toolsOpen ? html`<div class="tpop">
            <div class="tsect">
              <div class="tl">Bewegen</div>
              <div class="trow">
                <button ?disabled=${this._sel < 0} @click=${() => this._nudgeSelected(-1, 0)}>←</button>
                <button ?disabled=${this._sel < 0} @click=${() => this._nudgeSelected(1, 0)}>→</button>
                <button ?disabled=${this._sel < 0} @click=${() => this._nudgeSelected(0, -1)}>↑</button>
                <button ?disabled=${this._sel < 0} @click=${() => this._nudgeSelected(0, 1)}>↓</button>
              </div>
            </div>
            <div class="tsect">
              <div class="tl">An Kante / Mitte ausrichten</div>
              <div class="trow">
                <button ?disabled=${multiCount < 2} @click=${() => this._alignSelectedEdge("left")}>⇤</button>
                <button ?disabled=${multiCount < 2} @click=${() => this._alignSelectedEdge("center-x")}>↔</button>
                <button ?disabled=${multiCount < 2} @click=${() => this._alignSelectedEdge("right")}>⇥</button>
                <button ?disabled=${multiCount < 2} @click=${() => this._alignSelectedEdge("top")}>⇡</button>
                <button ?disabled=${multiCount < 2} @click=${() => this._alignSelectedEdge("center-y")}>↕</button>
                <button ?disabled=${multiCount < 2} @click=${() => this._alignSelectedEdge("bottom")}>⇣</button>
                <button ?disabled=${multiCount < 2} @click=${() => this._alignSelectedEdge("col")}>⇤X</button>
                <button ?disabled=${multiCount < 2} @click=${() => this._alignSelectedEdge("row")}>⇡Y</button>
              </div>
            </div>
            <div class="tsect">
              <div class="tl">Größe / Verteilung</div>
              <div class="trow">
                <button ?disabled=${multiCount < 2} @click=${() => this._alignSelectedSize("width")}>▭W</button>
                <button ?disabled=${multiCount < 2} @click=${() => this._alignSelectedSize("height")}>▯H</button>
                <button ?disabled=${multiCount < 2} @click=${() => this._distributeSelected("x")}>⋯X</button>
                <button ?disabled=${multiCount < 2} @click=${() => this._distributeSelected("y")}>⋮Y</button>
                <button ?disabled=${this._sel < 0} @click=${() => this._resizeSelected(1,0)}>＋W</button>
                <button ?disabled=${this._sel < 0} @click=${() => this._resizeSelected(-1,0)}>－W</button>
                <button ?disabled=${this._sel < 0} @click=${() => this._resizeSelected(0,1)}>＋H</button>
                <button ?disabled=${this._sel < 0} @click=${() => this._resizeSelected(0,-1)}>－H</button>
              </div>
            </div>
            <div class="tsect">
              <div class="tl">Raster</div>
              <div class="trow">
                <button class=${this._snap ? "p" : ""} @click=${() => this._snap = !this._snap}># Snap</button>
              </div>
            </div>
          </div>` : ""}
        </div>
        <div class="sp"></div>
        <span class="lb">${multiCount > 1 ? `${multiCount} Widgets ausgewählt` : (this._sel >= 0 ? `Widget ${this._sel + 1} ausgewählt` : "Kein Widget ausgewählt")}</span>
        <button ?disabled=${!this._undo.length} @click=${() => this._doUndo()}>↩</button>
        <button ?disabled=${!this._redo.length} @click=${() => this._doRedo()}>↪</button>
        <button @click=${() => this._prev = this._prev === "landscape" ? "portrait" : "landscape"}>${this._prev === "landscape" ? "🖥" : "📱"}</button>
        <select .value=${String(this._cfg.duration || 15)} @change=${(e) => this._cfg = { ...this._cfg, duration: +e.target.value }}>${[5,10,15,20,30,60].map((n) => html`<option value=${n}>${n}s</option>`)}</select>
        <button @click=${() => this._openDraftPreview()}>👁️</button>
        <button @click=${() => {
          const n = prompt("Vorlagenname:", this._cfg.name || "Vorlage");
          if (n) this._e("save-as-template", { name: n, screenConfig: this._cfg });
        }}>📋</button>
        <button class="p" @click=${() => this._e("save", { screenConfig: this._cfg })}>💾 Speichern</button>
      </div>
    `;
  }

  _palette() {
    const userTemplateItems = Object.entries(this.templates || {}).map(([id, t]) => ({
      t: `saved-template:${id}`,
      i: "📋",
      l: t.name || id,
      d: `${t.category || "custom"} · ${(t.screen_config?.widgets?.length || 0)} Widgets`,
      previewConfig: t.screen_config || {}
    }));
    const cats = [
      { n: "📁 Werte & Status", items: [
        { t: "simple-value", i: "🔢", l: "Wert", d: "Klassische Zahl oder Sensorwert" },
        { t: "icon-value", i: "ℹ️", l: "Icon+Wert", d: "Wert mit Symbol und Titel" },
        { t: "trend-arrow", i: "📈", l: "Trend", d: "Tendenz nach oben oder unten" },
        { t: "status-dot", i: "🟢", l: "Status", d: "Kompakter Zustand mit Farbe" },
        { t: "gauge", i: "🎯", l: "Gauge", d: "Runder Füllstand / Prozentwert" },
        { t: "progress-bar", i: "📊", l: "Fortschritt", d: "Horizontaler Fortschrittsbalken" },
      ]},
      { n: "📁 Graphen & Charts", items: TD_CHART_WIDGETS.map(([t,i,l]) => ({ t, i, l, d: "Chart.js Widget" })) },
      { n: "📁 Medien & Kamera", items: [
        { t: "camera", i: "📹", l: "Kamera", d: "Snapshot, entity_picture, Proxy, Stream" },
        { t: "image", i: "🖼️", l: "Bild", d: "Lokale oder HA-Medienbilder" },
      ]},
      { n: "📁 Uhr, Wetter & Info", items: [
        { t: "clock", i: "🕐", l: "Uhr", d: "Zeit und Datum" },
        { t: "weather", i: "🌦️", l: "Wetter", d: "Wetter-Entity mit Übersicht" },
        { t: "countdown", i: "⏱️", l: "Countdown", d: "Ereignis oder Zielzeit" },
      ]},
      { n: "📁 Home Assistant Presets", items: [
        { t: "preset-energy", i: "⚡", l: "Energie", d: "Leistungs-, Batterie- oder Energie-Sensor" },
        { t: "preset-calendar", i: "🗓️", l: "Kalender", d: "Kalender oder Countdown mit Terminen" },
        { t: "preset-person", i: "👤", l: "Personen", d: "Anwesenheit und Status" },
        { t: "preset-doors", i: "🚪", l: "Türen/Fenster", d: "Öffnungssensoren und Kontakte" },
        { t: "preset-battery", i: "🔋", l: "Batterie", d: "Batterie-Ladung oder Status" },
        { t: "preset-media", i: "🎵", l: "Medienplayer", d: "Titel, Status und Wiedergabe" },
        { t: "preset-climate", i: "🌡️", l: "Klima", d: "Thermostat, Temperatur, Sollwert" },
        { t: "preset-light", i: "💡", l: "Licht", d: "Lichtstatus und Helligkeit" },
        { t: "preset-alarm", i: "🛡️", l: "Alarm", d: "Alarmsteuerung oder Sicherheitsstatus" },
        { t: "preset-cover", i: "🪟", l: "Rollläden/Cover", d: "Position und Status von Covers" },
        { t: "preset-vacuum", i: "🧹", l: "Staubsauger", d: "Status und Akku des Roboters" },
        { t: "preset-network", i: "📶", l: "Netzwerk", d: "Router, WLAN oder Ping-Sensoren" },
      ]},
      { n: "📁 HA Karten-Vorlagen", items: [
        { t: "ha-card-weather-hero", i: "🌤️", l: "Wetter Hero", d: "Große Wetterkarte im HA-Stil" },
        { t: "ha-card-entities", i: "📋", l: "Entities Liste", d: "Hauptwert mit mehreren Zusatzsensoren" },
        { t: "ha-card-security", i: "🛡️", l: "Sicherheit", d: "Alarm-/Tür-/Fenster-Übersicht" },
        { t: "ha-card-energy-flow", i: "⚙️", l: "Energie Übersicht", d: "Leistung, Vergleich und Verlauf" },
        { t: "ha-card-media-player", i: "🎶", l: "Medienkarte", d: "Medienplayer im HA-Stil" },
        { t: "ha-card-climate", i: "🌡️", l: "Klima-Karte", d: "Aktuelle Temperatur und Sollwert" },
      ]},
      { n: "📁 Screen-Vorlagen", items: [
        { t: "ha-template-home", i: "🏠", l: "Home Übersicht", d: "Wetter, Uhr, wichtige Statuswerte" },
        { t: "ha-template-energy", i: "⚡", l: "Energie Screen", d: "Energie- und Verbrauchsübersicht" },
        { t: "ha-template-security", i: "🚨", l: "Sicherheits Screen", d: "Kontakte, Bewegung, Alarm" },
        { t: "ha-template-family", i: "👨‍👩‍👧", l: "Familie Screen", d: "Personen, Kalender, Zuhause-Status" },
        { t: "ha-template-media", i: "📺", l: "Medien Screen", d: "Medienplayer und Lieblingsbilder" },
      ]},
      { n: "📁 Meine Screen-Presets", items: userTemplateItems },
      { n: "📁 Sonstige", items: [
        { t: "color-block", i: "🟦", l: "Farbblock", d: "Dekoratives Element / Fläche" },
        { t: "button", i: "🔘", l: "Button", d: "Interaktive Aktion" },
      ]},
    ];

    let groups = cats.map((c) => ({...c, items: c.items.filter((it) => {
      const q = (this._paletteQuery || "").trim().toLowerCase();
      const fav = (this._favoriteWidgets || []).includes(it.t);
      const rec = (this._recentWidgets || []).includes(it.t);
      if (this._paletteFilter === "favorites" && !fav) return false;
      if (this._paletteFilter === "recent" && !rec) return false;
      if (!q) return true;
      return [it.t, it.l, it.d, c.n].join(" ").toLowerCase().includes(q);
    }).sort((a,b) => {
      const af = (this._favoriteWidgets || []).includes(a.t) ? 1 : 0;
      const bf = (this._favoriteWidgets || []).includes(b.t) ? 1 : 0;
      if (af !== bf) return bf - af;
      const ar = (this._recentWidgets || []).includes(a.t) ? 1 : 0;
      const br = (this._recentWidgets || []).includes(b.t) ? 1 : 0;
      if (ar !== br) return br - ar;
      return String(a.l).localeCompare(String(b.l), "de");
    })})).filter((c) => c.items.length);

    const total = groups.reduce((sum, c) => sum + c.items.length, 0);

    return html`
      <div class="pal">
        <div class="paltools">
          <input .value=${this._paletteQuery} placeholder="Widget suchen..." @input=${(e) => this._paletteQuery = e.target.value}>
          <div class="chips">
            <button class="chip2 ${this._paletteFilter === "all" ? "a" : ""}" @click=${() => this._paletteFilter = "all"}>Alle</button>
            <button class="chip2 ${this._paletteFilter === "favorites" ? "a" : ""}" @click=${() => this._paletteFilter = "favorites"}>Favoriten</button>
            <button class="chip2 ${this._paletteFilter === "recent" ? "a" : ""}" @click=${() => this._paletteFilter = "recent"}>Zuletzt</button>
          </div>
          <div class="lb">${total} Widgets in der Palette</div>
        </div>
        ${groups.map((c) => html`
          <details class="folder" ?open=${this._paletteFolders[c.n] !== false} @toggle=${(e) => this._togglePaletteFolder(c.n, e.currentTarget.open)}>
            <summary>
              <div class="fleft">
                <div>${c.n}</div>
                <div class="fmeta">${c.items.length} Einträge</div>
              </div>
              <div class="fpreview">${c.items.slice(0,3).map((it) => html`<span>${it.i || "•"}</span>`)}</div>
            </summary>
            <div class="body">
              <div class="pgrid">
                ${c.items.map((it) => html`
                  <div class="pi" draggable="true"
                    @dragstart=${(e) => { this._dwt = it.t; e.dataTransfer.setData("text/plain", it.t); e.dataTransfer.effectAllowed = "copy"; }}
                    @dragend=${() => this._dwt = null}
                    @dblclick=${() => this._quickAddWidget(it.t)}
                  >
                    <div class="pvm">${this._paletteMini(it)}</div>
                    <div>
                      <div class="pti">${it.i || "◼"}</div>
                      <div>${it.l}</div>
                      <div class="meta">${it.d}</div>
                    </div>
                    <button class="favb ${(this._favoriteWidgets || []).includes(it.t) ? "a" : ""}" @click=${(e) => { e.stopPropagation(); this._toggleFavoriteWidget(it.t); }}>${(this._favoriteWidgets || []).includes(it.t) ? "★" : "☆"}</button>
                  </div>
                `)}
              </div>
            </div>
          </details>
        `)}
      </div>
    `;
  }


  _rememberWidgetType(type) {
    const list = [type, ...(this._recentWidgets || []).filter((x) => x !== type)].slice(0, 8);
    this._recentWidgets = list;
    localStorage.setItem("td_widget_recent", JSON.stringify(list));
  }

  _toggleFavoriteWidget(type) {
    const set = new Set(this._favoriteWidgets || []);
    if (set.has(type)) set.delete(type); else set.add(type);
    this._favoriteWidgets = [...set];
    localStorage.setItem("td_widget_favorites", JSON.stringify(this._favoriteWidgets));
  }


  _togglePaletteFolder(name, open) {
    this._paletteFolders = { ...(this._paletteFolders || {}), [name]: open };
    localStorage.setItem("td_palette_folders", JSON.stringify(this._paletteFolders));
  }

  _applySavedTemplate(templateId) {
    const tpl = (this.templates || {})[templateId];
    if (!tpl?.screen_config) return;
    this._push();
    const currentId = this._cfg.id;
    this._cfg = { ...deepClone(tpl.screen_config), id: currentId, name: tpl.name || this._cfg.name || "Screen" };
    this._sel = -1;
    this._selMulti = [];
  }

  _findNextFreeCell() {
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    const widgets = this._cfg.widgets || [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const taken = widgets.some((w) => c >= (w.col || 0) && c < (w.col || 0) + (w.colspan || 1) && r >= (w.row || 0) && r < (w.row || 0) + (w.rowspan || 1));
        if (!taken) return { c, r };
      }
    }
    return { c: 0, r: 0 };
  }

  _quickAddWidget(type) {
    if (String(type).startsWith("preset-")) {
      this._applyDomainPreset(type);
      return;
    }
    if (String(type).startsWith("ha-card-")) {
      this._applyHomeAssistantCard(type);
      return;
    }
    if (String(type).startsWith("ha-template-")) {
      this._applyHomeAssistantTemplate(type);
      return;
    }
    if (String(type).startsWith("saved-template:")) {
      this._applySavedTemplate(String(type).split(":").slice(1).join(":"));
      return;
    }
    const { c, r } = this._findNextFreeCell();
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    ws.push(tdCreateWidget(type, c, r, this.globalSettings || {}));
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = ws.length - 1;
    this._selMulti = [this._sel];
    this._rememberWidgetType(type);
  }

  _paletteMini(it) {
    const t = it.t;
    if (String(t).startsWith("saved-template:")) {
      const widgets = it.previewConfig?.widgets || [];
      return html`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;width:100%;height:100%">${widgets.slice(0,4).map((w) => html`<div style="border-radius:8px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:13px">${this._widgetIcon(w.type)}</div>`)}${!widgets.length ? html`<div class="lc">📋</div>` : ""}</div>`;
    }
    if (String(t).startsWith("preset-") || String(t).startsWith("ha-card-") || String(t).startsWith("ha-template-")) return html`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;width:100%;height:100%"><div class="lc">${it.i}</div><div class="bars"><span style="height:8px"></span><span style="height:14px"></span><span style="height:18px"></span><span style="height:11px"></span></div><div class="ring"></div><div class="weather">☀️</div></div>`;
    if (TD_CHART_TYPES.has(t)) return html`<div class="bars"><span style="height:8px"></span><span style="height:14px"></span><span style="height:18px"></span><span style="height:11px"></span></div>`;
    if (t === "gauge" || t === "radial-gauge-advanced") return html`<div class="ring"></div>`;
    if (t === "camera" || t === "image") return html`<div class="cam">${it.i}</div>`;
    if (t === "weather") return html`<div class="weather">${it.i}</div>`;
    return html`<div><div class="lc">${it.i}</div><div class="ln"></div></div>`;
  }

  _widgetIcon(type) { return ({"simple-value":"🔢","icon-value":"ℹ️","trend-arrow":"📈","status-dot":"🟢","gauge":"🎯","progress-bar":"📊","camera":"📹","image":"🖼️","clock":"🕐","weather":"🌦️","countdown":"⏱️","button":"🔘"}[type] || (TD_CHART_TYPES.has(type) ? "📈" : "◼")); }

  _duplicateSelected() {
    const idxs = this._getSelectedIndices();
    if (!idxs.length) return;
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    const created = [];
    for (const idx of idxs) {
      const src = ws[idx];
      if (!src) continue;
      const copy = deepClone(src);
      copy.id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      copy.col = Math.max(0, (src.col || 0) + 1);
      copy.row = Math.max(0, (src.row || 0) + 1);
      ws.push(copy);
      created.push(ws.length - 1);
      this._rememberWidgetType(copy.type);
    }
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = created.length ? created[created.length - 1] : -1;
    this._selMulti = created;
  }

  _deleteSelected() {
    if (this._sel < 0) return;
    const idxs = this._getSelectedIndices();
    if (idxs.length > 1) {
      this._push();
      const ws = [...(this._cfg.widgets || [])].filter((_, i) => !idxs.includes(i));
      this._cfg = { ...this._cfg, widgets: ws };
      this._sel = -1;
      this._selMulti = [];
      return;
    }
    this._delW();
  }

  _getSelectedIndices() {
    if ((this._selMulti || []).length) return [...new Set(this._selMulti)].sort((a,b) => a-b);
    return this._sel >= 0 ? [this._sel] : [];
  }

  _handleWidgetSelect(i, e) {
    if (e?.ctrlKey || e?.metaKey) {
      const set = new Set(this._selMulti || []);
      if (set.has(i)) set.delete(i); else set.add(i);
      this._selMulti = [...set].sort((a,b) => a-b);
      this._sel = this._selMulti.length ? this._selMulti[this._selMulti.length - 1] : -1;
      return;
    }
    this._sel = i;
    this._selMulti = [i];
  }

  _alignSelectedEdge(mode) {
    const idxs = this._getSelectedIndices();
    if (idxs.length < 2) return;
    const ws = [...(this._cfg.widgets || [])];
    const first = ws[idxs[0]];
    this._push();
    const refLeft = first.col || 0;
    const refRight = (first.col || 0) + (first.colspan || 1);
    const refTop = first.row || 0;
    const refBottom = (first.row || 0) + (first.rowspan || 1);
    const refCx = refLeft + ((first.colspan || 1) / 2);
    const refCy = refTop + ((first.rowspan || 1) / 2);
    for (const i of idxs) {
      const w = ws[i];
      const spanX = w.colspan || 1;
      const spanY = w.rowspan || 1;
      if (mode === "left" || mode === "col") ws[i] = { ...w, col: refLeft };
      else if (mode === "right") ws[i] = { ...w, col: Math.max(0, refRight - spanX) };
      else if (mode === "top" || mode === "row") ws[i] = { ...w, row: refTop };
      else if (mode === "bottom") ws[i] = { ...w, row: Math.max(0, refBottom - spanY) };
      else if (mode === "center-x") ws[i] = { ...w, col: Math.max(0, Math.round(refCx - (spanX / 2))) };
      else if (mode === "center-y") ws[i] = { ...w, row: Math.max(0, Math.round(refCy - (spanY / 2))) };
    }
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _alignSelectedSize(kind) {
    const idxs = this._getSelectedIndices();
    if (idxs.length < 2) return;
    const first = this._cfg.widgets[idxs[0]];
    const key = kind === "width" ? "colspan" : "rowspan";
    const value = first[key] || 1;
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    for (const i of idxs) ws[i] = { ...ws[i], [key]: value };
    this._cfg = { ...this._cfg, widgets: ws };
  }


  _distributeSelected(axis) {
    const idxs = this._getSelectedIndices();
    if (idxs.length < 3) return;
    const ws = [...(this._cfg.widgets || [])];
    const ordered = [...idxs].sort((a, b) => axis === "x" ? (ws[a].col || 0) - (ws[b].col || 0) : (ws[a].row || 0) - (ws[b].row || 0));
    const first = ws[ordered[0]];
    const last = ws[ordered[ordered.length - 1]];
    const start = axis === "x" ? (first.col || 0) : (first.row || 0);
    const end = axis === "x" ? (last.col || 0) : (last.row || 0);
    const step = ordered.length > 1 ? (end - start) / (ordered.length - 1) : 0;
    this._push();
    ordered.forEach((idx, pos) => {
      const w = ws[idx];
      const next = Math.round(start + (step * pos));
      ws[idx] = { ...w, [axis === "x" ? "col" : "row"]: Math.max(0, next) };
    });
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _resizeSelected(dw, dh) {
    const idxs = this._getSelectedIndices();
    if (!idxs.length) return;
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    for (const i of idxs) {
      const w = ws[i];
      const spanX = Math.max(1, Math.min(cols - (w.col || 0), (w.colspan || 1) + dw));
      const spanY = Math.max(1, Math.min(rows - (w.row || 0), (w.rowspan || 1) + dh));
      ws[i] = { ...w, colspan: spanX, rowspan: spanY };
    }
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _applyDomainPreset(type) {
    const map = {
      "preset-energy": { widget: "comparison-chart", domain: "sensor", match: ["power", "energy", "verbrauch", "leistung"] },
      "preset-calendar": { widget: "countdown", domain: "calendar", match: ["calendar", "kalender"] },
      "preset-person": { widget: "status-dot", domain: "person", match: ["person"] },
      "preset-doors": { widget: "status-dot", domain: "binary_sensor", match: ["door", "window", "fenster", "tuer", "öffnung"] },
      "preset-battery": { widget: "progress-bar", domain: "sensor", match: ["battery", "akku"] },
      "preset-media": { widget: "icon-value", domain: "media_player", match: ["media_player", "speaker", "tv"] },
      "preset-climate": { widget: "simple-value", domain: "climate", match: ["climate", "thermostat", "heizung"] },
      "preset-light": { widget: "status-dot", domain: "light", match: ["light", "licht"] },
      "preset-alarm": { widget: "status-dot", domain: "alarm_control_panel", match: ["alarm", "security"] },
      "preset-cover": { widget: "progress-bar", domain: "cover", match: ["cover", "rollladen", "jalousie"] },
      "preset-vacuum": { widget: "icon-value", domain: "vacuum", match: ["vacuum", "robot", "staubsauger"] },
      "preset-network": { widget: "status-dot", domain: "sensor", match: ["wifi", "ping", "router", "netz"] },
    };
    const spec = map[type];
    if (!spec) return;
    const entities = getAllEntities(this.hass, spec.domain || "");
    const hit = entities.find((e) => spec.match.some((m) => `${e.entity_id} ${e.friendly_name}`.toLowerCase().includes(m))) || entities[0];
    const { c, r } = this._findNextFreeCell();
    const w = tdCreateWidget(spec.widget, c, r, this.globalSettings || {});
    w.entity_id = hit?.entity_id || "";
    w.name = hit?.friendly_name || spec.widget;
    if (type === "preset-energy") { w.colspan = 2; w.config = { ...(w.config || {}), entities: entities.slice(0,4).map((e) => e.entity_id) }; }
    if (type === "preset-doors") { w.config = { ...(w.config || {}), entities: entities.slice(0,6).map((e) => e.entity_id) }; }
    if (type === "preset-media") { w.config = { ...(w.config || {}), entities: entities.slice(0,4).map((e) => e.entity_id) }; }
    if (type === "preset-climate") { w.icon = "🌡️"; w.config = { ...(w.config || {}), entities: entities.slice(0,3).map((e) => e.entity_id) }; }
    if (type === "preset-light") { w.icon = "💡"; w.config = { ...(w.config || {}), entities: entities.slice(0,6).map((e) => e.entity_id) }; }
    if (type === "preset-alarm") { w.icon = "🛡️"; }
    if (type === "preset-cover") { w.icon = "🪟"; w.config = { ...(w.config || {}), min: 0, max: 100, entities: entities.slice(0,4).map((e) => e.entity_id) }; }
    if (type === "preset-vacuum") { w.icon = "🧹"; w.config = { ...(w.config || {}), entities: entities.slice(0,4).map((e) => e.entity_id) }; }
    if (type === "preset-network") { w.icon = "📶"; w.config = { ...(w.config || {}), entities: entities.slice(0,6).map((e) => e.entity_id) }; }
    this._push();
    const ws = [...(this._cfg.widgets || []), w];
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = ws.length - 1;
    this._selMulti = [this._sel];
    this._rememberWidgetType(spec.widget);
  }

  _applyHomeAssistantCard(type) {
    const { c, r } = this._findNextFreeCell();
    const add = (w) => {
      const ws = [...(this._cfg.widgets || []), w];
      this._cfg = { ...this._cfg, widgets: ws };
      this._sel = ws.length - 1;
      this._selMulti = [this._sel];
    };
    this._push();
    if (type === "ha-card-weather-hero") {
      const w = tdCreateWidget("weather", c, r, this.globalSettings || {});
      w.colspan = 2; w.rowspan = 2; w.name = "Wetter"; add(w); return;
    }
    if (type === "ha-card-entities") {
      const sensors = getAllEntities(this.hass, "sensor").slice(0, 5);
      const w = tdCreateWidget("simple-value", c, r, this.globalSettings || {});
      w.entity_id = sensors[0]?.entity_id || "";
      w.name = sensors[0]?.friendly_name || "Übersicht";
      w.colspan = 2;
      w.config = { ...(w.config || {}), entities: sensors.slice(1).map((e) => e.entity_id) };
      add(w); return;
    }
    if (type === "ha-card-security") {
      const entities = getAllEntities(this.hass, "binary_sensor").filter((e) => /door|window|motion|beweg|fenster|tuer|kontakt/i.test(`${e.entity_id} ${e.friendly_name}`)).slice(0, 6);
      const w = tdCreateWidget("status-dot", c, r, this.globalSettings || {});
      w.entity_id = entities[0]?.entity_id || "";
      w.name = "Sicherheit";
      w.icon = "🛡️";
      w.config = { ...(w.config || {}), entities: entities.slice(1).map((e) => e.entity_id) };
      add(w); return;
    }
    if (type === "ha-card-energy-flow") {
      const entities = getAllEntities(this.hass, "sensor").filter((e) => /power|energy|leistung|verbrauch/i.test(`${e.entity_id} ${e.friendly_name}`)).slice(0, 5);
      const w = tdCreateWidget("comparison-chart", c, r, this.globalSettings || {});
      w.entity_id = entities[0]?.entity_id || "";
      w.name = "Energie";
      w.colspan = 2;
      w.config = { ...(w.config || {}), entities: entities.slice(1).map((e) => e.entity_id), hours: 24 };
      add(w); return;
    }
    if (type === "ha-card-media-player") {
      const entities = getAllEntities(this.hass, "media_player").slice(0, 4);
      const w = tdCreateWidget("icon-value", c, r, this.globalSettings || {});
      w.entity_id = entities[0]?.entity_id || "";
      w.name = entities[0]?.friendly_name || "Medien";
      w.icon = "🎵";
      w.config = { ...(w.config || {}), entities: entities.slice(1).map((e) => e.entity_id) };
      add(w); return;
    }
    if (type === "ha-card-climate") {
      const climates = getAllEntities(this.hass, "climate");
      const w = tdCreateWidget("simple-value", c, r, this.globalSettings || {});
      w.entity_id = climates[0]?.entity_id || "";
      w.name = climates[0]?.friendly_name || "Klima";
      w.icon = "🌡️";
      add(w); return;
    }
  }

  _applyHomeAssistantTemplate(type) {
    this._push();
    const widgets = [];
    const mk = (kind, col, row, extra = {}) => Object.assign(tdCreateWidget(kind, col, row, this.globalSettings || {}), extra);
    if (type === "ha-template-home") {
      widgets.push(mk("weather", 0, 0, { colspan: 2, rowspan: 2, name: "Wetter" }));
      widgets.push(mk("clock", 2, 0, { name: "Uhr" }));
      widgets.push(mk("trend-arrow", 2, 1, { name: "Trend" }));
    } else if (type === "ha-template-energy") {
      widgets.push(mk("comparison-chart", 0, 0, { colspan: 2, name: "Energie" }));
      widgets.push(mk("progress-bar", 2, 0, { name: "Batterie" }));
      widgets.push(mk("simple-value", 2, 1, { name: "Verbrauch" }));
    } else if (type === "ha-template-security") {
      widgets.push(mk("status-dot", 0, 0, { name: "Alarm", icon: "🛡️" }));
      widgets.push(mk("camera", 1, 0, { colspan: 2, rowspan: 2, name: "Kamera" }));
      widgets.push(mk("status-dot", 0, 1, { name: "Kontakte", icon: "🚪" }));
    } else if (type === "ha-template-family") {
      widgets.push(mk("status-dot", 0, 0, { name: "Person 1", icon: "👤" }));
      widgets.push(mk("status-dot", 1, 0, { name: "Person 2", icon: "👤" }));
      widgets.push(mk("countdown", 2, 0, { name: "Nächster Termin" }));
      widgets.push(mk("weather", 0, 1, { colspan: 2, name: "Wetter" }));
    } else if (type === "ha-template-media") {
      widgets.push(mk("icon-value", 0, 0, { colspan: 2, name: "Medien" , icon: "🎵" }));
      widgets.push(mk("image", 2, 0, { rowspan: 2, name: "Cover" }));
      widgets.push(mk("progress-bar", 0, 1, { colspan: 2, name: "Lautstärke" }));
    } else {
      return;
    }
    this._cfg = { ...this._cfg, widgets: [...(this._cfg.widgets || []), ...widgets] };
    this._sel = (this._cfg.widgets || []).length - widgets.length;
    this._selMulti = [this._sel];
  }

  _nudgeSelected(dx, dy) {
    const idxs = this._getSelectedIndices();
    if (!idxs.length) return;
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    for (const i of idxs) {
      const w = ws[i];
      ws[i] = {
        ...w,
        col: Math.max(0, Math.min(cols - (w.colspan || 1), (w.col || 0) + dx)),
        row: Math.max(0, Math.min(rows - (w.rowspan || 1), (w.row || 0) + dy)),
      };
    }
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _preview() {
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    const widgets = this._cfg.widgets || [];
    const occ = new Set();
    for (const w of widgets) {
      for (let r = w.row || 0; r < (w.row || 0) + (w.rowspan || 1); r++) {
        for (let c = w.col || 0; c < (w.col || 0) + (w.colspan || 1); c++) occ.add(`${c},${r}`);
      }
    }

    const els = [];
    const ti = { "simple-value": "🔢", gauge: "🎯", "progress-bar": "📊", "status-dot": "🔵", camera: "📹", clock: "🕐", weather: "🌤️", image: "🖼️", ...Object.fromEntries(TD_CHART_WIDGETS.map(([t,i]) => [t,i])) };

    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i];
      const st = this.hass?.states?.[w.entity_id];
      const v = st?.state || "—";
      const u = st?.attributes?.unit_of_measurement || "";
      const nm = w.name || st?.attributes?.friendly_name || w.type || "";
      els.push(html`
        <div class="wb ${this._sel === i ? "sel" : ""} ${(this._selMulti || []).includes(i) && this._sel !== i ? "ms" : ""} ${w.locked ? "locked" : ""}" style="grid-column:${(w.col || 0) + 1}/span ${w.colspan || 1};grid-row:${(w.row || 0) + 1}/span ${w.rowspan || 1};background:${w.bgColor || "#1E1E1E"};z-index:${w.z_index || i + 1};${w.bgOpacity != null ? `opacity:${Math.max(0.25, Math.min(1, Number(w.bgOpacity) || 1))};` : ""}"
          @click=${(e) => this._handleWidgetSelect(i, e)} draggable=${!w.locked ? "true" : "false"}
          @pointerdown=${(e) => this._startWidgetDrag(e, i)}
          @dragstart=${(e) => { if (w.locked) { e.preventDefault(); return; } e.dataTransfer.setData("widget-index", String(i)); e.dataTransfer.effectAllowed = "move"; }}
        >
          ${w.group ? html`<span class="groupb">${w.group}</span>` : ""}
          <span class="layerb">L${w.z_index || i + 1}${w.locked ? " 🔒" : ""}</span>
          <span class="wi">${ti[w.type] || "📊"}</span>
          <span class="wv">${v}${u ? ` ${u}` : ""}</span>
          <span class="wn">${nm}</span>
          ${(w.config?.entities || []).length ? html`<span class="wx">+ ${(w.config.entities || []).slice(0, 3).join(" · ")}</span>` : ""}
          ${this._sel === i && !w.locked ? html`<span class="wbh e" @pointerdown=${(e) => this._startWidgetResize(e, i, "e")}></span><span class="wbh s" @pointerdown=${(e) => this._startWidgetResize(e, i, "s")}></span><span class="wbh se" @pointerdown=${(e) => this._startWidgetResize(e, i, "se")}></span>` : ""}
        </div>
      `);
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!occ.has(`${c},${r}`)) {
          els.push(html`
            <div class="gc ${this._grid ? "sg" : ""}" style="grid-column:${c + 1};grid-row:${r + 1}"
              @dragover=${(e) => { e.preventDefault(); e.currentTarget.classList.add("do"); }}
              @dragleave=${(e) => e.currentTarget.classList.remove("do")}
              @drop=${(e) => { e.preventDefault(); e.currentTarget.classList.remove("do"); this._drop(c, r); }}
            ></div>
          `);
        }
      }
    }

    const guides = [];
    if (this._snap) {
      for (let c = 1; c < cols; c++) guides.push(html`<div class="gvl" style="left:${(c / cols) * 100}%"></div>`);
      for (let r = 1; r < rows; r++) guides.push(html`<div class="ghl" style="top:${(r / rows) * 100}%"></div>`);
    }
    return html`
      <div class="pva">
        <div class="pf ${this._prev === "landscape" ? "l" : "p"}" style="background-color:${this._cfg.background_color || "#121212"};${this._cfg.background_image ? `background-image:linear-gradient(rgba(0,0,0,${1 - Number(this._cfg.background_overlay_opacity ?? 1)}), rgba(0,0,0,${1 - Number(this._cfg.background_overlay_opacity ?? 1)})), url(${this._cfg.background_image});background-size:100% 100%, ${this._cfg.background_image_size || "cover"};background-position:center;background-repeat:no-repeat;` : ""}">
          <div class="pg" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">${els}</div>
          ${this._snap ? html`<div class="guides">${guides}</div>` : ""}
          <div class="ptk" style="height:${this._cfg.ticker_style?.height || this.globalSettings?.default_ticker_height || 36}px;font-size:${this._cfg.ticker_style?.font_size || 12}px;background:${this._cfg.ticker_style?.background_color || "rgba(12,18,28,.72)"};color:${this._cfg.ticker_style?.text_color || "#e8eef7"};opacity:${this._cfg.ticker_style?.opacity || 1};border-radius:${this._cfg.ticker_style?.border_radius || 0}px">${(this._cfg.ticker_style?.fixed_messages || ["Ticker-Leiste"]).slice(0,2).join(` ${this._cfg.ticker_style?.separator || "│"} `)}</div>
        </div>
      </div>
    `;
  }

  _properties() {
    if (this._sel < 0 || !this._cfg.widgets?.[this._sel]) {
      return html`<div class="props">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><strong style="font-size:15px">Screen</strong></div>
        <div class="pg4">Screen-Style</div>
        <div class="pf2"><label>Screen-Typ</label><select .value=${this._cfg.type || "dashboard"} @change=${(e) => this._ss("type", e.target.value)}>
          <option value="dashboard">Dashboard</option>
          <option value="clock">Uhr</option>
          <option value="weather">Wetter</option>
          <option value="camera">Kamera</option>
          <option value="image">Bild</option>
        </select></div>
        <div class="pf2"><td-color-picker .value=${this._cfg.background_color || "#121212"} label="Hintergrundfarbe" @value-changed=${(e) => this._ss("background_color", e.detail.value)}></td-color-picker></div>
        <div class="pf2"><label>Hintergrundbild URL</label><input .value=${this._cfg.background_image || ""} placeholder="/ticker-display/media/images/dein-bild.png" @input=${(e) => this._ss("background_image", e.target.value)}></div>
        <div class="pf2"><label>Bildgröße</label><select .value=${this._cfg.background_image_size || "cover"} @change=${(e) => this._ss("background_image_size", e.target.value)}>
          <option value="cover">cover</option><option value="contain">contain</option><option value="auto">auto</option>
        </select></div>
        <div class="pf2"><label>Farb-Overlay über Bild: ${Math.round(Number(this._cfg.background_overlay_opacity ?? 1) * 100)}%</label><input type="range" min="0" max="1" step="0.05" .value=${this._cfg.background_overlay_opacity ?? 1} @input=${(e) => this._ss("background_overlay_opacity", +e.target.value)}></div>
        <div class="pf2"><button class="ab" @click=${() => this._ss("background_image", "")}>Hintergrundbild entfernen</button></div>
        <div class="pg4">Ticker-Leiste</div>
        <div class="pf2"><label>Stil-Vorlage</label><select .value=${this._cfg.ticker_style?.style_template || "classic"} @change=${(e) => this._applyTickerTemplate(e.target.value)}><option value="classic">Classic</option><option value="glass">Glass</option><option value="alert">Alert</option><option value="minimal">Minimal</option></select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="pf2"><label>Höhe</label><input type="number" min="24" max="120" .value=${this._cfg.ticker_style?.height || this.globalSettings?.default_ticker_height || 36} @change=${(e) => this._ss("ticker_style", { ...(this._cfg.ticker_style || {}), height: +e.target.value })}></div>
          <div class="pf2"><label>Schriftgröße</label><input type="number" min="10" max="40" .value=${this._cfg.ticker_style?.font_size || 12} @change=${(e) => this._ss("ticker_style", { ...(this._cfg.ticker_style || {}), font_size: +e.target.value })}></div>
          <div class="pf2"><label>Padding X</label><input type="number" min="4" max="40" .value=${this._cfg.ticker_style?.item_padding_x || 22} @change=${(e) => this._ss("ticker_style", { ...(this._cfg.ticker_style || {}), item_padding_x: +e.target.value })}></div>
          <div class="pf2"><label>Transparenz</label><input type="number" min="0.1" max="1" step="0.05" .value=${this._cfg.ticker_style?.opacity || 1} @change=${(e) => this._ss("ticker_style", { ...(this._cfg.ticker_style || {}), opacity: +e.target.value })}></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="pf2"><label>Position</label><select .value=${this._cfg.ticker_style?.position || "bottom"} @change=${(e) => this._ss("ticker_style", { ...(this._cfg.ticker_style || {}), position: e.target.value })}><option value="bottom">unten</option><option value="top">oben</option></select></div>
          <div class="pf2"><label>Separator</label><input .value=${this._cfg.ticker_style?.separator || "│"} @input=${(e) => this._ss("ticker_style", { ...(this._cfg.ticker_style || {}), separator: e.target.value })}></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="pf2"><td-color-picker .value=${this._cfg.ticker_style?.text_color || "#e8eef7"} label="Textfarbe" @value-changed=${(e) => this._ss("ticker_style", { ...(this._cfg.ticker_style || {}), text_color: e.detail.value })}></td-color-picker></div>
          <div class="pf2"><td-color-picker .value=${this._cfg.ticker_style?.accent_color || "#40c4ff"} label="Akzentfarbe" @value-changed=${(e) => this._ss("ticker_style", { ...(this._cfg.ticker_style || {}), accent_color: e.detail.value })}></td-color-picker></div>
        </div>
        <div class="pf2"><label>Feste Meldungen (eine pro Zeile)</label><textarea rows="4" .value=${(this._cfg.ticker_style?.fixed_messages || []).join("\n")} @change=${(e) => this._ss("ticker_style", { ...(this._cfg.ticker_style || {}), fixed_messages: String(e.target.value || "").split(/\n+/).map((x) => x.trim()).filter(Boolean) })}></textarea></div>
        <div class="pf2"><label>Ticker-Regeln JSON</label><textarea rows="7" .value=${JSON.stringify(this._cfg.ticker_style?.rules || [], null, 2)} @change=${(e) => { const parsed = safeJsonParse(e.target.value, null); if (parsed) this._ss("ticker_style", { ...(this._cfg.ticker_style || {}), rules: parsed }); }} placeholder='[{"priority":10,"domain":"binary_sensor","condition":"state=on","template":"Alarm: {friendly_name}","icon":"⚠️","color":"#ff5252"}]'></textarea></div>
        ${(this.images || []).length ? html`<div class="pf2"><label>Lokales Hintergrundbild wählen</label><select .value=${this._cfg.background_image || ""} @change=${(e) => this._ss("background_image", e.target.value)}><option value="">—</option>${(this.images || []).map((img) => html`<option value=${img.url || `/ticker-display/media/images/${img.filename || img.name}`}>${img.filename || img.name || img.id}</option>`)}</select></div>` : ""}
        ${(this.haImages || []).length ? html`<div class="pf2"><td-ha-media-picker .items=${this.haImages || []} .value=${this._cfg.background_image || ""} label="Home Assistant Medienbild" placeholder="Bild aus Medienbrowser wählen" @value-changed=${(e) => this._ss("background_image", e.detail.value)}></td-ha-media-picker></div>` : ""}
        <div class="pe"><span style="font-size:32px;opacity:.3">👆</span><span>Widget auswählen<br>oder aus Palette ziehen</span></div>
      </div>`;
    }

    const w = this._cfg.widgets[this._sel];
    const wts = [
      { v: "simple-value", l: "Einfacher Wert" },
      { v: "gauge", l: "Gauge" },
      { v: "progress-bar", l: "Fortschrittsbalken" },
      { v: "status-dot", l: "Status Punkt" },
      { v: "icon-value", l: "Icon+Wert" },
      ...TD_CHART_WIDGETS.map(([v,,l]) => ({ v, l })),
      { v: "camera", l: "Kamera" },
      { v: "clock", l: "Uhr" },
      { v: "weather", l: "Wetter" },
      { v: "image", l: "Bild" },
      { v: "color-block", l: "Farbblock" },
      { v: "countdown", l: "Countdown" },
      { v: "button", l: "Button" },
    ];

    return html`
      <div class="props">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <strong style="font-size:15px">Widget</strong>
          <button class="ib" style="font-size:14px" @click=${() => this._delW()}>🗑️</button>
        </div>
        <div class="ptabs">
          <button class="ptab ${this._pt === 0 ? "a" : ""}" @click=${() => this._pt = 0}>Allgemein</button>
          <button class="ptab ${this._pt === 1 ? "a" : ""}" @click=${() => this._pt = 1}>Style</button>
          <button class="ptab ${this._pt === 2 ? "a" : ""}" @click=${() => this._pt = 2}>Erweitert</button>
        </div>

        ${this._pt === 0 ? html`
          <div class="pg4">Grundeinstellungen</div>
          <div class="pf2"><label>Widget-Typ</label><select .value=${w.type || "simple-value"} @change=${(e) => this._uw("type", e.target.value)}>${wts.map((t) => html`<option value=${t.v}>${t.l}</option>`)}</select></div>
          <div class="pf2">
            <td-entity-picker
              .hass=${this.hass}
              .value=${w.entity_id || ""}
              .domain=${this._entityDomainForWidget(w.type)}
              label="Entity"
              placeholder="Entity suchen..."
              @value-changed=${(e) => this._uw("entity_id", e.detail.value)}
            ></td-entity-picker>
          </div>

          ${this._supportsMultiEntity(w.type) ? html`<div class="pf2"><td-entity-multi-picker .hass=${this.hass} .value=${this._mergeEntityList("", w.config?.entities || []).filter((id) => id !== w.entity_id)} .domain=${this._entityDomainForWidget(w.type)} label="Zusätzliche Sensoren / Entities" placeholder="Weitere Entities hinzufügen" @value-changed=${(e) => this._uwc("entities", e.detail.value)}></td-entity-multi-picker></div>
          ${this._renderExtraEntityMetaEditor(w)}` : ""}
          ${this._supportsValueFormatting(w.type) ? html`
            <div class="pg4">Wertformat</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div class="pf2"><label>Dezimalstellen</label><input type="number" min="0" max="6" .value=${w.config?.value_decimals ?? 1} @change=${(e) => this._uwc("value_decimals", +e.target.value)}></div>
              <div class="pf2"><label>Zusatzsensoren Dezimalstellen</label><input type="number" min="0" max="6" .value=${w.config?.extra_value_decimals ?? w.config?.value_decimals ?? 1} @change=${(e) => this._uwc("extra_value_decimals", +e.target.value)}></div>
            </div>
            <div class="tog"><input type="checkbox" .checked=${w.config?.trim_trailing_zeros === true} @change=${(e) => this._uwc("trim_trailing_zeros", e.target.checked)}><span>Überflüssige Nullen entfernen (25.0 → 25)</span></div>
          ` : ""}
          <div class="pf2"><label>Name</label><input .value=${w.name || ""} placeholder="Auto" @input=${(e) => this._uw("name", e.target.value)}></div>
          <div class="pf2">
            <td-icon-picker .value=${w.icon || ""} label="Icon" @value-changed=${(e) => this._uw("icon", e.detail.value)}></td-icon-picker>
          </div>
          <div class="pg4">Interaktion auf dem Display</div>
          <div class="pf2"><label>Touch-Aktion</label><select .value=${w.tap_action || "none"} @change=${(e) => this._uw("tap_action", e.target.value)}><option value="none">Keine</option><option value="expand">Widget vergrößern / Details</option><option value="toggle">Schalter ein/aus</option></select></div>
          ${w.tap_action === "expand" ? html`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="pf2"><label>Auto schließen (s)</label><input type="number" min="0" max="120" .value=${w.tap_autoclose || 10} @change=${(e) => this._uw("tap_autoclose", +e.target.value)}></div><div class="pf2"><label>Detail-Skalierung</label><input type="number" min="1" max="2.4" step="0.1" .value=${w.tap_scale || 1.45} @change=${(e) => this._uw("tap_scale", +e.target.value)}></div></div>` : ""}
          ${w.tap_action === "toggle" ? html`<div class="pf2"><label>Statuspunkt anzeigen</label><select .value=${w.toggle_badge !== false ? "on" : "off"} @change=${(e) => this._uw("toggle_badge", e.target.value === "on")}><option value="on">Ja</option><option value="off">Nein</option></select></div>` : ""}
          <div class="pg4">Position & Größe</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="pf2"><label>Spalte</label><input type="number" min="0" .value=${w.col || 0} @change=${(e) => this._uw("col", +e.target.value)}></div>
            <div class="pf2"><label>Zeile</label><input type="number" min="0" .value=${w.row || 0} @change=${(e) => this._uw("row", +e.target.value)}></div>
            <div class="pf2"><label>Breite</label><input type="number" min="1" .value=${w.colspan || 1} @change=${(e) => this._uw("colspan", +e.target.value)}></div>
            <div class="pf2"><label>Höhe</label><input type="number" min="1" .value=${w.rowspan || 1} @change=${(e) => this._uw("rowspan", +e.target.value)}></div>
          </div>
          <div class="pg4">Gruppierung & Ebenen</div>
          <div class="pf2"><label>Gruppe</label><input .value=${w.group || ""} placeholder="z. B. header / energie / fenster" @input=${(e) => this._uw("group", e.target.value)}></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="pf2"><label>Ebene (z-index)</label><input type="number" min="1" max="999" .value=${w.z_index || (this._sel + 1)} @change=${(e) => this._uw("z_index", +e.target.value)}></div>
            <div class="pf2"><label>Ebenen</label><div style="display:flex;gap:6px"><button class="ib" @click=${() => this._setSelectedLayer(1)}>Vor</button><button class="ib" @click=${() => this._setSelectedLayer(-1)}>Zurück</button></div></div>
          </div>
          <div class="tog"><input type="checkbox" .checked=${w.locked || false} @change=${(e) => this._setSelectedLock(e.target.checked)}><span>Sperren (Drag/Resize aus)</span></div>
          ${w.type === "gauge" ? html`
            <div class="pg4">Gauge</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div class="pf2"><label>Min</label><input type="number" .value=${w.config?.min || 0} @change=${(e) => this._uwc("min", +e.target.value)}></div>
              <div class="pf2"><label>Max</label><input type="number" .value=${w.config?.max || 100} @change=${(e) => this._uwc("max", +e.target.value)}></div>
            </div>
          ` : ""}
          ${w.type === "camera" ? html`
            <div class="pg4">Kamera</div>
            <div class="pf2"><label>Kamera-Quelle</label><select .value=${w.config?.camera_source || "auto"} @change=${(e) => this._uwc("camera_source", e.target.value)}>${TD_CAMERA_SOURCES.map(([v,l]) => html`<option value=${v}>${l}</option>`)}</select></div>
            <div class="pf2"><label>Refresh (s)</label><input type="number" min="1" .value=${w.config?.refresh_interval || 5} @change=${(e) => this._uwc("refresh_interval", +e.target.value)}></div>
          ` : ""}
          ${TD_CHART_TYPES.has(w.type) ? html`
            <div class="pg4">Chart</div>
            <div class="pf2"><label>Zeitraum (Stunden)</label><input type="number" min="1" max="168" .value=${w.config?.hours || 24} @change=${(e) => this._uwc("hours", +e.target.value)}></div>
            <div class="pf2"><td-entity-multi-picker .hass=${this.hass} .value=${w.config?.entities || []} label="Zusätzliche Entities" placeholder="Weitere Chart-Entities hinzufügen" @value-changed=${(e) => this._uwc("entities", e.detail.value)}></td-entity-multi-picker></div>
            ${(w.type === "gauge" || w.type === "radial-gauge-advanced" || w.type === "bullet-chart") ? html`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="pf2"><label>Min</label><input type="number" .value=${w.config?.min || 0} @change=${(e) => this._uwc("min", +e.target.value)}></div><div class="pf2"><label>Max</label><input type="number" .value=${w.config?.max || 100} @change=${(e) => this._uwc("max", +e.target.value)}></div></div>` : ""}
          ` : ""}
          ${w.type === "weather" ? html`
            <div class="pg4">Wetter-Karte</div>
            <div class="tog"><input type="checkbox" .checked=${w.config?.weather_animation !== false} @change=${(e) => this._uwc("weather_animation", e.target.checked)}><span>Animationen aktivieren</span></div>
            <div class="pf2"><label>Stil</label><select .value=${w.config?.weather_style || "modern"} @change=${(e) => this._uwc("weather_style", e.target.value)}><option value="modern">Modern</option><option value="glass">Glass</option><option value="minimal">Minimal</option></select></div>
          ` : ""}
          ${w.type === "image" ? html`
            <div class="pg4">Bild</div>
            <div class="pf2"><label>Bild-URL</label><input .value=${w.imageUrl || w.image_url || ""} placeholder="/ticker-display/media/images/xyz.png" @input=${(e) => this._uw("imageUrl", e.target.value)}></div>
            ${(this.images || []).length ? html`<div class="pf2"><label>Lokales Bild wählen</label><select .value=${w.imageUrl || w.image_url || ""} @change=${(e) => this._uw("imageUrl", e.target.value)}><option value="">—</option>${(this.images || []).map((img) => html`<option value=${img.url || `/ticker-display/media/images/${img.filename || img.name}`}>${img.filename || img.name || img.id}</option>`)}</select></div>` : ""}
            ${(this.haImages || []).length ? html`<div class="pf2"><td-ha-media-picker .items=${this.haImages || []} .value=${w.imageUrl || w.image_url || ""} label="Home Assistant Medienbild" placeholder="Bild aus Medienbrowser wählen" @value-changed=${(e) => this._uw("imageUrl", e.detail.value)}></td-ha-media-picker></div>` : ""}
          ` : ""}
        ` : ""}

        ${this._pt === 1 ? html`
          <div class="pg4">Darstellung</div>
          <div class="pf2"><td-font-picker .value=${w.font || ""} .fonts=${this.fonts || []} label="Schriftart" @value-changed=${(e) => this._uw("font", e.detail.value)}></td-font-picker></div>
          <div class="pf2"><label>Schriftgröße: ${w.fontSize || 28}px</label><input type="range" min="12" max="72" step="2" .value=${w.fontSize || 28} @input=${(e) => this._uw("fontSize", +e.target.value)}></div>
          <div class="pf2"><td-color-picker .value=${w.textColor || "#FFFFFF"} label="Textfarbe" @value-changed=${(e) => this._uw("textColor", e.detail.value)}></td-color-picker></div>
          <div class="pf2"><td-color-picker .value=${w.bgColor || "#1E1E1E"} label="Hintergrundfarbe" @value-changed=${(e) => this._uw("bgColor", e.detail.value)}></td-color-picker></div>
          <div class="pf2"><label>Hintergrund-Transparenz: ${w.bgOpacity ?? 0.75}</label><input type="range" min="0" max="1" step="0.05" .value=${w.bgOpacity ?? 0.75} @input=${(e) => this._uw("bgOpacity", +e.target.value)}></div>
          <div class="pf2"><label>Blur: ${w.blur || 0}px</label><input type="range" min="0" max="20" step="1" .value=${w.blur || 0} @input=${(e) => this._uw("blur", +e.target.value)}></div>
          <div class="pf2"><label>Ecken-Radius: ${w.borderRadius || 12}px</label><input type="range" min="0" max="32" step="2" .value=${w.borderRadius || 12} @input=${(e) => this._uw("borderRadius", +e.target.value)}></div>
          <div class="tog"><input type="checkbox" .checked=${w.animations !== false} @change=${(e) => this._uw("animations", e.target.checked)}><span>Animationen aktivieren</span></div>
        ` : ""}

        ${this._pt === 2 ? html`
          <div class="pg4">Erweitert</div>
          <div class="pf2"><label>Benutzerdefiniertes CSS</label><textarea rows="4" .value=${w.customCss || ""} @input=${(e) => this._uw("customCss", e.target.value)} placeholder="box-shadow: 0 0 10px #2196F3;"></textarea></div>
          <div class="pf2"><label>Widget JSON</label><textarea rows="8" .value=${JSON.stringify(w, null, 2)} @change=${(e) => {
            const parsed = safeJsonParse(e.target.value, null);
            if (parsed) {
              const ws = [...(this._cfg.widgets || [])];
              ws[this._sel] = parsed;
              this._cfg = { ...this._cfg, widgets: ws };
            }
          }}></textarea></div>
          <button class="delb" @click=${() => this._delW()}>🗑️ Widget löschen</button>
        ` : ""}
      </div>
    `;
  }

  _entityDomainForWidget(type) {
    if (type === "camera") return "camera";
    if (type === "weather") return "weather";
    return "";
  }

  _supportsMultiEntity(type) {
    return !["camera", "weather", "clock", "countdown", "qr-code", "button", "color-block"].includes(type);
  }

  _supportsValueFormatting(type) {
    return !["camera", "weather", "clock", "countdown", "qr-code", "button", "color-block", "image"].includes(type);
  }

  _mergeEntityList(primary, extras) {
    const out = [];
    if (primary) out.push(primary);
    for (const item of Array.isArray(extras) ? extras : []) {
      if (item && !out.includes(item)) out.push(item);
    }
    return out;
  }


  _renderExtraEntityMetaEditor(w) {
    const ids = Array.isArray(w?.config?.entities) ? w.config.entities.map((id) => typeof id === "string" ? id : id?.entity_id || id?.id || "").filter(Boolean) : [];
    if (!ids.length) return html``;
    const meta = w?.config?.entity_meta || {};
    return html`
      <div class="pg4">Zusatzsensoren Anzeige</div>
      <div class="tog"><input type="checkbox" .checked=${w.config?.show_extra_entity_names !== false} @change=${(e) => this._uwc("show_extra_entity_names", e.target.checked)}><span>Namen standardmäßig anzeigen</span></div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${ids.map((id) => {
        const m = meta[id] || {};
        return html`<div style="border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px;background:rgba(255,255,255,.03)">
          <div style="font-size:11px;opacity:.8;margin-bottom:6px;word-break:break-all">${id}</div>
          <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center">
            <input .value=${m.alias || ""} placeholder="Kurzer Name, z.B. ober-max" @input=${(e) => this._setExtraEntityMeta(id, { alias: e.target.value })}>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" .checked=${m.hide_name || false} @change=${(e) => this._setExtraEntityMeta(id, { hide_name: e.target.checked })}>Name ausblenden</label>
          </div>
        </div>`;
      })}</div>`;
  }

  _setExtraEntityMeta(entityId, patch) {
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    const w = ws[this._sel] || {};
    const cfg = { ...(w.config || {}) };
    const meta = { ...(cfg.entity_meta || {}) };
    meta[entityId] = { ...(meta[entityId] || {}), ...patch };
    cfg.entity_meta = meta;
    ws[this._sel] = { ...w, config: cfg };
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _ss(k, v) {
    this._push();
    this._cfg = { ...this._cfg, [k]: v };
  }

  _drop(c, r) {
    if (!this._dwt) return;
    if (String(this._dwt).startsWith("preset-")) {
      this._applyDomainPreset(this._dwt);
      this._dwt = null;
      return;
    }
    if (String(this._dwt).startsWith("ha-card-")) {
      this._applyHomeAssistantCard(this._dwt);
      this._dwt = null;
      return;
    }
    if (String(this._dwt).startsWith("ha-template-")) {
      this._applyHomeAssistantTemplate(this._dwt);
      this._dwt = null;
      return;
    }
    if (String(this._dwt).startsWith("saved-template:")) {
      this._applySavedTemplate(String(this._dwt).split(":").slice(1).join(":"));
      this._dwt = null;
      return;
    }
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    ws.push(tdCreateWidget(this._dwt, c, r, this.globalSettings || {}));
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = ws.length - 1;
    this._selMulti = [this._sel];
    this._rememberWidgetType(this._dwt);
    this._dwt = null;
  }

  _openDraftPreview() {
    const key = `td_preview_${this.deviceId || "device"}_${this.screenIndex ?? 0}`;
    const payload = { screens: [deepClone(this._cfg)], ticker: { ...(this.globalSettings?.ticker || {}), ...(this._cfg.ticker_style || {}) }, rotation: { transition: this._cfg.transition || "fade" } };
    try { localStorage.setItem(key, JSON.stringify(payload)); } catch (e) {}
    window.open(`/ticker-display/preview/${this.deviceId}?td_preview_key=${encodeURIComponent(key)}`, "_blank");
  }

  _startWidgetDrag(e, index) {
    if (e.target?.classList?.contains("wbh")) return;
    const w = this._cfg?.widgets?.[index];
    if (!w || w.locked || e.button !== 0) return;
    this._handleWidgetSelect(index, e);
    const grid = this.renderRoot?.querySelector('.pg');
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    const cw = rect.width / cols; const ch = rect.height / rows;
    const idxs = this._getSelectedIndices();
    const base = idxs.map((i) => ({ i, col: this._cfg.widgets[i].col || 0, row: this._cfg.widgets[i].row || 0 }));
    const startX = e.clientX, startY = e.clientY;
    const move = (ev) => {
      const dc = Math.round((ev.clientX - startX) / cw);
      const dr = Math.round((ev.clientY - startY) / ch);
      const ws = [...(this._cfg.widgets || [])];
      for (const item of base) {
        const src = ws[item.i]; if (!src || src.locked) continue;
        const maxC = Math.max(0, cols - (src.colspan || 1));
        const maxR = Math.max(0, rows - (src.rowspan || 1));
        ws[item.i] = { ...src, col: Math.max(0, Math.min(maxC, item.col + dc)), row: Math.max(0, Math.min(maxR, item.row + dr)) };
      }
      this._cfg = { ...this._cfg, widgets: ws };
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this._dragState = null; };
    this._push(); this._dragState = { index };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  _startWidgetResize(e, index, dir) {
    e.stopPropagation();
    const w = this._cfg?.widgets?.[index];
    if (!w || w.locked) return;
    const grid = this.renderRoot?.querySelector('.pg'); if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const cols = this._cfg.grid?.columns || 3; const rows = this._cfg.grid?.rows || 2;
    const cw = rect.width / cols; const ch = rect.height / rows;
    const startX = e.clientX, startY = e.clientY;
    const base = { colspan: w.colspan || 1, rowspan: w.rowspan || 1, col: w.col || 0, row: w.row || 0 };
    const move = (ev) => {
      const dc = Math.round((ev.clientX - startX) / cw);
      const dr = Math.round((ev.clientY - startY) / ch);
      const ws = [...(this._cfg.widgets || [])]; const cur = { ...ws[index] };
      if (dir === 'e' || dir === 'se') cur.colspan = Math.max(1, Math.min(cols - base.col, base.colspan + dc));
      if (dir === 's' || dir === 'se') cur.rowspan = Math.max(1, Math.min(rows - base.row, base.rowspan + dr));
      ws[index] = cur; this._cfg = { ...this._cfg, widgets: ws };
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this._resizeState = null; };
    this._push(); this._resizeState = { index, dir };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  _distributeSelected(axis) {
    const idxs = this._getSelectedIndices(); if (idxs.length < 3) return;
    this._push(); const ws = [...(this._cfg.widgets || [])]; const key = axis === 'x' ? 'col' : 'row';
    idxs.sort((a,b) => (ws[a][key]||0) - (ws[b][key]||0));
    const first = ws[idxs[0]][key] || 0; const last = ws[idxs[idxs.length - 1]][key] || 0; const step = (last - first) / (idxs.length - 1 || 1);
    idxs.forEach((idx, pos) => { ws[idx] = { ...ws[idx], [key]: Math.round(first + step * pos) }; });
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _resizeSelected(dw, dh) {
    const idxs = this._getSelectedIndices(); if (!idxs.length) return;
    this._push(); const cols = this._cfg.grid?.columns || 3; const rows = this._cfg.grid?.rows || 2; const ws = [...(this._cfg.widgets || [])];
    for (const idx of idxs) { const w = { ...ws[idx] }; if (w.locked) continue; w.colspan = Math.max(1, Math.min(cols - (w.col || 0), (w.colspan || 1) + dw)); w.rowspan = Math.max(1, Math.min(rows - (w.row || 0), (w.rowspan || 1) + dh)); ws[idx] = w; }
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _setSelectedLock(locked) {
    const idxs = this._getSelectedIndices(); if (!idxs.length) return;
    this._push(); const ws = [...(this._cfg.widgets || [])]; for (const idx of idxs) ws[idx] = { ...ws[idx], locked }; this._cfg = { ...this._cfg, widgets: ws };
  }

  _setSelectedLayer(delta) {
    const idxs = this._getSelectedIndices(); if (!idxs.length) return;
    this._push(); const ws = [...(this._cfg.widgets || [])]; for (const idx of idxs) ws[idx] = { ...ws[idx], z_index: Math.max(1, (ws[idx].z_index || (idx + 1)) + delta) }; this._cfg = { ...this._cfg, widgets: ws };
  }

  _applyTickerTemplate(name) {
    const presets = { classic: { background_color: 'rgba(12,18,28,.78)', text_color: '#e8eef7', accent_color: '#40c4ff', border_radius: 0, font_weight: 600 }, glass: { background_color: 'rgba(20,24,32,.45)', text_color: '#ffffff', accent_color: '#7dd3fc', border_radius: 14, font_weight: 600, opacity: 0.92 }, alert: { background_color: 'rgba(120,8,8,.85)', text_color: '#fff5f5', accent_color: '#ffd54f', border_radius: 0, font_weight: 700 }, minimal: { background_color: 'rgba(0,0,0,.22)', text_color: '#f3f4f6', accent_color: '#9ca3af', border_radius: 10, font_weight: 500 } };
    this._ss('ticker_style', { ...(this._cfg.ticker_style || {}), style_template: name, ...(presets[name] || {}) });
  }
  _uw(k, v) {
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    ws[this._sel] = { ...ws[this._sel], [k]: v };
    this._cfg = { ...this._cfg, widgets: ws };
  }
  _uwc(k, v) {
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    const w = ws[this._sel];
    let nextValue = v;
    if (k === "entities") {
      nextValue = [...new Set((Array.isArray(v) ? v : []).map((item) => typeof item === "string" ? item : item?.entity_id || item?.id || "").filter(Boolean))];
    }
    ws[this._sel] = { ...w, config: { ...(w.config || {}), [k]: nextValue } };
    this._cfg = { ...this._cfg, widgets: ws };
  }
  _delW() {
    if (this._sel < 0) return;
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    ws.splice(this._sel, 1);
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = -1;
    this._selMulti = [];
  }
  _sg(k, v) { this._cfg = { ...this._cfg, grid: { ...(this._cfg.grid || { columns: 3, rows: 2 }), [k]: v } }; }
  _push() { this._undo = [...this._undo, JSON.stringify(this._cfg)]; this._redo = []; }
  _doUndo() { if (!this._undo.length) return; this._redo = [...this._redo, JSON.stringify(this._cfg)]; this._cfg = JSON.parse(this._undo[this._undo.length - 1]); this._undo = this._undo.slice(0, -1); this._sel = -1; this._selMulti = []; }
  _doRedo() { if (!this._redo.length) return; this._undo = [...this._undo, JSON.stringify(this._cfg)]; this._cfg = JSON.parse(this._redo[this._redo.length - 1]); this._redo = this._redo.slice(0, -1); this._sel = -1; this._selMulti = []; }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-screen-editor", TdScreenEditor);

/* ══════════════════════════════════════════════════════════
   TEMPLATE GALLERY
   ══════════════════════════════════════════════════════════ */

class TdTemplateGallery extends LitElement {
  static get properties() {
    return { hass: { type: Object }, templates: { type: Object }, devices: { type: Array }, _importJson: { type: String }, _showImport: { type: Boolean } };
  }
  constructor() {
    super();
    this._importJson = "";
    this._showImport = false;
  }
  static get styles() {
    return css`
      :host { display:block; padding:16px; }
      .hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:8px; }
      .hdr h2 { margin:0; font-size:22px; }
      .ha { display:flex; gap:8px; }
      .b { padding:8px 16px; border:1px solid var(--divider-color); border-radius:8px; background:none; color:var(--primary-text-color); font-size:13px; cursor:pointer; }
      .b:hover { background:rgba(255,255,255,.05); }
      .b.p { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
      .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px; }
      .card { background:var(--card-background-color); border-radius:12px; overflow:hidden; border:1px solid var(--divider-color); transition:all .2s; }
      .card:hover { border-color:rgba(255,255,255,.2); box-shadow:0 4px 12px rgba(0,0,0,.2); }
      .cpv { height:120px; background:#0a0a0a; display:flex; align-items:center; justify-content:center; font-size:48px; opacity:.3; }
      .ci { padding:14px; }
      .cname { font-size:16px; font-weight:500; margin-bottom:4px; }
      .cdesc { font-size:13px; color:var(--secondary-text-color); margin-bottom:12px; }
      .cmeta { font-size:12px; color:var(--secondary-text-color); margin-bottom:12px; }
      .cacts { display:flex; gap:6px; flex-wrap:wrap; }
      .tb2 { padding:6px 12px; border:1px solid var(--divider-color); border-radius:6px; background:none; color:var(--primary-text-color); font-size:12px; cursor:pointer; }
      .tb2:hover { background:rgba(255,255,255,.05); }
      .isec { background:var(--card-background-color); border-radius:12px; padding:16px; margin-bottom:24px; }
      .isec textarea { width:100%; height:120px; border:1px solid var(--divider-color); border-radius:8px; background:var(--primary-background-color); color:var(--primary-text-color); font-family:monospace; font-size:12px; padding:10px; resize:vertical; margin:8px 0; }
      .empty { text-align:center; padding:60px 20px; color:var(--secondary-text-color); }
      .empty .ei { font-size:48px; opacity:.3; margin-bottom:12px; }
    `;
  }

  render() {
    const tl = Object.entries(this.templates || {});
    const ci = { dashboard: "📊", weather: "🌤️", energy: "⚡", security: "🔒", media: "🎵", custom: "📋" };
    return html`
      <div class="hdr">
        <h2>📚 Screen-Bibliothek</h2>
        <div class="ha">
          <button class="b" @click=${() => this._showImport = !this._showImport}>📥 Importieren</button>
          <button class="b p" @click=${() => this._e("create-template", {})}>➕ Neu</button>
        </div>
      </div>
      <p style="margin:0 0 16px;color:var(--secondary-text-color);font-size:13px">Speichere einzelne Folien oder Grundlayouts und verwende sie später auf neuen Displays wieder.</p>
      ${this._showImport ? html`
        <div class="isec">
          <strong>JSON importieren:</strong>
          <textarea .value=${this._importJson} @input=${(e) => this._importJson = e.target.value}></textarea>
          <button class="b p" @click=${() => { this._e("import-template", { json: this._importJson }); this._importJson = ""; this._showImport = false; }}>📥 Importieren</button>
        </div>
      ` : ""}
      ${tl.length === 0 ? html`
        <div class="empty"><div class="ei">📋</div><p style="font-size:18px">Noch keine Vorlagen</p></div>
      ` : html`
        <div class="grid">
          ${tl.map(([id, t]) => html`
            <div class="card">
              <div class="cpv">${ci[t.category] || "📋"}</div>
              <div class="ci">
                <div class="cname">${t.name || id}</div>
                <div class="cdesc">${t.description || ""}</div>
                <div class="cmeta">${t.category || "custom"} · ${(t.screen_config?.widgets?.length || 0)} Widgets · ${(t.screen_config?.type || "dashboard")}</div>
                <div class="cacts">
                  <button class="tb2" @click=${() => this._e("edit-template", { templateId: id })}>✏️</button>
                  <button class="tb2" @click=${() => this._e("export-template", { templateId: id })}>📤</button>
                  <button class="tb2" @click=${() => this._e("delete-template", { templateId: id })}>🗑️</button>
                </div>
              </div>
            </div>
          `)}
        </div>
      `}
    `;
  }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-template-gallery", TdTemplateGallery);

/* ══════════════════════════════════════════════════════════
   TEMPLATE EDITOR
   ══════════════════════════════════════════════════════════ */

class TdTemplateEditor extends LitElement {
  static get properties() {
    return { hass: { type: Object }, template: { type: Object }, templateId: { type: String }, fonts: { type: Array }, _cfg: { type: Object } };
  }
  constructor() {
    super();
    this._cfg = null;
  }
  updated(c) {
    if (c.has("template")) {
      this._cfg = this.template ? deepClone(this.template) : {
        name: "",
        description: "",
        category: "custom",
        screen_config: { type: "dashboard", grid: { columns: 3, rows: 2 }, widgets: [], duration: 15, background_color: "#121212", background_image: "", background_image_size: "cover" },
        variables: [],
      };
    }
  }
  static get styles() {
    return css`
      :host { display:block; padding:16px; max-width:800px; margin:0 auto; }
      .sec { background:var(--card-background-color); border-radius:12px; padding:20px; margin-bottom:16px; }
      .sec h3 { margin:0 0 16px; font-size:16px; }
      .f { margin-bottom:14px; }
      .f label { display:block; font-size:13px; color:var(--secondary-text-color); margin-bottom:6px; }
      .f input,.f select,.f textarea { width:100%; padding:10px 12px; border:1px solid var(--divider-color); border-radius:8px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:14px; }
      .f textarea { font-family:inherit; resize:vertical; min-height:60px; }
      .row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .vl { list-style:none; padding:0; margin:0; }
      .vi { display:flex; gap:8px; align-items:center; padding:8px 12px; background:var(--primary-background-color); border-radius:8px; margin-bottom:6px; border:1px solid var(--divider-color); }
      .vi input { flex:1; padding:6px 8px; font-size:13px; border:1px solid var(--divider-color); border-radius:6px; background:var(--primary-background-color); color:var(--primary-text-color); }
      .ib { padding:6px; border:none; background:none; color:var(--secondary-text-color); cursor:pointer; font-size:16px; border-radius:6px; }
      .ib:hover { background:rgba(255,255,255,.08); }
      .addb { width:100%; padding:12px; border:2px dashed var(--divider-color); border-radius:8px; background:none; color:var(--secondary-text-color); cursor:pointer; font-size:13px; }
      .addb:hover { border-color:var(--primary-color); color:var(--primary-color); }
      .jp { width:100%; min-height:200px; padding:10px; font-family:monospace; font-size:12px; resize:vertical; background:var(--primary-background-color); color:var(--primary-text-color); border:1px solid var(--divider-color); border-radius:8px; }
      .sb { position:sticky; bottom:0; padding:16px; display:flex; justify-content:flex-end; gap:12px; background:var(--card-background-color); border-top:1px solid var(--divider-color); }
      .b { padding:10px 24px; border:1px solid var(--divider-color); border-radius:8px; background:none; color:var(--primary-text-color); font-size:14px; cursor:pointer; }
      .b.p { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
    `;
  }
  render() {
    if (!this._cfg) return html``;
    const c = this._cfg;
    return html`
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <button class="ib" style="font-size:20px" @click=${() => this._e("back", {})}>←</button>
        <span style="font-size:20px;font-weight:500">📋 Vorlage ${this.templateId ? "bearbeiten" : "erstellen"}</span>
      </div>
      <div class="sec">
        <h3>📝 Allgemein</h3>
        <div class="f"><label>Name</label><input .value=${c.name || ""} @input=${(e) => this._s("name", e.target.value)}></div>
        <div class="f"><label>Beschreibung</label><textarea .value=${c.description || ""} @input=${(e) => this._s("description", e.target.value)}></textarea></div>
        <div class="row">
          <div class="f"><label>Kategorie</label><select .value=${c.category || "custom"} @change=${(e) => this._s("category", e.target.value)}>
            <option value="dashboard">📊 Dashboard</option>
            <option value="weather">🌤️ Wetter</option>
            <option value="energy">⚡ Energie</option>
            <option value="security">🔒 Sicherheit</option>
            <option value="custom">📋 Benutzerdefiniert</option>
          </select></div>
          <div class="f"><label>Screen-Typ</label><select .value=${c.screen_config?.type || "dashboard"} @change=${(e) => { const sc = { ...(c.screen_config || {}) }; sc.type = e.target.value; this._s("screen_config", sc); }}>
            <option value="dashboard">Dashboard</option>
            <option value="weather">Wetter</option>
            <option value="camera">Kamera</option>
            <option value="clock">Uhr</option>
          </select></div>
        </div>
      </div>
      <div class="sec">
        <h3>🔀 Variablen</h3>
        <ul class="vl">
          ${(c.variables || []).map((v, i) => html`
            <li class="vi">
              <input .value=${v.key || ""} placeholder="variable_name" @input=${(e) => { const vs = [...(c.variables || [])]; vs[i] = { ...vs[i], key: e.target.value }; this._s("variables", vs); }}>
              <input .value=${v.label || ""} placeholder="Anzeigename" @input=${(e) => { const vs = [...(c.variables || [])]; vs[i] = { ...vs[i], label: e.target.value }; this._s("variables", vs); }}>
              <input .value=${v.default || ""} placeholder="Standard" @input=${(e) => { const vs = [...(c.variables || [])]; vs[i] = { ...vs[i], default: e.target.value }; this._s("variables", vs); }}>
              <button class="ib" @click=${() => { const vs = [...(c.variables || [])]; vs.splice(i, 1); this._s("variables", vs); }}>🗑️</button>
            </li>
          `)}
        </ul>
        <button class="addb" @click=${() => this._s("variables", [...(c.variables || []), { key: "", label: "", default: "" }])}>➕ Variable</button>
      </div>
      <div class="sec">
        <h3>🔧 JSON</h3>
        <textarea class="jp" .value=${JSON.stringify(c.screen_config || {}, null, 2)} @change=${(e) => { const parsed = safeJsonParse(e.target.value, null); if (parsed) this._s("screen_config", parsed); }}></textarea>
      </div>
      <div class="sb">
        <button class="b" @click=${() => this._e("back", {})}>Abbrechen</button>
        <button class="b p" @click=${() => this._e("save", { id: this.templateId || `template_${Date.now()}`, ...this._cfg })}>💾 Speichern</button>
      </div>
    `;
  }
  _s(k, v) { this._cfg = { ...this._cfg, [k]: v }; }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-template-editor", TdTemplateEditor);

/* ══════════════════════════════════════════════════════════
   ALERTS
   ══════════════════════════════════════════════════════════ */

class TdAlertList extends LitElement {
  static get properties() {
    return { hass: { type: Object }, alertTemplates: { type: Object }, sounds: { type: Array } };
  }
  static get styles() {
    return css`
      :host { display:block; padding:16px; }
      .hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
      .hdr h2 { margin:0; font-size:22px; }
      .b { padding:8px 16px; border:1px solid var(--divider-color); border-radius:8px; background:none; color:var(--primary-text-color); font-size:13px; cursor:pointer; }
      .b.p { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
      .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px; }
      .card { background:var(--card-background-color); border-radius:12px; padding:16px; border:1px solid var(--divider-color); }
      .card:hover { border-color:rgba(255,255,255,.2); }
      .ch2 { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
      .ct { font-size:16px; font-weight:500; }
      .sev { padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; text-transform:uppercase; }
      .sev.info { background:rgba(33,150,243,.15); color:#2196F3; }
      .sev.warning { background:rgba(255,152,0,.15); color:#FF9800; }
      .sev.critical { background:rgba(244,67,54,.15); color:#F44336; }
      .cm { font-size:13px; color:var(--secondary-text-color); margin-bottom:12px; }
      .cm span { display:block; margin:2px 0; }
      .ca { display:flex; gap:6px; }
      .sb2 { padding:6px 12px; border:1px solid var(--divider-color); border-radius:6px; background:none; color:var(--primary-text-color); font-size:12px; cursor:pointer; }
      .sb2:hover { background:rgba(255,255,255,.05); }
      .empty { text-align:center; padding:60px 20px; color:var(--secondary-text-color); }
    `;
  }
  render() {
    const list = Object.entries(this.alertTemplates || {});
    const ml = { fullscreen: "Vollbild", banner: "Banner", toast: "Toast", pip: "PIP" };
    return html`
      <div class="hdr"><h2>🔔 Alert-Studio</h2><button class="b p" @click=${() => this._e("create-alert", {})}>➕ Neue Vorlage</button></div>
      <p style="margin:0 0 16px;color:var(--secondary-text-color);font-size:13px">Vorlagen für Banner, Vollbild, Toast und PIP. Sounds lassen sich direkt testen und über Automationen wiederverwenden.</p>
      ${list.length === 0 ? html`<div class="empty"><p style="font-size:48px;opacity:.3">🔔</p><p style="font-size:18px">Keine Alert-Vorlagen</p></div>` : html`
        <div class="grid">
          ${list.map(([id, a]) => html`
            <div class="card">
              <div class="ch2"><span class="ct">${a.icon || "🔔"} ${a.title || a.name || id}</span><span class="sev ${a.severity || "info"}">${a.severity || "info"}</span></div>
              <div class="cm">
                <span>Modus: ${ml[a.mode] || a.mode || "fullscreen"}</span>
                <span>Dauer: ${a.duration || "∞"}s</span>
                ${a.sound ? html`<span>Sound: ${a.sound}</span>` : (a.sound_url ? html`<span>Audio: HA Medien</span>` : "")}
              </div>
              <div class="ca">
                <button class="sb2" @click=${() => this._e("edit-alert", { alertId: id })}>✏️</button>
                <button class="sb2" title="Alert testen" @click=${() => { if (this.hass) this.hass.callService("ticker_display", "show_alert", { device: "all", ...a }); }}>👁️</button><button class="sb2" title="Ton testen" @click=${() => this._previewSound(a)}>🔊</button>
                <button class="sb2" @click=${() => this._e("delete-alert", { alertId: id })}>🗑️</button>
              </div>
            </div>
          `)}
        </div>
      `}
    `;
  }
  _previewSound(a) {
    const sound = document.createElement("audio");
    sound.src = a.sound_url || "";
    if (!sound.src && a.sound && Array.isArray(this.sounds)) {
      const hit = this.sounds.find((s) => s.id === a.sound);
      if (hit?.url) sound.src = hit.url;
    }
    if (sound.src) sound.play().catch(() => {});
  }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-alert-list", TdAlertList);

class TdAlertEditor extends LitElement {
  static get properties() {
    return { hass: { type: Object }, alert: { type: Object }, alertId: { type: String }, sounds: { type: Array }, haAudio: { type: Array }, _cfg: { type: Object } };
  }
  constructor() {
    super();
    this._cfg = null;
  }
  updated(c) {
    if (c.has("alert")) {
      this._cfg = this.alert ? deepClone(this.alert) : { name:"", title:"", message:"", severity:"info", mode:"fullscreen", icon:"", sound:"", sound_url:"", duration:10, flash_screen:false, vibrate:false, persistent:false, color:"", volume:100 };
    }
  }
  static get styles() {
    return css`
      :host { display:block; padding:16px; max-width:700px; margin:0 auto; }
      .sec { background:var(--card-background-color); border-radius:12px; padding:20px; margin-bottom:16px; }
      .sec h3 { margin:0 0 16px; font-size:16px; }
      .f { margin-bottom:14px; }
      .f label { display:block; font-size:13px; color:var(--secondary-text-color); margin-bottom:6px; }
      .f input,.f select,.f textarea { width:100%; padding:10px 12px; border:1px solid var(--divider-color); border-radius:8px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:14px; }
      .f textarea { resize:vertical; min-height:60px; font-family:inherit; }
      .row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .tog { display:flex; align-items:center; gap:10px; padding:8px 0; }
      .tog input[type=checkbox] { width:18px; height:18px; accent-color:var(--primary-color); }
      .pv2 { background:#121212; border-radius:12px; padding:30px; text-align:center; margin-top:16px; border:1px solid var(--divider-color); }
      .pv2.info { border-color:#2196F3; }
      .pv2.warning { border-color:#FF9800; }
      .pv2.critical { border-color:#F44336; }
      .pvi { font-size:48px; margin-bottom:12px; }
      .pvt { font-size:24px; font-weight:700; color:#fff; margin-bottom:8px; }
      .pvm { font-size:16px; color:rgba(255,255,255,.7); }
      .sb { position:sticky; bottom:0; display:flex; justify-content:flex-end; gap:12px; padding:16px; background:var(--card-background-color); border-top:1px solid var(--divider-color); }
      .b { padding:10px 24px; border:1px solid var(--divider-color); border-radius:8px; background:none; color:var(--primary-text-color); font-size:14px; cursor:pointer; }
      .b.p { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
      .b.t { background:#4CAF50; border-color:#4CAF50; color:#fff; }
    `;
  }
  render() {
    if (!this._cfg) return html``;
    const c = this._cfg;
    const si = { info: "ℹ️", warning: "⚠️", critical: "🚨" };
    return html`
      <div class="sec">
        <h3>📝 Alert-Inhalt</h3>
        <div class="f"><label>Name</label><input .value=${c.name || ""} @input=${(e) => this._s("name", e.target.value)}></div>
        <div class="row">
          <div class="f"><label>Schweregrad</label><select .value=${c.severity || "info"} @change=${(e) => this._s("severity", e.target.value)}>
            <option value="info">ℹ️ Info</option>
            <option value="warning">⚠️ Warnung</option>
            <option value="critical">🚨 Kritisch</option>
          </select></div>
          <div class="f"><label>Modus</label><select .value=${c.mode || "fullscreen"} @change=${(e) => this._s("mode", e.target.value)}>
            <option value="fullscreen">Vollbild</option>
            <option value="banner">Banner</option>
            <option value="toast">Toast</option>
            <option value="pip">PIP</option>
          </select></div>
        </div>
        <div class="f"><label>Icon</label><input .value=${c.icon || ""} @input=${(e) => this._s("icon", e.target.value)} placeholder="🔔"></div>
        <div class="f"><label>Titel</label><input .value=${c.title || ""} @input=${(e) => this._s("title", e.target.value)}></div>
        <div class="f"><label>Nachricht</label><textarea .value=${c.message || ""} @input=${(e) => this._s("message", e.target.value)}></textarea></div>
      </div>

      <div class="sec">
        <h3>🔊 Sound & Verhalten</h3><p style="margin:0 0 12px;color:var(--secondary-text-color);font-size:13px">Du kannst interne Sounds oder Audio aus dem Home-Assistant-Medienbrowser verwenden.</p>
        <div class="row">
          <div class="f"><td-sound-picker .value=${c.sound || ""} .sounds=${this.sounds || []} label="Interner Sound" @value-changed=${(e) => { this._s("sound", e.detail.value); if (e.detail.value) this._s("sound_url", ""); }}></td-sound-picker></div>
          <div class="f"><label>Lautstärke: ${c.volume || 100}%</label><input type="range" min="0" max="100" .value=${c.volume || 100} @input=${(e) => this._s("volume", +e.target.value)}></div>
        </div>
        ${(this.haAudio || []).length ? html`<div class="f"><td-ha-media-picker .items=${this.haAudio || []} .value=${c.sound_url || ""} label="Home Assistant Audio" placeholder="Audio aus Medienbrowser wählen" @value-changed=${(e) => { this._s("sound_url", e.detail.value); if (e.detail.value) this._s("sound", ""); }}></td-ha-media-picker></div>` : ""}
        <div class="row">
          <div class="f"><label>Dauer (0=manuell)</label><input type="number" min="0" max="300" .value=${c.duration || 10} @change=${(e) => this._s("duration", +e.target.value)}></div>
          <div class="f"><td-color-picker .value=${c.color || "#2196F3"} label="Farbe" @value-changed=${(e) => this._s("color", e.detail.value)}></td-color-picker></div>
        </div>
        <div class="tog"><input type="checkbox" .checked=${c.flash_screen || false} @change=${(e) => this._s("flash_screen", e.target.checked)}><span>Bildschirm blinken</span></div>
        <div class="tog"><input type="checkbox" .checked=${c.vibrate || false} @change=${(e) => this._s("vibrate", e.target.checked)}><span>Vibration</span></div>
        <div class="tog"><input type="checkbox" .checked=${c.persistent || false} @change=${(e) => this._s("persistent", e.target.checked)}><span>Dauerhaft</span></div>
      </div>

      ${c.mode === "pip" ? html`
        <div class="sec">
          <h3>📹 PIP</h3>
          <div class="f">
            <td-entity-picker .hass=${this.hass} .value=${c.entity_id || ""} domain="camera" label="Kamera-Entity" placeholder="camera.haustuer" @value-changed=${(e) => this._s("entity_id", e.detail.value)}></td-entity-picker>
          </div>
          <div class="row">
            <div class="f"><label>Position</label><select .value=${c.pip_position || "top-right"} @change=${(e) => this._s("pip_position", e.target.value)}>
              <option value="top-right">Oben rechts</option>
              <option value="top-left">Oben links</option>
              <option value="bottom-right">Unten rechts</option>
              <option value="bottom-left">Unten links</option>
            </select></div>
            <div class="f"><label>Größe</label><select .value=${c.pip_size || "medium"} @change=${(e) => this._s("pip_size", e.target.value)}>
              <option value="small">Klein</option>
              <option value="medium">Mittel</option>
              <option value="large">Groß</option>
            </select></div>
          </div>
        </div>
      ` : ""}

      <div class="sec">
        <h3>👁️ Vorschau</h3>
        <div class="pv2 ${c.severity || "info"}">
          <div class="pvi">${c.icon || si[c.severity] || "ℹ️"}</div>
          <div class="pvt">${c.title || "Alert"}</div>
          <div class="pvm">${c.message || "Nachricht"}</div>
        </div>
      </div>

      <div class="sb">
        <button class="b" @click=${() => this._e("back", {})}>Abbrechen</button>
        <button class="b" @click=${() => this._previewSound()}>🔊 Ton testen</button><button class="b t" @click=${() => { if (this.hass) this.hass.callService("ticker_display", "show_alert", { device: "all", ...this._cfg }); }}>👁️ Alert testen</button>
        <button class="b p" @click=${() => this._e("save", { id: this.alertId || `alert_${Date.now()}`, ...this._cfg })}>💾 Speichern</button>
      </div>
    `;
  }
  _s(k, v) { this._cfg = { ...this._cfg, [k]: v }; }
  _previewSound() {
    const url = this._cfg?.sound_url || (this.sounds || []).find((s) => s.id === this._cfg?.sound)?.url;
    if (!url) return;
    if (this._audio) { this._audio.pause(); this._audio = null; }
    this._audio = new Audio(url);
    this._audio.volume = Math.max(0, Math.min(1, Number(this._cfg?.volume || 100) / 100));
    this._audio.play().catch(() => {});
  }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-alert-editor", TdAlertEditor);

/* ══════════════════════════════════════════════════════════
   THEMES
   ══════════════════════════════════════════════════════════ */

class TdThemeList extends LitElement {
  static get properties() {
    return { hass: { type: Object }, customThemes: { type: Object } };
  }
  static get styles() {
    return css`
      :host { display:block; padding:16px; }
      .hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
      .hdr h2 { margin:0; font-size:22px; }
      .b { padding:8px 16px; border:1px solid var(--divider-color); border-radius:8px; background:none; color:var(--primary-text-color); font-size:13px; cursor:pointer; }
      .b.p { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
      .cat { font-size:14px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; color:var(--secondary-text-color); margin:24px 0 12px; padding-bottom:8px; border-bottom:1px solid var(--divider-color); }
      .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px; }
      .card { background:var(--card-background-color); border-radius:12px; overflow:hidden; border:1px solid var(--divider-color); cursor:pointer; transition:all .2s; }
      .card:hover { border-color:rgba(255,255,255,.2); }
      .sw { height:80px; display:flex; align-items:flex-end; padding:8px; }
      .dots { display:flex; gap:4px; }
      .dot { width:12px; height:12px; border-radius:50%; border:1px solid rgba(255,255,255,.2); }
      .ci { padding:12px; }
      .cn { font-size:14px; font-weight:500; }
      .ca { display:flex; gap:6px; padding:0 12px 12px; }
      .sb2 { padding:4px 10px; border:1px solid var(--divider-color); border-radius:6px; background:none; color:var(--primary-text-color); font-size:12px; cursor:pointer; }
      .sb2:hover { background:rgba(255,255,255,.05); }
    `;
  }
  render() {
    const bi = [
      { id: "dark", n: "🌙 Dark", bg: "#121212", c: "#1E1E1E", a: "#2196F3", p: "#4CAF50", ne: "#F44336" },
      { id: "light", n: "☀️ Light", bg: "#FAFAFA", c: "#FFFFFF", a: "#1976D2", p: "#388E3C", ne: "#D32F2F" },
      { id: "high-contrast", n: "🔲 High Contrast", bg: "#000", c: "#1A1A1A", a: "#00BFFF", p: "#0F0", ne: "#F00" },
      { id: "night", n: "🌃 Night", bg: "#0A0000", c: "#1A0505", a: "#CC3333", p: "#664444", ne: "#CC2222" },
      { id: "glass-blue", n: "🧊 Glass Blue", bg: "#0C1420", c: "rgba(255,255,255,0.10)", a: "#57B8FF", p: "#60E3A1", ne: "#FF6B6B" },
      { id: "oled", n: "🖤 OLED", bg: "#000000", c: "#0A0A0A", a: "#35A7FF", p: "#7CFC00", ne: "#FF5050" },
    ];
    const cu = Object.entries(this.customThemes || {});
    return html`
      <div class="hdr"><h2>🎨 Theme-Studio</h2><button class="b p" @click=${() => this._e("create-theme", {})}>➕ Neues Theme</button></div><p style="margin:0 0 16px;color:var(--secondary-text-color);font-size:13px">Themes steuern Anzeige, Ticker und Karten gemeinsam. Screens können zusätzlich ein eigenes Screen-Theme bekommen.</p>
      <div class="cat">Eingebaut (${bi.length})</div>
      <div class="grid">${bi.map((t) => html`
        <div class="card">
          <div class="sw" style="background:${t.bg}"><div class="dots"><div class="dot" style="background:${t.a}"></div><div class="dot" style="background:${t.p}"></div><div class="dot" style="background:${t.ne}"></div><div class="dot" style="background:${t.c}"></div></div></div>
          <div class="ci"><span class="cn">${t.n}</span></div>
        </div>
      `)}</div>
      ${cu.length > 0 ? html`
        <div class="cat">Benutzerdefiniert (${cu.length})</div>
        <div class="grid">${cu.map(([id, t]) => html`
          <div class="card">
            <div class="sw" style="background:${t.vars?.bg || "#121212"}"><div class="dots"><div class="dot" style="background:${t.vars?.accent || "#2196F3"}"></div><div class="dot" style="background:${t.vars?.positive || "#4CAF50"}"></div></div></div>
            <div class="ci"><span class="cn">${t.name || id}</span></div>
            <div class="ca"><button class="sb2" @click=${() => this._e("edit-theme", { themeId: id })}>✏️</button><button class="sb2" @click=${() => this._e("delete-theme", { themeId: id })}>🗑️</button></div>
          </div>
        `)}</div>
      ` : ""}
    `;
  }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-theme-list", TdThemeList);

class TdThemeEditor extends LitElement {
  static get properties() {
    return { hass: { type: Object }, theme: { type: Object }, themeId: { type: String }, fonts: { type: Array }, _cfg: { type: Object } };
  }
  constructor() {
    super();
    this._cfg = null;
  }
  updated(c) {
    if (c.has("theme")) {
      this._cfg = this.theme ? deepClone(this.theme) : { name: "", vars: { bg:"#121212", "card-bg":"#1E1E1E", "text-primary":"#FFFFFF", "text-secondary":"rgba(255,255,255,0.6)", accent:"#2196F3", positive:"#4CAF50", warning:"#FF9800", negative:"#F44336", info:"#2196F3", "ticker-bg":"rgba(255,255,255,0.03)", "widget-gap":"8px", "widget-padding":"12px", "widget-radius":"12px", "ticker-height":"36px" } };
    }
  }
  static get styles() {
    return css`
      :host { display:block; padding:16px; max-width:700px; margin:0 auto; }
      .sec { background:var(--card-background-color); border-radius:12px; padding:20px; margin-bottom:16px; }
      .sec h3 { margin:0 0 16px; font-size:16px; }
      .f { margin-bottom:12px; }
      .f label { display:block; font-size:13px; color:var(--secondary-text-color); margin-bottom:6px; }
      .f input { width:100%; padding:10px 12px; border:1px solid var(--divider-color); border-radius:8px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:14px; }
      .cg { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .cf { display:flex; align-items:center; gap:10px; }
      .cf input[type=color] { width:44px; height:36px; padding:2px; border:1px solid var(--divider-color); border-radius:6px; cursor:pointer; background:none; }
      .cf .cl { font-size:13px; flex:1; }
      .cf .cv { font-family:monospace; font-size:12px; color:var(--secondary-text-color); }
      .pv3 { border-radius:12px; padding:20px; margin-top:16px; border:1px solid var(--divider-color); }
      .pw { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
      .pwi { border-radius:8px; padding:12px; text-align:center; }
      .pwv { font-size:20px; font-weight:500; }
      .pwn { font-size:11px; margin-top:4px; }
      .sb { position:sticky; bottom:0; display:flex; justify-content:flex-end; gap:12px; padding:16px; background:var(--card-background-color); border-top:1px solid var(--divider-color); }
      .b { padding:10px 24px; border:1px solid var(--divider-color); border-radius:8px; background:none; color:var(--primary-text-color); font-size:14px; cursor:pointer; }
      .b.p { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
    `;
  }
  render() {
    if (!this._cfg) return html``;
    const v = this._cfg.vars || {};
    const cf = [["bg","Hintergrund"],["card-bg","Karten-BG"],["text-primary","Text primär"],["text-secondary","Text sekundär"],["accent","Akzent"],["positive","Positiv"],["warning","Warnung"],["negative","Negativ"],["info","Info"],["ticker-bg","Ticker BG"]];
    const sf = [["widget-gap","Abstand"],["widget-padding","Padding"],["widget-radius","Radius"],["ticker-height","Ticker Höhe"]];
    return html`
      <div class="sec"><h3>📝 Name & Basis</h3><div class="f"><input .value=${this._cfg.name || ""} @input=${(e) => this._cfg = { ...this._cfg, name: e.target.value }} placeholder="Mein Theme"></div><div class="f"><label>Hinweis</label><div style="font-size:13px;color:var(--secondary-text-color)">Dieses Theme wirkt auf Display, Screens, Widgets und Ticker zusammen. Screen-Styles können einzelne Werte zusätzlich überschreiben.</div></div></div>
      <div class="sec"><h3>🎨 Farben</h3><div class="cg">${cf.map(([k,l]) => html`<div class="cf"><input type="color" .value=${this._hex(v[k] || "#121212")} @input=${(e) => this._sv(k, e.target.value)}><span class="cl">${l}</span><span class="cv">${v[k] || ""}</span></div>`)}</div></div>
      <div class="sec"><h3>📐 Abstände</h3><div class="cg">${sf.map(([k,l]) => html`<div class="f"><label>${l}</label><input .value=${v[k] || ""} @input=${(e) => this._sv(k, e.target.value)} placeholder="8px"></div>`)}</div></div>
      <div class="sec"><h3>👁️ Vorschau</h3><div class="pv3" style="background:${v.bg || "#121212"}"><div class="pw"><div class="pwi" style="background:${v["card-bg"] || "#1E1E1E"}"><div class="pwv" style="color:${v["text-primary"] || "#FFF"}">21.5°C</div><div class="pwn" style="color:${v["text-secondary"] || "#999"}">Temp</div></div><div class="pwi" style="background:${v["card-bg"] || "#1E1E1E"}"><div class="pwv" style="color:${v.accent || "#2196F3"}">85%</div><div class="pwn" style="color:${v["text-secondary"] || "#999"}">Feuchte</div></div><div class="pwi" style="background:${v["card-bg"] || "#1E1E1E"}"><div class="pwv" style="color:${v.positive || "#4CAF50"}">ON</div><div class="pwn" style="color:${v["text-secondary"] || "#999"}">Status</div></div></div><div style="margin-top:12px;padding:8px;background:${v["ticker-bg"] || "rgba(255,255,255,.03)"};border-radius:6px;text-align:center;font-size:12px;color:${v["text-secondary"] || "#999"}">▶ Ticker</div></div></div>
      <div class="sb"><button class="b" @click=${() => this._e("back", {})}>Abbrechen</button><button class="b p" @click=${() => this._e("save", { id: this.themeId || `theme_${Date.now()}`, ...this._cfg })}>💾 Speichern</button></div>
    `;
  }
  _sv(k, v2) { const vs = { ...(this._cfg.vars || {}) }; vs[k] = v2; this._cfg = { ...this._cfg, vars: vs }; }
  _hex(c) { return c.startsWith("#") ? c.substring(0, 7) : "#121212"; }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-theme-editor", TdThemeEditor);

/* ══════════════════════════════════════════════════════════
   MEDIA MANAGERS
   ══════════════════════════════════════════════════════════ */

class TdSoundManager extends LitElement {
  static get properties() {
    return { hass: { type: Object }, sounds: { type: Array }, _playing: { type: String }, _dragOver: { type: Boolean } };
  }
  constructor() {
    super();
    this._playing = null;
    this._dragOver = false;
    this._audio = null;
  }
  static get styles() {
    return css`
      :host { display:block; padding:16px; }
      .hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
      .hdr h2 { margin:0; font-size:22px; }
      .ua { border:2px dashed var(--divider-color); border-radius:12px; padding:30px; text-align:center; margin-bottom:24px; transition:all .2s; cursor:pointer; color:var(--secondary-text-color); }
      .ua:hover,.ua.do { border-color:var(--primary-color); background:rgba(33,150,243,.05); color:var(--primary-color); }
      .ua input { display:none; }
      .ui { font-size:40px; margin-bottom:8px; }
      .cat { font-size:14px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; color:var(--secondary-text-color); margin:24px 0 12px; padding-bottom:8px; border-bottom:1px solid var(--divider-color); }
      .sg { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; }
      .sc { background:var(--card-background-color); border-radius:10px; padding:14px; display:flex; align-items:center; gap:12px; border:1px solid var(--divider-color); }
      .sc:hover { border-color:rgba(255,255,255,.15); }
      .pb { width:40px; height:40px; border-radius:50%; border:none; background:var(--primary-color); color:#fff; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:transform .1s; }
      .pb:hover { transform:scale(1.1); }
      .pb.pl { background:#F44336; }
      .si { flex:1; min-width:0; }
      .sn { font-weight:500; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .sm2 { font-size:12px; color:var(--secondary-text-color); margin-top:2px; }
      .sid { font-family:monospace; font-size:11px; color:var(--secondary-text-color); background:rgba(255,255,255,.05); padding:2px 8px; border-radius:4px; cursor:pointer; white-space:nowrap; }
      .sid:hover { background:rgba(255,255,255,.1); }
      .db { padding:6px; border:none; background:none; color:var(--secondary-text-color); cursor:pointer; font-size:16px; border-radius:6px; flex-shrink:0; }
      .db:hover { color:#F44336; background:rgba(244,67,54,.1); }
    `;
  }
  render() {
    const bi = (this.sounds || []).filter((s) => s.builtin);
    const cu = (this.sounds || []).filter((s) => !s.builtin);
    return html`
      <div class="hdr"><h2>🔊 Sound Manager</h2></div>
      <div class="ua ${this._dragOver ? "do" : ""}" @click=${() => this.shadowRoot.querySelector("#fi").click()} @dragover=${(e) => { e.preventDefault(); this._dragOver = true; }} @dragleave=${() => this._dragOver = false} @drop=${(e) => this._od(e)}>
        <div class="ui">📁</div><div>Klicken oder Datei hierher ziehen</div><div style="font-size:12px;margin-top:4px">MP3, WAV, OGG</div>
        <input id="fi" type="file" accept=".mp3,.wav,.ogg" @change=${(e) => this._of(e)}>
      </div>
      <div class="cat">Eingebaut (${bi.length})</div><div class="sg">${bi.map((s) => this._rs(s, false))}</div>
      ${cu.length > 0 ? html`<div class="cat">Benutzerdefiniert (${cu.length})</div><div class="sg">${cu.map((s) => this._rs(s, true))}</div>` : ""}
    `;
  }
  _rs(s, cd) {
    const kb = Math.round((s.size || 0) / 1024);
    return html`
      <div class="sc">
        <button class="pb ${this._playing === s.id ? "pl" : ""}" @click=${() => this._tp(s)}>${this._playing === s.id ? "⏹" : "▶"}</button>
        <div class="si"><div class="sn">${s.name}</div><div class="sm2">${s.category} · ${kb} KB</div></div>
        <span class="sid" @click=${async () => { try { await copyToClipboard(s.id); } catch (err) { console.error("Clipboard copy failed:", err); } }}>${s.id}</span>
        ${cd ? html`<button class="db" @click=${() => this._e("delete-sound", { soundId: s.id })}>🗑️</button>` : ""}
      </div>
    `;
  }
  _tp(s) {
    if (this._playing === s.id) {
      this._audio?.pause();
      this._audio = null;
      this._playing = null;
    } else {
      this._audio?.pause();
      this._audio = new Audio(s.url);
      this._audio.onended = () => (this._playing = null);
      this._audio.play().catch(() => {});
      this._playing = s.id;
    }
  }
  _of(e) { const f = e.target.files?.[0]; if (f) this._e("upload-sound", { file: f, name: f.name, category: "custom" }); e.target.value = ""; }
  _od(e) { e.preventDefault(); this._dragOver = false; const f = e.dataTransfer?.files?.[0]; if (f) this._e("upload-sound", { file: f, name: f.name, category: "custom" }); }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-sound-manager", TdSoundManager);

class TdFontManager extends LitElement {
  static get properties() {
    return { hass: { type: Object }, fonts: { type: Array }, _gs: { type: String }, _do: { type: Boolean } };
  }
  constructor() {
    super();
    this._gs = "";
    this._do = false;
  }
  static get styles() {
    return css`
      :host { display:block; padding:16px; }
      .hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
      .hdr h2 { margin:0; font-size:22px; }
      .ua { border:2px dashed var(--divider-color); border-radius:12px; padding:24px; text-align:center; margin-bottom:16px; cursor:pointer; color:var(--secondary-text-color); transition:all .2s; }
      .ua:hover,.ua.do { border-color:var(--primary-color); background:rgba(33,150,243,.05); }
      .ua input { display:none; }
      .gsec { background:var(--card-background-color); border-radius:12px; padding:16px; margin-bottom:24px; }
      .gsec h3 { margin:0 0 12px; font-size:15px; }
      .gi { display:flex; gap:8px; }
      .gi input { flex:1; padding:10px 12px; border:1px solid var(--divider-color); border-radius:8px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:14px; }
      .gi button { padding:10px 16px; border:none; border-radius:8px; background:var(--primary-color); color:#fff; font-size:14px; cursor:pointer; }
      .cat { font-size:14px; font-weight:600; text-transform:uppercase; color:var(--secondary-text-color); margin:24px 0 12px; padding-bottom:8px; border-bottom:1px solid var(--divider-color); }
      .fg { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }
      .fc { background:var(--card-background-color); border-radius:10px; padding:16px; border:1px solid var(--divider-color); }
      .fh { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
      .fn { font-weight:600; font-size:15px; }
      .fvr { font-size:12px; color:var(--secondary-text-color); }
      .fp { padding:12px; background:var(--primary-background-color); border-radius:8px; font-size:18px; line-height:1.4; }
      .fd { padding:6px; border:none; background:none; color:var(--secondary-text-color); cursor:pointer; font-size:16px; }
      .fd:hover { color:#F44336; }
    `;
  }
  render() {
    const bi = (this.fonts || []).filter((f) => f.builtin);
    const cu = (this.fonts || []).filter((f) => !f.builtin);
    return html`
      <div class="hdr"><h2>🔤 Font Manager</h2></div>
      <div class="ua ${this._do ? "do" : ""}" @click=${() => this.shadowRoot.querySelector("#ffi").click()} @dragover=${(e) => { e.preventDefault(); this._do = true; }} @dragleave=${() => this._do = false} @drop=${(e) => { e.preventDefault(); this._do = false; const f = e.dataTransfer?.files?.[0]; if (f) this._e("upload-font", { file: f }); }}>
        <div style="font-size:32px;margin-bottom:8px">📁</div><div>Font hochladen (.woff2, .ttf, .otf)</div>
        <input id="ffi" type="file" accept=".woff2,.ttf,.otf" @change=${(e) => { const f = e.target.files?.[0]; if (f) this._e("upload-font", { file: f }); e.target.value = ""; }}>
      </div>
      <div class="gsec"><h3>🔍 Google Font</h3><div class="gi"><input placeholder="z.B. Open Sans, Montserrat..." .value=${this._gs} @input=${(e) => this._gs = e.target.value}><button @click=${() => { if (this._gs.trim()) this._e("install-google-font", { fontName: this._gs.trim() }); this._gs = ""; }}>⬇️ Installieren</button></div></div>
      <div class="cat">Eingebaut (${bi.length})</div><div class="fg">${bi.map((f) => this._rf(f, false))}</div>
      ${cu.length > 0 ? html`<div class="cat">Benutzerdefiniert (${cu.length})</div><div class="fg">${cu.map((f) => this._rf(f, true))}</div>` : ""}
    `;
  }
  _rf(f, cd) {
    return html`
      <div class="fc">
        <div class="fh"><div><div class="fn">${f.name}</div><div class="fvr">${(f.variants || []).join(", ")}</div></div>${cd ? html`<button class="fd" @click=${() => this._e("delete-font", { fontId: f.id })}>🗑️</button>` : ""}</div>
        <div class="fp" style="font-family:'${f.name}',sans-serif">ABCDEFGHIJ abcdefghij 0123456789</div>
      </div>
    `;
  }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-font-manager", TdFontManager);

class TdImageManager extends LitElement {
  static get properties() {
    return { hass: { type: Object }, images: { type: Array }, _do: { type: Boolean } };
  }
  constructor() {
    super();
    this._do = false;
  }
  static get styles() {
    return css`
      :host { display:block; padding:16px; }
      .hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
      .hdr h2 { margin:0; font-size:22px; }
      .ua { border:2px dashed var(--divider-color); border-radius:12px; padding:30px; text-align:center; margin-bottom:24px; cursor:pointer; color:var(--secondary-text-color); transition:all .2s; }
      .ua:hover,.ua.do { border-color:var(--primary-color); background:rgba(33,150,243,.05); }
      .ua input { display:none; }
      .ig { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; }
      .ic { background:var(--card-background-color); border-radius:10px; overflow:hidden; border:1px solid var(--divider-color); transition:border-color .2s; }
      .ic:hover { border-color:rgba(255,255,255,.2); }
      .it { width:100%; aspect-ratio:16/10; object-fit:cover; display:block; background:#000; }
      .ii { padding:10px; display:flex; justify-content:space-between; align-items:center; }
      .in { font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
      .is { font-size:11px; color:var(--secondary-text-color); }
      .ia { display:flex; gap:4px; padding:0 10px 10px; }
      .ib2 { padding:4px 10px; border:1px solid var(--divider-color); border-radius:6px; background:none; color:var(--primary-text-color); font-size:12px; cursor:pointer; }
      .ib2:hover { background:rgba(255,255,255,.05); }
      .ib2.d { border-color:#F44336; color:#F44336; }
      .empty { text-align:center; padding:40px; color:var(--secondary-text-color); }
    `;
  }
  render() {
    return html`
      <div class="hdr"><h2>🖼️ Bild Manager</h2></div>
      <div class="ua ${this._do ? "do" : ""}" @click=${() => this.shadowRoot.querySelector("#imi").click()} @dragover=${(e) => { e.preventDefault(); this._do = true; }} @dragleave=${() => this._do = false} @drop=${(e) => { e.preventDefault(); this._do = false; const f = e.dataTransfer?.files?.[0]; if (f) this._e("upload-image", { file: f }); }}>
        <div style="font-size:40px;margin-bottom:8px">🖼️</div><div>Bild hochladen oder hierher ziehen</div><div style="font-size:12px;margin-top:4px">PNG, JPG, SVG, GIF, WebP</div>
        <input id="imi" type="file" accept=".png,.jpg,.jpeg,.svg,.gif,.webp" @change=${(e) => { const f = e.target.files?.[0]; if (f) this._e("upload-image", { file: f }); e.target.value = ""; }}>
      </div>
      ${(this.images || []).length === 0 ? html`<div class="empty">Noch keine Bilder</div>` : html`
        <div class="ig">
          ${(this.images || []).map((img) => {
            const kb = Math.round((img.size || 0) / 1024);
            return html`
              <div class="ic">
                <img class="it" src=${img.url} alt=${img.filename} loading="lazy">
                <div class="ii"><span class="in" title=${img.filename}>${img.filename}</span><span class="is">${kb} KB</span></div>
                <div class="ia">
                  <button class="ib2" @click=${async () => { try { await copyToClipboard(img.url); } catch (err) { console.error("Clipboard copy failed:", err); } }}>📋 URL</button>
                  <button class="ib2 d" @click=${() => this._e("delete-image", { imageId: img.id })}>🗑️</button>
                </div>
              </div>
            `;
          })}
        </div>
      `}
    `;
  }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-image-manager", TdImageManager);

/* ══════════════════════════════════════════════════════════
   GLOBAL SETTINGS
   ══════════════════════════════════════════════════════════ */

class TdGlobalSettings extends LitElement {
  static get properties() {
    return { hass: { type: Object }, settings: { type: Object }, sounds: { type: Array }, fonts: { type: Array }, _ed: { type: Object } };
  }
  updated(c) {
    if (c.has("settings") && this.settings) this._ed = deepClone(this.settings);
  }
  static get styles() {
    return css`
      :host { display:block; padding:16px; max-width:700px; margin:0 auto; }
      .sec { background:var(--card-background-color); border-radius:12px; padding:20px; margin-bottom:16px; }
      .sec h3 { margin:0 0 16px; font-size:16px; }
      .f { margin-bottom:14px; }
      .f label { display:block; font-size:13px; color:var(--secondary-text-color); margin-bottom:6px; }
      .f select,.f input { width:100%; padding:10px 12px; border:1px solid var(--divider-color); border-radius:8px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:14px; }
      .br { display:flex; gap:12px; flex-wrap:wrap; }
      .b { padding:10px 20px; border:1px solid var(--divider-color); border-radius:8px; background:none; color:var(--primary-text-color); font-size:14px; cursor:pointer; }
      .b:hover { background:rgba(255,255,255,.05); }
      .b.p { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
      .fi { display:none; }
    `;
  }
  render() {
    if (!this._ed) return html``;
    return html`
      <div class="sec">
        <h3>⚙️ Standardwerte</h3>
        <div class="f"><label>Standard-Theme</label><select .value=${this._ed.default_theme || "dark"} @change=${(e) => this._ed = { ...this._ed, default_theme: e.target.value }}>
          <option value="dark">🌙 Dark</option><option value="light">☀️ Light</option><option value="high-contrast">🔲 High Contrast</option><option value="night">🌃 Nacht</option>
        </select></div>
        <div class="f"><label>Standard-Übergang</label><select .value=${this._ed.default_transition || "fade"} @change=${(e) => this._ed = { ...this._ed, default_transition: e.target.value }}>
          <option value="fade">Fade</option><option value="slide">Slide</option><option value="flip">Flip</option><option value="zoom">Zoom</option><option value="none">Kein</option>
        </select></div>
        <div class="f"><label>Screen-Dauer (s)</label><input type="number" min="3" max="300" .value=${this._ed.default_screen_duration || 15} @change=${(e) => this._ed = { ...this._ed, default_screen_duration: +e.target.value }}></div>
        <div class="f"><label>Standard-Kameraquelle</label><select .value=${this._ed.default_camera_source || "auto"} @change=${(e) => this._ed = { ...this._ed, default_camera_source: e.target.value }}>${TD_CAMERA_SOURCES.map(([v,l]) => html`<option value=${v}>${l}</option>`)}</select></div>
        <div class="f"><label>Standard-Chart-Zeitraum (h)</label><input type="number" min="1" max="168" .value=${this._ed.default_chart_hours || 24} @change=${(e) => this._ed = { ...this._ed, default_chart_hours: +e.target.value }}></div>
        <div class="f"><label>Standard-Hintergrundfarbe</label><input .value=${this._ed.default_background_color || "#121212"} @input=${(e) => this._ed = { ...this._ed, default_background_color: e.target.value }}></div>
        <div class="f"><label>Widget-Transparenz</label><input type="range" min="0" max="1" step="0.05" .value=${this._ed.default_widget_opacity ?? 0.75} @input=${(e) => this._ed = { ...this._ed, default_widget_opacity: +e.target.value }}></div>
        <div class="f"><label>Widget-Blur</label><input type="range" min="0" max="20" step="1" .value=${this._ed.default_widget_blur || 0} @input=${(e) => this._ed = { ...this._ed, default_widget_blur: +e.target.value }}></div>
        <div class="f"><label>Widget-Radius</label><input type="range" min="0" max="32" step="2" .value=${this._ed.default_widget_radius || 12} @input=${(e) => this._ed = { ...this._ed, default_widget_radius: +e.target.value }}></div>
        <button class="b p" @click=${() => this._e("save-settings", this._ed)}>💾 Speichern</button>
      </div>

      <div class="sec">
        <h3>💾 Backup</h3>
        <p style="font-size:13px;color:var(--secondary-text-color);margin:0 0 16px">Sichert Konfigurationen, Vorlagen, Themes. Keine Mediendateien.</p>
        <div class="br">
          <button class="b" @click=${() => this._e("create-backup", {})}>📥 Herunterladen</button>
          <button class="b" @click=${() => this.shadowRoot.querySelector("#ri").click()}>📤 Wiederherstellen</button>
          <input id="ri" class="fi" type="file" accept=".json" @change=${(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => { const d = safeJsonParse(ev.target.result, null); if (d && confirm("Alle Einstellungen überschreiben?")) this._e("restore-backup", { data: d }); else alert("Ungültige Datei"); }; r.readAsText(f); e.target.value = ""; }}>
        </div>
      </div>

      <div class="sec"><h3>ℹ️ Info</h3><p style="font-size:13px;color:var(--secondary-text-color);margin:0">Ticker Display v1.0.2+<br>Sounds: ${(this.sounds || []).length}<br>Fonts: ${(this.fonts || []).length}</p></div>
    `;
  }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-global-settings", TdGlobalSettings);

/* ══════════════════════════════════════════════════════════
   MAIN PANEL
   ══════════════════════════════════════════════════════════ */

class TickerDisplayPanel extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      narrow: { type: Boolean },
      panel: { type: Object },
      _page: { type: String },
      _tab: { type: String },
      _libraryTab: { type: String },
      _mediaTab: { type: String },
      _devId: { type: String },
      _scrIdx: { type: Number },
      _tplId: { type: String },
      _alertId: { type: String },
      _themeId: { type: String },
      _devices: { type: Array },
      _templates: { type: Object },
      _alertTemplates: { type: Object },
      _customThemes: { type: Object },
      _sounds: { type: Array },
      _fonts: { type: Array },
      _images: { type: Array },
      _haMediaImages: { type: Array },
      _haMediaAudio: { type: Array },
      _globalSettings: { type: Object },
      _loading: { type: Boolean },
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
    await this._load();
  }

  async _get(p) {
    const r = await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${this.hass.auth.data.access_token}` } });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async _post(p, d) {
    const r = await fetch(`${API}${p}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.hass.auth.data.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(d),
    });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async _del(p) {
    return (await fetch(`${API}${p}`, { method: "DELETE", headers: { Authorization: `Bearer ${this.hass.auth.data.access_token}` } })).json();
  }
  async _upload(p, file) {
    const fd = new FormData();
    fd.append("file", file);
    return (await fetch(`${API}${p}`, { method: "POST", headers: { Authorization: `Bearer ${this.hass.auth.data.access_token}` }, body: fd })).json();
  }

  async _load() {
    this._loading = true;
    try {
      const [dv, tp, al, th, so, fo, im, haim, haau, gs] = await Promise.all([
        this._get("/api/config/devices"),
        this._get("/api/config/templates"),
        this._get("/api/config/alerts"),
        this._get("/api/config/themes"),
        this._get("/api/media/sounds"),
        this._get("/api/media/fonts"),
        this._get("/api/media/images"),
        this._get("/api/ha-media/items?kind=image").catch(() => []),
        this._get("/api/ha-media/items?kind=audio").catch(() => []),
        this._get("/api/config/global"),
      ]);
      this._devices = dv;
      this._templates = tp;
      this._alertTemplates = al;
      this._customThemes = th;
      this._sounds = so;
      this._fonts = fo;
      this._images = im;
      this._haMediaImages = haim;
      this._haMediaAudio = haau;
      this._globalSettings = gs;
    } catch (e) {
      console.error(e);
    }
    this._loading = false;
  }

  static get styles() {
    return css`
      :host { display:block; height:100vh; background:var(--primary-background-color); color:var(--primary-text-color); --td-accent:var(--primary-color,#2196f3); }
      .top { display:flex; align-items:center; height:56px; padding:0 16px; background:var(--app-header-background-color,#1e1e1e); color:var(--app-header-text-color,#fff); box-shadow:0 2px 4px rgba(0,0,0,.2); z-index:10; position:relative; }
      .top .t { font-size:20px; font-weight:500; margin-left:12px; flex:1; }
      .top .bb { cursor:pointer; opacity:.8; font-size:24px; padding:8px; border-radius:50%; border:none; background:none; color:inherit; }
      .top .bb:hover { opacity:1; background:rgba(255,255,255,.1); }
      .tabs { display:flex; background:var(--card-background-color,#1e1e1e); border-bottom:1px solid var(--divider-color); overflow-x:auto; scrollbar-width:none; }
      .tabs::-webkit-scrollbar { display:none; }
      .tab { padding:12px 20px; font-size:13px; font-weight:500; text-transform:uppercase; letter-spacing:.5px; cursor:pointer; white-space:nowrap; border-bottom:2px solid transparent; color:var(--secondary-text-color); transition:all .2s; background:none; border-top:none; border-left:none; border-right:none; }
      .tab:hover { color:var(--primary-text-color); background:rgba(255,255,255,.03); }
      .tab.a { color:var(--td-accent); border-bottom-color:var(--td-accent); }
      .cnt { height:calc(100vh - 56px - 48px); overflow-y:auto; }
      .cnt.nt { height:calc(100vh - 56px); }
      .ld { display:flex; align-items:center; justify-content:center; height:200px; color:var(--secondary-text-color); }
      .wrap { padding:16px; }
      .hero { display:grid; grid-template-columns:2fr 1fr; gap:16px; margin-bottom:16px; }
      .card { background:var(--card-background-color,#1e1e1e); border-radius:16px; padding:18px; box-shadow:var(--ha-card-box-shadow,0 2px 6px rgba(0,0,0,.15)); }
      .card h3 { margin:0 0 10px; font-size:18px; }
      .muted { color:var(--secondary-text-color); font-size:13px; }
      .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:16px; }
      .stat { background:var(--card-background-color,#1e1e1e); border-radius:14px; padding:16px; }
      .stat .v { font-size:28px; font-weight:600; margin-top:6px; }
      .qa, .subtabs { display:flex; gap:8px; flex-wrap:wrap; }
      .chip { padding:8px 12px; border-radius:999px; border:1px solid var(--divider-color); background:none; color:var(--primary-text-color); cursor:pointer; }
      .chip.a { background:rgba(33,150,243,.12); border-color:var(--td-accent); color:var(--td-accent); }
      .list { display:grid; gap:10px; }
      .rowcard { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:12px 14px; border:1px solid var(--divider-color); border-radius:12px; background:rgba(255,255,255,.02); }
      .rowcard .title { font-weight:600; }
      .rowcard .meta { color:var(--secondary-text-color); font-size:12px; }
      .cta { display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; }
      .btn { padding:10px 14px; border-radius:10px; border:1px solid var(--divider-color); background:none; color:var(--primary-text-color); cursor:pointer; }
      .btn.p { background:var(--td-accent); border-color:var(--td-accent); color:#fff; }
      @media (max-width: 900px) { .hero { grid-template-columns:1fr; } }
      .sp { width:40px; height:40px; border:3px solid rgba(255,255,255,.1); border-top-color:var(--td-accent); border-radius:50%; animation:spin .8s linear infinite; }
      @keyframes spin { to { transform:rotate(360deg); } }
    `;
  }

  render() {
    if (this._loading) {
      return html`<div class="top"><span class="t">📱 Ticker Display</span></div><div class="ld"><div class="sp"></div></div>`;
    }
    switch (this._page) {
      case "device-editor": return this._rdEdit();
      case "screen-editor": return this._rsEdit();
      case "template-editor": return this._rtEdit();
      case "alert-editor": return this._raEdit();
      case "theme-editor": return this._rthEdit();
      default: return this._rMain();
    }
  }

  _rMain() {
    const tabs = [
      { id: "overview", l: "✨ Studio" },
      { id: "devices", l: "📱 Geräte" },
      { id: "library", l: "🧱 Bibliothek" },
      { id: "media", l: "🖼️ Medien" },
      { id: "settings", l: "⚙️ Einstellungen" },
    ];
    return html`
      <div class="top"><span class="t">📱 Ticker Display Studio</span></div>
      <div class="tabs">${tabs.map((t) => html`<button class="tab ${this._tab === t.id ? "a" : ""}" @click=${() => this._tab = t.id}>${t.l}</button>`)}</div>
      <div class="cnt">${this._tabContent()}</div>
      <td-toast></td-toast>
      <td-confirm></td-confirm>
    `;
  }

  _stats() {
    const online = this._devices.filter((d) => d.online).length;
    const screens = this._devices.reduce((sum, d) => sum + (d.screens?.length || 0), 0);
    const widgets = this._devices.reduce((sum, d) => sum + (d.screens || []).reduce((a, s) => a + (s.widgets?.length || 0), 0), 0);
    return {
      devices: this._devices.length,
      online,
      screens,
      widgets,
      templates: Object.keys(this._templates || {}).length,
      alerts: Object.keys(this._alertTemplates || {}).length,
      themes: Object.keys(this._customThemes || {}).length,
      media: (this._images?.length || 0) + (this._sounds?.length || 0) + (this._fonts?.length || 0),
    };
  }

  _renderOverview() {
    const stats = this._stats();
    const recommendations = [];
    if (!stats.devices) recommendations.push("Registriere zuerst ein Tablet oder Smartphone mit der App.");
    if (!stats.templates) recommendations.push("Lege 2–3 Vorlagen an, damit neue Screens schneller entstehen.");
    if (!stats.themes) recommendations.push("Ein eigenes Theme lohnt sich für Corporate Colors und Lesbarkeit.");
    if (!stats.media) recommendations.push("Bilder, Sounds und Fonts zentral hochladen, damit Widgets konsistent bleiben.");
    return html`
      <div class="wrap">
        <div class="hero">
          <div class="card">
            <h3>Modernisiertes Studio</h3>
            <div class="muted">Die Oberfläche ist jetzt stärker nach Arbeitsbereichen geordnet: Geräte für den laufenden Betrieb, Bibliothek für wiederverwendbare Bausteine, Medien für Assets und Einstellungen für globale Defaults.</div>
            <div class="cta">
              <button class="btn p" @click=${() => this._tab = "devices"}>Geräte verwalten</button>
              <button class="btn" @click=${() => { this._tab = "library"; this._libraryTab = "templates"; }}>Vorlagen öffnen</button>
              <button class="btn" @click=${() => { this._tab = "settings"; }}>Defaults anpassen</button>
            </div>
          </div>
          <div class="card">
            <h3>Schnellstart</h3>
            <div class="list">
              <div class="rowcard"><div><div class="title">Wetter-/Kamera-/Chart-Presets</div><div class="meta">Direkt im Geräte-Editor als Startlayout anlegbar</div></div></div>
              <div class="rowcard"><div><div class="title">Globale Widget-Defaults</div><div class="meta">Transparenz, Blur, Radius, Kameraquelle, Chart-Zeitraum</div></div></div>
              <div class="rowcard"><div><div class="title">Bibliothek statt verstreuter Register</div><div class="meta">Vorlagen, Alerts und Themes zusammengeführt</div></div></div>
            </div>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><div class="muted">Geräte</div><div class="v">${stats.devices}</div></div>
          <div class="stat"><div class="muted">Online</div><div class="v">${stats.online}</div></div>
          <div class="stat"><div class="muted">Screens</div><div class="v">${stats.screens}</div></div>
          <div class="stat"><div class="muted">Widgets</div><div class="v">${stats.widgets}</div></div>
          <div class="stat"><div class="muted">Vorlagen</div><div class="v">${stats.templates}</div></div>
          <div class="stat"><div class="muted">Medien</div><div class="v">${stats.media}</div></div>
        </div>
        <div class="hero">
          <div class="card">
            <h3>Geräte im Überblick</h3>
            <div class="list">
              ${this._devices.slice(0, 5).map((d) => html`<div class="rowcard"><div><div class="title">${d.name || d.id}</div><div class="meta">${d.model || "Unbekannt"} · ${(d.screens?.length || 0)} Screens · ${d.online ? "Online" : "Offline"}</div></div><button class="btn" @click=${() => this._openDev(d.id)}>Öffnen</button></div>`)}
              ${!this._devices.length ? html`<div class="muted">Noch keine Geräte vorhanden.</div>` : ""}
            </div>
          </div>
          <div class="card">
            <h3>Empfehlungen</h3>
            <div class="list">
              ${recommendations.length ? recommendations.map((r) => html`<div class="rowcard"><div class="meta">${r}</div></div>`) : html`<div class="rowcard"><div class="meta">Die Grundstruktur sieht gut aus. Als Nächstes würde ich die Bibliothek auf Vorlagen + Themes standardisieren und pro Gerät nur noch Screens pflegen.</div></div>`}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderLibrary() {
    return html`
      <div class="wrap">
        <div class="subtabs">
          <button class="chip ${this._libraryTab === "templates" ? "a" : ""}" @click=${() => this._libraryTab = "templates"}>📋 Vorlagen</button>
          <button class="chip ${this._libraryTab === "alerts" ? "a" : ""}" @click=${() => this._libraryTab = "alerts"}>🔔 Alerts</button>
          <button class="chip ${this._libraryTab === "themes" ? "a" : ""}" @click=${() => this._libraryTab = "themes"}>🎨 Themes</button>
        </div>
        <div style="margin-top:16px">${this._renderLibraryInner()}</div>
      </div>
    `;
  }

  _renderLibraryInner() {
    switch (this._libraryTab) {
      case "alerts":
        return html`<td-alert-list .hass=${this.hass} .alertTemplates=${this._alertTemplates} .sounds=${this._sounds}
          @create-alert=${() => { this._alertId = null; this._page = "alert-editor"; }}
          @edit-alert=${(e) => { this._alertId = e.detail.alertId; this._page = "alert-editor"; }}
          @delete-alert=${async (e) => { if (await this._confirm("Alert löschen", `Alert ${e.detail.alertId} wirklich löschen?`)) { await this._del(`/api/config/alert/${e.detail.alertId}`); await this._load(); } }}
        ></td-alert-list>`;
      case "themes":
        return html`<td-theme-list .hass=${this.hass} .customThemes=${this._customThemes}
          @create-theme=${() => { this._themeId = null; this._page = "theme-editor"; }}
          @edit-theme=${(e) => { this._themeId = e.detail.themeId; this._page = "theme-editor"; }}
          @delete-theme=${async (e) => { if (await this._confirm("Theme löschen", `Theme ${e.detail.themeId} wirklich löschen?`)) { await this._del(`/api/config/theme/${e.detail.themeId}`); await this._load(); } }}
        ></td-theme-list>`;
      default:
        return html`<td-template-gallery .hass=${this.hass} .templates=${this._templates} .devices=${this._devices}
          @create-template=${() => { this._tplId = null; this._page = "template-editor"; }}
          @edit-template=${(e) => { this._tplId = e.detail.templateId; this._page = "template-editor"; }}
          @export-template=${async (e) => {
            try {
              await copyToClipboard(JSON.stringify(this._templates[e.detail.templateId], null, 2));
              this._toast("📋 Kopiert");
            } catch (err) {
              console.error("Clipboard copy failed:", err);
              this._toast("❌ Kopieren fehlgeschlagen");
            }
          }}
          @delete-template=${async (e) => { if (await this._confirm("Vorlage löschen", `Vorlage ${e.detail.templateId} wirklich löschen?`)) { await this._del(`/api/config/template/${e.detail.templateId}`); await this._load(); } }}
          @import-template=${async (e) => {
            try {
              const t = JSON.parse(e.detail.json);
              t.id = `imported_${Date.now()}`;
              await this._post("/api/config/template", t);
              await this._load();
              this._toast("📥 Importiert");
            } catch {
              this._toast("❌ Ungültiges JSON");
            }
          }}
        ></td-template-gallery>`;
    }
  }

  _renderMedia() {
    return html`
      <div class="wrap">
        <div class="subtabs">
          <button class="chip ${this._mediaTab === "images" ? "a" : ""}" @click=${() => this._mediaTab = "images"}>🖼️ Bilder</button>
          <button class="chip ${this._mediaTab === "sounds" ? "a" : ""}" @click=${() => this._mediaTab = "sounds"}>🔊 Sounds</button>
          <button class="chip ${this._mediaTab === "fonts" ? "a" : ""}" @click=${() => this._mediaTab = "fonts"}>🔤 Fonts</button>
        </div>
        <div style="margin-top:16px">${this._renderMediaInner()}</div>
      </div>
    `;
  }

  _renderMediaInner() {
    switch (this._mediaTab) {
      case "sounds":
        return html`<td-sound-manager .hass=${this.hass} .sounds=${this._sounds}
          @upload-sound=${async (e) => { await this._upload("/api/media/sound/upload", e.detail.file); await this._load(); this._toast("🔊 Hochgeladen"); }}
          @delete-sound=${async (e) => { await this._del(`/api/media/sound/${e.detail.soundId}`); await this._load(); }}
        ></td-sound-manager>`;
      case "fonts":
        return html`<td-font-manager .hass=${this.hass} .fonts=${this._fonts}
          @upload-font=${async (e) => { await this._upload("/api/media/font/upload", e.detail.file); await this._load(); this._toast("🔤 Hochgeladen"); }}
          @delete-font=${async (e) => { await this._del(`/api/media/font/${e.detail.fontId}`); await this._load(); }}
          @install-google-font=${(e) => this._toast(`ℹ️ Google Font Install noch nicht serverseitig umgesetzt: ${e.detail.fontName}`)}
        ></td-font-manager>`;
      default:
        return html`<td-image-manager .hass=${this.hass} .images=${this._images}
          @upload-image=${async (e) => { await this._upload("/api/media/image/upload", e.detail.file); await this._load(); this._toast("🖼️ Hochgeladen"); }}
          @delete-image=${async (e) => { await this._del(`/api/media/image/${e.detail.imageId}`); await this._load(); }}
        ></td-image-manager>`;
    }
  }

  _tabContent() {
    switch (this._tab) {
      case "overview":
        return this._renderOverview();
      case "devices":
        return html`
          <td-device-list .hass=${this.hass} .devices=${this._devices}
            @edit-device=${(e) => this._openDev(e.detail.deviceId)}
            @preview-device=${(e) => window.open(`${API}/preview/${e.detail.deviceId}`, "_blank")}
            @reload-device=${(e) => this.hass.callService("ticker_display", "reload_page", { device: e.detail.deviceId })}
            @identify-device=${(e) => this.hass.callService("ticker_display", "identify_device", { device: e.detail.deviceId })}
            @delete-device=${async (e) => { if (await this._confirm("Gerät löschen", `Gerät ${e.detail.deviceId} wirklich löschen?`)) { await this._del(`/api/device/${e.detail.deviceId}`); await this._load(); } }}
            @refresh=${() => this._load()}
          ></td-device-list>
        `;
      case "library":
        return this._renderLibrary();
      case "media":
        return this._renderMedia();
      case "settings":
        return html`
          <td-global-settings .hass=${this.hass} .settings=${this._globalSettings} .sounds=${this._sounds} .fonts=${this._fonts}
            @save-settings=${async (e) => { await this._post("/api/config/global", e.detail); await this._load(); this._toast("✅ Gespeichert"); }}
            @create-backup=${async () => { const b = await this._post("/api/config/backup", {}); downloadJson(`ticker-backup-${new Date().toISOString().slice(0,10)}.json`, b); this._toast("💾 Heruntergeladen"); }}
            @restore-backup=${async (e) => { await this._post("/api/config/restore", e.detail.data); await this._load(); this._toast("✅ Wiederhergestellt"); }}
          ></td-global-settings>
        `;
      default:
        return html`<div class="ld">?</div>`;
    }
  }

  _rdEdit() {
    const d = this._devices.find((d) => d.id === this._devId);
    return html`
      <div class="top"><button class="bb" @click=${() => this._page = "main"}>←</button><span class="t">📱 ${d?.name || this._devId}</span></div>
      <div class="cnt nt">
        <td-device-editor .hass=${this.hass} .device=${d} .sounds=${this._sounds} .fonts=${this._fonts} .templates=${this._templates}
          .globalSettings=${this._globalSettings}
          @save=${async (e) => { await this._post(`/api/config/device/${this._devId}`, e.detail); await this._load(); this._toast("✅ Gespeichert"); }}
          @edit-screen=${(e) => { this._scrIdx = e.detail.screenIndex; this._page = "screen-editor"; }}
          @add-screen=${async () => {
            if (!d) return;
            const ns = tdCreateScreenPreset("blank", d.screens?.length || 0, this._globalSettings);
            await this._post(`/api/config/device/${this._devId}`, { ...d, screens:[...(d.screens || []), ns] });
            await this._load();
            this._scrIdx = d.screens?.length || 0;
            this._page = "screen-editor";
          }}
          @add-screen-preset=${async (e) => {
            if (!d) return;
            const ns = tdCreateScreenPreset(e.detail.preset || "blank", d.screens?.length || 0, this._globalSettings);
            await this._post(`/api/config/device/${this._devId}`, { ...d, screens:[...(d.screens || []), ns] });
            await this._load();
            this._scrIdx = d.screens?.length || 0;
            this._page = "screen-editor";
          }}
          @delete-screen=${async (e) => {
            const sc = [...(d.screens || [])];
            sc.splice(e.detail.screenIndex, 1);
            await this._post(`/api/config/device/${this._devId}`, { ...d, screens: sc });
            await this._load();
          }}
          @save-screen-as-template=${async (e) => {
            const sc = d?.screens?.[e.detail.screenIndex];
            if (!sc) return;
            await this._post(`/api/config/template`, { templateId: `template_${Date.now()}`, name: e.detail.name || sc.name || 'Screen Vorlage', category: 'custom', screen_config: deepClone(sc) });
            await this._load();
            this._toast("📚 Als Vorlage gespeichert");
          }}
          @back=${() => this._page = "main"}
        ></td-device-editor>
      </div>
    `;
  }

  _rsEdit() {
    const d = this._devices.find((d) => d.id === this._devId);
    const sc = d?.screens?.[this._scrIdx] || { type:"dashboard", widgets:[], grid:{columns:3,rows:2} };
    return html`
      <td-screen-editor .hass=${this.hass} .deviceId=${this._devId} .screenIndex=${this._scrIdx} .screenConfig=${sc} .fonts=${this._fonts} .sounds=${this._sounds} .templates=${this._templates}
        .images=${this._images}
        .haImages=${this._haMediaImages}
        .globalSettings=${this._globalSettings}
        @save=${async (e) => {
          const scr = [...(d.screens || [])];
          scr[this._scrIdx] = e.detail.screenConfig;
          await this._post(`/api/config/device/${this._devId}`, { ...d, screens: scr });
          await this._load();
          this._toast("✅ Screen gespeichert");
        }}
        @save-as-template=${async (e) => {
          await this._post("/api/config/template", { id:`template_${Date.now()}`, name:e.detail.name, category:"custom", screen_config:e.detail.screenConfig, variables:[] });
          await this._load();
          this._toast("📋 Vorlage gespeichert");
        }}
        @back=${() => this._page = "device-editor"}
      ></td-screen-editor>
    `;
  }

  _rtEdit() {
    const t = this._tplId ? this._templates[this._tplId] : null;
    return html`
      <td-template-editor .hass=${this.hass} .template=${t} .templateId=${this._tplId} .fonts=${this._fonts}
        @save=${async (e) => { await this._post("/api/config/template", e.detail); await this._load(); this._page = "main"; this._toast("✅ Vorlage gespeichert"); }}
        @back=${() => this._page = "main"}
      ></td-template-editor>
    `;
  }

  _raEdit() {
    const a = this._alertId ? this._alertTemplates[this._alertId] : null;
    return html`
      <div class="top"><button class="bb" @click=${() => this._page = "main"}>←</button><span class="t">🔔 Alert ${a ? "bearbeiten" : "erstellen"}</span></div>
      <div class="cnt nt">
        <td-alert-editor .hass=${this.hass} .alert=${a} .alertId=${this._alertId} .sounds=${this._sounds} .haAudio=${this._haMediaAudio}
          @save=${async (e) => { await this._post("/api/config/alert", e.detail); await this._load(); this._page = "main"; this._toast("✅ Alert gespeichert"); }}
          @back=${() => this._page = "main"}
        ></td-alert-editor>
      </div>
    `;
  }

  _rthEdit() {
    const t = this._themeId ? this._customThemes[this._themeId] : null;
    return html`
      <div class="top"><button class="bb" @click=${() => this._page = "main"}>←</button><span class="t">🎨 Theme ${t ? "bearbeiten" : "erstellen"}</span></div>
      <div class="cnt nt">
        <td-theme-editor .hass=${this.hass} .theme=${t} .themeId=${this._themeId} .fonts=${this._fonts}
          @save=${async (e) => { await this._post("/api/config/theme", e.detail); await this._load(); this._page = "main"; this._toast("✅ Theme gespeichert"); }}
          @back=${() => this._page = "main"}
        ></td-theme-editor>
      </div>
    `;
  }

  async _confirm(title, message) {
    const d = this.shadowRoot.querySelector("td-confirm");
    return d ? d.show(title, message) : confirm(message);
  }

  _openDev(id) { this._devId = id; this._page = "device-editor"; }
  _toast(m) { const t = this.shadowRoot.querySelector("td-toast"); if (t) t.show(m); }
}
customElements.define("ticker-display-panel", TickerDisplayPanel);
