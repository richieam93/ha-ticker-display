/**
 * Ticker Display – Complete Display Engine (merged)
 * Utils + Bridge + WebSocket + ScreenManager + TickerManager + AlertManager + ThemeManager + App
 */

/* ══════════════════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════════════════ */

const Utils = {
  formatNumber(v, d = 1) { const n = parseFloat(v); return isNaN(n) ? v : n.toFixed(d); },
  relativeTime(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "gerade eben";
    if (s < 3600) return `vor ${Math.floor(s / 60)} Min`;
    if (s < 86400) return `vor ${Math.floor(s / 3600)} Std`;
    return `vor ${Math.floor(s / 86400)} Tagen`;
  },
  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
};

class DataManager {
  constructor(apiBase) { this.apiBase = apiBase; this._cache = {}; }
  async fetchHistory(entityId, hours = 24) {
    const k = `h_${entityId}_${hours}`, c = this._cache[k];
    if (c && (Date.now() - c.t) < 60000) return c.d;
    try {
      const r = await fetch(`${this.apiBase}/api/history/${entityId}?hours=${hours}`);
      const d = await r.json(); this._cache[k] = { d, t: Date.now() }; return d;
    } catch (e) { return { entity_id: entityId, data: [] }; }
  }
  async fetchWeather(entityId) {
    try { return await (await fetch(`${this.apiBase}/api/weather/${entityId}`)).json(); }
    catch (e) { return null; }
  }
  getCameraUrl(entityId) { return `${this.apiBase}/api/image/camera/${entityId}?t=${Date.now()}`; }
}

/* ══════════════════════════════════════════════════════════
   BRIDGE WRAPPER
   ══════════════════════════════════════════════════════════ */

class BridgeWrapper {
  constructor() {
    this._bridge = window.TickerBridge || null;
    this._available = !!this._bridge;
    this._audioElement = null;
    console.log(this._available ? "📱 Bridge available" : "🌐 Browser mode");
  }
  isAvailable() { return this._available; }

  setScreenBrightness(v) { if (this._bridge) this._bridge.setScreenBrightness(Math.round(v)); }
  setScreenPower(on) { if (this._bridge) this._bridge.setScreenPower(on); }

  playSound(url, volume = 100, loop = false) {
    if (this._bridge) {
      loop ? this._bridge.playSoundLoop(url) : this._bridge.playSound(url);
      if (volume !== undefined) this._bridge.setVolume(volume);
    } else {
      try {
        if (this._audioElement) this._audioElement.pause();
        this._audioElement = new Audio(url);
        this._audioElement.volume = volume / 100;
        this._audioElement.loop = loop;
        this._audioElement.play().catch(() => { });
      } catch (e) { }
    }
  }
  stopSound() {
    if (this._bridge) this._bridge.stopSound();
    else if (this._audioElement) { this._audioElement.pause(); this._audioElement = null; }
  }
  ttsSpeak(text, lang = "de", volume = 70) { if (this._bridge) this._bridge.ttsSpeak(text, lang); }
  setVolume(v) { if (this._bridge) this._bridge.setVolume(v); }
  vibrate(ms = 500) { if (this._bridge) this._bridge.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); }

  getAllSensorData() {
    if (!this._bridge) return null;
    try {
      return {
        battery_level: this._bridge.getBatteryLevel(),
        battery_charging: this._bridge.isBatteryCharging(),
        battery_temperature: this._bridge.getBatteryTemperature(),
        wifi_signal: this._bridge.getWifiSignal(),
        wifi_ssid: this._bridge.getWifiSsid(),
        ip_address: this._bridge.getIpAddress(),
        light_level: this._bridge.getLightLevel(),
        motion_detected: this._bridge.isMotionDetected(),
        proximity_near: false, ambient_noise_db: 0,
        screen_on: this._bridge.isScreenOn(),
        screen_brightness: this._bridge.getScreenBrightness(),
        memory_free_mb: this._bridge.getMemoryFree(),
        cpu_usage: 0, app_version: this._bridge.getAppVersion(), uptime_seconds: 0,
      };
    } catch (e) { return null; }
  }
}

/* ══════════════════════════════════════════════════════════
   THEME MANAGER
   ══════════════════════════════════════════════════════════ */

