/**
 * Ticker Display Panel - Enhanced Admin UI
 * Improved entity pickers, clipboard handling, editor UX, media tools, and stability.
 * Drop-in replacement for frontend/dist/ticker-display-panel.js
 */

import { LitElement, html, css } from "https://unpkg.com/lit@2.8.0/index.js?module";

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

/* ----------------------------------------------------------
   SHARED: TOAST NOTIFICATION
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   SHARED: CONFIRM DIALOG
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   SHARED: ENTITY PICKER
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   SHARED: ICON PICKER
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   SHARED: COLOR PICKER
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   SHARED: FONT PICKER
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   SHARED: SOUND PICKER
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   DEVICE LIST
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   DEVICE EDITOR
   ---------------------------------------------------------- */

class TdDeviceEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      device: { type: Object },
      sounds: { type: Array },
      fonts: { type: Array },
      templates: { type: Object },
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
        <p style="font-size:13px;color:var(--secondary-text-color);margin:0 0 16px">Reihenfolge per Drag & Drop ändern.</p>
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
        <button class="addb" @click=${() => this._e("add-screen", {})}>➕ Screen hinzufügen</button>
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

/* ----------------------------------------------------------
   SCREEN EDITOR
   ---------------------------------------------------------- */

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
      _cfg: { type: Object },
      _sel: { type: Number },
      _prev: { type: String },
      _grid: { type: Boolean },
      _undo: { type: Array },
      _redo: { type: Array },
      _dwt: { type: String },
      _pt: { type: Number },
      _palSearch: { type: String },
      _tpl: { type: String },
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
    this._palSearch = "";
    this._tpl = "";
    this._pointerCleanup = null;
  }
  updated(c) {
    if (c.has("screenConfig") && this.screenConfig) this._cfg = deepClone(this.screenConfig);
  }

  static get styles() {
    return css`
      :host { display:grid; grid-template-columns:280px 1fr 380px; grid-template-rows:72px 1fr; height:100vh; overflow:hidden; background:radial-gradient(circle at top left, rgba(77,171,247,.12), transparent 28%), radial-gradient(circle at top right, rgba(147,51,234,.12), transparent 26%), linear-gradient(180deg, rgba(255,255,255,.025), rgba(255,255,255,0)); }
      .tb { grid-column:1/-1; display:flex; align-items:center; gap:10px; padding:0 16px; background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02)), var(--app-header-background-color,#151822); border-bottom:1px solid rgba(255,255,255,.08); overflow-x:auto; box-shadow:0 18px 42px rgba(0,0,0,.24); backdrop-filter:blur(18px); }
      .tb button { padding:6px 12px; border:1px solid var(--divider-color); border-radius:6px; background:none; color:var(--primary-text-color); font-size:13px; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:4px; }
      .tb button:hover { background:rgba(255,255,255,.05); }
      .tb button.p { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
      .tb button:disabled { opacity:.3; cursor:not-allowed; }
      .tb input { padding:6px 10px; border:1px solid var(--divider-color); border-radius:6px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:13px; width:160px; }
      .tb select { padding:6px 8px; border:1px solid var(--divider-color); border-radius:6px; background:var(--primary-background-color); color:var(--primary-text-color); font-size:13px; }
      .tb .sp { flex:1; }
      .tb .lb { font-size:12px; color:var(--secondary-text-color); white-space:nowrap; }
      .pal { overflow-y:auto; padding:14px; border-right:1px solid rgba(255,255,255,.08); background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0)), var(--sidebar-background-color,#0f1118); }
      .pc { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--secondary-text-color); padding:12px 8px 6px; }
      .pi { display:flex; align-items:center; gap:8px; padding:8px 10px; margin:2px 0; border-radius:8px; cursor:grab; font-size:13px; color:var(--primary-text-color); transition:background .15s; }
      .pi:hover { background:rgba(255,255,255,.06); }
      .pi:active { cursor:grabbing; opacity:.6; }
      .pi .pp { font-size:18px; opacity:.7; width:22px; text-align:center; }
      .pva { display:flex; align-items:center; justify-content:center; background:#0a0a0a; padding:20px; overflow:hidden; }
      .pf { background:linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.015)), #0f1118; border-radius:22px; box-shadow:0 18px 60px rgba(0,0,0,.5); display:flex; flex-direction:column; overflow:hidden; position:relative; border:1px solid rgba(255,255,255,.08); }
      .pf.l { width:min(100%,720px); aspect-ratio:16/10; }
      .pf.p { height:min(100%,520px); aspect-ratio:10/16; }
      .pg { display:grid; gap:6px; padding:6px; flex:1; min-height:0; }
      .ptk { height:28px; background:rgba(255,255,255,.03); border-top:1px solid rgba(255,255,255,.05); display:flex; align-items:center; padding:0 10px; font-size:11px; color:rgba(255,255,255,.3); flex-shrink:0; }
      .gc { border:1px dashed transparent; border-radius:6px; transition:all .15s; min-height:40px; }
      .gc.sg { border-color:rgba(255,255,255,.06); }
      .gc.do { border-color:var(--primary-color); background:rgba(33,150,243,.08); }
      .wb {
        background:linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.04)); border-radius:18px; padding:10px; display:flex; flex-direction:column;
        align-items:center; justify-content:center; cursor:pointer; position:relative; overflow:hidden; border:2px solid transparent; transition:border-color .15s;
      }
      .wb:hover { border-color:rgba(255,255,255,.15); }
      .wb.sel { border-color:var(--primary-color); }
      .wb .wi { font-size:20px; opacity:.5; }
      .wb .wv { font-size:22px; font-weight:500; color:#fff; margin:2px 0; }
      .wb .wn { font-size:10px; color:rgba(255,255,255,.5); text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }
      .props { overflow-y:auto; padding:18px; border-left:1px solid rgba(255,255,255,.08); background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0)), var(--sidebar-background-color,#0f1118); }
      .pe { display:flex; flex-direction:column; align-items:center; justify-content:center; height:200px; color:var(--secondary-text-color); text-align:center; font-size:14px; gap:8px; }
      .ptabs { display:flex; border-bottom:1px solid var(--divider-color); margin-bottom:12px; }
      .ptab { flex:1; padding:8px 4px; text-align:center; font-size:12px; font-weight:500; cursor:pointer; border-bottom:2px solid transparent; color:var(--secondary-text-color); background:none; border-top:none; border-left:none; border-right:none; }
      .ptab.a { color:var(--primary-color); border-bottom-color:var(--primary-color); }
      .pg4 { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--secondary-text-color); margin:0 0 8px; }
      .pf2 { margin-bottom:10px; }
      .pf2 label { display:block; font-size:12px; color:var(--secondary-text-color); margin-bottom:4px; }
      .pf2 input,.pf2 select {
        width:100%; padding:9px 11px; border:1px solid rgba(255,255,255,.08); border-radius:10px;
        background:color-mix(in srgb, var(--primary-background-color) 80%, rgba(255,255,255,.04)); color:var(--primary-text-color); font-size:13px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
      }
      .pf2 input[type=color] { height:36px; padding:2px; cursor:pointer; }
      .delb { width:100%; padding:10px; border:1px solid #F44336; border-radius:8px; background:none; color:#F44336; cursor:pointer; font-size:13px; margin-top:16px; }
      .delb:hover { background:rgba(244,67,54,.1); }
      textarea {
        width:100%; font-family:monospace; font-size:12px; background:var(--primary-background-color); color:var(--primary-text-color);
        border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:10px; resize:vertical;
      }
      .hint { font-size:11px; color:var(--secondary-text-color); margin-top:4px; line-height:1.35; }
      .sec { padding:12px; border-radius:16px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.025); margin-bottom:14px; }
      .wb { user-select:none; }
      .wb .wh { position:absolute; inset:0 auto auto 0; padding:4px 6px; font-size:11px; color:rgba(255,255,255,.7); cursor:grab; background:rgba(0,0,0,.22); border-bottom-right-radius:10px; }
      .wb .wr { position:absolute; right:6px; bottom:6px; width:14px; height:14px; border-right:2px solid rgba(255,255,255,.65); border-bottom:2px solid rgba(255,255,255,.65); cursor:nwse-resize; opacity:.7; }
      .wb .wz { position:absolute; top:6px; right:8px; font-size:10px; color:rgba(255,255,255,.55); padding:2px 6px; border-radius:999px; background:rgba(255,255,255,.08); }
      .wb .wvb { position:absolute; left:8px; bottom:8px; font-size:10px; color:#ffd7a6; padding:2px 6px; border-radius:999px; background:rgba(92,53,0,.45); }
      .tpgrid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .miniBtn { padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.04); color:var(--primary-text-color); cursor:pointer; font-size:12px; }
      .miniBtn:hover { background:rgba(255,255,255,.08); }
      .row2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    `;
  }

  render() {
    if (!this._cfg) return html``;
    return html`${this._toolbar()}${this._palette()}${this._preview()}${this._properties()}`;
  }

  _toolbar() {
    return html`
      <div class="tb">
        <button @click=${() => this._e("back", {})}>← Zurück</button>
        <input .value=${this._cfg.name || ""} placeholder="Screen Name" @input=${(e) => (this._cfg = { ...this._cfg, name: e.target.value })}>
        <span class="lb">Grid:</span>
        <select .value=${String(this._cfg.grid?.columns || 3)} @change=${(e) => this._sg("columns", +e.target.value)}>${[1,2,3,4,5].map((n) => html`<option value=${n}>${n}</option>`)}</select>
        <span>×</span>
        <select .value=${String(this._cfg.grid?.rows || 2)} @change=${(e) => this._sg("rows", +e.target.value)}>${[1,2,3,4].map((n) => html`<option value=${n}>${n}</option>`)}</select>
        <button @click=${() => this._grid = !this._grid}>${this._grid ? "▦" : "▢"}</button>
        <button @click=${() => this._cfg = { ...this._cfg, backgroundColor: "#0f172a", backgroundImage: "", backgroundSize: "cover" }}>🌑 Dark</button>
        <button @click=${() => this._cfg = { ...this._cfg, backgroundColor: "#08121d", backgroundImage: "linear-gradient(135deg, rgba(77,171,247,.22), rgba(147,51,234,.18))", backgroundSize: "cover" }}>✨ Premium</button>
        <div class="sp"></div>
        <button ?disabled=${!this._undo.length} @click=${() => this._doUndo()}>↩</button>
        <button ?disabled=${!this._redo.length} @click=${() => this._doRedo()}>↪</button>
        <button @click=${() => this._prev = this._prev === "landscape" ? "portrait" : "landscape"}>${this._prev === "landscape" ? "🖥" : "📱"}</button>
        <select .value=${String(this._cfg.duration || 15)} @change=${(e) => this._cfg = { ...this._cfg, duration: +e.target.value }}>${[5,10,15,20,30,60].map((n) => html`<option value=${n}>${n}s</option>`)}</select>
        <button @click=${() => window.open(`/ticker-display/preview/${this.deviceId}`, "_blank")}>👁️</button>
        <select .value=${this._tpl || ""} @change=${(e) => this._tpl = e.target.value}>
          <option value="">Vorlage laden…</option>
          <option value="weather_station">Wetter</option>
          <option value="energy_dashboard">Energie</option>
          <option value="camera_wall">Kamera</option>
          <option value="room_status">Raumstatus</option>
        </select>
        <button @click=${() => this._applyBuiltInTemplate(this._tpl)} ?disabled=${!this._tpl}>⚡ Anwenden</button>
        <button @click=${() => {
          const n = prompt("Vorlagenname:", this._cfg.name || "Vorlage");
          if (n) this._e("save-as-template", { name: n, screenConfig: this._cfg });
        }}>📋</button>
        <button class="p" @click=${() => this._e("save", { screenConfig: this._cfg })}>💾 Speichern</button>
      </div>
    `;
  }

  _palette() {
    const cats = [
      { n: "Werte", items: [
        { t: "simple-value", i: "🔢", l: "Wert" },
        { t: "gauge", i: "🎯", l: "Gauge" },
        { t: "progress-bar", i: "📊", l: "Fortschritt" },
        { t: "status-dot", i: "🔵", l: "Status" },
        { t: "trend-arrow", i: "📈", l: "Trend" },
        { t: "icon-value", i: "ℹ️", l: "Icon+Wert" },
      ]},
      { n: "Graphen", items: [
        { t: "mini-graph", i: "📉", l: "Mini Graph" },
        { t: "bar-chart", i: "📊", l: "Balken" },
        { t: "sparkline", i: "〰️", l: "Sparkline" },
        { t: "area-chart", i: "🌊", l: "Area" },
        { t: "multi-line-chart", i: "📈", l: "Multi Line" },
        { t: "stacked-bar-chart", i: "🧱", l: "Stacked Bar" },
        { t: "horizontal-bar-chart", i: "↔️", l: "Horizontal Bar" },
        { t: "donut-chart", i: "🍩", l: "Donut" },
        { t: "pie-chart", i: "🥧", l: "Pie" },
        { t: "radar-chart", i: "🕸️", l: "Radar" },
        { t: "heatmap-mini", i: "🟧", l: "Heatmap" },
        { t: "timeline-chart", i: "🕒", l: "Timeline" },
        { t: "scatter-chart", i: "✳️", l: "Scatter" },
        { t: "forecast-chart", i: "☁️", l: "Forecast" },
        { t: "energy-flow-mini", i: "⚡", l: "Energy Flow" },
        { t: "comparison-chart", i: "⚖️", l: "Comparison" },
        { t: "radial-gauge-advanced", i: "🎯", l: "Radial Gauge" },
        { t: "bullet-chart", i: "🎚️", l: "Bullet" },
      ]},
      { n: "Media", items: [
        { t: "camera", i: "📹", l: "Kamera" },
        { t: "image", i: "🖼️", l: "Bild" },
      ]},
      { n: "Info", items: [
        { t: "clock", i: "🕐", l: "Uhr" },
        { t: "weather", i: "🌤️", l: "Wetter" },
        { t: "countdown", i: "⏱️", l: "Countdown" },
      ]},
      { n: "Sonstige", items: [
        { t: "color-block", i: "🟦", l: "Farbblock" },
        { t: "button", i: "🔘", l: "Button" },
      ]},
    ];

    const q = (this._palSearch || "").toLowerCase().trim();
    const filtered = cats.map((c) => ({ ...c, items: c.items.filter((it) => !q || `${it.t} ${it.l}`.toLowerCase().includes(q)) })).filter((c) => c.items.length);
    return html`
      <div class="pal">
        <div class="pf2"><label>Widget suchen</label><input .value=${this._palSearch || ""} placeholder="z. B. Kamera, Donut, Gauge" @input=${(e) => this._palSearch = e.target.value}></div>
        ${filtered.map((c) => html`
          <div class="pc">${c.n}</div>
          ${c.items.map((it) => html`
            <div class="pi" draggable="true"
              @dragstart=${(e) => { this._dwt = it.t; e.dataTransfer.setData("text/plain", it.t); e.dataTransfer.effectAllowed = "copy"; }}
              @dragend=${() => this._dwt = null}
            >
              <span class="pp">${it.i}</span>${it.l}
            </div>
          `)}
        `)}
      </div>
    `;
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
    const ti = { "simple-value": "🔢", gauge: "🎯", "progress-bar": "📊", "status-dot": "🔵", camera: "📹", clock: "🕐", weather: "🌤️", "mini-graph": "📉", image: "🖼️" };

    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i];
      const st = this.hass?.states?.[w.entity_id];
      const v = st?.state || "—";
      const u = st?.attributes?.unit_of_measurement || "";
      const nm = w.name || st?.attributes?.friendly_name || w.type || "";
      els.push(html`
        <div class="wb ${this._sel === i ? "sel" : ""}" style="grid-column:${(w.col || 0) + 1}/span ${w.colspan || 1};grid-row:${(w.row || 0) + 1}/span ${w.rowspan || 1};z-index:${w.zIndex || i + 1}"
          @click=${() => this._sel = i} draggable="true"
          @dragstart=${(e) => { e.dataTransfer.setData("widget-index", String(i)); e.dataTransfer.effectAllowed = "move"; }}
        >
          <span class="wh" @mousedown=${(e) => this._startDragWidget(e, i)}>✥</span>
          <span class="wz">z ${w.zIndex || i + 1}</span>
          ${w.visibilityEntity || w.visibleWhen ? html`<span class="wvb">👁 Regel</span>` : ""}
          <span class="wi">${ti[w.type] || "📊"}</span>
          <span class="wv">${v}${u ? ` ${u}` : ""}</span>
          <span class="wn">${nm}</span>
          <span class="wr" @mousedown=${(e) => this._startResizeWidget(e, i)}></span>
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

    return html`
      <div class="pva">
        <div class="pf ${this._prev === "landscape" ? "l" : "p"}" style=${`background:${this._cfg.backgroundColor || "#0f1118"};background-image:${this._cfg.backgroundImage ? `url(${this._cfg.backgroundImage})` : "none"};background-size:${this._cfg.backgroundSize || "cover"};position:relative;overflow:hidden;`}>
          <div style=${`position:absolute;inset:0;background:${this._cfg.overlayColor || "transparent"};opacity:${this._cfg.overlayOpacity ?? 0};pointer-events:none;`}></div>
          <div class="pg" style=${`grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);gap:${this._cfg.widgetSpacing ?? 10}px;padding:${this._cfg.widgetSpacing ?? 10}px;position:relative;z-index:1;`}>${els}</div>
          <div class="ptk">▶ Ticker-Leiste</div>
        </div>
      </div>
    `;
  }

  _properties() {
    if (this._sel < 0 || !this._cfg.widgets?.[this._sel]) {
      return html`<div class="props">
        <div class="sec"><div class="pg4">Screen Style</div>
        <div class="pf2"><label>Hintergrundfarbe</label><input .value=${this._cfg.backgroundColor || "#121212"} @input=${(e) => this._cfg = { ...this._cfg, backgroundColor: e.target.value }}></div>
        <div class="pf2"><label>Hintergrundbild URL</label><input .value=${this._cfg.backgroundImage || ""} placeholder="/ticker-display/media/images/dein-bild.png" @input=${(e) => this._cfg = { ...this._cfg, backgroundImage: e.target.value }}></div>
        <div class="pf2"><label>Bildgröße</label><select .value=${this._cfg.backgroundSize || "cover"} @change=${(e) => this._cfg = { ...this._cfg, backgroundSize: e.target.value }}><option value="cover">cover</option><option value="contain">contain</option><option value="auto">auto</option></select></div>
        <div class="pf2"><label>Overlay-Farbe</label><input .value=${this._cfg.overlayColor || "rgba(0,0,0,.0)"} @input=${(e) => this._cfg = { ...this._cfg, overlayColor: e.target.value }}></div>
        <div class="pf2"><label>Overlay-Opacity: ${this._cfg.overlayOpacity ?? 0}</label><input type="range" min="0" max="1" step="0.05" .value=${this._cfg.overlayOpacity ?? 0} @input=${(e) => this._cfg = { ...this._cfg, overlayOpacity: +e.target.value }}></div>
        <div class="pf2"><label>Widget-Abstand</label><input type="number" min="0" max="40" .value=${this._cfg.widgetSpacing ?? 10} @change=${(e) => this._cfg = { ...this._cfg, widgetSpacing: +e.target.value }}></div>
        <div class="pf2"><label>Transition</label><select .value=${this._cfg.transition || "fade"} @change=${(e) => this._cfg = { ...this._cfg, transition: e.target.value }}><option value="fade">fade</option><option value="slide-left">slide-left</option><option value="slide-right">slide-right</option><option value="zoom">zoom</option></select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="pf2"><label>Spalten</label><input type="number" min="1" max="8" .value=${this._cfg.grid?.columns || 3} @change=${(e) => this._cfg = { ...this._cfg, grid: { ...(this._cfg.grid || {}), columns: +e.target.value } }}></div><div class="pf2"><label>Zeilen</label><input type="number" min="1" max="6" .value=${this._cfg.grid?.rows || 2} @change=${(e) => this._cfg = { ...this._cfg, grid: { ...(this._cfg.grid || {}), rows: +e.target.value } }}></div></div>
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
      { v: "mini-graph", l: "Mini Graph" },
      { v: "camera", l: "Kamera" },
      { v: "clock", l: "Uhr" },
      { v: "weather", l: "Wetter" },
      { v: "image", l: "Bild" },
      { v: "color-block", l: "Farbblock" },
      { v: "countdown", l: "Countdown" },
      { v: "button", l: "Button" },
      { v: "area-chart", l: "Area Chart" },
      { v: "multi-line-chart", l: "Multi Line Chart" },
      { v: "stacked-bar-chart", l: "Stacked Bar Chart" },
      { v: "horizontal-bar-chart", l: "Horizontal Bar Chart" },
      { v: "donut-chart", l: "Donut Chart" },
      { v: "pie-chart", l: "Pie Chart" },
      { v: "radar-chart", l: "Radar Chart" },
      { v: "heatmap-mini", l: "Heatmap Mini" },
      { v: "timeline-chart", l: "Timeline Chart" },
      { v: "scatter-chart", l: "Scatter Chart" },
      { v: "forecast-chart", l: "Forecast Chart" },
      { v: "energy-flow-mini", l: "Energy Flow Mini" },
      { v: "comparison-chart", l: "Comparison Chart" },
      { v: "radial-gauge-advanced", l: "Radial Gauge Advanced" },
      { v: "bullet-chart", l: "Bullet Chart" },
    ];

    return html`
      <div class="props">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <strong style="font-size:15px">Widget</strong>
          <div style="display:flex;gap:8px"><button class="ib" style="font-size:14px" @click=${() => this._dupW()}>⧉</button><button class="ib" style="font-size:14px" @click=${() => this._delW()}>🗑️</button></div>
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
          <div class="pf2"><label>Name</label><input .value=${w.name || ""} placeholder="Auto" @input=${(e) => this._uw("name", e.target.value)}></div>
          <div class="pf2">
            <td-icon-picker .value=${w.icon || ""} label="Icon" @value-changed=${(e) => this._uw("icon", e.detail.value)}></td-icon-picker>
          </div>
          <div class="pg4">Position & Größe</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="pf2"><label>Spalte</label><input type="number" min="0" .value=${w.col || 0} @change=${(e) => this._uw("col", +e.target.value)}></div>
            <div class="pf2"><label>Zeile</label><input type="number" min="0" .value=${w.row || 0} @change=${(e) => this._uw("row", +e.target.value)}></div>
            <div class="pf2"><label>Breite</label><input type="number" min="1" .value=${w.colspan || 1} @change=${(e) => this._uw("colspan", +e.target.value)}></div>
            <div class="pf2"><label>Höhe</label><input type="number" min="1" .value=${w.rowspan || 1} @change=${(e) => this._uw("rowspan", +e.target.value)}></div>
          </div>
          <div class="pf2"><label>Schnell verschieben</label><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px"><button class="ib" @click=${() => this._moveSel(0,-1)}>↑</button><button class="ib" @click=${() => this._moveSel(-1,0)}>←</button><button class="ib" @click=${() => this._moveSel(1,0)}>→</button><button class="ib" @click=${() => this._moveSel(0,1)}>↓</button></div></div>
          ${w.type === "gauge" ? html`
            <div class="pg4">Gauge</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div class="pf2"><label>Min</label><input type="number" .value=${w.config?.min || 0} @change=${(e) => this._uwc("min", +e.target.value)}></div>
              <div class="pf2"><label>Max</label><input type="number" .value=${w.config?.max || 100} @change=${(e) => this._uwc("max", +e.target.value)}></div>
            </div>
          ` : ""}
          ${w.type === "camera" ? html`
            <div class="pg4">Kamera</div>
            <div class="pf2"><label>Refresh (s)</label><input type="number" min="1" .value=${w.config?.refresh_interval || 5} @change=${(e) => this._uwc("refresh_interval", +e.target.value)}></div>
            <div class="pf2"><label>Kamera-Quelle</label><select .value=${w.config?.camera_source || "auto"} @change=${(e) => this._uwc("camera_source", e.target.value)}><option value="auto">Auto</option><option value="snapshot">Snapshot</option><option value="entity_picture">entity_picture</option><option value="camera_proxy">camera_proxy</option><option value="stream">Stream Snapshot</option></select></div>
          ` : ""}
          ${w.type === "image" ? html`
            <div class="pg4">Bild</div>
            <div class="pf2"><label>Bild-URL</label><input .value=${w.imageUrl || ""} placeholder="/ticker-display/media/images/xyz.png" @input=${(e) => this._uw("imageUrl", e.target.value)}></div>
          ` : ""}
          ${["mini-graph","sparkline","bar-chart","area-chart","multi-line-chart","stacked-bar-chart","horizontal-bar-chart","donut-chart","pie-chart","radar-chart","heatmap-mini","timeline-chart","scatter-chart","forecast-chart","energy-flow-mini","comparison-chart","bullet-chart"].includes(w.type) ? html`
            <div class="pg4">Chart</div>
            <div class="pf2"><label>Weitere Entities (kommagetrennt)</label><input .value=${(w.config?.entities || w.entities || []).join(", ")} placeholder="sensor.a, sensor.b" @change=${(e) => { const vals = e.target.value.split(",").map(v => v.trim()).filter(Boolean); this._uwc("entities", vals); this._uw("entities", vals); }}></div>
            <div class="pf2"><label>Zeitraum (Stunden)</label><input type="number" min="1" max="168" .value=${w.config?.hours || 24} @change=${(e) => this._uwc("hours", +e.target.value)}></div>
          ` : ""}

        ${w.type === "energy-flow-mini" ? html`
          <div class="sec"><div class="pg4">Energy Flow</div>
          <div class="pf2"><td-entity-picker .hass=${this.hass} .value=${w.config?.solar_entity || ""} label="PV Entity" @value-changed=${(e) => this._uwc("solar_entity", e.detail.value)}></td-entity-picker></div>
          <div class="pf2"><td-entity-picker .hass=${this.hass} .value=${w.config?.battery_entity || ""} label="Akku Entity" @value-changed=${(e) => this._uwc("battery_entity", e.detail.value)}></td-entity-picker></div>
          <div class="pf2"><td-entity-picker .hass=${this.hass} .value=${w.config?.grid_entity || ""} label="Netz Entity" @value-changed=${(e) => this._uwc("grid_entity", e.detail.value)}></td-entity-picker></div>
          <div class="pf2"><td-entity-picker .hass=${this.hass} .value=${w.config?.load_entity || ""} label="Haus/Load Entity" @value-changed=${(e) => this._uwc("load_entity", e.detail.value)}></td-entity-picker></div></div>
        ` : ""}

        ${w.type === "bullet-chart" ? html`
          <div class="sec"><div class="pg4">Bullet</div>
          <div class="pf2"><label>Zielwert</label><input type="number" .value=${w.config?.target ?? 100} @change=${(e) => this._uwc("target", +e.target.value)}></div>
          <div class="pf2"><td-entity-picker .hass=${this.hass} .value=${w.config?.target_entity || ""} label="Optional Ziel-Entity" @value-changed=${(e) => this._uwc("target_entity", e.detail.value)}></td-entity-picker></div>
          <div class="pf2"><label>Maximum</label><input type="number" .value=${w.config?.max ?? 100} @change=${(e) => this._uwc("max", +e.target.value)}></div>
          <div class="pf2"><label>Schwelle niedrig</label><input type="number" .value=${w.config?.threshold_low ?? 40} @change=${(e) => this._uwc("threshold_low", +e.target.value)}></div>
          <div class="pf2"><label>Schwelle mittel</label><input type="number" .value=${w.config?.threshold_mid ?? 70} @change=${(e) => this._uwc("threshold_mid", +e.target.value)}></div></div>
        ` : ""}

        ${w.type === "comparison-chart" ? html`
          <div class="sec"><div class="pg4">Vergleich</div>
          <div class="pf2"><td-entity-picker .hass=${this.hass} .value=${w.config?.comparison_entity || ""} label="Vergleichs-Entity" @value-changed=${(e) => this._uwc("comparison_entity", e.detail.value)}></td-entity-picker><div class="hint">Beispiel: heute vs gestern, Netz heute vs gestern, etc.</div></div></div>
        ` : ""}
        ` : ""}

          <div class="pg4">Aktion</div>
          <div class="pf2"><label>Tap-Action</label><select .value=${w.tapAction || "none"} @change=${(e) => this._uw("tapAction", e.target.value)}><option value="none">Keine</option><option value="navigate">Navigation</option><option value="url">URL öffnen</option><option value="service">Home Assistant Service</option></select></div>
          ${(w.tapAction || "none") === "navigate" ? html`<div class="pf2"><label>Pfad</label><input .value=${w.navigationPath || ""} placeholder="/lovelace/0" @input=${(e) => this._uw("navigationPath", e.target.value)}></div>` : ""}
          ${(w.tapAction || "none") === "url" ? html`<div class="pf2"><label>URL</label><input .value=${w.url || ""} placeholder="https://..." @input=${(e) => this._uw("url", e.target.value)}></div><div class="pf2"><label><input type="checkbox" .checked=${w.openInNewTab !== false} @change=${(e) => this._uw("openInNewTab", e.target.checked)}> In neuem Tab öffnen</label></div>` : ""}
          ${(w.tapAction || "none") === "service" ? html`<div class="pf2"><label>Service</label><input .value=${w.service || ""} placeholder="light.turn_on" @input=${(e) => this._uw("service", e.target.value)}></div><div class="pf2"><label>Service JSON</label><textarea rows="4" .value=${w.serviceData || "{}"} @input=${(e) => this._uw("serviceData", e.target.value)}></textarea></div>` : ""}

        ${this._pt === 1 ? html`
          <div class="sec"><div class="pg4">Darstellung</div>
          <div class="pf2"><td-font-picker .value=${w.font || ""} .fonts=${this.fonts || []} label="Schriftart" @value-changed=${(e) => this._uw("font", e.detail.value)}></td-font-picker></div>
          <div class="pf2"><label>Schriftgröße: ${w.fontSize || 28}px</label><input type="range" min="12" max="72" step="2" .value=${w.fontSize || 28} @input=${(e) => this._uw("fontSize", +e.target.value)}></div>
          <div class="pf2"><td-color-picker .value=${w.textColor || "#FFFFFF"} label="Textfarbe" @value-changed=${(e) => this._uw("textColor", e.detail.value)}></td-color-picker></div>
          <div class="pf2"><td-color-picker .value=${w.bgColor || "#1E1E1E"} label="Hintergrundfarbe" @value-changed=${(e) => this._uw("bgColor", e.detail.value)}></td-color-picker></div>
          <div class="pf2"><label>Ecken-Radius: ${w.borderRadius || 12}px</label><input type="range" min="0" max="32" step="2" .value=${w.borderRadius || 12} @input=${(e) => this._uw("borderRadius", +e.target.value)}></div>
          <div class="pf2"><label>Transparenz: ${Math.round((w.opacity ?? 1) * 100)}%</label><input type="range" min="0" max="1" step="0.05" .value=${w.opacity ?? 1} @input=${(e) => this._uw("opacity", +e.target.value)}></div>
          <div class="pf2"><label>Blur: ${w.blur || 0}px</label><input type="range" min="0" max="24" step="1" .value=${w.blur || 0} @input=${(e) => this._uw("blur", +e.target.value)}></div>
          <div class="pf2"><label>Rahmenfarbe</label><input .value=${w.borderColor || "rgba(255,255,255,.06)"} @input=${(e) => this._uw("borderColor", e.target.value)}></div>
          <div class="pf2"><label>Box-Shadow</label><input .value=${w.boxShadow || "0 10px 24px rgba(0,0,0,.18)"} @input=${(e) => this._uw("boxShadow", e.target.value)}></div>
          <div class="pf2"><label>Style-Preset</label><select @change=${(e) => { const v = e.target.value; if (v === "glass") { this._uw("bgColor", "rgba(18,24,32,.38)"); this._uw("opacity", .72); this._uw("blur", 10); this._uw("borderRadius", 18); } if (v === "solid") { this._uw("bgColor", "#1E1E1E"); this._uw("opacity", 1); this._uw("blur", 0); this._uw("borderRadius", 12); } if (v === "accent") { this._uw("bgColor", "rgba(77,171,247,.18)"); this._uw("opacity", .95); this._uw("blur", 6); this._uw("borderRadius", 20); } e.target.value = ""; }}><option value="">- wählen -</option><option value="glass">Glass</option><option value="solid">Solid</option><option value="accent">Accent</option></select></div>
        </div>
        ` : ""}

        ${this._pt === 2 ? html`
          <div class="sec"><div class="pg4">Erweitert</div>
          <div class="sec"><div class="pg4">Layout & Ebene</div>
          <div class="row2">
            <div class="pf2"><label>Breite (Spalten)</label><input type="number" min="1" max="8" .value=${w.colspan || 1} @change=${(e) => this._uw("colspan", +e.target.value)}></div>
            <div class="pf2"><label>Höhe (Zeilen)</label><input type="number" min="1" max="6" .value=${w.rowspan || 1} @change=${(e) => this._uw("rowspan", +e.target.value)}></div>
          </div>
          <div class="row2">
            <div class="pf2"><label>Ebene / Z-Index</label><input type="number" min="1" max="99" .value=${w.zIndex || this._sel + 1} @change=${(e) => this._uw("zIndex", +e.target.value)}></div>
            <div class="pf2"><label>CSS Klasse</label><input .value=${w.className || ""} placeholder="z. B. highlight-card" @input=${(e) => this._uw("className", e.target.value)}></div>
          </div>
          <div class="tpgrid">
            <button class="miniBtn" @click=${() => this._bringToFront()}>Nach vorne</button>
            <button class="miniBtn" @click=${() => this._sendToBack()}>Nach hinten</button>
          </div></div>
          <div class="sec"><div class="pg4">Sichtbarkeit</div>
          <div class="pf2"><td-entity-picker .hass=${this.hass} .value=${w.visibilityEntity || ""} label="Regel-Entity" @value-changed=${(e) => this._uw("visibilityEntity", e.detail.value)}></td-entity-picker></div>
          <div class="row2">
            <div class="pf2"><label>Operator</label><select .value=${w.visibilityOperator || "eq"} @change=${(e) => this._uw("visibilityOperator", e.target.value)}><option value="eq">gleich</option><option value="neq">ungleich</option><option value="gt">größer</option><option value="gte">größer/gleich</option><option value="lt">kleiner</option><option value="lte">kleiner/gleich</option><option value="contains">enthält</option><option value="truthy">ist aktiv</option><option value="falsy">ist inaktiv</option></select></div>
            <div class="pf2"><label>Vergleichswert</label><input .value=${w.visibilityValue || w.visibleWhen || ""} placeholder="on, home, 50 ..." @input=${(e) => { this._uw("visibilityValue", e.target.value); this._uw("visibleWhen", e.target.value); }}></div>
          </div>
          <div class="hint">Für komplexere Regeln kannst du eine andere Entity als die Haupt-Entity des Widgets verwenden.</div></div>
          <div class="sec"><div class="pg4">Aktion Builder</div>
          ${(w.tapAction || "none") === "service" ? html`<div class="row2"><div class="pf2"><label>Domain</label><input .value=${w.serviceDomain || ""} placeholder="light" @input=${(e) => this._syncServiceField("serviceDomain", e.target.value)}></div><div class="pf2"><label>Service</label><input .value=${w.serviceName || ""} placeholder="turn_on" @input=${(e) => this._syncServiceField("serviceName", e.target.value)}></div></div><div class="pf2"><td-entity-picker .hass=${this.hass} .value=${w.serviceTargetEntity || ""} label="Target Entity" @value-changed=${(e) => this._syncServiceField("serviceTargetEntity", e.detail.value)}></td-entity-picker></div>` : ""}
          <div class="hint">Bei Service-Aktionen werden Domain und Service automatisch zu <code>domain.service</code> kombiniert.</div></div>
          <div class="pf2"><label>Benutzerdefiniertes CSS</label><textarea rows="4" .value=${w.customCss || ""} @input=${(e) => this._uw("customCss", e.target.value)} placeholder="box-shadow: 0 0 10px #2196F3;"></textarea></div>
          <div class="pf2"><label>Widget JSON</label><textarea rows="8" .value=${JSON.stringify(w, null, 2)} @change=${(e) => {
            const parsed = safeJsonParse(e.target.value, null);
            if (parsed) {
              const ws = [...(this._cfg.widgets || [])];
              ws[this._sel] = parsed;
              this._cfg = { ...this._cfg, widgets: ws };
            }
          }}></textarea></div>
          <div class="pf2"><label>Legacy visibleWhen</label><input .value=${w.visibleWhen || ""} placeholder="optional" @input=${(e) => this._uw("visibleWhen", e.target.value)}><div class="hint">Kompatibilitätsfeld. Bevorzugt wird oben die neue Regel-Konfiguration.</div></div>
          <button class="delb" @click=${() => this._delW()}>🗑️ Widget löschen</button>
        </div>
        ` : ""}
      </div>
    `;
  }


  _gridMetrics() {
    const cols = this._cfg.grid?.columns || 3;
    const rows = this._cfg.grid?.rows || 2;
    const frame = this.renderRoot?.querySelector('.pf');
    const grid = this.renderRoot?.querySelector('.pg');
    if (!frame || !grid) return null;
    const fr = frame.getBoundingClientRect();
    const gr = grid.getBoundingClientRect();
    return { cols, rows, cellW: gr.width / cols, cellH: gr.height / rows, left: gr.left, top: gr.top };
  }

  _attachPointerSession(onMove, onEnd) {
    if (this._pointerCleanup) this._pointerCleanup();
    const mm = (ev) => onMove(ev);
    const mu = (ev) => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
      this._pointerCleanup = null;
      if (onEnd) onEnd(ev);
    };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    this._pointerCleanup = () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
      this._pointerCleanup = null;
    };
  }

  _startDragWidget(e, idx) {
    e.preventDefault();
    e.stopPropagation();
    this._sel = idx;
    const m = this._gridMetrics();
    if (!m) return;
    const start = deepClone(this._cfg.widgets[idx]);
    this._push();
    this._attachPointerSession((ev) => {
      const col = Math.max(0, Math.min(m.cols - (start.colspan || 1), Math.floor((ev.clientX - m.left) / m.cellW)));
      const row = Math.max(0, Math.min(m.rows - (start.rowspan || 1), Math.floor((ev.clientY - m.top) / m.cellH)));
      const ws = [...(this._cfg.widgets || [])];
      ws[idx] = { ...ws[idx], col, row };
      this._cfg = { ...this._cfg, widgets: ws };
    });
  }

  _startResizeWidget(e, idx) {
    e.preventDefault();
    e.stopPropagation();
    this._sel = idx;
    const m = this._gridMetrics();
    if (!m) return;
    const start = deepClone(this._cfg.widgets[idx]);
    this._push();
    this._attachPointerSession((ev) => {
      const spanX = Math.max(1, Math.min(m.cols - (start.col || 0), Math.ceil((ev.clientX - m.left) / m.cellW) - (start.col || 0)));
      const spanY = Math.max(1, Math.min(m.rows - (start.row || 0), Math.ceil((ev.clientY - m.top) / m.cellH) - (start.row || 0)));
      const ws = [...(this._cfg.widgets || [])];
      ws[idx] = { ...ws[idx], colspan: spanX, rowspan: spanY };
      this._cfg = { ...this._cfg, widgets: ws };
    });
  }

  _bringToFront() {
    if (this._sel < 0) return;
    const maxZ = Math.max(...(this._cfg.widgets || []).map((w, i) => w.zIndex || i + 1), 1);
    this._uw('zIndex', maxZ + 1);
  }

  _sendToBack() {
    if (this._sel < 0) return;
    const minZ = Math.min(...(this._cfg.widgets || []).map((w, i) => w.zIndex || i + 1), 1);
    this._uw('zIndex', Math.max(1, minZ - 1));
  }

  _syncServiceField(key, value) {
    if (this._sel < 0) return;
    const w = this._cfg.widgets[this._sel];
    const next = { ...w, [key]: value };
    const domain = key === 'serviceDomain' ? value : (next.serviceDomain || '');
    const name = key === 'serviceName' ? value : (next.serviceName || '');
    if (domain && name) next.service = `${domain}.${name}`;
    const target = key === 'serviceTargetEntity' ? value : (next.serviceTargetEntity || '');
    if (target) {
      let data = safeJsonParse(next.serviceData || '{}', {});
      if (typeof data !== 'object' || Array.isArray(data) || !data) data = {};
      data.entity_id = target;
      next.serviceData = JSON.stringify(data, null, 2);
    }
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    ws[this._sel] = next;
    this._cfg = { ...this._cfg, widgets: ws };
  }

  _applyBuiltInTemplate(name) {
    if (!name) return;
    const mk = (type, col, row, extra = {}) => ({ id: `w_${Date.now()}_${Math.random().toString(16).slice(2,8)}`, type, col, row, colspan: 1, rowspan: 1, entity_id: '', name: '', icon: '', config: {}, ...extra });
    const base = { ...this._cfg, widgets: [], grid: { columns: 3, rows: 2 }, widgetSpacing: 10 };
    if (name === 'weather_station') {
      base.name = 'Wetter Übersicht';
      base.widgets = [mk('weather',0,0,{colspan:2}), mk('forecast-chart',2,0,{entity_id:'weather.home'}), mk('clock',0,1), mk('simple-value',1,1,{name:'Außen Temp'}), mk('area-chart',2,1,{name:'Temperatur Verlauf'})];
    } else if (name === 'energy_dashboard') {
      base.name = 'Energie Dashboard';
      base.widgets = [mk('energy-flow-mini',0,0,{colspan:2, config:{}}), mk('bullet-chart',2,0,{name:'Verbrauch'}), mk('donut-chart',0,1,{name:'Batterie'}), mk('comparison-chart',1,1,{name:'Heute vs Gestern'}), mk('multi-line-chart',2,1,{name:'PV / Netz'})];
    } else if (name === 'camera_wall') {
      base.name = 'Kamera Wand';
      base.grid = { columns: 3, rows: 2 };
      base.widgets = [mk('camera',0,0), mk('camera',1,0), mk('camera',2,0), mk('camera',0,1), mk('camera',1,1), mk('clock',2,1)];
    } else if (name === 'room_status') {
      base.name = 'Raumstatus';
      base.widgets = [mk('simple-value',0,0,{name:'Temperatur'}), mk('simple-value',1,0,{name:'Luftfeuchte'}), mk('status-dot',2,0,{name:'Fenster'}), mk('timeline-chart',0,1,{colspan:2,name:'Bewegung'}), mk('button',2,1,{name:'Licht'})];
    }
    this._push();
    this._cfg = base;
    this._sel = -1;
  }

  _entityDomainForWidget(type) {
    if (type === "camera") return "camera";
    if (type === "weather") return "weather";
    return "";
  }

  _drop(c, r) {
    if (!this._dwt) return;
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    ws.push({ id: `w_${Date.now()}`, type: this._dwt, col: c, row: r, colspan: 1, rowspan: 1, entity_id: "", name: "", icon: "", config: {} });
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = ws.length - 1;
    this._dwt = null;
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
    ws[this._sel] = { ...w, config: { ...(w.config || {}), [k]: v } };
    this._cfg = { ...this._cfg, widgets: ws };
  }
  _moveSel(dx, dy) {
    if (this._sel < 0) return;
    const ws = [...(this._cfg.widgets || [])];
    const w = ws[this._sel];
    ws[this._sel] = { ...w, col: Math.max(0, (w.col || 0) + dx), row: Math.max(0, (w.row || 0) + dy) };
    this._cfg = { ...this._cfg, widgets: ws };
  }
  _dupW() {
    if (this._sel < 0) return;
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    const src = JSON.parse(JSON.stringify(ws[this._sel]));
    src.id = `w_${Date.now()}`;
    src.col = (src.col || 0) + 1;
    ws.push(src);
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = ws.length - 1;
  }
  _delW() {
    if (this._sel < 0) return;
    this._push();
    const ws = [...(this._cfg.widgets || [])];
    ws.splice(this._sel, 1);
    this._cfg = { ...this._cfg, widgets: ws };
    this._sel = -1;
  }
  _sg(k, v) { this._cfg = { ...this._cfg, grid: { ...(this._cfg.grid || { columns: 3, rows: 2 }), [k]: v } }; }
  _push() { this._undo = [...this._undo, JSON.stringify(this._cfg)]; this._redo = []; }
  _doUndo() { if (!this._undo.length) return; this._redo = [...this._redo, JSON.stringify(this._cfg)]; this._cfg = JSON.parse(this._undo[this._undo.length - 1]); this._undo = this._undo.slice(0, -1); this._sel = -1; }
  _doRedo() { if (!this._redo.length) return; this._undo = [...this._undo, JSON.stringify(this._cfg)]; this._cfg = JSON.parse(this._redo[this._redo.length - 1]); this._redo = this._redo.slice(0, -1); this._sel = -1; }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-screen-editor", TdScreenEditor);

/* ----------------------------------------------------------
   TEMPLATE GALLERY
   ---------------------------------------------------------- */

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
        <h2>📋 Vorlagen</h2>
        <div class="ha">
          <button class="b" @click=${() => this._showImport = !this._showImport}>📥 Importieren</button>
          <button class="b p" @click=${() => this._e("create-template", {})}>➕ Neu</button>
        </div>
      </div>
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
                <div class="cmeta">${t.category || "custom"} · ${t.screen_config?.widgets?.length || 0} Widgets</div>
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

/* ----------------------------------------------------------
   TEMPLATE EDITOR
   ---------------------------------------------------------- */

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
        screen_config: { type: "dashboard", grid: { columns: 3, rows: 2 }, widgets: [], duration: 15 },
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

/* ----------------------------------------------------------
   ALERTS
   ---------------------------------------------------------- */

class TdAlertList extends LitElement {
  static get properties() {
    return { hass: { type: Object }, alertTemplates: { type: Object } };
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
      <div class="hdr"><h2>🔔 Alert-Vorlagen</h2><button class="b p" @click=${() => this._e("create-alert", {})}>➕ Neu</button></div>
      ${list.length === 0 ? html`<div class="empty"><p style="font-size:48px;opacity:.3">🔔</p><p style="font-size:18px">Keine Alert-Vorlagen</p></div>` : html`
        <div class="grid">
          ${list.map(([id, a]) => html`
            <div class="card">
              <div class="ch2"><span class="ct">${a.icon || "🔔"} ${a.title || a.name || id}</span><span class="sev ${a.severity || "info"}">${a.severity || "info"}</span></div>
              <div class="cm">
                <span>Modus: ${ml[a.mode] || a.mode || "fullscreen"}</span>
                <span>Dauer: ${a.duration || "∞"}s</span>
                ${a.sound ? html`<span>Sound: ${a.sound}</span>` : ""}
              </div>
              <div class="ca">
                <button class="sb2" @click=${() => this._e("edit-alert", { alertId: id })}>✏️</button>
                <button class="sb2" @click=${() => { if (this.hass) this.hass.callService("ticker_display", "show_alert", { device: "all", ...a }); }}>▶️</button>
                <button class="sb2" @click=${() => this._e("delete-alert", { alertId: id })}>🗑️</button>
              </div>
            </div>
          `)}
        </div>
      `}
    `;
  }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-alert-list", TdAlertList);

