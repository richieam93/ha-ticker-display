/**
 * Ticker Display Panel 3.0.13
 * Kiosk-Verwaltung mit Modul-Einstellungen fuer Uhr, Wetter und Kamera.
 */
(function () {
  const API = "/ticker-display";
  const VERSION = "3.0.13";
  const DEFAULT_PAGE_URL = "/dashboard-durchgang/4";
  const QUICK_PAGES = [
    ["Durchgang", "/dashboard-durchgang/4"],
    ["Übersicht", "/lovelace"],
    ["Energy", "/energy"],
    ["Karte", "/map"],
    ["Medien", "/media-browser"],
  ];
  const POSITIONS = [
    ["top-left", "Oben links"],
    ["top-right", "Oben rechts"],
    ["bottom-left", "Unten links"],
    ["bottom-right", "Unten rechts"],
    ["center", "Mitte"],
    ["fullscreen", "Vollbild"],
  ];

  function uid(prefix = "page") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function cleanInt(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }
  function normalizeHaUrl(raw) {
    let value = String(raw || "").trim();
    if (!value) return "";
    try {
      const parsed = new URL(value, window.location.origin);
      if (parsed.origin === window.location.origin) return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
      return parsed.href;
    } catch (_err) {
      if (!value.startsWith("/")) value = `/${value.replace(/^\/+/, "")}`;
      return value;
    }
  }
  function screenToPage(screen, index = 0) {
    const cfg = screen && typeof screen === "object" ? screen : {};
    return {
      id: cfg.id || uid("page"),
      name: cfg.name || cfg.title || `Seite ${index + 1}`,
      url: normalizeHaUrl(cfg.url || cfg.page_url || cfg.kiosk_url || DEFAULT_PAGE_URL),
      duration: cleanInt(cfg.duration, 60, 5, 86400),
      enabled: cfg.enabled !== false,
      kiosk: cfg.kiosk !== false,
    };
  }
  function pageToScreen(page, index = 0) {
    const url = normalizeHaUrl(page.url || DEFAULT_PAGE_URL) || DEFAULT_PAGE_URL;
    return {
      id: page.id || uid("page"), type: "ha-page", name: String(page.name || `Seite ${index + 1}`).trim() || `Seite ${index + 1}`,
      url, page_url: url, duration: cleanInt(page.duration, 60, 5, 86400), enabled: page.enabled !== false,
      kiosk: page.kiosk !== false, pause_on_touch: true, background_color: "#000000", transition: "fade",
    };
  }
  function defaultModules() {
    return {
      clock: { format: "24h", show_date: true, show_seconds: false, time_zone: "Europe/Zurich", position: "top-right", size: "normal", color: "#ffffff", background: "rgba(15,23,42,0.82)", duration: 30 },
      weather: { entity_id: "", title: "Wetter", position: "top-left", layout: "compact", show_forecast: true, refresh_seconds: 300, duration: 45 },
      camera: { entity_id: "", title: "Kamera", position: "fullscreen", mode: "auto", refresh_seconds: 10, duration: 30 },
    };
  }
  function normalizeModules(modules) {
    const out = defaultModules();
    const src = modules && typeof modules === "object" ? modules : {};
    ["clock", "weather", "camera"].forEach((key) => {
      if (src[key] && typeof src[key] === "object") out[key] = { ...out[key], ...src[key] };
    });
    out.clock.duration = cleanInt(out.clock.duration, 30, 0, 86400);
    out.weather.duration = cleanInt(out.weather.duration, 45, 0, 86400);
    out.camera.duration = cleanInt(out.camera.duration, 30, 0, 86400);
    out.weather.refresh_seconds = cleanInt(out.weather.refresh_seconds, 300, 30, 3600);
    out.camera.refresh_seconds = cleanInt(out.camera.refresh_seconds, 10, 2, 3600);
    return out;
  }

  class TickerDisplayPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._devices = [];
      this._weatherEntities = [];
      this._cameraEntities = [];
      this._selectedId = "";
      this._device = null;
      this._pages = [];
      this._renderMode = "wrapper";
      this._directUrl = "";
      this._directKiosk = false;
      this._directViewportMode = "normal";
      this._directViewportWidth = 1920;
      this._directPageZoom = 0;
      this._modules = defaultModules();
      this._tab = "pages";
      this._loading = true;
      this._saving = false;
      this._message = "";
      this._error = "";
      this._pauseSeconds = 300;
      this._tickerEnabled = false;
      this._fixedText = "";
      this._target = "all";
      this._tickerMessage = "Willkommen zuhause 👋";
      this._tickerDuration = 15;
      this._tickerColor = "#9ca3af";
      this._toastMessage = "Geschirrspüler ist fertig";
      this._toastDuration = 6;
      this._toastColor = "#111827";
      this._bannerTitle = "Info";
      this._bannerMessage = "Fenster im Büro ist noch offen";
      this._bannerColor = "#2196F3";
      this._alertTitle = "Türklingel";
      this._alertMessage = "Jemand steht vor der Haustür";
      this._alertColor = "#ff9800";
      this._boundClick = this._onClick.bind(this);
      this._boundInput = this._onInput.bind(this);
      this._boundChange = this._onChange.bind(this);
    }
    set hass(value) { this._hass = value; }
    connectedCallback() {
      this.shadowRoot.addEventListener("click", this._boundClick);
      this.shadowRoot.addEventListener("input", this._boundInput);
      this.shadowRoot.addEventListener("change", this._boundChange);
      this._load();
    }
    disconnectedCallback() {
      this.shadowRoot.removeEventListener("click", this._boundClick);
      this.shadowRoot.removeEventListener("input", this._boundInput);
      this.shadowRoot.removeEventListener("change", this._boundChange);
    }
    async _fetchJson(url, options = {}) {
      const resp = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
      const text = await resp.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_err) { data = text; }
      if (!resp.ok) throw new Error((data && data.error) || `HTTP ${resp.status}`);
      return data;
    }
    async _load() {
      this._loading = true; this._error = ""; this._message = ""; this._render();
      try {
        const [devices, weather, cameras] = await Promise.all([
          this._fetchJson(`${API}/api/config/devices`),
          this._fetchJson(`${API}/api/entities?domain=weather`).catch(() => []),
          this._fetchJson(`${API}/api/entities?domain=camera`).catch(() => []),
        ]);
        this._devices = (Array.isArray(devices) ? devices : []).filter((d) => !(d && (d.virtual || String(d.id || "").startsWith("virtual_"))));
        this._weatherEntities = Array.isArray(weather) ? weather : [];
        this._cameraEntities = Array.isArray(cameras) ? cameras : [];
        if (this._selectedId && !this._devices.some((d) => d.id === this._selectedId)) this._selectedId = "";
        if (!this._selectedId && this._devices.length) this._selectedId = this._devices[0].id;
        await this._loadSelectedDevice();
      } catch (err) {
        this._error = `Laden fehlgeschlagen: ${err.message || err}`;
      } finally { this._loading = false; this._render(); }
    }
    async _loadSelectedDevice() {
      if (!this._selectedId) { this._device = null; this._pages = []; this._renderMode = "wrapper"; this._directUrl = ""; this._directKiosk = false; this._directViewportMode = "normal"; this._directViewportWidth = 1920; this._directPageZoom = 0; this._modules = defaultModules(); return; }
      const device = await this._fetchJson(`${API}/api/config/device/${encodeURIComponent(this._selectedId)}`);
      this._device = device;
      this._pages = Array.isArray(device.screens) ? device.screens.map(screenToPage).filter((p) => p.url) : [];
      this._renderMode = String(device.render_mode || "wrapper") === "direct" ? "direct" : "wrapper";
      this._directUrl = normalizeHaUrl(device.direct_url || (this._pages[0] && this._pages[0].url) || DEFAULT_PAGE_URL);
      this._directKiosk = device.direct_kiosk !== false;
      this._directViewportMode = String(device.direct_viewport_mode || "normal") === "normal" ? "normal" : "desktop";
      this._directViewportWidth = cleanInt(device.direct_viewport_width, 1920, 800, 3840);
      this._directPageZoom = cleanInt(device.direct_page_zoom, 0, 0, 200);
      this._pauseSeconds = cleanInt((device.rotation && device.rotation.touch_pause_seconds), 300, 0, 86400);
      this._tickerEnabled = (device.ticker && device.ticker.enabled) === true;
      const fixed = device.ticker && Array.isArray(device.ticker.fixed_messages) ? device.ticker.fixed_messages : [];
      this._fixedText = fixed.map((item) => typeof item === "string" ? item : (item && item.text) || "").filter(Boolean).join("\n");
      this._modules = normalizeModules(device.modules);
      if (!this._modules.weather.entity_id && this._weatherEntities.length) this._modules.weather.entity_id = this._weatherEntities[0].entity_id;
      if (!this._modules.camera.entity_id && this._cameraEntities.length) this._modules.camera.entity_id = this._cameraEntities[0].entity_id;
    }
    _deviceOptions() { return [{ id: "all", name: "Alle Geräte" }, ...this._devices.map((d) => ({ id: d.id || d.device_id || d.name, name: `${d.name || d.id} (${d.id || d.device_id || d.name})` }))]; }
    _yamlEscape(value) { return String(value == null ? "" : value).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
    _entityOptions(list, selected, emptyLabel) {
      const rows = [`<option value="">${esc(emptyLabel || "Bitte wählen")}</option>`];
      (list || []).forEach((e) => rows.push(`<option value="${esc(e.entity_id)}" ${e.entity_id === selected ? "selected" : ""}>${esc(e.name || e.entity_id)} · ${esc(e.entity_id)}</option>`));
      return rows.join("");
    }
    _positionOptions(selected, allowFullscreen = true) {
      return POSITIONS.filter(([id]) => allowFullscreen || id !== "fullscreen").map(([id, label]) => `<option value="${esc(id)}" ${id === selected ? "selected" : ""}>${esc(label)}</option>`).join("");
    }
    _setMessage(msg, error = false) { this._message = error ? "" : msg; this._error = error ? msg : ""; this._render(); }
    _tickerYaml() { return `action: ticker_display.send_ticker_message\ndata:\n  device: ${this._target}\n  message: "${this._yamlEscape(this._tickerMessage)}"\n  duration: ${cleanInt(this._tickerDuration, 15, 1, 3600)}\n  replace: true\n  color: "${this._yamlEscape(this._tickerColor)}"`; }
    _toastYaml() { return `action: ticker_display.show_toast\ndata:\n  device: ${this._target}\n  message: "${this._yamlEscape(this._toastMessage)}"\n  duration: ${cleanInt(this._toastDuration, 6, 1, 3600)}\n  color: "${this._yamlEscape(this._toastColor)}"`; }
    _bannerYaml() { return `action: ticker_display.show_banner\ndata:\n  device: ${this._target}\n  title: "${this._yamlEscape(this._bannerTitle)}"\n  message: "${this._yamlEscape(this._bannerMessage)}"\n  color: "${this._yamlEscape(this._bannerColor)}"`; }
    _alertYaml() { return `action: ticker_display.show_alert\ndata:\n  device: ${this._target}\n  title: "${this._yamlEscape(this._alertTitle)}"\n  message: "${this._yamlEscape(this._alertMessage)}"\n  severity: warning\n  mode: fullscreen\n  color: "${this._yamlEscape(this._alertColor)}"\n  duration: 10`; }
    _clockYaml() {
      const c = this._modules.clock;
      return `action: ticker_display.show_clock\ndata:\n  device: ${this._target}\n  format: ${c.format}\n  show_date: ${!!c.show_date}\n  show_seconds: ${!!c.show_seconds}\n  time_zone: "${this._yamlEscape(c.time_zone || "")}"\n  position: ${c.position}\n  duration: ${cleanInt(c.duration, 30, 0, 86400)}`;
    }
    _weatherYaml() {
      const w = this._modules.weather;
      return `action: ticker_display.show_weather\ndata:\n  device: ${this._target}\n  entity_id: ${w.entity_id || "weather.home"}\n  title: "${this._yamlEscape(w.title || "Wetter")}"\n  position: ${w.position}\n  duration: ${cleanInt(w.duration, 45, 0, 86400)}`;
    }
    _cameraYaml() {
      const c = this._modules.camera;
      return `action: ticker_display.show_camera\ndata:\n  device: ${this._target}\n  entity_id: ${c.entity_id || "camera.haustuer"}\n  title: "${this._yamlEscape(c.title || "Kamera")}"\n  mode: ${c.mode || "auto"}\n  position: ${c.position}\n  duration: ${cleanInt(c.duration, 30, 0, 86400)}`;
    }
    _fixedPreviewText() {
      const list = String(this._fixedText || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
      return list.length ? list.join(" │ ") : "Erste Meldung │ Zweite Meldung │ Dritte Meldung";
    }
    _savePayload(extra = {}) {
      const tickerExtra = extra.ticker && typeof extra.ticker === "object" ? extra.ticker : {};
      const modulesExtra = extra.modules && typeof extra.modules === "object" ? extra.modules : {};
      return {
        ...this._device,
        ...extra,
        screens: this._pages.map(pageToScreen),
        render_mode: this._renderMode === "direct" ? "direct" : "wrapper",
        direct_url: normalizeHaUrl(this._directUrl || (this._pages[0] && this._pages[0].url) || DEFAULT_PAGE_URL),
        direct_kiosk: false,
        direct_viewport_mode: "normal",
        direct_viewport_width: cleanInt(this._directViewportWidth, 1920, 800, 3840),
        direct_page_zoom: 0,
        rotation: { ...(this._device.rotation || {}), touch_pause_seconds: this._pauseSeconds, enabled: true, transition: "fade" },
        ticker: { ...(this._device.ticker || {}), ...tickerExtra, enabled: !!this._tickerEnabled },
        modules: normalizeModules({ ...this._modules, ...modulesExtra }),
      };
    }
    async _save() {
      if (!this._device) return;
      this._saving = true; this._setMessage("Speichere Konfiguration...");
      try {
        const payload = this._savePayload();
        await this._fetchJson(`${API}/api/config/device/${encodeURIComponent(this._device.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        this._device = payload; this._setMessage("Gespeichert."); await this._loadSelectedDevice();
      } catch (err) { this._setMessage(`Speichern fehlgeschlagen: ${err.message || err}`, true); }
      finally { this._saving = false; this._render(); }
    }
    async _saveTickerList() {
      if (!this._device) return;
      this._saving = true; this._setMessage("Speichere feste Tickerliste...");
      const fixedMessages = String(this._fixedText || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
      try {
        const payload = this._savePayload({ ticker: { ...(this._device.ticker || {}), enabled: !!this._tickerEnabled, show_list: true, fixed_messages: fixedMessages } });
        await this._fetchJson(`${API}/api/config/device/${encodeURIComponent(this._device.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        this._device = payload; this._setMessage("Feste Tickerliste gespeichert."); await this._loadSelectedDevice();
      } catch (err) { this._setMessage(`Tickerliste konnte nicht gespeichert werden: ${err.message || err}`, true); }
      finally { this._saving = false; this._render(); }
    }
    _addPage(url = DEFAULT_PAGE_URL, name = "") { this._pages.push(screenToPage({ id: uid("page"), name: name || `Seite ${this._pages.length + 1}`, url }, this._pages.length)); this._render(); }
    _updatePage(index, key, value) { if (!this._pages[index]) return; this._pages[index][key] = key === "duration" ? cleanInt(value, 60, 5, 86400) : (key === "enabled" || key === "kiosk" ? !!value : value); this._render(); }
    _movePage(index, delta) { const ni = index + delta; if (ni < 0 || ni >= this._pages.length) return; const [p] = this._pages.splice(index, 1); this._pages.splice(ni, 0, p); this._render(); }
    _deletePage(index) { this._pages.splice(index, 1); this._render(); }
    _setModule(path, value, isCheckbox = false) {
      const [module, key] = String(path || "").split(".");
      if (!this._modules[module]) return;
      let val = isCheckbox ? !!value : value;
      if (["duration", "refresh_seconds"].includes(key)) val = cleanInt(val, this._modules[module][key] || 0, 0, 86400);
      this._modules[module][key] = val;
      this._render();
    }
    _onClick(ev) {
      const target = ev.target.closest("[data-action]"); if (!target) return;
      const action = target.dataset.action; const index = Number(target.dataset.index);
      if (action === "reload") this._load();
      else if (action === "save") this._save();
      else if (action === "save-ticker-list") this._saveTickerList();
      else if (action === "tab") { this._tab = target.dataset.tab || "pages"; this._render(); }
      else if (action === "select-device") { this._selectedId = target.dataset.id || ""; this._loadSelectedDevice().then(() => this._render()); }
      else if (action === "add-page") this._addPage();
      else if (action === "add-quick") this._addPage(target.dataset.url || DEFAULT_PAGE_URL, target.dataset.name || "");
      else if (action === "move-up") this._movePage(index, -1);
      else if (action === "move-down") this._movePage(index, 1);
      else if (action === "delete-page") this._deletePage(index);
      else if (action === "copy") { const text = target.dataset.copy || ""; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text); this._setMessage("Kopiert."); }
    }
    _onInput(ev) {
      const el = ev.target; if (!el || !el.dataset) return;
      const f = el.dataset.field; const live = new Set(["target", "fixedText", "tickerMessage", "tickerDuration", "tickerColor", "toastMessage", "toastDuration", "toastColor", "bannerTitle", "bannerMessage", "bannerColor", "alertTitle", "alertMessage", "alertColor"]);
      if (f === "pauseSeconds") this._pauseSeconds = cleanInt(el.value, 300, 0, 86400);
      else if (f === "directUrl") this._directUrl = el.value;
      else if (f === "directViewportWidth") this._directViewportWidth = cleanInt(el.value, 1920, 800, 3840);
      else if (f === "directPageZoom") this._directPageZoom = cleanInt(el.value, 0, 0, 200);
      else if (f === "target") this._target = el.value || "all";
      else if (f === "fixedText") this._fixedText = el.value;
      else if (f === "tickerMessage") this._tickerMessage = el.value;
      else if (f === "tickerDuration") this._tickerDuration = cleanInt(el.value, 15, 1, 3600);
      else if (f === "tickerColor") this._tickerColor = el.value;
      else if (f === "toastMessage") this._toastMessage = el.value;
      else if (f === "toastDuration") this._toastDuration = cleanInt(el.value, 6, 1, 3600);
      else if (f === "toastColor") this._toastColor = el.value;
      else if (f === "bannerTitle") this._bannerTitle = el.value;
      else if (f === "bannerMessage") this._bannerMessage = el.value;
      else if (f === "bannerColor") this._bannerColor = el.value;
      else if (f === "alertTitle") this._alertTitle = el.value;
      else if (f === "alertMessage") this._alertMessage = el.value;
      else if (f === "alertColor") this._alertColor = el.value;
      else if (f && f.startsWith("module.")) this._setModule(f.slice(7), el.value, false);
      const index = el.dataset.index; const key = el.dataset.key;
      if (index !== undefined && key) this._updatePage(Number(index), key, el.value);
      else if (live.has(f)) this._render();
    }
    _onChange(ev) {
      const el = ev.target; if (!el || !el.dataset) return;
      const f = el.dataset.field;
      if (f === "tickerEnabled") this._tickerEnabled = !!el.checked;
      else if (f === "renderMode") { this._renderMode = el.value === "direct" ? "direct" : "wrapper"; this._render(); return; }
      else if (f === "directKiosk") this._directKiosk = !!el.checked;
      else if (f === "directViewportMode") { this._directViewportMode = el.value === "normal" ? "normal" : "desktop"; this._render(); return; }
      else if (f === "target") { this._target = el.value || "all"; this._render(); return; }
      else if (f && f.startsWith("module.")) { this._setModule(f.slice(7), el.type === "checkbox" ? el.checked : el.value, el.type === "checkbox"); return; }
      const index = el.dataset.index; const key = el.dataset.key;
      if (index !== undefined && key) this._updatePage(Number(index), key, el.type === "checkbox" ? el.checked : el.value);
    }
    _renderDeviceList() {
      if (!this._devices.length) return `<div class="empty-mini">Noch kein Android-Gerät registriert.<br>Starte die Android-App einmal, damit das echte Gerät hier erscheint.</div>`;
      return this._devices.map((d) => { const selected = d.id === this._selectedId ? "selected" : ""; const online = d.online || d.websocket_connected ? "online" : "offline"; return `<button class="device ${selected}" data-action="select-device" data-id="${esc(d.id)}"><span class="dot ${online}"></span><span><b>${esc(d.name || d.id)}</b><small>${esc(d.model || "Gerät")} · ${esc(d.screen_resolution || "")}</small></span></button>`; }).join("");
    }
    _renderPages() {
      const d = this._device; if (!d) return `<div class="card">Bitte zuerst ein Gerät auswählen.</div>`;
      const rows = this._pages.map((p, i) => `<div class="page-row"><div class="page-number">${i + 1}</div><label>Name<input data-index="${i}" data-key="name" value="${esc(p.name)}" placeholder="z.B. Durchgang"></label><label class="url">Home-Assistant-Seite / URL<input data-index="${i}" data-key="url" value="${esc(p.url)}" placeholder="/dashboard-durchgang/4"></label><label>Dauer Sekunden<input type="number" min="5" max="86400" data-index="${i}" data-key="duration" value="${esc(p.duration)}"></label><label class="check"><input type="checkbox" data-index="${i}" data-key="enabled" ${p.enabled !== false ? "checked" : ""}> Aktiv</label><label class="check"><input type="checkbox" data-index="${i}" data-key="kiosk" ${p.kiosk !== false ? "checked" : ""}> Kiosk-Parameter</label><div class="row-actions"><button class="icon" data-action="move-up" data-index="${i}" title="Nach oben">↑</button><button class="icon" data-action="move-down" data-index="${i}" title="Nach unten">↓</button><button class="icon danger" data-action="delete-page" data-index="${i}" title="Löschen">✕</button></div></div>`).join("");
      const directInfo = this._renderMode === "direct" ? "Die Android-App lädt diese Home-Assistant-Seite direkt in einer WebView mit den gleichen Grund-Einstellungen wie die offizielle Home-Assistant-App: kein Iframe, kein erzwungener Desktop-Viewport, keine CSS-Manipulation am HA-Frontend. Ticker und Alerts laufen nur als natives Overlay, wenn sie aktiv sind." : "Die Android-App lädt die Ticker-Display-Weboberfläche mit eingebettetem Home Assistant. Für Sections-Dashboards ist Direct WebView empfohlen.";
      return `<div class="hero"><div><h1>Kiosk-Seiten</h1><p>Hier trägst du Home-Assistant-Seiten ein. Layout, Karten und Hintergründe baust du direkt in Lovelace/YAML.</p></div><button class="primary" data-action="save" ${this._saving ? "disabled" : ""}>Speichern</button></div><div class="card"><h2>Android-App Anzeige</h2><div class="settings-grid two"><label>App-Modus<select data-field="renderMode"><option value="wrapper" ${this._renderMode !== "direct" ? "selected" : ""}>Wrapper / Browser-Vorschau</option><option value="direct" ${this._renderMode === "direct" ? "selected" : ""}>Direct WebView wie HA-App</option></select></label><label>Direct-URL<input data-field="directUrl" value="${esc(this._directUrl || (this._pages[0] && this._pages[0].url) || DEFAULT_PAGE_URL)}" placeholder="/badezimmer-display/0"></label></div><p class="hint">${esc(directInfo)} Speichern und die Android-App danach über das App-Menü neu laden.</p></div><div class="card"><h2>Schnell hinzufügen</h2><div class="quick-list">${QUICK_PAGES.map(([name, url]) => `<button data-action="add-quick" data-name="${esc(name)}" data-url="${esc(url)}">${esc(name)}<small>${esc(url)}</small></button>`).join("")}</div><button data-action="add-page">+ Eigene Seite hinzufügen</button></div><div class="card"><h2>Rotation</h2><div class="settings-grid"><label>Touch-Pause in Sekunden<input type="number" min="0" max="86400" data-field="pauseSeconds" value="${esc(this._pauseSeconds)}"></label><label class="check"><input type="checkbox" data-field="tickerEnabled" ${this._tickerEnabled ? "checked" : ""}> Ticker-Leiste anzeigen</label></div><p class="hint">Standard: 300 Sekunden = 5 Minuten. Jeder Tap/Klick im Display pausiert den Seitenwechsel für diese Zeit.</p></div><div class="card"><h2>Seiten-Reihenfolge</h2>${rows || `<div class="empty-big">Noch keine Seite eingetragen.<br>Füge z.B. <code>/badezimmer-display/0</code> hinzu.</div>`}</div><div class="card links"><h2>Display-Links</h2><a href="${esc(d.display_url || `/ticker-display/${d.id}`)}" target="_blank" rel="noreferrer">Display öffnen</a><a href="${esc(d.preview_url || `/ticker-display/preview/${d.id}`)}" target="_blank" rel="noreferrer">Vorschau öffnen</a><button data-action="copy" data-copy="${esc(d.display_url || `/ticker-display/${d.id}`)}">Display-Link kopieren</button></div>`;
    }
    _renderModules() {
      if (!this._device) return `<div class="card">Bitte zuerst ein Gerät auswählen.</div>`;
      const c = this._modules.clock, w = this._modules.weather, cam = this._modules.camera;
      return `<div class="hero"><div><h1>Module</h1><p>Hier stellst du die Standardwerte fuer Uhr, Wetter und Kamera ein. Die Services <code>ticker_display.show_clock</code>, <code>show_weather</code> und <code>show_camera</code> verwenden diese Werte, wenn du in der Aktion nichts anderes angibst.</p></div><button class="primary" data-action="save" ${this._saving ? "disabled" : ""}>Speichern</button></div>
      <div class="module-grid">
        <div class="card module-config"><h2>🕒 Uhr</h2><div class="settings-grid two"><label>Format<select data-field="module.clock.format"><option value="24h" ${c.format !== "12h" ? "selected" : ""}>24 Stunden</option><option value="12h" ${c.format === "12h" ? "selected" : ""}>12 Stunden</option></select></label><label>Position<select data-field="module.clock.position">${this._positionOptions(c.position, true)}</select></label><label>Zeitzone<input data-field="module.clock.time_zone" value="${esc(c.time_zone || "Europe/Zurich")}" placeholder="Europe/Zurich"></label><label>Dauer Sekunden<input type="number" min="0" max="86400" data-field="module.clock.duration" value="${esc(c.duration)}"></label><label>Textfarbe<input data-field="module.clock.color" value="${esc(c.color)}"></label><label>Hintergrund<input data-field="module.clock.background" value="${esc(c.background)}"></label><label class="check"><input type="checkbox" data-field="module.clock.show_date" ${c.show_date !== false ? "checked" : ""}> Datum anzeigen</label><label class="check"><input type="checkbox" data-field="module.clock.show_seconds" ${c.show_seconds ? "checked" : ""}> Sekunden anzeigen</label></div><pre class="code">${esc(this._clockYaml())}</pre><button class="primary" data-action="copy" data-copy="${esc(this._clockYaml())}">Uhr-Aktion kopieren</button></div>
        <div class="card module-config"><h2>🌦️ Wetter</h2><div class="settings-grid two"><label>Wetter-Entity<select data-field="module.weather.entity_id">${this._entityOptions(this._weatherEntities, w.entity_id, "Keine Wetter-Entity")}</select></label><label>Titel<input data-field="module.weather.title" value="${esc(w.title)}"></label><label>Position<select data-field="module.weather.position">${this._positionOptions(w.position, true)}</select></label><label>Layout<select data-field="module.weather.layout"><option value="compact" ${w.layout !== "full" ? "selected" : ""}>Kompakt</option><option value="full" ${w.layout === "full" ? "selected" : ""}>Gross</option></select></label><label>Dauer Sekunden<input type="number" min="0" max="86400" data-field="module.weather.duration" value="${esc(w.duration)}"></label><label>Aktualisieren Sekunden<input type="number" min="30" max="3600" data-field="module.weather.refresh_seconds" value="${esc(w.refresh_seconds)}"></label><label class="check"><input type="checkbox" data-field="module.weather.show_forecast" ${w.show_forecast !== false ? "checked" : ""}> Forecast anzeigen</label></div><pre class="code">${esc(this._weatherYaml())}</pre><button class="primary" data-action="copy" data-copy="${esc(this._weatherYaml())}">Wetter-Aktion kopieren</button></div>
        <div class="card module-config"><h2>📷 Kamera</h2><div class="settings-grid two"><label>Kamera-Entity<select data-field="module.camera.entity_id">${this._entityOptions(this._cameraEntities, cam.entity_id, "Keine Kamera-Entity")}</select></label><label>Titel<input data-field="module.camera.title" value="${esc(cam.title)}"></label><label>Position<select data-field="module.camera.position">${this._positionOptions(cam.position, true)}</select></label><label>Modus<select data-field="module.camera.mode"><option value="auto" ${cam.mode === "auto" ? "selected" : ""}>Automatisch</option><option value="snapshot" ${cam.mode === "snapshot" ? "selected" : ""}>Snapshot</option><option value="camera_proxy" ${cam.mode === "camera_proxy" ? "selected" : ""}>Camera proxy</option><option value="stream" ${cam.mode === "stream" || cam.mode === "camera_proxy_stream" ? "selected" : ""}>Stream</option></select></label><label>Dauer Sekunden<input type="number" min="0" max="86400" data-field="module.camera.duration" value="${esc(cam.duration)}"></label><label>Aktualisieren Sekunden<input type="number" min="2" max="3600" data-field="module.camera.refresh_seconds" value="${esc(cam.refresh_seconds)}"></label></div><pre class="code">${esc(this._cameraYaml())}</pre><button class="primary" data-action="copy" data-copy="${esc(this._cameraYaml())}">Kamera-Aktion kopieren</button></div>
      </div>`;
    }
    _renderMessages() {
      const devs = this._deviceOptions(); const fixedPreview = this._fixedPreviewText();
      return `<div class="hero"><div><h1>Ticker & Meldungen</h1><p>Live-Ticker, feste Liste, Toast, Banner und Alert – jeweils mit Vorschau und kopierbarer Beispiel-Aktion.</p></div></div><div class="card"><h2>Zielgerät für Beispiele</h2><label>Zielgerät<select data-field="target">${devs.map((d) => `<option value="${esc(d.id)}" ${d.id === this._target ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label></div><div class="message-grid"><div class="card msg-card"><h2>▶️ Live-Ticker</h2><div class="subgrid"><label>Nachricht<input data-field="tickerMessage" value="${esc(this._tickerMessage)}"></label><label>Dauer (s)<input type="number" min="1" max="3600" data-field="tickerDuration" value="${esc(this._tickerDuration)}"></label></div><label>Akzent/Farbe<input data-field="tickerColor" value="${esc(this._tickerColor)}"></label><div class="preview-wrap"><div class="ticker-preview" style="background:linear-gradient(90deg, ${esc(this._tickerColor)}, rgba(0,0,0,.65));">${esc(this._tickerMessage)}</div></div><pre class="code">${esc(this._tickerYaml())}</pre><button class="primary" data-action="copy" data-copy="${esc(this._tickerYaml())}">Aktion kopieren</button></div><div class="card msg-card"><h2>🗂️ Feste Tickerliste</h2><p class="hint">Eine Meldung pro Zeile. Sie wird angezeigt, wenn die Ticker-Leiste aktiv ist.</p><textarea rows="6" data-field="fixedText" placeholder="Erste Meldung\nZweite Meldung\nDritte Meldung">${esc(this._fixedText)}</textarea><div class="preview-wrap"><div class="ticker-preview dark">${esc(fixedPreview)}</div></div><button class="primary" data-action="save-ticker-list" ${!this._device || this._saving ? "disabled" : ""}>Feste Tickerliste speichern</button></div><div class="card msg-card"><h2>💬 Toast</h2><div class="subgrid"><label>Nachricht<input data-field="toastMessage" value="${esc(this._toastMessage)}"></label><label>Dauer (s)<input type="number" min="1" max="3600" data-field="toastDuration" value="${esc(this._toastDuration)}"></label></div><label>Farbe<input data-field="toastColor" value="${esc(this._toastColor)}"></label><div class="preview-wrap"><div class="toast-preview" style="background:${esc(this._toastColor)};">${esc(this._toastMessage)}</div></div><pre class="code">${esc(this._toastYaml())}</pre><button class="primary" data-action="copy" data-copy="${esc(this._toastYaml())}">Aktion kopieren</button></div><div class="card msg-card"><h2>📣 Banner</h2><label>Titel<input data-field="bannerTitle" value="${esc(this._bannerTitle)}"></label><label>Nachricht<textarea rows="3" data-field="bannerMessage">${esc(this._bannerMessage)}</textarea></label><label>Farbe<input data-field="bannerColor" value="${esc(this._bannerColor)}"></label><div class="preview-wrap"><div class="banner-preview" style="background:${esc(this._bannerColor)};"><strong>${esc(this._bannerTitle)}</strong><span>${esc(this._bannerMessage)}</span></div></div><pre class="code">${esc(this._bannerYaml())}</pre><button class="primary" data-action="copy" data-copy="${esc(this._bannerYaml())}">Aktion kopieren</button></div><div class="card msg-card"><h2>🚨 Alert</h2><label>Titel<input data-field="alertTitle" value="${esc(this._alertTitle)}"></label><label>Nachricht<textarea rows="3" data-field="alertMessage">${esc(this._alertMessage)}</textarea></label><label>Farbe<input data-field="alertColor" value="${esc(this._alertColor)}"></label><div class="preview-wrap"><div class="alert-preview" style="background:${esc(this._alertColor)};"><div><div class="alert-title-preview">${esc(this._alertTitle)}</div><div>${esc(this._alertMessage)}</div></div></div></div><pre class="code">${esc(this._alertYaml())}</pre><button class="primary" data-action="copy" data-copy="${esc(this._alertYaml())}">Aktion kopieren</button></div></div>`;
    }
    _renderHelp() { return `<div class="hero"><div><h1>Neues Prinzip</h1><p>Die Integration ist ein schlanker Kiosk-Browser für Home Assistant.</p></div></div><div class="card prose"><h2>Seiten</h2><p>Du baust deine Seiten in Home Assistant, z.B. als Lovelace-Dashboard unter <code>/dashboard-durchgang/4</code>, und trägst diese URL hier als Kiosk-Seite ein. Für <b>Sections-Dashboards auf Android</b> nutze im Tab Kiosk-Seiten den Modus <b>Direct WebView wie HA-App</b> plus <b>HA-App / normaler Android-Viewport</b>.</p><h2>Module</h2><p>Uhr, Wetter und Kamera sind keine alten Widgets mehr. Sie sind Kiosk-Overlays, die du im Tab <b>Module</b> vorkonfigurierst und per Automation mit <code>ticker_display.show_clock</code>, <code>ticker_display.show_weather</code> oder <code>ticker_display.show_camera</code> anzeigen kannst.</p></div>`; }
    _renderContent() { if (this._loading) return `<div class="card">Lade Konfiguration...</div>`; if (this._tab === "modules") return this._renderModules(); if (this._tab === "messages") return this._renderMessages(); if (this._tab === "help") return this._renderHelp(); return this._renderPages(); }
    _render() {
      this.shadowRoot.innerHTML = `<style>${this._styles()}</style><div class="app"><aside><div class="brand"><span>📱</span><div><b>Ticker Display</b><small>Kiosk-Verwaltung ${VERSION}</small></div></div><nav><button class="${this._tab === "pages" ? "active" : ""}" data-action="tab" data-tab="pages">Kiosk-Seiten</button><button class="${this._tab === "modules" ? "active" : ""}" data-action="tab" data-tab="modules">Module</button><button class="${this._tab === "messages" ? "active" : ""}" data-action="tab" data-tab="messages">Ticker & Meldungen</button><button class="${this._tab === "help" ? "active" : ""}" data-action="tab" data-tab="help">Hinweise</button></nav><div class="side-title">Geräte</div><div class="devices">${this._renderDeviceList()}</div><button class="small wide" data-action="reload">Neu laden</button></aside><main>${this._message ? `<div class="toast ok">${esc(this._message)}</div>` : ""}${this._error ? `<div class="toast error">${esc(this._error)}</div>` : ""}${this._renderContent()}</main></div>`;
    }
    _styles() { return `:host{display:block;min-height:100vh;background:#0b1020;color:#e5e7eb;font-family:Roboto,Arial,sans-serif;--card:#111827;--muted:#94a3b8;--line:rgba(255,255,255,.1);--accent:#38bdf8;}*{box-sizing:border-box}button,input,select,textarea{font:inherit}.app{display:grid;grid-template-columns:300px 1fr;min-height:100vh}aside{background:#08111f;border-right:1px solid var(--line);padding:18px;position:sticky;top:0;height:100vh;overflow:auto}main{padding:24px;max-width:1400px;width:100%;margin:0 auto}.brand{display:flex;align-items:center;gap:12px;margin-bottom:20px}.brand span{font-size:32px}.brand b{display:block;font-size:18px}.brand small,.device small,.hint{color:var(--muted)}nav{display:grid;gap:8px;margin-bottom:20px}button,a{border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.05);color:#e5e7eb;text-decoration:none;padding:10px 12px;cursor:pointer}button:hover,a:hover{background:rgba(56,189,248,.12);border-color:rgba(56,189,248,.5)}button.active,.primary{background:linear-gradient(135deg,#0891b2,#2563eb);border-color:transparent;color:white;font-weight:700}button:disabled{opacity:.6;cursor:wait}.side-title{text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-size:12px;margin:18px 0 8px}.devices{display:grid;gap:8px}.device{width:100%;text-align:left;display:grid;grid-template-columns:12px 1fr;gap:10px;align-items:center}.device.selected{border-color:var(--accent);background:rgba(56,189,248,.14)}.dot{width:10px;height:10px;border-radius:50%;background:#64748b}.dot.online{background:#22c55e}.dot.offline{background:#ef4444}.wide{width:100%;margin-top:8px}.small{font-size:13px;padding:8px 10px}.hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.hero h1{margin:0 0 6px;font-size:32px}.hero p{margin:0;color:var(--muted);max-width:900px;line-height:1.45}.card{background:rgba(17,24,39,.92);border:1px solid var(--line);border-radius:20px;padding:18px;margin-bottom:18px;box-shadow:0 18px 60px rgba(0,0,0,.18)}.card h2{margin:0 0 12px;font-size:18px}.quick-list{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px}.quick-list button{display:flex;flex-direction:column;align-items:flex-start;gap:3px}.quick-list small{color:#bae6fd}.settings-grid{display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:end}.settings-grid.two{grid-template-columns:repeat(2,minmax(180px,1fr))}.module-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px}.module-config{display:grid;gap:12px}.page-row{display:grid;grid-template-columns:42px 180px minmax(260px,1fr) 130px 90px 130px 128px;gap:10px;align-items:end;border:1px solid var(--line);border-radius:16px;padding:12px;margin-bottom:10px;background:rgba(255,255,255,.035)}.page-number{width:32px;height:32px;border-radius:50%;background:rgba(56,189,248,.15);display:flex;align-items:center;justify-content:center;font-weight:700;color:#7dd3fc}label{display:grid;gap:6px;color:#cbd5e1;font-size:12px}input,select,textarea{width:100%;border:1px solid var(--line);border-radius:10px;background:#020617;color:#f8fafc;padding:10px 11px}textarea{resize:vertical;min-height:78px}.check{display:flex;gap:8px;align-items:center;min-height:40px}.check input{width:auto}.row-actions{display:flex;gap:6px}.icon{width:36px;height:36px;padding:0;display:inline-flex;align-items:center;justify-content:center}.danger{color:#fecaca;border-color:rgba(239,68,68,.35)}.links{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.links h2{width:100%}.toast{border-radius:14px;padding:12px 14px;margin-bottom:14px;border:1px solid}.toast.ok{background:rgba(22,163,74,.12);border-color:rgba(34,197,94,.4);color:#bbf7d0}.toast.error{background:rgba(220,38,38,.12);border-color:rgba(248,113,113,.45);color:#fecaca}.empty-big,.empty-mini{color:var(--muted);line-height:1.5}.message-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}.msg-card{display:grid;gap:12px}.subgrid{display:grid;grid-template-columns:1fr 150px;gap:10px}.preview-wrap{border:1px dashed var(--line);border-radius:14px;padding:12px;background:rgba(255,255,255,.025)}.ticker-preview{display:flex;align-items:center;width:100%;min-height:38px;padding:0 14px;border-radius:10px;color:#fff;overflow:hidden;white-space:nowrap}.ticker-preview.dark{background:rgba(12,18,28,.78)}.toast-preview{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:16px;color:#fff}.banner-preview{display:grid;gap:4px;min-height:60px;padding:12px 14px;border-radius:12px;color:#fff}.alert-preview{display:grid;place-items:center;min-height:140px;border-radius:18px;color:#fff;text-align:center;padding:20px}.alert-title-preview{font-size:24px;font-weight:700;margin-bottom:8px}.code{background:#020617;color:#dbeafe;padding:12px;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;border:1px solid var(--line);margin:0}.prose{line-height:1.55}.prose code,.hero code,.empty-big code{background:#020617;border:1px solid var(--line);padding:2px 6px;border-radius:6px;color:#bfdbfe}@media(max-width:980px){.app{grid-template-columns:1fr}aside{position:relative;height:auto}.page-row{grid-template-columns:1fr}.settings-grid,.settings-grid.two{grid-template-columns:1fr}.subgrid{grid-template-columns:1fr}.hero{display:block}.hero .primary{margin-top:12px;width:100%}}`; }
  }
  if (!customElements.get("ticker-display-panel")) customElements.define("ticker-display-panel", TickerDisplayPanel);
})();