class ThemeManager {
  applyDynamic(data) {
    const r = document.documentElement;
    if (data.accent_color) r.style.setProperty("--td-accent", data.accent_color);
    if (data.vars) Object.entries(data.vars).forEach(([k, v]) => r.style.setProperty(`--td-${k}`, v));
  }
}

/* ══════════════════════════════════════════════════════════
   WEBSOCKET CLIENT
   ══════════════════════════════════════════════════════════ */

class WebSocketClient {
  constructor(app) { this.app = app; this.ws = null; this._connected = false; this._reconnectDelay = 1000; }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.app.wsUrl);
        this.ws.onopen = () => {
          this._connected = true;
          this._reconnectDelay = 1000;
          const offline = document.getElementById("offline-screen");
          if (offline) offline.hidden = true;

          this.send({ type: "subscribe", entities: this.app.neededEntities });

          if (this.app && typeof this.app.reportSensorsNow === "function") {
            this.app.reportSensorsNow();
          }

          resolve();
        };
        this.ws.onmessage = (e) => { try { this._handleMessage(JSON.parse(e.data)); } catch (err) { } };
        this.ws.onclose = () => {
          this._connected = false;
          const offline = document.getElementById("offline-screen");
          if (offline) offline.hidden = false;
          this._scheduleReconnect();
        };
        this.ws.onerror = (err) => reject(err);
      } catch (e) { reject(e); }
    });
  }

  send(data) { if (this.ws && this._connected) this.ws.send(JSON.stringify(data)); }
  isConnected() { return this._connected; }

  _handleMessage(msg) {
    switch (msg.type) {
      case "state_changed": this.app.onEntityStateChanged(msg.entity_id, msg.new_state); break;
      case "command": this.app.onCommand(msg.command, msg.data || {}); break;
      case "alert": this.app.onAlert(msg.data); break;
      case "ticker": this.app.onTickerMessages(msg.messages || []); break;
      case "display_control": this.app.onDisplayControl(msg); break;
      case "audio": this.app.onAudio(msg); break;
      case "navigate": this.app.onNavigate(msg); break;
      case "config_changed": this.app.onConfigChanged(msg.config); break;
      case "theme_changed": this.app.onThemeChanged(msg.theme || msg); break;
      case "reload": location.reload(); break;
    }
  }

  _scheduleReconnect() {
    setTimeout(() => {
      this.connect().catch(() => {
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
        this._scheduleReconnect();
      });
    }, this._reconnectDelay);
  }
}

/* ══════════════════════════════════════════════════════════
   SCREEN MANAGER
   ══════════════════════════════════════════════════════════ */

class ScreenManager {
  constructor(app) {
    this.app = app; this.screens = app.config.screens || [];
    this.currentIndex = 0; this.rotationTimer = null; this.isPaused = false;
    this.temporaryScreen = null; this.container = document.getElementById("screen-container");
    this._widgetElements = {}; this._clockInterval = null; this._cameraInterval = null;
  }