class TdAlertEditor extends LitElement {
  static get properties() {
    return { hass: { type: Object }, alert: { type: Object }, alertId: { type: String }, sounds: { type: Array }, _cfg: { type: Object } };
  }
  constructor() {
    super();
    this._cfg = null;
  }
  updated(c) {
    if (c.has("alert")) {
      this._cfg = this.alert ? deepClone(this.alert) : { name:"", title:"", message:"", severity:"info", mode:"fullscreen", icon:"", sound:"", duration:10, flash_screen:false, vibrate:false, persistent:false, color:"", volume:100 };
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
        <h3>🔊 Sound & Verhalten</h3>
        <div class="row">
          <div class="f"><td-sound-picker .value=${c.sound || ""} .sounds=${this.sounds || []} label="Sound" @value-changed=${(e) => this._s("sound", e.detail.value)}></td-sound-picker></div>
          <div class="f"><label>Lautstärke: ${c.volume || 100}%</label><input type="range" min="0" max="100" .value=${c.volume || 100} @input=${(e) => this._s("volume", +e.target.value)}></div>
        </div>
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
        <button class="b t" @click=${() => { if (this.hass) this.hass.callService("ticker_display", "show_alert", { device: "all", ...this._cfg }); }}>▶️ Testen</button>
        <button class="b p" @click=${() => this._e("save", { id: this.alertId || `alert_${Date.now()}`, ...this._cfg })}>💾 Speichern</button>
      </div>
    `;
  }
  _s(k, v) { this._cfg = { ...this._cfg, [k]: v }; }
  _e(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d, bubbles: true, composed: true })); }
}
customElements.define("td-alert-editor", TdAlertEditor);

/* ----------------------------------------------------------
   THEMES
   ---------------------------------------------------------- */

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
    ];
    const cu = Object.entries(this.customThemes || {});
    return html`
      <div class="hdr"><h2>🎨 Themes</h2><button class="b p" @click=${() => this._e("create-theme", {})}>➕ Neu</button></div>
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
      <div class="sec"><h3>📝 Name</h3><div class="f"><input .value=${this._cfg.name || ""} @input=${(e) => this._cfg = { ...this._cfg, name: e.target.value }} placeholder="Mein Theme"></div></div>
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

/* ----------------------------------------------------------
   MEDIA MANAGERS
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   GLOBAL SETTINGS
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   MAIN PANEL
   ---------------------------------------------------------- */

class TickerDisplayPanel extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      narrow: { type: Boolean },
      panel: { type: Object },
      _page: { type: String },
      _tab: { type: String },
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
      _globalSettings: { type: Object },
      _loading: { type: Boolean },
    };
  }