  start() {
    if (this.screens.length === 0) {
      this.container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;color:var(--td-text-secondary)">
        <div style="font-size:48px;margin-bottom:16px">📱</div>
        <div style="font-size:18px">Warte auf Konfiguration...</div>
        <div style="font-size:14px;margin-top:8px;opacity:.5">${this.app.deviceId}</div></div>`;
      return;
    }
    this._showScreen(0); this._startRotation();
  }

  rebuild() { this.screens = this.app.config.screens || []; this._stopRotation(); this.start(); }
  next() { if (this.screens.length > 1) this._showScreen((this.currentIndex + 1) % this.screens.length); }
  previous() { if (this.screens.length > 1) this._showScreen((this.currentIndex - 1 + this.screens.length) % this.screens.length); }
  goto(screenId) { const i = this.screens.findIndex(s => s.id === screenId || s.name === screenId); if (i >= 0) this._showScreen(i); }
  pauseRotation() { this.isPaused = true; this._stopRotation(); }
  resumeRotation() { this.isPaused = false; this.temporaryScreen = null; this._showScreen(this.currentIndex); this._startRotation(); }

  showTemporaryScreen(command, data) {
    const typeMap = { show_dashboard: "dashboard", show_graph: "graph", show_camera: "camera", show_weather: "weather", show_single_value: "single-value", show_clock: "clock", show_status_board: "status-board", show_image: "image" };
    const tempConfig = { type: typeMap[command] || "dashboard", ...data };
    this.temporaryScreen = tempConfig; this._stopRotation(); this._renderScreen(tempConfig);
    if (data.duration && data.duration > 0)
      setTimeout(() => { this.temporaryScreen = null; this._showScreen(this.currentIndex); if (!this.isPaused) this._startRotation(); }, data.duration * 1000);
  }

  onEntityUpdate(entityId, newState) {
    const widgets = this._widgetElements[entityId];
    if (widgets) for (const w of widgets) this._updateWidget(w, entityId, newState);
  }

  _showScreen(index) {
    if (index >= this.screens.length) return;
    this.currentIndex = index;
    this._renderScreen(this.screens[index]);
    if (this.app.wsClient) this.app.wsClient.send({ type: "status", screen: this.screens[index].name || `screen_${index}` });
  }

  _renderScreen(config) {
    this._widgetElements = {};
    const screen = document.createElement("div");
    screen.className = "screen";

    switch (config.type) {
      case "clock": this._buildClock(screen, config); break;
      case "weather": this._buildWeather(screen, config); break;
      case "camera": this._buildCamera(screen, config); break;
      default: this._buildDashboard(screen, config); break;
    }

    const transition = config.transition || this.app.config.rotation?.transition || "fade";
    this._doTransition(screen, transition);
  }

  _buildDashboard(screen, config) {
    const grid = document.createElement("div");
    grid.className = "dashboard-grid";
    const cols = config.grid?.columns || 3, rows = config.grid?.rows || 2;
    grid.style.gridTemplateColumns = `repeat(${cols},1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows},1fr)`;
    for (const wc of (config.widgets || [])) {
      const widget = this._createWidget(wc);
      widget.style.gridColumn = `${(wc.col || 0) + 1}/span ${wc.colspan || 1}`;
      widget.style.gridRow = `${(wc.row || 0) + 1}/span ${wc.rowspan || 1}`;
      grid.appendChild(widget);
    }
    screen.appendChild(grid);
  }

  _buildClock(screen) {
    screen.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column">
      <div id="clock-time" style="font-size:120px;font-weight:300;color:var(--td-text-primary)">--:--</div>
      <div id="clock-date" style="font-size:24px;color:var(--td-text-secondary);margin-top:8px"></div></div>`;
    const update = () => {
      const n = new Date();
      const t = screen.querySelector("#clock-time"), d = screen.querySelector("#clock-date");
      if (t) t.textContent = n.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      if (d) d.textContent = n.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    };
    update(); this._clockInterval = setInterval(update, 1000);
  }

  _buildWeather(screen, config) {
    screen.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column">
      <div style="font-size:64px">🌤️</div>
      <div id="weather-temp" style="font-size:72px;font-weight:300;margin:12px 0">--°C</div>
      <div id="weather-condition" style="font-size:20px;color:var(--td-text-secondary)">Laden...</div></div>`;
    if (config.entity_id) {
      const s = this.app.entityStates[config.entity_id];
      if (s) {
        const t = screen.querySelector("#weather-temp"), c = screen.querySelector("#weather-condition");
        if (t) t.textContent = `${s.attributes?.temperature || "--"}°C`;
        if (c) c.textContent = s.state || "";
      }
    }
  }

  _buildCamera(screen, config) {
    const eid = config.entity_id || "";
    screen.innerHTML = `<img id="camera-img" src="${this.app.apiBase}/api/image/camera/${eid}" style="width:100%;height:100%;object-fit:contain" onerror="this.style.opacity=0.3">
      <div style="position:absolute;bottom:12px;left:16px;font-size:14px;color:white;text-shadow:0 1px 4px rgba(0,0,0,.8)">${config.title || eid}</div>`;
    const ms = (config.refresh_interval || 5) * 1000;
    this._cameraInterval = setInterval(() => { const img = screen.querySelector("#camera-img"); if (img) img.src = `${this.app.apiBase}/api/image/camera/${eid}?t=${Date.now()}`; }, ms);
  }

  _createWidget(config) {
    const widget = document.createElement("div");
    widget.className = `widget widget-${config.type || "simple-value"}`;
    if (config.entity_id) {
      if (!this._widgetElements[config.entity_id]) this._widgetElements[config.entity_id] = [];
      this._widgetElements[config.entity_id].push({ element: widget, config });
    }
    const state = this.app.entityStates[config.entity_id] || {};
    const value = state.state || "—", unit = state.attributes?.unit_of_measurement || config.unit || "";
    const name = config.name || state.attributes?.friendly_name || "", icon = config.icon || "📊";

    switch (config.type) {
      case "gauge":
        const min = config.config?.min || 0, max = config.config?.max || 100;
        const nv = parseFloat(value) || 0, pct = Math.max(0, Math.min(100, ((nv - min) / (max - min)) * 100));
        const color = this._getZoneColor(nv, config.config?.zones);
        widget.innerHTML = `<svg viewBox="0 0 200 130"><path d="M 20 120 A 80 80 0 0 1 180 120" class="gauge-arc-bg"/><path d="M 20 120 A 80 80 0 0 1 180 120" class="gauge-arc-value" stroke="${color}" stroke-dasharray="${pct * 2.51} 251"/><text x="100" y="95" class="gauge-text-value">${nv}${unit}</text><text x="100" y="118" class="gauge-text-label">${name}</text></svg>`;
        break;
      case "progress-bar":
        const pMin = config.config?.min || 0, pMax = config.config?.max || 100;
        const pv = parseFloat(value) || 0, pp = Math.max(0, Math.min(100, ((pv - pMin) / (pMax - pMin)) * 100));
        widget.innerHTML = `<div class="w-name" style="margin-bottom:4px">${name}</div><div><span class="w-value" style="font-size:24px">${pv}</span><span class="w-unit">${unit}</span></div><div class="progress-container"><div class="progress-fill" style="width:${pp}%;background:${config.config?.color || 'var(--td-accent)'}"></div></div>`;
        break;
      case "status-dot":
        const isOn = ["on", "true", "home", "open", "detected"].includes(String(value).toLowerCase());
        const dc = isOn ? "var(--td-positive)" : "var(--td-text-secondary)";
        widget.innerHTML = `<div class="status-dot-indicator ${isOn ? 'on' : ''}" style="background:${dc};color:${dc}"></div><div class="w-name">${name}</div><div style="font-size:13px;color:var(--td-text-secondary);margin-top:2px">${value}</div>`;
        break;
      case "camera":
        widget.classList.add("widget-camera");
        const ceid = config.entity_id || "";
        widget.innerHTML = `<img src="${this.app.apiBase}/api/image/camera/${ceid}" alt="Camera" onerror="this.style.opacity=0.2"><div class="camera-overlay">${name || ceid}</div>`;
        setInterval(() => { const img = widget.querySelector("img"); if (img) img.src = `${this.app.apiBase}/api/image/camera/${ceid}?t=${Date.now()}`; }, (config.config?.refresh_interval || 5) * 1000);
        break;
      default:
        widget.innerHTML = `<div class="w-icon"><span style="font-size:24px">${icon}</span></div><div><span class="w-value">${value}</span><span class="w-unit">${unit}</span></div><div class="w-name">${name}</div>`;
    }

    if (config.font) widget.style.fontFamily = `"${config.font}",sans-serif`;
    if (config.fontSize) { const ve = widget.querySelector(".w-value"); if (ve) ve.style.fontSize = config.fontSize + "px"; }
    if (config.textColor) widget.style.color = config.textColor;
    if (config.bgColor) widget.style.background = config.bgColor;
    if (config.borderRadius) widget.style.borderRadius = config.borderRadius + "px";
    return widget;
  }

  _updateWidget(widgetInfo, entityId, newState) {
    const { element, config } = widgetInfo;
    const value = newState.state || "—", unit = newState.attributes?.unit_of_measurement || config.unit || "";
    switch (config.type) {
      case "gauge":
        const min = config.config?.min || 0, max = config.config?.max || 100, nv = parseFloat(value) || 0;
        const pct = Math.max(0, Math.min(100, ((nv - min) / (max - min)) * 100));
        const arc = element.querySelector(".gauge-arc-value"), txt = element.querySelector(".gauge-text-value");
        if (arc) { arc.setAttribute("stroke-dasharray", `${pct * 2.51} 251`); arc.setAttribute("stroke", this._getZoneColor(nv, config.config?.zones)); }
        if (txt) txt.textContent = `${nv}${unit}`;
        break;
      case "progress-bar":
        const pm = config.config?.min || 0, px = config.config?.max || 100, pv = parseFloat(value) || 0;
        const fill = element.querySelector(".progress-fill"), ve = element.querySelector(".w-value");
        if (fill) fill.style.width = `${Math.max(0, Math.min(100, ((pv - pm) / (px - pm)) * 100))}%`;
        if (ve) ve.textContent = pv;
        break;
      default:
        const wv = element.querySelector(".w-value"); if (wv) wv.textContent = value;
    }
    element.classList.remove("value-changed"); void element.offsetWidth; element.classList.add("value-changed");
  }

  _doTransition(newScreen, type) {
    const oldScreen = this.container.querySelector(".screen");
    if (oldScreen && type !== "none") {
      newScreen.classList.add(`screen-enter-${type}`);
      oldScreen.classList.add(`screen-exit-${type}`);
      this.container.appendChild(newScreen);
      setTimeout(() => { oldScreen.remove(); newScreen.classList.remove(`screen-enter-${type}`); }, 600);
    } else {
      if (oldScreen) oldScreen.remove();
      this.container.appendChild(newScreen);
    }
  }

  _startRotation() {
    this._stopRotation();
    if (this.screens.length <= 1 || this.isPaused) return;
    const ms = (this.screens[this.currentIndex]?.duration || 15) * 1000;
    this.rotationTimer = setTimeout(() => { if (!this.isPaused && !this.temporaryScreen) this.next(); this._startRotation(); }, ms);
  }

  _stopRotation() {
    if (this.rotationTimer) { clearTimeout(this.rotationTimer); this.rotationTimer = null; }
    if (this._clockInterval) clearInterval(this._clockInterval);
    if (this._cameraInterval) clearInterval(this._cameraInterval);
  }

  _getZoneColor(value, zones) {
    if (!zones?.length) return "var(--td-accent)";
    for (const z of zones) if (value >= z.from && value <= z.to) return z.color;
    return "var(--td-accent)";
  }
}

/* ══════════════════════════════════════════════════════════
   TICKER MANAGER
   ══════════════════════════════════════════════════════════ */

class TickerManager {
  constructor(app) {
    this.app = app;
    this.container = document.getElementById("ticker-content");
    this.bar = document.getElementById("ticker-bar");
    this.messages = []; this.entityTemplates = [];
  }

  init() {
    const tc = this.app.config.ticker || {};
    if (!tc.enabled) {
      if (this.bar) this.bar.hidden = true;
      document.querySelector(".screen-container")?.classList.add("no-ticker");
      return;
    }
    this.entityTemplates = tc.entities || [];
    this._rebuild();
  }

  rebuild() { this.entityTemplates = (this.app.config.ticker || {}).entities || []; this._rebuild(); }

  addMessages(msgs) {
    for (const m of msgs) this.messages.push({ text: m.text || m.message || "", color: m.color, icon: m.icon, timestamp: Date.now(), duration: m.duration || 300 });
    this._rebuild();
  }

  setEntities(data) { this.entityTemplates = data.entities || []; this._rebuild(); }
  clear() { this.messages = []; this.entityTemplates = []; this._rebuild(); }

  onEntityUpdate(entityId, newState) {
    if (this.entityTemplates.some(t => (typeof t === "string" ? t : t.entity_id) === entityId)) this._rebuild();
  }

  _rebuild() {
    if (!this.container) return;
    let items = [];

    for (const tmpl of this.entityTemplates) {
      const eid = typeof tmpl === "string" ? tmpl : tmpl.entity_id;
      const tpl = typeof tmpl === "string" ? "{friendly_name}: {state}" : (tmpl.template || "{state}");
      const color = typeof tmpl === "object" ? tmpl.color : null;
      const state = this.app.entityStates[eid];
      if (state) {
        let text = tpl.replace("{state}", state.state || "").replace("{friendly_name}", state.attributes?.friendly_name || eid).replace("{unit}", state.attributes?.unit_of_measurement || "");
        items.push({ text, color });
      }
    }

    const now = Date.now();
    this.messages = this.messages.filter(m => (now - m.timestamp) / 1000 < m.duration);
    for (const m of this.messages) items.push({ text: m.text, color: m.color, icon: m.icon });

    if (items.length === 0) { this.container.innerHTML = ""; this.container.classList.remove("scrolling"); return; }

    const build = (list) => list.map((item, i) => {
      const s = item.color ? `color:${item.color}` : "";
      return `<span class="ticker-item" style="${s}">${item.text}</span>` + (i < list.length - 1 ? `<span class="ticker-separator">│</span>` : "");
    }).join("");

    this.container.innerHTML = build(items) + `<span class="ticker-separator">│</span>` + build(items);
    this.container.classList.add("scrolling");
    const speed = this.app.config.ticker?.speed || "normal";
    const mult = { slow: 1.5, normal: 1, fast: 0.6 }[speed] || 1;
    this.container.style.setProperty("--ticker-duration", `${Math.max(10, items.length * 5 * mult)}s`);
  }
}

/* ══════════════════════════════════════════════════════════
   ALERT MANAGER
   ══════════════════════════════════════════════════════════ */

class AlertManager {
  constructor(app) {
    this.app = app;
    this.overlay = document.getElementById("alert-overlay");
    this.banner = document.getElementById("notification-banner");
    this.toastContainer = document.getElementById("toast-container");
    this.pipContainer = document.getElementById("pip-container");
    this._timers = []; this._pipInterval = null;
  }

  show(data) {
    const mode = data.mode || "fullscreen";
    switch (mode) {
      case "fullscreen": this._showFullscreen(data); break;
      case "notification": case "banner": this._showBanner(data); break;
      case "toast": this._showToast(data); break;
      case "pip": this._showPip(data); break;
      default: this._showFullscreen(data);
    }
    if (data.sound_url) this.app.bridge.playSound(data.sound_url, data.volume || 100, data.sound_loop || false);
    if (data.vibrate) this.app.bridge.vibrate(500);
  }

  clearAll() {
    if (this.overlay) this.overlay.hidden = true;
    if (this.banner) this.banner.hidden = true;
    if (this.toastContainer) this.toastContainer.hidden = true;
    if (this.pipContainer) this.pipContainer.hidden = true;
    this.app.bridge.stopSound();
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
    if (this._pipInterval) clearInterval(this._pipInterval);
  }

  _showFullscreen(data) {
    const sev = data.severity || "info";
    const icons = { info: "ℹ️", warning: "⚠️", critical: "🚨" };
    this.overlay.className = `alert-overlay severity-${sev}`;
    this.overlay.innerHTML = `<div class="alert-icon">${data.icon || icons[sev] || "ℹ️"}</div>
      <div class="alert-title">${data.title || ""}</div><div class="alert-message">${data.message || ""}</div>
      ${data.duration ? `<div class="alert-timer">Schließt in ${data.duration}s</div>` : ""}`;
    this.overlay.hidden = false;
    if (data.duration && data.duration > 0 && !data.persistent)
      this._timers.push(setTimeout(() => { this.overlay.hidden = true; }, data.duration * 1000));
  }

  _showBanner(data) {
    this.banner.style.background = data.color || "var(--td-accent)";
    this.banner.innerHTML = `<span style="font-size:20px">${data.icon || "ℹ️"}</span>
      <div><div style="font-weight:600">${data.title || ""}</div><div style="font-size:14px;opacity:.9">${data.message || ""}</div></div>`;
    this.banner.hidden = false;
    this._timers.push(setTimeout(() => { this.banner.hidden = true; }, (data.duration || 10) * 1000));
  }

  _showToast(data) {
    this.toastContainer.innerHTML = `<div class="toast-message">${data.message || ""}</div>`;
    this.toastContainer.hidden = false;
    this._timers.push(setTimeout(() => { this.toastContainer.hidden = true; }, (data.duration || 5) * 1000));
  }

  _showPip(data) {
    const pos = data.pip_position || "top-right", size = data.pip_size || "medium", eid = data.entity_id || "";
    this.pipContainer.className = `pip-container ${pos} ${size}`;
    const img = this.pipContainer.querySelector("#pip-image");
    if (img) {
      img.src = `${this.app.apiBase}/api/image/camera/${eid}?t=${Date.now()}`;
      this._pipInterval = setInterval(() => { img.src = `${this.app.apiBase}/api/image/camera/${eid}?t=${Date.now()}`; }, (data.refresh_interval || 5) * 1000);
    }
    this.pipContainer.hidden = false;
    if (data.duration && data.duration > 0)
      this._timers.push(setTimeout(() => { this.pipContainer.hidden = true; if (this._pipInterval) clearInterval(this._pipInterval); }, data.duration * 1000));
  }
}

/* ══════════════════════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════════════════════ */

class TickerDisplayApp {
  constructor() {
    this.config = window.TICKER_CONFIG || {};
    this.deviceId = window.TICKER_DEVICE_ID || "unknown";
    this.wsUrl = window.TICKER_WS_URL || "";
    this.apiBase = window.TICKER_API_BASE || "/ticker-display";
    this.neededEntities = window.TICKER_ENTITIES || [];
    this.entityStates = {};
    this.dataManager = new DataManager(this.apiBase);
  }

  async init() {
    console.log("🚀 Ticker Display starting...", this.deviceId);
    try {
      this.bridge = new BridgeWrapper();
      this.themeManager = new ThemeManager();
      this.screenManager = new ScreenManager(this);
      this.tickerManager = new TickerManager(this);
      this.alertManager = new AlertManager(this);
      this.wsClient = new WebSocketClient(this);
      await this.wsClient.connect();
      this.screenManager.start();
      this.tickerManager.init();
      this._startSensorReporting();
      const l = document.getElementById("loading-screen"); if (l) l.style.display = "none";
      console.log("✅ Ticker Display ready!");
    } catch (e) { console.error("❌ Init error:", e); }
  }

  onEntityStateChanged(id, state) { this.entityStates[id] = state; this.screenManager.onEntityUpdate(id, state); this.tickerManager.onEntityUpdate(id, state); }

  onCommand(cmd, data) {
    const screenCmds = ["show_dashboard", "show_graph", "show_camera", "show_weather", "show_single_value", "show_clock", "show_status_board", "show_image", "show_template"];
    if (screenCmds.includes(cmd)) { this.screenManager.showTemporaryScreen(cmd, data); return; }
    if (cmd === "clear_alert") this.alertManager.clearAll();
    else if (cmd === "set_ticker_entities") this.tickerManager.setEntities(data);
    else if (cmd === "clear_ticker") this.tickerManager.clear();
    else if (cmd === "identify") this._showIdentify();
  }

  onAlert(data) { this.alertManager.show(data); }
  onTickerMessages(msgs) { this.tickerManager.addMessages(msgs); }

  onDisplayControl(data) {
    if (data.brightness !== undefined) this.bridge.setScreenBrightness(data.brightness);
    if (data.screen_power !== undefined) this.bridge.setScreenPower(data.screen_power);
  }

  onAudio(data) {
    if (data.action === "play") this.bridge.playSound(data.url, data.volume, data.loop);
    else if (data.action === "tts") this.bridge.ttsSpeak(data.text, data.language, data.volume);
    else if (data.action === "stop") this.bridge.stopSound();
    else if (data.action === "set_volume") this.bridge.setVolume(data.volume);
  }

  onNavigate(data) {
    if (data.action === "next") this.screenManager.next();
    else if (data.action === "previous") this.screenManager.previous();
    else if (data.action === "goto") this.screenManager.goto(data.screen_id);
    else if (data.action === "pause") this.screenManager.pauseRotation();
    else if (data.action === "resume") this.screenManager.resumeRotation();
  }

  onConfigChanged(cfg) { this.config = cfg; this.screenManager.rebuild(); this.tickerManager.rebuild(); try { localStorage.setItem("ticker_config_cache", JSON.stringify(cfg)); } catch (e) { } }
  onThemeChanged(data) { this.themeManager.applyDynamic(data); }

  reportSensorsNow() {
    if (!this.bridge || !this.bridge.isAvailable()) return;
    const d = this.bridge.getAllSensorData();
    if (d && this.wsClient?.isConnected()) {
      this.wsClient.send({
        type: "sensor_update",
        data: { device_id: this.deviceId, ...d }
      });
    }
  }

  _startSensorReporting() {
    if (!this.bridge.isAvailable()) return;
    this._sensorTimer = setInterval(() => this.reportSensorsNow(), 30000);
    setTimeout(() => this.reportSensorsNow(), 2000);
  }

  _showIdentify() {
    const o = document.createElement("div");
    o.style.cssText = "position:fixed;inset:0;background:var(--td-accent);z-index:10000;display:flex;align-items:center;justify-content:center;flex-direction:column;animation:blink .5s ease 6";
    o.innerHTML = `<div style="font-size:48px;font-weight:700;color:white">${this.config.name || this.deviceId}</div><div style="font-size:20px;color:rgba(255,255,255,.7);margin-top:12px">${this.deviceId}</div>`;
    document.body.appendChild(o); setTimeout(() => o.remove(), 3000);
  }
}

document.addEventListener("DOMContentLoaded", () => { window.tickerApp = new TickerDisplayApp(); window.tickerApp.init(); });