  constructor() {
    super();
    this._page = "main";
    this._tab = "devices";
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
      const [dv, tp, al, th, so, fo, im, gs] = await Promise.all([
        this._get("/api/config/devices"),
        this._get("/api/config/templates"),
        this._get("/api/config/alerts"),
        this._get("/api/config/themes"),
        this._get("/api/media/sounds"),
        this._get("/api/media/fonts"),
        this._get("/api/media/images"),
        this._get("/api/config/global"),
      ]);
      this._devices = dv;
      this._templates = tp;
      this._alertTemplates = al;
      this._customThemes = th;
      this._sounds = so;
      this._fonts = fo;
      this._images = im;
      this._globalSettings = gs;
    } catch (e) {
      console.error(e);
    }
    this._loading = false;
  }

  static get styles() {
    return css`
      :host { display:block; height:100vh; background:radial-gradient(circle at top, rgba(33,150,243,.08), transparent 35%), var(--primary-background-color); color:var(--primary-text-color); --td-accent:var(--primary-color,#2196f3); }
      .top { display:flex; align-items:center; height:64px; padding:0 18px; background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.01)), var(--app-header-background-color,#1e1e1e); color:var(--app-header-text-color,#fff); box-shadow:0 10px 30px rgba(0,0,0,.18); z-index:10; position:relative; backdrop-filter: blur(12px); }
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
      { id: "devices", l: "📱 Geräte" },
      { id: "templates", l: "📋 Vorlagen" },
      { id: "alerts", l: "🔔 Alerts" },
      { id: "themes", l: "🎨 Themes" },
      { id: "sounds", l: "🔊 Sounds" },
      { id: "fonts", l: "🔤 Fonts" },
      { id: "images", l: "🖼️ Bilder" },
      { id: "settings", l: "⚙️ Settings" },
    ];
    return html`
      <div class="top"><span class="t">📱 Ticker Display</span></div>
      <div class="tabs">${tabs.map((t) => html`<button class="tab ${this._tab === t.id ? "a" : ""}" @click=${() => this._tab = t.id}>${t.l}</button>`)}</div>
      <div class="cnt">${this._tabContent()}</div>
      <td-toast></td-toast>
      <td-confirm></td-confirm>
    `;
  }

  _tabContent() {
    switch (this._tab) {
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
      case "templates":
        return html`
          <td-template-gallery .hass=${this.hass} .templates=${this._templates} .devices=${this._devices}
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
          ></td-template-gallery>
        `;
      case "alerts":
        return html`
          <td-alert-list .hass=${this.hass} .alertTemplates=${this._alertTemplates}
            @create-alert=${() => { this._alertId = null; this._page = "alert-editor"; }}
            @edit-alert=${(e) => { this._alertId = e.detail.alertId; this._page = "alert-editor"; }}
            @delete-alert=${async (e) => { if (await this._confirm("Alert löschen", `Alert ${e.detail.alertId} wirklich löschen?`)) { await this._del(`/api/config/alert/${e.detail.alertId}`); await this._load(); } }}
          ></td-alert-list>
        `;
      case "themes":
        return html`
          <td-theme-list .hass=${this.hass} .customThemes=${this._customThemes}
            @create-theme=${() => { this._themeId = null; this._page = "theme-editor"; }}
            @edit-theme=${(e) => { this._themeId = e.detail.themeId; this._page = "theme-editor"; }}
            @delete-theme=${async (e) => { if (await this._confirm("Theme löschen", `Theme ${e.detail.themeId} wirklich löschen?`)) { await this._del(`/api/config/theme/${e.detail.themeId}`); await this._load(); } }}
          ></td-theme-list>
        `;
      case "sounds":
        return html`
          <td-sound-manager .hass=${this.hass} .sounds=${this._sounds}
            @upload-sound=${async (e) => { await this._upload("/api/media/sound/upload", e.detail.file); await this._load(); this._toast("🔊 Hochgeladen"); }}
            @delete-sound=${async (e) => { await this._del(`/api/media/sound/${e.detail.soundId}`); await this._load(); }}
          ></td-sound-manager>
        `;
      case "fonts":
        return html`
          <td-font-manager .hass=${this.hass} .fonts=${this._fonts}
            @upload-font=${async (e) => { await this._upload("/api/media/font/upload", e.detail.file); await this._load(); this._toast("🔤 Hochgeladen"); }}
            @delete-font=${async (e) => { await this._del(`/api/media/font/${e.detail.fontId}`); await this._load(); }}
            @install-google-font=${(e) => this._toast(`ℹ️ Google Font Install noch nicht serverseitig umgesetzt: ${e.detail.fontName}`)}
          ></td-font-manager>
        `;
      case "images":
        return html`
          <td-image-manager .hass=${this.hass} .images=${this._images}
            @upload-image=${async (e) => { await this._upload("/api/media/image/upload", e.detail.file); await this._load(); this._toast("🖼️ Hochgeladen"); }}
            @delete-image=${async (e) => { await this._del(`/api/media/image/${e.detail.imageId}`); await this._load(); }}
          ></td-image-manager>
        `;
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
          @save=${async (e) => { await this._post(`/api/config/device/${this._devId}`, e.detail); await this._load(); this._toast("✅ Gespeichert"); }}
          @edit-screen=${(e) => { this._scrIdx = e.detail.screenIndex; this._page = "screen-editor"; }}
          @add-screen=${async () => {
            if (!d) return;
            const ns = { id:`screen_${Date.now()}`, name:`Screen ${(d.screens?.length || 0) + 1}`, type:"dashboard", duration:15, transition:"fade", grid:{columns:3,rows:2}, widgets:[] };
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
        <td-alert-editor .hass=${this.hass} .alert=${a} .alertId=${this._alertId} .sounds=${this._sounds}
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
