/**
 * Ticker Display – Enhanced Display Engine v2
 * Fixed: Charts, missing methods, history formats, animations
 */

/* ══════════════════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════════════════ */

const Utils = {
  formatNumber(v, d = 1) {
    const n = parseFloat(v);
    return Number.isNaN(n) ? v : n.toFixed(d);
  },

  relativeTime(iso) {
    if (!iso) return "";
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "gerade eben";
    if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
    if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
    return `vor ${Math.floor(diff / 86400)} Tagen`;
  },

  debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  },

  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },

  safeArray(v) { return Array.isArray(v) ? v : []; },

  text(v, fallback = "—") {
    if (v === null || v === undefined || v === "") return fallback;
    return String(v);
  },

  toNumber(v, fallback = 0) {
    const n = parseFloat(v);
    return Number.isNaN(n) ? fallback : n;
  },

  formatValue(v, opts = {}) {
    if (v === null || v === undefined || v === "") return opts.fallback ?? "—";
    const raw = String(v).trim();
    const numeric = Number.parseFloat(raw);
    if (!Number.isFinite(numeric) || !/^[-+]?\d+(?:[\.,]\d+)?$/.test(raw.replace(',', '.'))) return raw;
    let decimals = opts.decimals;
    if (decimals === undefined || decimals === null || decimals === "") return String(numeric);
    decimals = Math.max(0, Math.min(6, Number(decimals) || 0));
    let out = numeric.toFixed(decimals);
    if (opts.trimTrailingZeros) {
      out = out.replace(/\.0+$/, '');
      out = out.replace(/(\.\d*?[1-9])0+$/, '$1');
    }
    return out;
  },

  formatStateWithUnit(v, unit = '', opts = {}) {
    const value = Utils.formatValue(v, opts);
    if (!unit) return value;
    return `${value}${opts.spaceBeforeUnit === false ? '' : ' '}${unit}`;
  },

  isTruthyState(v) {
    return ["on", "true", "home", "open", "detected", "playing"].includes(String(v).toLowerCase());
  },

  shortDateTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  },

  applyAlpha(color, alpha = null) {
    if (color == null || color === "") return "";
    if (alpha === null || alpha === undefined || alpha === "") return String(color);
    const a = Utils.clamp(Number(alpha), 0, 1);
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
    if (/^var\(/i.test(raw)) {
      return `color-mix(in srgb, ${raw} ${Math.round(a * 100)}%, transparent)`;
    }
    return raw;
  }
};

/* ══════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════ */

const CHART_WIDGET_TYPES = new Set([
  "mini-graph", "sparkline", "line-chart", "bar-chart", "area-chart",
  "multi-line-chart", "stacked-bar-chart", "horizontal-bar-chart",
  "donut-chart", "pie-chart", "radar-chart", "heatmap-mini",
  "timeline-chart", "scatter-chart", "bubble-chart", "polar-area-chart",
  "forecast-chart", "energy-flow-mini", "comparison-chart",
  "radial-gauge-advanced", "bullet-chart"
]);

const METRIC_WIDGET_TYPES = new Set([
  "simple-value", "icon-value", "trend-arrow", "status-dot", "gauge", "progress-bar"
]);

const CHART_TYPE_ICONS = {
  "mini-graph": "📉", "sparkline": "〰️", "line-chart": "📈",
  "bar-chart": "📊", "area-chart": "🌊", "multi-line-chart": "📈",
  "stacked-bar-chart": "🧱", "horizontal-bar-chart": "↔️",
  "donut-chart": "🍩", "pie-chart": "🥧", "radar-chart": "🕸️",
  "heatmap-mini": "🔥", "timeline-chart": "🕒", "scatter-chart": "✳️",
  "bubble-chart": "🫧", "polar-area-chart": "🧿", "forecast-chart": "🔮",
  "energy-flow-mini": "⚡", "comparison-chart": "⚖️",
  "radial-gauge-advanced": "🎛️", "bullet-chart": "🎯"
};

/* ══════════════════════════════════════════════════════════
   DATA MANAGER – FIX: History-Format-Erkennung
   ══════════════════════════════════════════════════════════ */

class DataManager {
  constructor(apiBase) {
    this.apiBase = apiBase;
    this._cache = {};
  }

  async _fetchJson(path, options = {}) {
    const response = await fetch(`${this.apiBase}${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
    });
    if (!response.ok) {
      throw new Error(`${path}: ${response.status}`);
    }
    return response.json();
  }

  async fetchHistory(entityId, hours = 24) {
    const key = `h_${entityId}_${hours}`;
    const cached = this._cache[key];
    if (cached && Date.now() - cached.t < 60000) return cached.d;

    try {
      const raw = await this._fetchJson(`/api/history/${encodeURIComponent(entityId)}?hours=${encodeURIComponent(hours)}`);

      let data = [];

      // Format A: {entity_id, data: [{x, y}]}
      if (raw?.data && Array.isArray(raw.data)) {
        data = this._convertHistoryPoints(raw.data);
      }
      // Format B: HA-Standard – Array von Arrays [[{state, last_changed}]]
      else if (Array.isArray(raw) && Array.isArray(raw[0])) {
        data = this._convertHistoryPoints(raw[0]);
      }
      // Format C: Flaches Array [{state, last_changed}] oder [{x, y}]
      else if (Array.isArray(raw)) {
        data = this._convertHistoryPoints(raw);
      }
      // Format D: Objekt mit data-Property
      else if (raw?.data) {
        data = this._convertHistoryPoints(Utils.safeArray(raw.data));
      }

      const result = { entity_id: entityId, data };
      this._cache[key] = { d: result, t: Date.now() };
      return result;
    } catch (e) {
      console.warn("fetchHistory failed:", entityId, e);
      return { entity_id: entityId, data: [] };
    }
  }

  _convertHistoryPoints(arr) {
    return Utils.safeArray(arr)
      .map(p => {
        if (!p || typeof p !== "object") return null;
        // Ignoriere unavailable/unknown
        if (p.state === "unavailable" || p.state === "unknown") return null;

        const time = p.x || p.last_changed || p.last_updated || p.timestamp || p.t || p.date || p.time || null;
        const val  = p.y ?? p.value ?? p.state ?? p.v ?? p.val ?? null;

        if (val === null || val === undefined) return null;
        const y = Utils.toNumber(val, null);
        if (y === null) return null;

        return { x: time || new Date().toISOString(), y };
      })
      .filter(Boolean);
  }

  async fetchWeather(entityId) {
    try {
      return await this._fetchJson(`/api/weather/${encodeURIComponent(entityId)}`);
    } catch (e) { return null; }
  }

  async fetchState(entityId) {
    try {
      return await this._fetchJson(`/api/states/${encodeURIComponent(entityId)}`);
    } catch (e) { return null; }
  }

  getCameraUrl(entityId, mode = "auto") {
    return `${this.apiBase}/api/image/camera/${entityId}?mode=${encodeURIComponent(mode)}&t=${Date.now()}`;
  }

  async resolveCameraUrl(entityId, mode = "auto") {
    const url = this.getCameraUrl(entityId, mode);
    try {
      const r = await fetch(url, { cache: "no-store" });
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const data = await r.json();
        if (data?.redirect) return { url: data.redirect, mode: data.mode || mode };
      }
      if (r.ok) return { url, mode };
    } catch (e) {}
    return { url, mode };
  }
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

  setScreenBrightness(v) {
    if (this._bridge?.setScreenBrightness) this._bridge.setScreenBrightness(Math.round(v));
  }

  setScreenPower(on) {
    if (this._bridge?.setScreenPower) this._bridge.setScreenPower(!!on);
  }

  playSound(url, volume = 100, loop = false) {
    if (!url) return;
    if (this._bridge) {
      try {
        loop ? this._bridge.playSoundLoop(url) : this._bridge.playSound(url);
        if (volume !== undefined) this._bridge.setVolume(volume);
      } catch (e) {}
      return;
    }
    try {
      if (this._audioElement) this._audioElement.pause();
      this._audioElement = new Audio(url);
      this._audioElement.volume = Utils.clamp(volume / 100, 0, 1);
      this._audioElement.loop = loop;
      this._audioElement.play().catch(() => {});
    } catch (e) {}
  }

  stopSound() {
    if (this._bridge?.stopSound) { try { this._bridge.stopSound(); } catch (e) {} return; }
    if (this._audioElement) { this._audioElement.pause(); this._audioElement = null; }
  }

  ttsSpeak(text, lang = "de") {
    if (this._bridge?.ttsSpeak) { try { this._bridge.ttsSpeak(text, lang); } catch (e) {} }
  }

  setVolume(v) {
    if (this._bridge?.setVolume) { try { this._bridge.setVolume(v); } catch (e) {} }
  }

  vibrate(ms = 500) {
    if (this._bridge?.vibrate) { try { this._bridge.vibrate(ms); } catch (e) {} }
    else if (navigator.vibrate) navigator.vibrate(ms);
  }

  getAllSensorData() {
    if (!this._bridge) return null;
    try {
      return {
        battery_level: this._bridge.getBatteryLevel?.(),
        battery_charging: this._bridge.isBatteryCharging?.(),
        battery_temperature: this._bridge.getBatteryTemperature?.(),
        wifi_signal: this._bridge.getWifiSignal?.(),
        wifi_ssid: this._bridge.getWifiSsid?.(),
        ip_address: this._bridge.getIpAddress?.(),
        light_level: this._bridge.getLightLevel?.(),
        motion_detected: this._bridge.isMotionDetected?.(),
        proximity_near: false,
        ambient_noise_db: 0,
        screen_on: this._bridge.isScreenOn?.(),
        screen_brightness: this._bridge.getScreenBrightness?.(),
        memory_free_mb: this._bridge.getMemoryFree?.(),
        cpu_usage: 0,
        app_version: this._bridge.getAppVersion?.(),
        uptime_seconds: 0,
      };
    } catch (e) { return null; }
  }
}

/* ══════════════════════════════════════════════════════════
   THEME MANAGER
   ══════════════════════════════════════════════════════════ */

class ThemeManager {
  applyDynamic(data) {
    if (!data) return;
    const root = document.documentElement;
    if (data.accent_color) root.style.setProperty("--td-accent", data.accent_color);
    if (data.vars) {
      Object.entries(data.vars).forEach(([k, v]) => {
        root.style.setProperty(`--td-${k}`, v);
      });
    }
  }
}

/* ══════════════════════════════════════════════════════════
   WEBSOCKET CLIENT
   ══════════════════════════════════════════════════════════ */

class WebSocketClient {
  constructor(app) {
    this.app = app;
    this.ws = null;
    this._connected = false;
    this._reconnectDelay = 1000;
    this._reconnectTimer = null;
    this._connectSeq = 0;
    this._manuallyClosed = false;
    this._hadSuccessfulConnection = false;
  }

  async connect() {
    this._manuallyClosed = false;
    const seq = ++this._connectSeq;

    return new Promise((resolve, reject) => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) { resolve(); return; }

        const ws = new WebSocket(this.app.wsUrl);
        this.ws = ws;

        ws.onopen = () => {
          if (seq !== this._connectSeq || ws !== this.ws) { try { ws.close(); } catch (e) {} return; }
          this._connected = true;
          this._hadSuccessfulConnection = true;
          this._reconnectDelay = 1000;
          if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
          const offline = document.getElementById("offline-screen");
          if (offline) offline.hidden = true;
          this.send({ type: "subscribe", entities: this.app.neededEntities || [] });
          resolve();
        };

        ws.onmessage = (e) => {
          if (seq !== this._connectSeq || ws !== this.ws) return;
          try { this._handleMessage(JSON.parse(e.data)); } catch (err) { console.error("WebSocket parse error:", err); }
        };

        ws.onclose = () => {
          if (seq !== this._connectSeq || ws !== this.ws) return;
          this._connected = false;
          const offline = document.getElementById("offline-screen");
          if (offline) {
            if (this.app?.isPreview) offline.hidden = true;
            else offline.hidden = !this._hadSuccessfulConnection;
          }
          if (!this._manuallyClosed) this._scheduleReconnect();
        };

        ws.onerror = (err) => {
          if (seq !== this._connectSeq || ws !== this.ws) return;
          reject(err);
        };
      } catch (e) { reject(e); }
    });
  }

  disconnect() {
    this._manuallyClosed = true;
    this._connected = false;
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch (e) {} }
  }

  send(data) {
    if (this.ws && this._connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  isConnected() { return this._connected; }

  _handleMessage(msg) {
    switch (msg.type) {
      case "state_changed": this.app.onEntityStateChanged(msg.entity_id, msg.new_state); break;
      case "command": this.app.onCommand(msg.command, msg.data || {}); break;
      case "alert": this.app.onAlert(msg.data || {}); break;
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
    if (this.app?.isPreview) return;
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect().catch(() => {
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
        this._scheduleReconnect();
      });
    }, this._reconnectDelay);
  }
}

/* ══════════════════════════════════════════════════════════
   SCREEN MANAGER – Beginn
   ══════════════════════════════════════════════════════════ */

class ScreenManager {
  constructor(app) {
    this.app = app;
    this.screens = Utils.safeArray(app.config.screens);
    this.currentIndex = 0;
    this.rotationTimer = null;
    this.isPaused = false;
    this.temporaryScreen = null;
    this.container = document.getElementById("screen-container");
    this._widgetElements = {};
    this._clockIntervals = [];
    this._cameraIntervals = [];
    this._countdownIntervals = [];
    this._chartInstances = [];
  }

  /* ────── FEHLENDE METHODE: _applyCommonWidgetStyle ────── */
  _applyCommonWidgetStyle(widget, config) {
    const backgroundColor = config.background_color || config.bgColor || config.config?.background_color || config.config?.bgColor || "";
    const backgroundOpacity = config.background_opacity ?? config.bgOpacity ?? config.config?.background_opacity ?? config.config?.bgOpacity ?? config.config?.opacity ?? null;
    const resolvedBackground = backgroundColor ? Utils.applyAlpha(backgroundColor, backgroundOpacity) : "";
    const borderColor = config.border_color || config.borderColor || config.config?.border_color || config.config?.borderColor || "";
    const borderWidth = config.border_width ?? config.borderWidth ?? config.config?.border_width ?? config.config?.borderWidth;
    const borderRadius = config.border_radius ?? config.borderRadius ?? config.config?.border_radius ?? config.config?.borderRadius;
    const textColor = config.text_color || config.textColor || config.config?.text_color || config.config?.textColor || "";
    const fontSize = config.font_size ?? config.fontSize ?? config.config?.font_size ?? config.config?.fontSize;
    const fontFamily = config.font_family || config.font || config.config?.font_family || config.config?.font || "";
    const blur = config.blur ?? config.backdrop_blur ?? config.config?.blur ?? config.config?.backdrop_blur ?? 0;
    const customCss = config.custom_css || config.customCss || config.config?.custom_css || config.config?.customCss || "";

    if (resolvedBackground) widget.style.background = resolvedBackground;
    if (backgroundOpacity !== null && backgroundOpacity !== undefined) {
      widget.classList.add("widget-translucent");
      widget.style.setProperty("--td-widget-bg-opacity", String(Utils.clamp(Number(backgroundOpacity), 0, 1)));
    }
    if (config.background_image || config.bgImage) {
      const widgetBg = Utils.applyAlpha(backgroundColor || "rgba(30,30,30,1)", backgroundOpacity ?? 1);
      const imageUrl = config.background_image || config.bgImage;
      widget.style.backgroundImage = `linear-gradient(${widgetBg}, ${widgetBg}), url(${imageUrl})`;
      widget.style.backgroundSize = `100% 100%, ${config.background_size || config.background_image_size || config.bgImageSize || "cover"}`;
      widget.style.backgroundPosition = "center center, center center";
      widget.style.backgroundRepeat = "no-repeat, no-repeat";
    }
    if (borderColor) widget.style.borderColor = borderColor;
    if (borderWidth !== undefined && borderWidth !== null && borderWidth !== "") {
      widget.style.borderWidth = `${Number(borderWidth)}px`;
      widget.style.borderStyle = "solid";
    }
    if (borderRadius !== undefined && borderRadius !== null && borderRadius !== "") widget.style.borderRadius = `${Number(borderRadius)}px`;
    if (textColor) widget.style.color = textColor;
    if (fontSize !== undefined && fontSize !== null && fontSize !== "") widget.style.fontSize = `${Number(fontSize)}px`;
    if (fontFamily) widget.style.fontFamily = `'${String(fontFamily)}', var(--td-font-main, "Roboto", sans-serif)`;
    if (blur) {
      widget.style.backdropFilter = `blur(${Number(blur)}px) saturate(1.08)`;
      widget.style.webkitBackdropFilter = `blur(${Number(blur)}px) saturate(1.08)`;
    }
    if (config.css_class) widget.classList.add(...String(config.css_class).split(/\s+/).filter(Boolean));
    if (config.glass || config.config?.glass) widget.classList.add("widget-glass");
    if (config.glow || config.config?.glow) widget.classList.add("widget-glow");
    if (config.shadow === "none") widget.style.boxShadow = "none";
    else if (config.shadow === "elevated") widget.classList.add("widget-elevated");
    if (config.padding !== undefined) widget.style.padding = typeof config.padding === "number" ? `${config.padding}px` : config.padding;
    if (config.z_index) widget.style.zIndex = String(config.z_index);
    if (customCss) widget.style.cssText += `;${customCss}`;
  }

  /* ────── FEHLENDE METHODE: _loadCameraInto ────── */
  _loadCameraInto(imgElement, entityId, source = "auto") {
    if (!imgElement || !entityId) return;
    const sources = [];
    const preferred = source || "auto";
    if (preferred === "auto") sources.push("camera_proxy", "entity_picture", "snapshot", "camera_proxy_stream");
    else {
      sources.push(preferred);
      if (preferred !== "camera_proxy") sources.push("camera_proxy");
      if (preferred !== "entity_picture") sources.push("entity_picture");
      if (preferred !== "snapshot") sources.push("snapshot");
    }
    const tried = new Set();
    const next = () => {
      const mode = sources.find((item) => !tried.has(item));
      if (!mode) {
        imgElement.classList.add("camera-error");
        if (!imgElement.src) imgElement.alt = "⚠️ Kamera nicht verfügbar";
        return;
      }
      tried.add(mode);
      const url = this._cameraUrlForEntity(entityId, mode);
      if (!url) return next();
      imgElement.classList.add("camera-loading");
      imgElement.onload = () => {
        imgElement.classList.remove("camera-loading", "camera-error");
        imgElement.classList.add("camera-loaded");
      };
      imgElement.onerror = () => next();
      imgElement.src = url;
    };
    next();
  }

  /* ────── FEHLENDE METHODE: _cameraUrlForEntity ────── */
  _cameraUrlForEntity(entityId, source = "auto") {
    if (!entityId) return "";
    const base = this.app.apiBase || "/ticker-display";
    const mode = source || "auto";
    return `${base}/api/image/camera/${encodeURIComponent(entityId)}?mode=${encodeURIComponent(mode)}&t=${Date.now()}`;
  }

  /* ────── FIX: _normalizePoints ────── */
  _normalizePoints(rawPoints, fallbackValue = 0) {
    const raw = Utils.safeArray(rawPoints);
    const points = raw.map(p => {
      if (!p || typeof p !== "object") return null;
      if (p.x !== undefined && p.y !== undefined) { const y = Utils.toNumber(p.y, null); return y !== null ? { x: p.x, y } : null; }
      if (p.timestamp !== undefined && p.value !== undefined) { const y = Utils.toNumber(p.value, null); return y !== null ? { x: p.timestamp, y } : null; }
      if (p.last_changed !== undefined && p.state !== undefined) { const y = Utils.toNumber(p.state, null); return y !== null ? { x: p.last_changed, y } : null; }
      if (p.last_updated !== undefined && p.state !== undefined) { const y = Utils.toNumber(p.state, null); return y !== null ? { x: p.last_updated, y } : null; }
      if (p.t !== undefined && p.v !== undefined) { const y = Utils.toNumber(p.v, null); return y !== null ? { x: p.t, y } : null; }
      if (p.date !== undefined && p.value !== undefined) { const y = Utils.toNumber(p.value, null); return y !== null ? { x: p.date, y } : null; }
      if (p.time !== undefined && (p.val !== undefined || p.value !== undefined)) { const y = Utils.toNumber(p.val ?? p.value, null); return y !== null ? { x: p.time, y } : null; }
      return null;
    }).filter(Boolean);

    if (points.length > 0) return points;
    const now = new Date();
    const val = Utils.toNumber(fallbackValue, 0);
    return [
      { x: new Date(now.getTime() - 3600000).toISOString(), y: val * 0.95 },
      { x: now.toISOString(), y: val }
    ];
  }

  /* ────── Navigation ────── */
  start() {
    if (!this.container) return;
    if (!this.screens.length) {
      this.container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📱</div><div class="empty-state-title">Warte auf Konfiguration...</div><div class="empty-state-subtitle">${this.app.deviceId}</div></div>`;
      return;
    }
    this._showScreen(0);
    this._startRotation();
  }

  rebuild() {
    this.screens = Utils.safeArray(this.app.config.screens);
    this.currentIndex = 0;
    this.temporaryScreen = null;
    this._stopRotation();
    this.start();
  }

  next() { if (this.screens.length > 1) this._showScreen((this.currentIndex + 1) % this.screens.length); }
  previous() { if (this.screens.length > 1) this._showScreen((this.currentIndex - 1 + this.screens.length) % this.screens.length); }

  goto(screenId) {
    const i = this.screens.findIndex(s => s.id === screenId || s.name === screenId);
    if (i >= 0) this._showScreen(i);
  }

  pauseRotation() { this.isPaused = true; this._stopRotation(); }

  resumeRotation() {
    this.isPaused = false;
    this.temporaryScreen = null;
    this._showScreen(this.currentIndex);
    this._startRotation();
  }

  showTemporaryScreen(command, data) {
    const typeMap = { show_dashboard: "dashboard", show_graph: "graph", show_camera: "camera", show_weather: "weather", show_single_value: "single-value", show_clock: "clock", show_status_board: "status-board", show_image: "image", show_template: "dashboard" };
    const tempConfig = { type: typeMap[command] || "dashboard", ...data };
    this.temporaryScreen = tempConfig;
    this._stopRotation();
    this._renderScreen(tempConfig);
    if (data.duration && data.duration > 0) {
      setTimeout(() => {
        this.temporaryScreen = null;
        this._showScreen(this.currentIndex);
        if (!this.isPaused) this._startRotation();
      }, data.duration * 1000);
    }
  }

  onEntityUpdate(entityId, newState) {
    const widgets = this._widgetElements[entityId];
    if (widgets) { for (const w of widgets) this._updateWidget(w, entityId, newState); }
    const current = this.temporaryScreen || this.screens[this.currentIndex];
    if (!current) return;
    const weatherRelated = current.entity_id === entityId || Utils.safeArray(current.widgets).some(w => w.type === "weather" && w.entity_id === entityId);
    if ((current.type === "weather" || current.screen_weather_fx) && weatherRelated) this._renderScreen(current);
  }

  /* ────── Screen-Rendering ────── */
  _showScreen(index) {
    if (index >= this.screens.length) return;
    this.currentIndex = index;
    this._renderScreen(this.screens[index]);
    if (this.app.wsClient?.isConnected()) {
      this.app.wsClient.send({ type: "status", screen: this.screens[index].name || `screen_${index}` });
    }
  }

  _renderScreen(config) {
    this._widgetElements = {};
    this._clearIntervals();
    if (this.app.tickerManager) this.app.tickerManager._applyStyle({ ...(this.app.config.ticker || {}), ...(config.ticker_style || {}) });

    const screen = document.createElement("div");
    screen.className = "screen";
    screen.style.zIndex = "2";
    screen.style.isolation = "isolate";
    this._applyScreenStyle(screen, config);

    switch (config.type) {
      case "clock": this._buildClockScreen(screen, config); break;
      case "weather": this._buildWeatherScreen(screen, config); break;
      case "camera": this._buildCameraScreen(screen, config); break;
      case "image": this._buildImageScreen(screen, config); break;
      default: this._buildDashboardScreen(screen, config); break;
    }

    this._applyScreenWeatherOverlay(screen, config);
    const transition = config.transition || this.app.config.rotation?.transition || "fade";
    this._doTransition(screen, transition);
  }

  _applyScreenStyle(screen, config) {
    screen.style.backgroundColor = config.background_color || "var(--td-bg, #121212)";
    if (config.background_image) {
      const overlay = Number(config.background_overlay_opacity ?? 1);
      const shade = Math.max(0, Math.min(1, 1 - overlay));
      screen.style.backgroundImage = `linear-gradient(rgba(0,0,0,${shade}), rgba(0,0,0,${shade})), url(${config.background_image})`;
      screen.style.backgroundRepeat = "no-repeat, no-repeat";
      screen.style.backgroundPosition = "center center, center center";
      screen.style.backgroundSize = `100% 100%, ${config.background_image_size || "cover"}`;
    }
  }

  _getScreenWeatherEffectConfig(config) {
    const enabled = config.screen_weather_fx === true || config.weather_fullscreen_fx === true;
    if (!enabled) return null;
    let entityId = config.entity_id || null;
    if (!entityId) { const ww = Utils.safeArray(config.widgets).find(w => w.type === "weather" && w.entity_id); entityId = ww?.entity_id || null; }
    if (!entityId) return null;
    const state = this.app.entityStates[entityId] || {};
    const visual = this._weatherVisual(state?.state, config.config || config);
    return { entityId, visual, intensity: config.screen_weather_fx_intensity || "normal", layers: Number(config.screen_weather_fx_layers || 1) };
  }

  _applyScreenWeatherOverlay(screen, config) {
    const fx = this._getScreenWeatherEffectConfig(config);
    if (!fx) return;
    const overlay = document.createElement("div");
    overlay.className = `screen-weather-overlay ${fx.visual.theme} ${fx.visual.animClass} ${fx.visual.animate ? "animate" : ""} intensity-${fx.intensity} layers-${fx.layers}`;
    overlay.innerHTML = this._weatherFxMarkup(fx.visual.animClass, fx.layers);
    screen.appendChild(overlay);
  }

  /* ────── Screen Builders ────── */
  _buildDashboardScreen(screen, config) {
    const grid = document.createElement("div");
    grid.className = "dashboard-grid";
    const cols = config.grid?.columns || 3;
    const rows = config.grid?.rows || 2;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    const widgets = Utils.safeArray(config.widgets);
    widgets.forEach((wc, index) => {
      const widget = this._createWidget(wc);
      widget.style.setProperty("--widget-enter-delay", `${index * 60}ms`);
      widget.classList.add("widget-enter");
      widget.style.gridColumn = `${(wc.col || 0) + 1}/span ${wc.colspan || 1}`;
      widget.style.gridRow = `${(wc.row || 0) + 1}/span ${wc.rowspan || 1}`;
      grid.appendChild(widget);
    });
    screen.appendChild(grid);
  }

  _buildClockScreen(screen) {
    screen.innerHTML = `<div class="full-screen-center"><div id="clock-time" class="clock-time-large clock-animated">--:--</div><div id="clock-date" class="clock-date-large"></div></div>`;
    const update = () => {
      const now = new Date();
      const t = screen.querySelector("#clock-time");
      const d = screen.querySelector("#clock-date");
      if (t) t.textContent = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      if (d) d.textContent = now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    };
    update();
    this._clockIntervals.push(setInterval(update, 1000));
  }

  _buildWeatherScreen(screen, config) {
    const state = config.entity_id ? (this.app.entityStates[config.entity_id] || {}) : {};
    const visual = this._weatherVisual(state?.state, config.config || config);
    const temp = state?.attributes?.temperature ?? "--";
    const feels = state?.attributes?.temperature ?? temp;
    screen.innerHTML = `<div class="weather-screen ${visual.theme}"><div class="weather-animated-bg ${visual.animClass} ${visual.animate ? "animate" : ""}">${this._weatherFxMarkup(visual.animClass)}</div><div class="weather-screen-card"><div class="weather-hero-icon">${visual.icon}</div><div id="weather-temp" class="weather-temp-large">${temp}°C</div><div id="weather-condition" class="weather-cond-large">${visual.label}</div><div class="weather-meta-row"><span>Gefühlt</span><strong>${feels}°C</strong></div></div></div>`;
  }

  _buildCameraScreen(screen, config) {
    const eid = config.entity_id || config.config?.camera_entity || config.camera_entity || "";
    const preferredSource = config.config?.camera_source || config.camera_source || "auto";
    const liveMode = (config.config?.camera_view || config.camera_view || "still") === "live";
    const source = liveMode && preferredSource === "auto" ? "camera_proxy_stream" : preferredSource;
    const fit = config.config?.camera_fit || config.camera_fit || "contain";
    const title = this._widgetCameraTitle(config, config.title || config.name || eid || "Kamera");
    screen.innerHTML = `<img id="camera-img" class="screen-image-contain" style="object-fit:${fit}" alt="Camera">${title ? `<div class="screen-caption">${title}</div>` : ""}`;
    const img = screen.querySelector("#camera-img");
    if (img && eid) this._loadCameraInto(img, eid, source);
    if (!liveMode) {
      const ms = (config.refresh_interval || config.config?.refresh_interval || 5) * 1000;
      this._cameraIntervals.push(setInterval(() => { const ni = screen.querySelector("#camera-img"); if (ni && eid) this._loadCameraInto(ni, eid, source); }, ms));
    }
  }

  _buildImageScreen(screen, config) {
    const src = config.image_url || config.imageUrl || config.url || "";
    screen.innerHTML = `<div class="image-screen-wrap">${src ? `<img src="${src}" class="screen-image-contain" style="object-fit:${config.image_fit || config.background_image_size || "contain"}" alt="Image">` : `<div class="empty-state"><div class="empty-state-icon">🖼️</div><div class="empty-state-title">Kein Bild gesetzt</div></div>`}</div>`;
  }

  /* ────── Widget Factory ────── */
  _createWidget(config) {
    const widget = document.createElement("div");
    widget.className = `widget widget-${config.type || "simple-value"}`;

    const trackedIds = [config.entity_id, config.config?.camera_entity, config.camera_entity, ...Utils.safeArray(config.config?.entities || config.entities)].filter(Boolean);
    for (const tid of [...new Set(trackedIds)]) {
      if (!this._widgetElements[tid]) this._widgetElements[tid] = [];
      this._widgetElements[tid].push({ element: widget, config });
    }

    const state = this.app.entityStates[config.entity_id] || {};
    const value = state.state ?? "—";
    const attrs = state.attributes || {};
    const unit = attrs.unit_of_measurement || config.unit || "";
    const name = this._widgetName(config, attrs.friendly_name || "");
    const icon = config.icon || this._defaultIconForType(config.type);

    switch (config.type) {
      case "gauge": this._renderGaugeWidget(widget, config, value, unit, name); break;
      case "progress-bar": this._renderProgressBarWidget(widget, config, value, unit, name); break;
      case "status-dot": this._renderStatusDotWidget(widget, config, value, name); break;
      case "trend-arrow": this._renderTrendArrowWidget(widget, config, state, name, icon); break;
      case "media-player-control": this._renderMediaPlayerControlWidget(widget, config, state, name, icon); break;
      case "switch-control": this._renderSwitchControlWidget(widget, config, state, name, icon); break;
      case "light-control": this._renderLightControlWidget(widget, config, state, name, icon); break;
      case "climate-control": this._renderClimateControlWidget(widget, config, state, name, icon); break;
      case "cover-control": this._renderCoverControlWidget(widget, config, state, name, icon); break;
      case "camera": this._renderCameraWidget(widget, config, name); break;
      case "weather": this._renderWeatherWidget(widget, config, state); break;
      case "clock": this._renderClockWidget(widget, config); break;
      case "countdown": this._renderCountdownWidget(widget, config); break;
      case "image": this._renderImageWidget(widget, config, name); break;
      case "qr-code": this._renderQrWidget(widget, config); break;
      case "color-block": this._renderColorBlockWidget(widget, config, name); break;
      case "button": this._renderButtonWidget(widget, config, name); break;
      case "mini-graph": case "sparkline": case "line-chart": case "bar-chart":
      case "area-chart": case "multi-line-chart": case "stacked-bar-chart":
      case "horizontal-bar-chart": case "donut-chart": case "pie-chart":
      case "radar-chart": case "heatmap-mini": case "timeline-chart":
      case "scatter-chart": case "bubble-chart": case "polar-area-chart":
      case "forecast-chart": case "energy-flow-mini": case "comparison-chart":
      case "radial-gauge-advanced": case "bullet-chart":
        this._renderChartWidget(widget, config, state, name); break;
      case "icon-value":
        if (String(config.entity_id || "").startsWith("media_player.")) this._renderMediaPlayerWidget(widget, config, state, name, icon);
        else this._renderIconValueWidget(widget, config, value, unit, name, icon);
        break;
      default: this._renderDefaultWidget(widget, config, value, unit, name, icon); break;
    }

    this._applyCommonWidgetStyle(widget, config);
    if (METRIC_WIDGET_TYPES.has(config.type || "")) this._renderMetricSparkline(widget, config);
    widget.classList.toggle("widget-animated", config.animations !== false);
    widget.classList.toggle(`widget-anim-${config.type || "generic"}`, config.animations !== false);
    widget.classList.remove("anim-auto", "anim-soft", "anim-lively", "anim-pulse");
    widget.classList.add(`anim-${config.animation_style || "auto"}`);
    widget.dataset.widgetType = config.type || "generic";
    const interactionConfig = this._effectiveWidgetInteractionConfig(config);
    this._syncWidgetToggleBadge(widget, interactionConfig);
    this._bindWidgetInteraction(widget, interactionConfig);
    return widget;
  }

  /* ────── Widget Renderers ────── */
  _renderDefaultWidget(widget, config, value, unit, name, icon) {
    widget.innerHTML = `<div class="w-icon"><span style="font-size:24px">${icon}</span></div><div class="w-value-wrap"><span class="w-value">${Utils.formatValue(value, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div>${name ? `<div class="w-name">${name}</div>` : ""}`;
    this._renderExtraEntityList(widget, config);
  }

  _renderIconValueWidget(widget, config, value, unit, name, icon) {
    widget.innerHTML = `<div class="w-icon"><span style="font-size:28px">${icon}</span></div><div class="w-value-wrap"><span class="w-value">${Utils.formatValue(value, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div>${name ? `<div class="w-name">${name}</div>` : ""}`;
    this._renderExtraEntityList(widget, config);
  }

  _renderMediaPlayerWidget(widget, config, state, name, icon) {
    const attrs = state?.attributes || {};
    const cover = attrs.entity_picture || "";
    const title = Utils.text(attrs.media_title || state?.state || "—");
    const subtitle = Utils.text(attrs.media_artist || attrs.source || attrs.friendly_name || "");
    const progress = Number(attrs.media_duration || 0) > 0 ? Math.max(0, Math.min(100, ((Number(attrs.media_position || 0) / Number(attrs.media_duration || 1)) * 100))) : 0;
    const vol = Math.round(Number(attrs.volume_level || 0) * 100);
    widget.classList.add("widget-media-modern");
    widget.innerHTML = `<div class="media-widget-shell">${cover ? `<img class="media-widget-cover" src="${cover}" alt="Cover">` : `<div class="media-widget-cover placeholder">${icon || "🎵"}</div>`}<div class="media-widget-meta">${name ? `<div class="w-name">${name}</div>` : ""}<div class="media-widget-title">${title}</div><div class="media-widget-subtitle">${subtitle}</div><div class="media-widget-state-row"><div class="media-widget-state">${Utils.text(state?.state || "—")}</div><div class="media-widget-vol">🔊 ${vol}%</div></div><div class="media-widget-progress"><span style="width:${progress}%"></span></div><div class="media-widget-controls"><span>⏮</span><span>⏯</span><span>⏭</span></div></div></div>`;
    this._renderExtraEntityList(widget, config);
  }

  _controlDisplayOptions(config = {}) {
    const cfg = config?.config || {};
    return {
      layout: cfg.control_layout || "compact",
      showIcon: cfg.control_show_icon !== false,
      showName: cfg.control_show_name !== false && cfg.show_name !== false,
      showValue: cfg.control_show_value !== false,
      showSub: cfg.control_show_sub !== false,
      showMeter: cfg.control_show_meter !== false,
      showStatusChip: cfg.control_show_status_chip !== false,
      showToggleBadge: cfg.control_show_toggle_badge !== false && config?.toggle_badge !== false,
      showPopupColors: cfg.control_show_popup_colors !== false,
      showPopupEffects: cfg.control_show_popup_effects !== false,
      showPopupPositionPresets: cfg.control_show_popup_position_presets !== false,
      showPopupTilt: cfg.control_show_popup_tilt !== false,
      showPopupModes: cfg.control_show_popup_modes !== false,
      showPopupPresets: cfg.control_show_popup_presets !== false,
      showPopupFanModes: cfg.control_show_popup_fan_modes !== false,
    };
  }

  _controlIconTint(attrs = {}) {
    const rgb = Utils.safeArray(attrs?.rgb_color || []);
    if (rgb.length >= 3) {
      return `background:linear-gradient(135deg, rgba(${rgb[0]},${rgb[1]},${rgb[2]},.42), rgba(126,87,194,.18)); box-shadow:0 12px 24px rgba(0,0,0,.22), 0 0 0 1px rgba(${rgb[0]},${rgb[1]},${rgb[2]},.24) inset;`;
    }
    return "";
  }

  _controlSummary(config, state, name, icon) {
    const entityId = config?.entity_id || config?.tap_target_entity || "";
    const domain = String(entityId || "").split(".")[0] || "switch";
    const attrs = state?.attributes || {};
    const rawState = String(state?.state || "off");
    const active = Utils.isTruthyState(rawState) || rawState === "open" || rawState === "opening" || rawState === "playing";
    const friendly = Utils.text(name || attrs.friendly_name || entityId || domain || "Widget");
    const summary = {
      domain,
      entityId,
      name: friendly,
      icon: icon || this._defaultIconForType(config?.type),
      active,
      value: Utils.text(state?.state || "—"),
      sub: Utils.text(attrs.friendly_name || domain),
      meter: active ? 100 : 0,
      chip: active ? "Aktiv" : "Aus",
      chipClass: active ? "on" : "off",
      cover: "",
      iconStyle: "",
    };

    if (domain === "media_player") {
      const progress = Number(attrs.media_duration || 0) > 0 ? Math.max(0, Math.min(100, ((Number(attrs.media_position || 0) / Number(attrs.media_duration || 1)) * 100))) : 0;
      summary.cover = attrs.entity_picture || "";
      summary.value = Utils.text(attrs.media_title || state?.state || "—");
      summary.sub = Utils.text(attrs.media_artist || attrs.source || attrs.friendly_name || "");
      summary.meter = progress;
      summary.chip = `🔊 ${Math.round(Number(attrs.volume_level || 0) * 100)}%`;
      summary.chipClass = summary.active ? "on" : "off";
      return summary;
    }

    if (domain === "light") {
      const brightness = attrs.brightness == null ? (active ? 100 : 0) : Math.round((Number(attrs.brightness || 0) / 255) * 100);
      summary.value = active ? `${brightness}%` : "Aus";
      summary.sub = Utils.text(attrs.effect || attrs.color_mode || attrs.supported_color_modes?.[0] || "Licht");
      summary.meter = Math.max(0, Math.min(100, brightness));
      summary.chip = active ? "Licht an" : "Aus";
      summary.chipClass = active ? "on" : "off";
      summary.iconStyle = this._controlIconTint(attrs);
      return summary;
    }

    if (domain === "climate") {
      const currentTemp = attrs.current_temperature ?? "—";
      const targetTemp = attrs.temperature ?? attrs.target_temp_high ?? attrs.target_temp_low ?? "—";
      const mode = Utils.text(state?.state || attrs.hvac_mode || "—");
      summary.value = `${Utils.text(currentTemp)}°C`;
      summary.sub = `Soll ${Utils.text(targetTemp)}°C · ${mode}`;
      summary.meter = Number.isFinite(Number(targetTemp)) ? Math.max(0, Math.min(100, (Number(targetTemp) / 30) * 100)) : 0;
      summary.chip = mode;
      summary.chipClass = String(mode).toLowerCase() === "off" ? "off" : "on";
      return summary;
    }

    if (domain === "cover") {
      const pos = attrs.current_position ?? attrs.position;
      const pct = Number.isFinite(Number(pos)) ? Math.max(0, Math.min(100, Number(pos))) : 0;
      const stateText = Utils.text(state?.state || (pct > 0 ? "open" : "closed"));
      summary.value = Number.isFinite(Number(pos)) ? `${pct}%` : stateText;
      summary.sub = stateText;
      summary.meter = pct;
      summary.chip = pct > 10 ? "Offen" : "Zu";
      summary.chipClass = pct > 10 ? "on" : "off";
      return summary;
    }

    if (domain === "fan") {
      const pct = Number.isFinite(Number(attrs.percentage)) ? Math.max(0, Math.min(100, Number(attrs.percentage))) : (active ? 100 : 0);
      summary.value = active ? `${pct}%` : "Aus";
      summary.sub = Utils.text(attrs.preset_mode || rawState || "Lüfter");
      summary.meter = pct;
      summary.chip = active ? "Läuft" : "Aus";
      summary.chipClass = active ? "on" : "off";
      return summary;
    }

    if (domain === "valve") {
      summary.value = active ? "Offen" : "Zu";
      summary.sub = Utils.text(rawState || "Ventil");
      summary.meter = active ? 100 : 0;
      summary.chip = active ? "Open" : "Closed";
      summary.chipClass = active ? "on" : "off";
      return summary;
    }

    summary.value = active ? "Ein" : "Aus";
    summary.sub = `${Utils.text(attrs.friendly_name || domain)} · ${Utils.text(rawState)}`;
    summary.meter = active ? 100 : 0;
    summary.chip = active ? "ON" : "OFF";
    summary.chipClass = active ? "on" : "off";
    return summary;
  }

  _controlIconMarkup(summary) {
    if (summary.cover) return `<img class="td-control-icon td-control-cover ${summary.active ? "active" : ""}" src="${summary.cover}" alt="Cover">`;
    return `<div class="td-control-icon ${summary.active ? "active" : ""}" ${summary.iconStyle ? `style="${summary.iconStyle}"` : ""}>${summary.icon || "🎛️"}</div>`;
  }

  _controlQuickActions(config, state, summary) {
    const domain = String(config?.entity_id || "").split(".")[0] || "";
    const attrs = state?.attributes || {};
    const actions = [];
    if (domain === "media_player") {
      actions.push(
        { key: "playpause", label: summary.active ? "Pause" : "Play", title: "Play / Pause", style: "primary", grow: true },
        { key: "next", label: "Weiter", title: "Weiter", style: "ghost" },
        { key: "details", label: "Öffnen", title: "Popup öffnen", style: "ghost" },
      );
    } else if (["switch", "input_boolean", "fan", "valve"].includes(domain)) {
      actions.push(
        { key: "toggle", label: summary.active ? "Ausschalten" : "Einschalten", title: "Umschalten", style: "primary", grow: true },
        { key: "details", label: "Öffnen", title: "Popup öffnen", style: "ghost" },
      );
      if (domain === "fan") {
        [25, 50, 100].forEach((pct) => actions.push({ key: `fan-${pct}`, label: `${pct}%`, title: `${pct}%`, style: Number(attrs.percentage || 0) === pct ? "active" : "ghost" }));
      }
    } else if (domain === "light") {
      actions.push(
        { key: "toggle", label: summary.active ? "Aus" : "Ein", title: "Licht schalten", style: "primary", grow: true },
        { key: "brightness-down", label: "−", title: "Dunkler", style: "ghost" },
        { key: "brightness-up", label: "+", title: "Heller", style: "ghost" },
        { key: "details", label: "Öffnen", title: "Popup öffnen", style: "ghost" },
      );
    } else if (domain === "cover") {
      actions.push(
        { key: "open", label: "Öffnen", title: "Öffnen", style: "ghost" },
        { key: "stop", label: "Stopp", title: "Stopp", style: "primary" },
        { key: "close", label: "Schließen", title: "Schließen", style: "ghost" },
        { key: "details", label: "Öffnen", title: "Popup öffnen", style: "ghost", grow: true },
      );
    } else if (domain === "climate") {
      actions.push(
        { key: "temp-down", label: "−1°", title: "Temperatur senken", style: "ghost" },
        { key: "temp-up", label: "+1°", title: "Temperatur erhöhen", style: "primary" },
        { key: "details", label: "Öffnen", title: "Popup öffnen", style: "ghost", grow: true },
      );
    }
    return actions;
  }

  _controlQuickActionsMarkup(config, state, summary, compact = false) {
    const actions = this._controlQuickActions(config, state, summary);
    if (!actions.length) return compact ? `<div class="td-control-actions compact"><button class="td-control-action ghost grow" data-action="details" type="button">Details</button></div>` : "";
    const visible = compact ? actions.filter((action, index) => index < 1 || action.key === "details") : actions.filter((action, index) => index < 3 || action.key === "details");
    return `<div class="td-control-actions ${compact ? "compact" : ""}">${visible.map((action) => `<button class="td-control-action ${action.style || "ghost"} ${action.grow ? "grow" : ""}" type="button" data-action="${action.key}" title="${action.title || action.label}">${action.label}</button>`).join("")}</div>`;
  }

  async _handleControlQuickAction(config, state, action) {
    const entityId = config?.entity_id || "";
    if (!entityId || !action) return;
    const domain = String(entityId).split(".")[0] || "";
    const attrs = state?.attributes || {};
    if (action === "details") { this._openWidgetPopup(config); return; }
    if (domain === "media_player") {
      if (action === "prev") return this.app.callEntityService("media_player", "media_previous_track", { entity_id: entityId });
      if (action === "playpause") return this.app.callEntityService("media_player", "media_play_pause", { entity_id: entityId });
      if (action === "next") return this.app.callEntityService("media_player", "media_next_track", { entity_id: entityId });
      if (action === "vol-down") return this.app.callEntityService("media_player", "volume_set", { entity_id: entityId, volume_level: Math.max(0, Number(attrs.volume_level ?? 0) - 0.1) });
      if (action === "vol-up") return this.app.callEntityService("media_player", "volume_set", { entity_id: entityId, volume_level: Math.min(1, Number(attrs.volume_level ?? 0) + 0.1) });
    }
    if (["switch", "input_boolean", "fan", "valve", "light"].includes(domain) && action === "toggle") return this._invokeToggleAction(entityId, "toggle");
    if (domain === "fan" && action.startsWith("fan-")) {
      const pct = Number(action.split("-")[1]);
      if (Number.isFinite(pct)) return this.app.callEntityService("fan", "set_percentage", { entity_id: entityId, percentage: pct });
    }
    if (domain === "light") {
      const currentBri = Math.round((Number(attrs.brightness ?? (Utils.isTruthyState(state?.state) ? 255 : 0)) / 255) * 100);
      if (action === "brightness-down") return this.app.callEntityService("light", "turn_on", { entity_id: entityId, brightness_pct: Math.max(1, currentBri - 15) });
      if (action === "brightness-up") return this.app.callEntityService("light", "turn_on", { entity_id: entityId, brightness_pct: Math.min(100, currentBri + 15) });
    }
    if (domain === "cover") {
      if (action === "open") return this.app.callEntityService("cover", "open_cover", { entity_id: entityId });
      if (action === "stop") return this.app.callEntityService("cover", "stop_cover", { entity_id: entityId });
      if (action === "close") return this.app.callEntityService("cover", "close_cover", { entity_id: entityId });
    }
    if (domain === "climate") {
      const temperature = Number(attrs.temperature ?? 20);
      if (action === "temp-down") return this.app.callEntityService("climate", "set_temperature", { entity_id: entityId, temperature: temperature - 1 });
      if (action === "temp-up") return this.app.callEntityService("climate", "set_temperature", { entity_id: entityId, temperature: temperature + 1 });
    }
  }

  _bindControlQuickActions(widget, config, state) {
    widget.querySelectorAll(".td-control-action[data-action]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        btn.disabled = true;
        try {
          await this._handleControlQuickAction(config, state, btn.dataset.action || "");
        } catch (err) {
          console.warn("control quick action failed", config?.entity_id, btn.dataset.action, err);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  _renderSmartHomeControlWidget(widget, config, state, name, icon) {
    const opts = this._controlDisplayOptions(config);
    const summary = this._controlSummary(config, state, name, icon);
    widget.classList.remove("widget-media-modern");
    widget.classList.add("widget-control-card");
    widget.classList.toggle("widget-control-compact", opts.layout !== "card");

    const compact = opts.layout !== "card";
    const iconMarkup = opts.showIcon ? this._controlIconMarkup(summary) : "";
    const nameMarkup = opts.showName && summary.name ? `<div class="w-name td-control-name">${summary.name}</div>` : "";
    const valueMarkup = opts.showValue ? `<div class="td-control-value">${summary.value}</div>` : "";
    const subMarkup = opts.showSub && summary.sub ? `<div class="td-control-sub">${summary.sub}</div>` : "";
    const chipMarkup = opts.showStatusChip ? `<div class="td-control-chip ${summary.chipClass}">${summary.chip}</div>` : "";
    const meterMarkup = opts.showMeter ? `<div class="td-control-meter ${compact ? "compact" : ""}"><span style="width:${Math.max(0, Math.min(100, summary.meter || 0))}%"></span></div>` : "";
    const actionMarkup = this._controlQuickActionsMarkup(config, state, summary, compact);
    const headerRight = chipMarkup || `<button class="td-control-open" type="button" data-action="details" aria-label="Öffnen">Öffnen</button>`;

    widget.innerHTML = `<div class="td-control-shell ${compact ? "compact" : "card"}"><div class="td-control-top">${iconMarkup}<div class="td-control-main">${nameMarkup}${valueMarkup}${subMarkup || `<div class="td-control-sub">Tippen für Details</div>`}</div>${headerRight}</div>${meterMarkup}${actionMarkup}</div>`;
    this._bindControlQuickActions(widget, config, state);
    this._renderExtraEntityList(widget, config);
  }

  _renderMediaPlayerControlWidget(widget, config, state, name, icon) {
    const summary = this._controlSummary(config, state, name, icon || "🎵");
    const attrs = state?.attributes || {};
    const progress = Number(attrs.media_duration || 0) > 0 ? Math.max(0, Math.min(100, ((Number(attrs.media_position || 0) / Number(attrs.media_duration || 1)) * 100))) : 0;
    widget.classList.remove("widget-media-modern");
    widget.classList.add("widget-control-card", "widget-media-horizontal");
    const cover = summary.cover ? `<img class="td-media-side-cover" src="${summary.cover}" alt="Cover">` : `<div class="td-media-side-cover placeholder">${icon || "🎵"}</div>`;
    widget.innerHTML = `<div class="td-media-side-shell"><div class="td-media-side-art">${cover}</div><div class="td-media-side-main"><div class="td-media-side-top"><div class="td-media-side-text"><div class="td-media-side-name">${summary.name}</div><div class="td-media-side-title">${summary.value}</div><div class="td-media-side-sub">${summary.sub || Utils.text(state?.state || "—")}</div></div><div class="td-media-side-chip">${summary.chip}</div></div><div class="td-media-side-progress"><span style="width:${progress}%"></span></div><div class="td-media-side-actions"><button class="td-control-action ghost" type="button" data-action="prev">⏮</button><button class="td-control-action primary grow" type="button" data-action="playpause">${summary.active ? "Pause" : "Play"}</button><button class="td-control-action ghost" type="button" data-action="next">⏭</button><button class="td-control-action ghost" type="button" data-action="details">Öffnen</button></div></div></div>`;
    this._bindControlQuickActions(widget, config, state);
    this._renderExtraEntityList(widget, config);
  }

  _renderSwitchControlWidget(widget, config, state, name, icon) {
    this._renderSmartHomeControlWidget(widget, config, state, name, icon || "🎚️");
  }

  _renderLightControlWidget(widget, config, state, name, icon) {
    this._renderSmartHomeControlWidget(widget, config, state, name, icon || "💡");
  }

  _renderClimateControlWidget(widget, config, state, name, icon) {
    this._renderSmartHomeControlWidget(widget, config, state, name, icon || "🌡️");
  }

  _renderCoverControlWidget(widget, config, state, name, icon) {
    this._renderSmartHomeControlWidget(widget, config, state, name, icon || "🪟");
  }

  _renderGaugeWidget(widget, config, value, unit, name) {
    const min = config.config?.min ?? 0;
    const max = config.config?.max ?? 100;
    const nv = Utils.toNumber(value, 0);
    const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
    const color = this._getZoneColor(nv, config.config?.zones);
    widget.innerHTML = `<svg viewBox="0 0 200 130" class="gauge-svg"><defs><linearGradient id="gauge-grad-${Math.round(pct)}" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${color}" stop-opacity="0.6"/><stop offset="100%" stop-color="${color}" stop-opacity="1"/></linearGradient></defs><path d="M 20 120 A 80 80 0 0 1 180 120" class="gauge-arc-bg"></path><path d="M 20 120 A 80 80 0 0 1 180 120" class="gauge-arc-value gauge-arc-animated" stroke="url(#gauge-grad-${Math.round(pct)})" stroke-dasharray="${pct * 2.51} 251"></path><text x="100" y="95" class="gauge-text-value">${Utils.formatStateWithUnit(nv, unit, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}</text><text x="100" y="118" class="gauge-text-label">${name}</text></svg>`;
    this._renderExtraEntityList(widget, config);
  }

  _renderProgressBarWidget(widget, config, value, unit, name) {
    const min = config.config?.min ?? 0;
    const max = config.config?.max ?? 100;
    const nv = Utils.toNumber(value, 0);
    const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
    const color = config.config?.color || "var(--td-accent)";
    widget.innerHTML = `${name ? `<div class="w-name" style="margin-bottom:4px">${name}</div>` : ""}<div><span class="w-value">${Utils.formatValue(nv, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div><div class="progress-container"><div class="progress-fill progress-animated" style="width:${pct}%;background:${color}"></div></div>`;
    this._renderExtraEntityList(widget, config);
  }

  _renderStatusDotWidget(widget, config, value, name) {
    const isOn = Utils.isTruthyState(value);
    const color = isOn ? "var(--td-positive)" : "var(--td-text-secondary)";
    widget.innerHTML = `<div class="status-dot-indicator ${isOn ? "on" : ""} status-dot-animated" style="background:${color};color:${color}"></div>${name ? `<div class="w-name">${name}</div>` : ""}<div class="widget-subvalue">${Utils.text(value)}</div>`;
    this._renderExtraEntityList(widget, config);
  }

  _renderTrendArrowWidget(widget, config, state, name, icon) {
    const current = Utils.toNumber(state?.state, null);
    const previous = Utils.toNumber(this.app.previousEntityStates?.[config.entity_id]?.state, null);
    const diff = (Number.isFinite(current) && Number.isFinite(previous)) ? current - previous : 0;
    const direction = diff > 0 ? "up" : (diff < 0 ? "down" : "flat");
    const arrow = direction === "up" ? "▲" : (direction === "down" ? "▼" : "▶");
    const trendColor = direction === "up" ? "var(--td-positive)" : (direction === "down" ? "var(--td-danger)" : "var(--td-warning)");
    const unit = state?.attributes?.unit_of_measurement || config.unit || "";
    widget.classList.add("widget-trend-arrow");
    widget.innerHTML = `<div class="w-icon trend-arrow-icon"><span style="font-size:24px">${icon}</span></div><div class="trend-main"><div><span class="w-value">${Utils.formatValue(state?.state ?? "—", { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div><div class="trend-arrow-chip ${direction} trend-chip-animated" style="color:${trendColor}">${arrow} <span class="trend-delta">${Number.isFinite(diff) ? (diff > 0 ? '+' : '') + diff.toFixed(1) : '0.0'}${unit}</span></div></div><div class="w-name">${name || state?.attributes?.friendly_name || config.entity_id || 'Trend'}</div>`;
    this._renderExtraEntityList(widget, config);
  }

  _renderCameraWidget(widget, config, name) {
    widget.classList.add("widget-camera");
    const eid = config.entity_id || config.config?.camera_entity || config.camera_entity || "";
    const preferredSource = config.config?.camera_source || config.camera_source || "auto";
    const liveMode = (config.config?.camera_view || config.camera_view || "still") === "live";
    const source = liveMode && preferredSource === "auto" ? "camera_proxy_stream" : preferredSource;
    const fit = config.config?.camera_fit || config.camera_fit || "cover";
    const title = this._widgetCameraTitle(config, name || eid);
    widget.innerHTML = `<img alt="Camera" class="widget-camera-image" style="object-fit:${fit}">${title ? `<div class="camera-overlay">${title}</div>` : ""}`;
    const img = widget.querySelector("img");
    if (img && eid) this._loadCameraInto(img, eid, source);
    if (!liveMode) {
      const ms = (config.config?.refresh_interval || 5) * 1000;
      this._cameraIntervals.push(setInterval(() => { const ni = widget.querySelector("img"); if (ni && eid) this._loadCameraInto(ni, eid, source); }, ms));
    }
  }

  _renderWeatherWidget(widget, config, state) {
    const attrs = state?.attributes || {};
    const temp = attrs.temperature ?? "—";
    const condition = state?.state || "—";
    const visual = this._weatherVisual(condition, config.config || config);
    widget.classList.add("widget-weather-modern");
    widget.innerHTML = `<div class="weather-card ${visual.theme}"><div class="weather-animated-bg ${visual.animClass} ${visual.animate ? "animate" : ""}">${this._weatherFxMarkup(visual.animClass)}</div><div class="weather-card-top"><div class="weather-card-icon weather-icon-animated">${visual.icon}</div><div class="weather-card-reading"><span class="w-value">${temp}</span><span class="w-unit">°C</span></div></div>${this._widgetName(config, attrs.friendly_name || "Wetter") ? `<div class="w-name">${this._widgetName(config, attrs.friendly_name || "Wetter")}</div>` : ""}<div class="widget-subvalue">${visual.label || condition}</div></div>`;
  }

  _renderClockWidget(widget) {
    widget.innerHTML = `<div class="w-icon"><span style="font-size:24px">🕐</span></div><div><span class="w-value js-clock-time clock-digit-animated">--:--</span></div><div class="w-name js-clock-date">--</div>`;
    const update = () => {
      const now = new Date();
      const t = widget.querySelector(".js-clock-time");
      const d = widget.querySelector(".js-clock-date");
      if (t) t.textContent = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      if (d) d.textContent = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    };
    update();
    this._clockIntervals.push(setInterval(update, 1000));
  }

  _renderCountdownWidget(widget, config) {
    const target = config.target_date || config.targetDate || config.date || null;
    widget.innerHTML = `<div class="w-icon"><span style="font-size:24px">⏱️</span></div><div><span class="w-value js-countdown-value countdown-animated">--</span></div>${this._widgetName(config, "Countdown") ? `<div class="w-name">${this._widgetName(config, "Countdown")}</div>` : ""}`;
    const update = () => {
      const el = widget.querySelector(".js-countdown-value");
      if (!el || !target) { if (el) el.textContent = "—"; return; }
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) { el.textContent = "00:00"; return; }
      const totalSec = Math.floor(diff / 1000);
      const hrs = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;
      el.textContent = hrs > 0 ? `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    };
    update();
    this._countdownIntervals.push(setInterval(update, 1000));
  }

  _renderImageWidget(widget, config, name) {
    const src = config.image_url || config.imageUrl || config.url || "";
    widget.classList.add("widget-image");
    widget.innerHTML = src ? `<img src="${src}" class="widget-image-tag" alt="${name || "Bild"}"><div class="camera-overlay">${name || "Bild"}</div>` : `<div class="empty-state"><div class="empty-state-icon">🖼️</div><div class="empty-state-title">Kein Bild</div></div>`;
  }

  _renderQrWidget(widget, config) {
    const value = config.text || config.value || config.qr_value || config.qrValue || "QR";
    widget.classList.add("widget-qr");
    const holder = document.createElement("div");
    holder.className = "widget-qr-holder";
    widget.appendChild(holder);
    if (window.QRCode?.toString) {
      window.QRCode.toString(value, { width: 192 }).then(svg => { holder.innerHTML = svg; }).catch(() => { holder.innerHTML = `<div class="qr-fallback">QR</div>`; });
    } else { holder.innerHTML = `<div class="qr-fallback">QR</div>`; }
    const label = document.createElement("div");
    label.className = "w-name";
    label.textContent = config.name || "QR-Code";
    widget.appendChild(label);
  }

  _renderColorBlockWidget(widget, config, name) {
    widget.style.background = config.bgColor || config.color || "var(--td-accent)";
    widget.innerHTML = `<div class="w-value">${name || "Block"}</div>`;
  }

  _renderButtonWidget(widget, config, name) {
    widget.innerHTML = `<div class="widget-button-face"><div class="w-icon button-icon-animated"><span style="font-size:24px">${config.icon || "🔘"}</span></div>${this._widgetName(config, name || "Button") ? `<div class="w-name">${this._widgetName(config, name || "Button")}</div>` : ""}</div>`;
  }

// ══════════════════════════════════════════════════════════
// TEIL 2 – ScreenManager Fortsetzung: Charts, Updates, Interactions
// ══════════════════════════════════════════════════════════

  /* ────── Chart Widget ────── */
  _renderChartWidget(widget, config, state, name) {
    const unit = state?.attributes?.unit_of_measurement || config.unit || "";
    const title = this._widgetName(config, name || state?.attributes?.friendly_name || config.entity_id || config.type || "Chart");
    widget.classList.add("widget-chart");
    widget.innerHTML = `<div class="chart-header"><div class="chart-title">${title}</div><div class="chart-value chart-value-animated">${Utils.formatValue(state?.state, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}${unit ? `<span class="chart-unit"> ${unit}</span>` : ""}</div></div><div class="chart-body"><canvas class="chart-canvas"></canvas></div><div class="chart-type-badge">${CHART_TYPE_ICONS[config.type] || "📊"} ${config.type || "chart"}</div>`;
    this._renderExtraEntityList(widget, config);
    const canvas = widget.querySelector(".chart-canvas");
    if (!canvas || !window.Chart) { if (!window.Chart) console.warn("⚠️ Chart.js nicht geladen!"); return; }
    this._scheduleChartBuild(widget, canvas, config, state);
  }

  _scheduleChartBuild(element, canvas, config, state, attempt = 0) {
    clearTimeout(element._chartBuildTimer);
    element._chartBuildTimer = setTimeout(() => {
      if (!document.body.contains(canvas)) return;
      const rect = canvas.getBoundingClientRect();
      if ((rect.width < 24 || rect.height < 24) && attempt < 8) {
        this._scheduleChartBuild(element, canvas, config, state, attempt + 1);
        return;
      }
      this._destroyElementChart(element);
      this._buildChart(canvas, config, state, element);
    }, attempt ? 80 : 20);
  }

  _destroyElementChart(element) {
    if (element?._chartInstance) { try { element._chartInstance.destroy(); } catch (e) {} element._chartInstance = null; }
  }

  async _buildChart(canvas, config, state, element = null) {
    try {
      const entityIds = this._chartEntityIds(config);
      const useHistory = config.config?.chart_use_history !== false;
      const hours = config.config?.hours || config.config?.period || 24;
      const maxPoints = config.config?.chart_mobile_compact ? 20 : (config.config?.chart_max_points || 36);

      const histories = await Promise.all(entityIds.map(async (entityId) => {
        const liveState = this.app.entityStates[entityId] || (entityId === config.entity_id ? state : null) || {};
        let points = [];
        if (entityId && useHistory) {
          const history = await this.app.dataManager.fetchHistory(entityId, hours);
          points = this._normalizePoints(history?.data, liveState?.state);
        } else {
          points = this._normalizePoints([], liveState?.state);
        }
        points = this._chartSamplePoints(points, maxPoints);
        return { entityId, state: liveState, points, meta: this._extraEntityMeta(config, entityId) };
      }));

      const primary = histories[0] || { state: state || {}, points: this._normalizePoints([], state?.state), meta: this._extraEntityMeta(config, config.entity_id || "") };
      const maxLen = Math.max(...histories.map(e => e.points.length), primary.points.length, 1);
      const labels = Array.from({ length: maxLen }, (_, idx) => {
        const point = primary.points[idx] || primary.points[primary.points.length - 1] || { x: new Date().toISOString() };
        return Utils.shortDateTime(point.x);
      });

      const type = config.type || "mini-graph";
      const chartCfg = this._getChartConfig(type, histories, labels, config);
      const chart = new Chart(canvas, chartCfg);
      canvas.dataset.chartType = type;
      canvas.dataset.entityIds = JSON.stringify(entityIds);
      if (element) element._chartInstance = chart;
      this._chartInstances.push(chart);
    } catch (e) {
      console.error("❌ Chart build failed:", e);
    }
  }

  _getChartConfig(type, histories, labels, config) {
    const showLegend = config.config?.chart_show_legend !== false;
    const showAxes = config.config?.chart_show_axes !== false;
    const showGrid = config.config?.chart_show_grid !== false;
    const showPoints = config.config?.chart_show_points !== false;
    const lineWidth = Number(config.config?.chart_line_width || 2);
    const tension = Number(config.config?.chart_tension ?? ((type === "line-chart" || type === "multi-line-chart" || type === "area-chart") ? 0.35 : 0.25));
    const fillOpacity = Number(config.config?.chart_fill_opacity ?? (type === "area-chart" ? 0.22 : 0.14));
    const stacked = config.config?.chart_stacked === true || type === "stacked-bar-chart";
    const compact = config.config?.chart_mobile_compact === true;
    const beginAtZero = config.config?.chart_begin_at_zero === true;
    const legendPosition = config.config?.chart_legend_position || (compact ? "bottom" : "top");
    const curveMode = config.config?.chart_curve_mode || "default";
    const pointStyle = config.config?.chart_point_style || "circle";

    const legendOptions = {
      display: showLegend && (histories.length > 1 || ["donut-chart", "pie-chart", "radar-chart", "line-chart", "multi-line-chart"].includes(type)),
      position: legendPosition,
      labels: { color: "rgba(255,255,255,0.72)", boxWidth: compact ? 10 : 14, usePointStyle: true, padding: compact ? 10 : 14, filter: (item, data) => !data?.datasets?.[item.datasetIndex]?.tdHideName }
    };

    const chartAnimationEnabled = (config.config?.chart_animation !== false) && (this.app?.globalSettings?.default_chart_widget_animations !== false);
    const baseOptions = {
      responsive: true, maintainAspectRatio: false,
      animation: chartAnimationEnabled ? { duration: compact ? 220 : 600, easing: "easeOutCubic" } : false,
      interaction: { mode: "nearest", intersect: false },
      plugins: { legend: legendOptions, tooltip: { enabled: true, displayColors: true } },
      scales: {
        x: { display: showAxes, grid: { display: showGrid, color: "rgba(255,255,255,0.05)" }, ticks: { maxTicksLimit: compact ? 4 : 6, color: "rgba(255,255,255,0.5)" } },
        y: { display: showAxes, beginAtZero, grid: { display: showGrid, color: "rgba(255,255,255,0.06)" }, ticks: { maxTicksLimit: compact ? 4 : 5, color: "rgba(255,255,255,0.5)" } }
      }
    };

    // ═══ LINE-BASIERTE CHARTS ═══
    const lineTypes = new Set(["mini-graph", "sparkline", "line-chart", "area-chart", "multi-line-chart", "forecast-chart", "comparison-chart", "energy-flow-mini", "timeline-chart"]);

    if (lineTypes.has(type)) {
      const datasets = histories.map((entry, idx) => ({
        label: this._chartSeriesLabel(config, entry.entityId, entry.state?.attributes?.friendly_name || entry.entityId, idx),
        tdHideName: !!entry.meta?.hide_name,
        data: labels.map((_, pidx) => entry.points[pidx]?.y ?? entry.points[entry.points.length - 1]?.y ?? 0),
        borderColor: this._chartPalette(idx, 0.96, config, entry.entityId),
        backgroundColor: this._chartPalette(idx, fillOpacity, config, entry.entityId),
        fill: type === "area-chart" || type === "forecast-chart" || type === "energy-flow-mini",
        tension: curveMode === "stepped" ? 0 : tension,
        stepped: curveMode === "stepped",
        cubicInterpolationMode: curveMode === "monotone" ? "monotone" : "default",
        pointStyle, pointRadius: showPoints ? (compact ? 1.5 : 2.5) : 0,
        pointHoverRadius: showPoints ? 4 : 0, borderWidth: lineWidth, spanGaps: true,
        stack: stacked ? "stack" : undefined
      }));
      return {
        type: "line",
        data: { labels, datasets },
        options: { ...baseOptions,
          plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: showLegend && (histories.length > 1 || ["line-chart", "multi-line-chart", "comparison-chart", "forecast-chart"].includes(type)) } },
          scales: { ...baseOptions.scales, x: { ...baseOptions.scales.x, display: showAxes && type !== "sparkline" }, y: { ...baseOptions.scales.y, display: showAxes && type !== "sparkline", stacked } }
        }
      };
    }

    // ═══ BAR-BASIERTE CHARTS ═══
    const barTypes = new Set(["bar-chart", "stacked-bar-chart", "horizontal-bar-chart", "heatmap-mini", "bullet-chart"]);

    if (barTypes.has(type)) {
      const heatmapMode = config.config?.heatmap_mode || "intensity";
      const datasets = histories.map((entry, idx) => ({
        label: this._chartSeriesLabel(config, entry.entityId, entry.state?.attributes?.friendly_name || entry.entityId, idx),
        tdHideName: !!entry.meta?.hide_name,
        data: labels.map((_, pidx) => entry.points[pidx]?.y ?? entry.points[entry.points.length - 1]?.y ?? 0),
        borderWidth: 1, borderRadius: compact ? 6 : 8,
        borderColor: this._chartPalette(idx, 0.96, config, entry.entityId),
        backgroundColor: type === "heatmap-mini"
          ? labels.map((_, pidx) => { const val = entry.points[pidx]?.y ?? 0; const alpha = heatmapMode === "zones" ? (Math.abs(val) >= 75 ? 0.78 : Math.abs(val) >= 50 ? 0.58 : Math.abs(val) >= 25 ? 0.38 : 0.22) : Utils.clamp(Math.abs(val) / 100, 0.18, 0.82); return this._chartPalette(idx, alpha, config, entry.entityId); })
          : this._chartPalette(idx, 0.42, config, entry.entityId),
        barPercentage: type === "bullet-chart" ? 0.55 : 0.78,
        categoryPercentage: type === "bullet-chart" ? 0.92 : 0.84
      }));
      return {
        type: "bar",
        data: { labels, datasets },
        options: { ...baseOptions, indexAxis: (type === "horizontal-bar-chart" || type === "bullet-chart") ? "y" : "x",
          scales: { x: { ...baseOptions.scales.x, stacked }, y: { ...baseOptions.scales.y, stacked } },
          plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: showLegend && (histories.length > 1 || stacked) } }
        }
      };
    }

    // ═══ CIRCULAR CHARTS ═══
    if (["donut-chart", "pie-chart", "radial-gauge-advanced", "polar-area-chart"].includes(type)) {
      const latest = histories.map(e => e.points[e.points.length - 1]?.y ?? 0);
      const dLabels = histories.map((e, idx) => this._chartSeriesLabel(config, e.entityId, e.state?.attributes?.friendly_name || e.entityId, idx));
      const isGauge = type === "radial-gauge-advanced";
      const gaugeMax = Number(config.config?.max ?? 100);
      const gaugeValue = Number(latest[0] ?? 0);
      return {
        type: type === "polar-area-chart" ? "polarArea" : "doughnut",
        data: {
          labels: isGauge ? [dLabels[0] || "Wert", "Rest"] : dLabels,
          datasets: [{ tdHideName: false,
            data: isGauge ? [gaugeValue, Math.max(gaugeMax - gaugeValue, 0)] : latest,
            backgroundColor: isGauge ? [this._chartPalette(0, 0.95, config, histories[0]?.entityId), "rgba(255,255,255,0.08)"] : histories.map((e, idx) => this._chartPalette(idx, 0.82, config, e.entityId)),
            borderColor: "rgba(255,255,255,0.08)", borderWidth: 1
          }]
        },
        options: { ...baseOptions, cutout: type === "pie-chart" || type === "polar-area-chart" ? "0%" : "68%", scales: {}, plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: showLegend } } }
      };
    }

    // ═══ RADAR ═══
    if (type === "radar-chart") {
      return {
        type: "radar",
        data: { labels, datasets: histories.map((entry, idx) => ({ label: this._chartSeriesLabel(config, entry.entityId, entry.state?.attributes?.friendly_name || entry.entityId, idx), tdHideName: !!entry.meta?.hide_name, data: labels.map((_, pidx) => entry.points[pidx]?.y ?? entry.points[entry.points.length - 1]?.y ?? 0), borderColor: this._chartPalette(idx, 0.95, config, entry.entityId), backgroundColor: this._chartPalette(idx, 0.2, config, entry.entityId), pointBackgroundColor: this._chartPalette(idx, 0.95, config, entry.entityId), pointRadius: showPoints ? 2 : 0, borderWidth: lineWidth })) },
        options: { ...baseOptions, scales: { r: { angleLines: { color: "rgba(255,255,255,0.08)" }, grid: { color: "rgba(255,255,255,0.08)" }, pointLabels: { color: "rgba(255,255,255,0.6)" }, ticks: { backdropColor: "transparent", color: "rgba(255,255,255,0.45)" } } } }
      };
    }

    // ═══ SCATTER / BUBBLE ═══
    if (type === "scatter-chart" || type === "bubble-chart") {
      return {
        type: type === "bubble-chart" ? "bubble" : "scatter",
        data: { datasets: histories.map((entry, idx) => ({ label: this._chartSeriesLabel(config, entry.entityId, entry.state?.attributes?.friendly_name || entry.entityId, idx), tdHideName: !!entry.meta?.hide_name, data: entry.points.map((p, pidx) => ({ x: pidx + 1, y: p.y, r: type === "bubble-chart" ? Utils.clamp(Math.abs(Number(p.y) || 0) / 8, 4, compact ? 11 : 16) : undefined })), borderColor: this._chartPalette(idx, 0.95, config, entry.entityId), backgroundColor: this._chartPalette(idx, 0.48, config, entry.entityId), pointStyle, pointRadius: showPoints ? 4 : 0, pointHoverRadius: showPoints ? 5 : 0 })) },
        options: { ...baseOptions, scales: { x: { display: showAxes, type: "linear", position: "bottom", grid: { display: showGrid, color: "rgba(255,255,255,0.06)" }, ticks: { color: "rgba(255,255,255,0.45)" } }, y: baseOptions.scales.y } }
      };
    }

    // ═══ FALLBACK → line (NICHT bar!) ═══
    const fallbackDS = histories.map((entry, idx) => ({
      label: this._chartSeriesLabel(config, entry.entityId, entry.state?.attributes?.friendly_name || entry.entityId, idx),
      tdHideName: !!entry.meta?.hide_name,
      data: labels.map((_, pidx) => entry.points[pidx]?.y ?? entry.points[entry.points.length - 1]?.y ?? 0),
      borderColor: this._chartPalette(idx, 0.96, config, entry.entityId),
      backgroundColor: this._chartPalette(idx, 0.14, config, entry.entityId),
      fill: false, tension, pointRadius: showPoints ? 2.5 : 0, borderWidth: lineWidth, spanGaps: true
    }));
    return { type: "line", data: { labels, datasets: fallbackDS }, options: baseOptions };
  }

  /* ────── Widget Updates ────── */
  _updateWidget(widgetInfo, entityId, newState) {
    const { element, config } = widgetInfo;
    const value = newState?.state ?? "—";
    const unit = newState?.attributes?.unit_of_measurement || config.unit || "";

    switch (config.type) {
      case "gauge": {
        const min = config.config?.min ?? 0; const max = config.config?.max ?? 100;
        const nv = Utils.toNumber(value, 0);
        const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
        const arc = element.querySelector(".gauge-arc-value");
        const txt = element.querySelector(".gauge-text-value");
        if (arc) { arc.setAttribute("stroke-dasharray", `${pct * 2.51} 251`); arc.setAttribute("stroke", this._getZoneColor(nv, config.config?.zones)); }
        if (txt) txt.textContent = Utils.formatStateWithUnit(nv, unit, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false });
        break;
      }
      case "progress-bar": {
        const min = config.config?.min ?? 0; const max = config.config?.max ?? 100;
        const nv = Utils.toNumber(value, 0);
        const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
        const fill = element.querySelector(".progress-fill"); const ve = element.querySelector(".w-value");
        if (fill) fill.style.width = `${pct}%`;
        if (ve) ve.textContent = Utils.formatValue(nv, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false });
        break;
      }
      case "status-dot": {
        const isOn = Utils.isTruthyState(value);
        const dot = element.querySelector(".status-dot-indicator"); const sub = element.querySelector(".widget-subvalue");
        const color = isOn ? "var(--td-positive)" : "var(--td-text-secondary)";
        if (dot) { dot.style.background = color; dot.style.color = color; dot.classList.toggle("on", isOn); }
        if (sub) sub.textContent = Utils.text(value);
        break;
      }
      case "weather": this._renderWeatherWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}); break;
      case "trend-arrow": this._renderTrendArrowWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, config.name || "", config.icon || this._defaultIconForType(config.type)); break;
      case "media-player-control": this._renderMediaPlayerControlWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, newState?.attributes?.friendly_name || ""), config.icon || this._defaultIconForType(config.type)); break;
      case "switch-control": this._renderSwitchControlWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, newState?.attributes?.friendly_name || ""), config.icon || this._defaultIconForType(config.type)); break;
      case "light-control": this._renderLightControlWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, newState?.attributes?.friendly_name || ""), config.icon || this._defaultIconForType(config.type)); break;
      case "climate-control": this._renderClimateControlWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, newState?.attributes?.friendly_name || ""), config.icon || this._defaultIconForType(config.type)); break;
      case "cover-control": this._renderCoverControlWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, newState?.attributes?.friendly_name || ""), config.icon || this._defaultIconForType(config.type)); break;
      case "mini-graph": case "sparkline": case "line-chart": case "bar-chart":
      case "area-chart": case "multi-line-chart": case "stacked-bar-chart":
      case "horizontal-bar-chart": case "donut-chart": case "pie-chart":
      case "radar-chart": case "heatmap-mini": case "timeline-chart":
      case "scatter-chart": case "bubble-chart": case "polar-area-chart":
      case "forecast-chart": case "energy-flow-mini": case "comparison-chart":
      case "radial-gauge-advanced": case "bullet-chart": {
        const cv = element.querySelector(".chart-value");
        if (cv) cv.innerHTML = `${Utils.formatValue(value, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}${unit ? `<span class="chart-unit"> ${unit}</span>` : ""}`;
        const canvas = element.querySelector(".chart-canvas");
        if (canvas && window.Chart) this._scheduleChartBuild(element, canvas, config, this.app.entityStates[config.entity_id] || newState);
        break;
      }
      default: { const wv = element.querySelector(".w-value"); if (wv) wv.textContent = Utils.formatValue(value, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false }); }
    }
    this._updateExtraEntityList(element, config);
    if (METRIC_WIDGET_TYPES.has(config.type || "")) this._renderMetricSparkline(element, config);
    element.classList.remove("value-changed"); void element.offsetWidth; element.classList.add("value-changed");
  }

  /* ────── Interactions ────── */
  _effectiveWidgetInteractionConfig(config) {
    if (!config) return {};
    const hasOwnAction = config.tap_action && config.tap_action !== "none";
    const cameraFullscreen = (config.type === "camera" && (config.config?.camera_tap_fullscreen || config.camera_tap_fullscreen));
    if (hasOwnAction || cameraFullscreen) return config;

    const defaultToggleTypes = new Set(["switch-control", "light-control"]);
    const defaultPopupTypes = new Set(["media-player-control", "climate-control", "cover-control"]);
    if (defaultToggleTypes.has(config.type)) {
      const compactPopup = (config?.config?.control_layout || "card") === "compact";
      return {
        ...config,
        tap_action: compactPopup ? "popup" : "toggle",
        tap_target_entity: config.tap_target_entity || config.entity_id || "",
        toggle_badge: config.toggle_badge ?? true,
      };
    }
    if (defaultPopupTypes.has(config.type)) {
      return {
        ...config,
        tap_action: "popup",
        tap_target_entity: config.tap_target_entity || config.entity_id || "",
      };
    }

    const group = String(config.group || "").trim();
    if (!group) return config;
    const current = this.temporaryScreen || this.screens[this.currentIndex] || {};
    const widgets = Utils.safeArray(current.widgets);
    const master = widgets.find(w => String(w?.group || "").trim() === group && w?.group_touch_enabled);
    if (!master) return config;
    return { ...config, tap_action: master.group_tap_action || master.tap_action || "none", tap_target_entity: master.group_tap_target_entity || master.tap_target_entity || config.tap_target_entity || config.entity_id || "", toggle_mode: master.group_toggle_mode || master.toggle_mode || config.toggle_mode || "toggle", toggle_badge: master.group_toggle_badge ?? master.toggle_badge ?? config.toggle_badge, tap_popup_kind: master.group_tap_popup_kind || master.tap_popup_kind || config.tap_popup_kind, tap_screen_id: master.group_tap_screen_id || master.tap_screen_id || config.tap_screen_id, tap_url: master.group_tap_url || master.tap_url || config.tap_url, tap_autoclose: master.group_tap_autoclose ?? master.tap_autoclose ?? config.tap_autoclose, tap_scale: master.group_tap_scale ?? master.tap_scale ?? config.tap_scale };
  }

  _bindWidgetInteraction(widget, config) {
    const cameraFullscreen = (config.type === "camera" && (config.config?.camera_tap_fullscreen || config.camera_tap_fullscreen));
    const action = config?.tap_action || "none";
    if ((action === "none" || !action) && !cameraFullscreen) return;
    widget.classList.add("widget-interactive");
    widget.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      this._createRipple(widget, ev);
      if (cameraFullscreen) return this._openCameraFullscreen(config);
      if (action === "expand") this._openWidgetDetail(widget, config);
      else if (action === "popup") this._openWidgetPopup(config);
      else if (action === "toggle") this._toggleWidgetEntity(widget, config);
      else if (action === "goto_screen") this._gotoTargetScreen(config);
      else if (action === "open_url") this._openWidgetUrl(config);
    });
  }

  _createRipple(widget, event) {
    const ripple = document.createElement("span");
    ripple.className = "widget-ripple";
    const rect = widget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    widget.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  _syncWidgetToggleBadge(widget, config) {
    if ((config?.tap_action || "none") !== "toggle" || config?.toggle_badge === false || config?.config?.control_show_toggle_badge === false) { const ex = widget.querySelector(".widget-toggle-badge"); if (ex) ex.remove(); return; }
    const entityId = config.tap_target_entity || config.entity_id;
    if (!entityId) return;
    const st = this.app?.entityStates?.[entityId] || {};
    this._showWidgetToggleBadge(widget, Utils.isTruthyState(st.state), st.state);
  }

  _showWidgetToggleBadge(widget, on, rawState = null) {
    let badge = widget.querySelector(".widget-toggle-badge");
    if (!badge) { badge = document.createElement("div"); badge.className = "widget-toggle-badge"; widget.appendChild(badge); }
    badge.classList.toggle("on", !!on); badge.classList.toggle("off", !on);
    badge.textContent = on ? "Ein" : "Aus";
    badge.title = rawState == null ? badge.textContent : `Status: ${rawState}`;
  }

  _openWidgetUrl(config) { const url = config.tap_url || config.config?.tap_url || ""; if (url) window.open(url, "_blank", "noopener,noreferrer"); }
  _gotoTargetScreen(config) { const target = config.tap_screen_id || config.config?.tap_screen_id || ""; if (target) this.goto(target); }

  _buildWidgetFocusCard(config, fallbackWidget = null, options = {}) {
    const renderConfig = Utils.deepClone(config || {});
    renderConfig.tap_action = "none";
    renderConfig.group_tap_action = "none";
    renderConfig.camera_tap_fullscreen = false;
    if (!renderConfig.config) renderConfig.config = {};
    renderConfig.config.camera_tap_fullscreen = false;

    let card = null;
    try {
      card = this._createWidget(renderConfig);
    } catch (err) {
      console.warn("[TickerDisplay] focus render failed, falling back to clone", err);
    }

    if (!card && fallbackWidget) card = fallbackWidget.cloneNode(true);
    if (!card) {
      card = document.createElement("div");
      card.className = "widget widget-detail-card widget-fallback-card";
      const entityId = config?.entity_id || config?.tap_target_entity || "";
      const st = this.app?.entityStates?.[entityId] || {};
      const attrs = st.attributes || {};
      card.innerHTML = `<div class="w-value-wrap"><span class="w-value">${Utils.formatStateWithUnit(st.state ?? "—", attrs.unit_of_measurement || "", { decimals: config?.config?.value_decimals, trimTrailingZeros: config?.config?.trim_trailing_zeros !== false })}</span></div><div class="w-name">${Utils.text(attrs.friendly_name || entityId || config?.type || "Widget")}</div>`;
    }

    card.classList.add("widget-detail-card");
    card.dataset.focusWidgetType = config?.type || "generic";
    const width = options.width || "min(760px, 82vw)";
    const height = options.height || "min(440px, 60vh)";
    const scale = Number(options.scale ?? config?.tap_scale ?? 1.08);
    card.style.width = width;
    card.style.height = height;
    card.style.maxWidth = options.maxWidth || width;
    card.style.maxHeight = options.maxHeight || height;
    card.style.transform = `scale(${Math.max(1, scale)})`;
    card.style.transformOrigin = "center center";
    return card;
  }

  _refreshFocusWidget(card, config = {}) {
    if (!card || !config) return;
    const state = this.app?.entityStates?.[config.entity_id] || {};
    try {
      switch (config.type) {
        case "gauge":
        case "progress-bar":
        case "status-dot":
        case "weather":
        case "trend-arrow":
        case "media-player-control":
        case "switch-control":
        case "light-control":
        case "climate-control":
        case "cover-control":
        case "simple-value":
        case "icon-value":
        case "camera":
        case "clock":
        case "countdown":
        case "image":
        case "qr-code":
        case "color-block":
        case "button":
        case "mini-graph": case "sparkline": case "line-chart": case "bar-chart":
        case "area-chart": case "multi-line-chart": case "stacked-bar-chart":
        case "horizontal-bar-chart": case "donut-chart": case "pie-chart":
        case "radar-chart": case "heatmap-mini": case "timeline-chart":
        case "scatter-chart": case "bubble-chart": case "polar-area-chart":
        case "forecast-chart": case "energy-flow-mini": case "comparison-chart":
        case "radial-gauge-advanced": case "bullet-chart":
          this._updateWidget({ element: card, config }, config.entity_id, state);
          break;
        default:
          this._updateWidget({ element: card, config }, config.entity_id, state);
      }
    } catch (err) {
      console.warn("[TickerDisplay] focus refresh failed", config?.type, err);
    }
    requestAnimationFrame(() => {
      try {
        const canvas = card.querySelector(".chart-canvas");
        if (canvas && window.Chart) this._scheduleChartBuild(card, canvas, config, state);
        if (METRIC_WIDGET_TYPES.has(config.type || "")) this._renderMetricSparkline(card, config);
      } catch (err) {
        console.warn("[TickerDisplay] focus chart refresh failed", config?.type, err);
      }
    });
  }

  _openWidgetDetail(widget, config) {
    const overlay = document.getElementById("widget-detail-overlay") || this._createWidgetDetailOverlay();
    const body = overlay.querySelector(".widget-detail-body");
    const stage = document.createElement("div");
    stage.className = "widget-detail-stage";
    const detailWidget = this._buildWidgetFocusCard(config, widget, { width: "min(760px, 82vw)", height: "min(440px, 60vh)", scale: config?.tap_scale ?? 1.05 });

    body.innerHTML = "";
    stage.appendChild(detailWidget);
    body.appendChild(stage);
    overlay.hidden = false;
    this._refreshFocusWidget(detailWidget, config);

    const close = () => {
      overlay.hidden = true;
      body.innerHTML = "";
    };
    overlay.querySelector(".widget-detail-close").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    const secs = Number(config.tap_autoclose || 0);
    clearTimeout(this._detailTimer);
    if (secs > 0) this._detailTimer = setTimeout(close, secs * 1000);
  }

  _createWidgetDetailOverlay() {
    const overlay = document.createElement("div"); overlay.id = "widget-detail-overlay"; overlay.className = "widget-detail-overlay"; overlay.hidden = true;
    overlay.innerHTML = `<div class="widget-detail-panel"><button class="widget-detail-close">✕</button><div class="widget-detail-body"></div></div>`;
    document.body.appendChild(overlay); return overlay;
  }

  _widgetPopupOverlay() {
    let overlay = document.getElementById("widget-popup-overlay");
    if (!overlay) { overlay = document.createElement("div"); overlay.id = "widget-popup-overlay"; overlay.className = "widget-popup-overlay"; overlay.hidden = true; overlay.innerHTML = `<div class="widget-popup-panel"><div class="widget-popup-body"></div></div>`; document.body.appendChild(overlay); }
    return overlay;
  }

  _closeWidgetPopup() { const o = document.getElementById("widget-popup-overlay"); if (!o) return; o.hidden = true; clearTimeout(this._popupTimer); const b = o.querySelector(".widget-popup-body"); if (b) b.innerHTML = ""; }
  _openCameraFullscreen(config) { this._openWidgetPopup({ ...config, tap_popup_kind: "camera" }); }
  _popupFriendlyName(config, st) { return this._widgetName(config, st?.attributes?.friendly_name || config.entity_id || config.type || "Widget"); }

  _popupWeatherMarkup(config, st) {
    const attrs = st?.attributes || {};
    const visual = this._weatherVisual(st?.state || "", config.config || config);
    return `<div class="popup-hero popup-weather ${visual.theme}"><div class="popup-weather-bg ${visual.animClass} ${visual.animate ? "animate" : ""}">${this._weatherFxMarkup(visual.animClass, 2)}</div><div class="popup-eyebrow">${this._popupFriendlyName(config, st)}</div><div class="popup-big-icon">${visual.icon}</div><div class="popup-big-value">${Utils.text(attrs.temperature ?? "—")}<span>°C</span></div><div class="popup-subtitle">${visual.label || st?.state || ""}</div><div class="popup-grid-info"><div><span>Feuchte</span><strong>${Utils.text(attrs.humidity ?? "—")}${attrs.humidity !== undefined ? "%" : ""}</strong></div><div><span>Wind</span><strong>${Utils.text(attrs.wind_speed ?? attrs.wind_bearing ?? "—")}</strong></div><div><span>Druck</span><strong>${Utils.text(attrs.pressure ?? "—")}</strong></div></div></div>`;
  }

  _popupCameraMarkup(config) {
    const eid = config.entity_id || config.config?.camera_entity || config.camera_entity || "";
    const preferred = config.config?.camera_source || config.camera_source || "auto";
    const live = (config.config?.camera_view || config.camera_view || "still") === "live";
    const source = live && preferred === "auto" ? "camera_proxy_stream" : preferred;
    const fit = config.config?.camera_fit || config.camera_fit || "contain";
    const src = this._cameraUrlForEntity(eid, source) || "";
    if (!src) return `<div class="popup-empty">Keine Kamera verfügbar</div>`;
    return `<div class="popup-hero popup-camera"><div class="popup-eyebrow">${Utils.text(this._widgetCameraTitle(config, eid) || eid)}</div><img class="popup-camera-image" style="object-fit:${fit}" src="${src}" alt="${eid}"></div>`;
  }

  _popupImageMarkup(config) {
    const src = config.image_url || config.imageUrl || config.url || "";
    if (!src) return `<div class="popup-empty">Kein Bild konfiguriert</div>`;
    return `<div class="popup-hero popup-image"><div class="popup-eyebrow">${Utils.text(this._widgetName(config, "Bild") || "Bild")}</div><img class="popup-camera-image" style="object-fit:contain" src="${src}" alt="Bild"></div>`;
  }

  _renderPopupControlButton(body, label, active, onClick) {
    const btn = document.createElement("button"); btn.className = `popup-control-btn ${active ? "active" : ""}`; btn.textContent = label; btn.onclick = onClick; body.appendChild(btn);
  }


  _popupAppendSection(host, title, className = "popup-controls popup-controls-sub") {
    const heading = document.createElement("div");
    heading.className = "popup-section-title";
    heading.textContent = title;
    host.appendChild(heading);
    const row = document.createElement("div");
    row.className = className;
    host.appendChild(row);
    return row;
  }

  _renderPopupColorButton(body, label, tone, onClick) {
    const btn = document.createElement("button");
    btn.className = "popup-color-chip";
    btn.innerHTML = `<span class="popup-color-swatch" style="background:${tone}"></span><span>${label}</span>`;
    btn.onclick = onClick;
    body.appendChild(btn);
  }

  _openWidgetPopup(config) {
    const overlay = this._widgetPopupOverlay();
    const body = overlay.querySelector(".widget-popup-body");
    const close = () => this._closeWidgetPopup();
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    const entityId = config.tap_target_entity || config.entity_id || "";
    const st = this.app.entityStates[entityId] || {};
    const attrs = st.attributes || {};
    const domain = String(entityId || "").split(".")[0];
    const kind = config.tap_popup_kind || (config.type === "weather" || domain === "weather" ? "weather" : config.type === "camera" ? "camera" : config.type === "image" ? "image" : domain);
    const options = this._controlDisplayOptions(config);
    let html = "";

    if (kind === "weather") html = this._popupWeatherMarkup(config, st);
    else if (kind === "camera") html = this._popupCameraMarkup(config);
    else if (kind === "image") html = this._popupImageMarkup(config);
    else if (domain === "media_player") {
      const cover = attrs.entity_picture || "";
      const progress = Number(attrs.media_duration || 0) > 0 ? Math.max(0, Math.min(100, ((Number(attrs.media_position || 0) / Number(attrs.media_duration || 1)) * 100))) : 0;
      html = `<div class="popup-hero popup-media popup-media-landscape"><div class="popup-media-art-wrap">${cover ? `<img class="popup-media-cover" src="${cover}" alt="Cover">` : `<div class="popup-media-cover placeholder">🎵</div>`}</div><div class="popup-media-info"><div class="popup-eyebrow">${Utils.text(attrs.friendly_name || entityId)}</div><div class="popup-big-value popup-media-big">${Utils.text(attrs.media_title || st.state || "—")}</div><div class="popup-subtitle">${Utils.text(attrs.media_artist || attrs.source || "")}</div><div class="popup-media-progress"><span style="width:${progress}%"></span></div><div class="popup-mini-grid"><div class="popup-mini-row"><span>Status</span><strong>${Utils.text(st.state || "—")}</strong></div><div class="popup-mini-row"><span>Lautstärke</span><strong>${Math.round(Number(attrs.volume_level || 0) * 100)}%</strong></div></div><div class="popup-controls popup-controls-media"></div></div></div>`;
    } else if (domain === "light" || domain === "switch" || domain === "input_boolean" || domain === "fan") {
      const summary = this._controlSummary(config, st, this._popupFriendlyName(config, st), config.icon || this._defaultIconForType(config.type));
      html = `<div class="popup-hero popup-control popup-light"><div class="popup-eyebrow">${Utils.text(attrs.friendly_name || entityId)}</div><div class="popup-big-icon">${domain === "light" ? (summary.active ? "💡" : "🔅") : (summary.active ? "🟢" : "⚪")}</div><div class="popup-big-value">${Utils.text(summary.value || "—")}</div><div class="popup-subtitle">${Utils.text(summary.sub || st.state || "—")}</div>${domain === "light" || domain === "fan" ? `<div class="popup-meter"><span style="width:${summary.meter || 0}%"></span></div><div class="popup-mini-row"><span>${domain === "light" ? "Helligkeit" : "Leistung"}</span><strong>${Math.round(summary.meter || 0)}%</strong></div>` : ``}<div class="popup-controls"></div></div>`;
    } else if (domain === "cover") {
      const pos = attrs.current_position ?? attrs.position;
      const pct = pos == null ? 0 : Math.max(0, Math.min(100, Math.round(Number(pos))));
      const tilt = attrs.current_tilt_position;
      html = `<div class="popup-hero popup-control popup-cover"><div class="popup-eyebrow">${Utils.text(attrs.friendly_name || entityId)}</div><div class="popup-big-icon">🪟</div><div class="popup-big-value">${pos == null ? Utils.text(st.state || "—") : `${pct}<span>%</span>`}</div><div class="popup-subtitle">${Utils.text(st.state || "—")}</div><div class="popup-meter"><span style="width:${pct}%"></span></div><div class="popup-mini-row"><span>Position</span><strong>${pct}%</strong></div>${tilt != null ? `<div class="popup-mini-row"><span>Lamellen</span><strong>${Math.max(0, Math.min(100, Math.round(Number(tilt))))}%</strong></div>` : ``}<div class="popup-controls"></div></div>`;
    } else if (domain === "valve") {
      const isOpen = Utils.isTruthyState(st.state) || String(st.state || '').toLowerCase() === 'open';
      html = `<div class="popup-hero popup-control"><div class="popup-eyebrow">${Utils.text(attrs.friendly_name || entityId)}</div><div class="popup-big-icon">${isOpen ? "💧" : "🚫"}</div><div class="popup-big-value">${isOpen ? "Offen" : "Zu"}</div><div class="popup-subtitle">${Utils.text(st.state || "—")}</div><div class="popup-controls"></div></div>`;
    } else if (domain === "climate") {
      const hvacModes = Utils.safeArray(attrs.hvac_modes);
      html = `<div class="popup-hero popup-control popup-climate"><div class="popup-eyebrow">${Utils.text(attrs.friendly_name || entityId)}</div><div class="popup-big-icon">🌡️</div><div class="popup-big-value">${Utils.text(attrs.current_temperature ?? "—")}<span>°C</span></div><div class="popup-subtitle">Soll ${Utils.text(attrs.temperature ?? "—")} °C · ${Utils.text(st.state || "—")}</div><div class="popup-mini-row"><span>Modus</span><strong>${Utils.text(st.state || "—")}</strong></div>${options.showPopupModes && hvacModes.length ? `<div class="popup-mode-row">${hvacModes.map(m => `<span class="popup-mode-chip ${String(st.state) === String(m) ? 'active' : ''}">${Utils.text(m)}</span>`).join("")}</div>` : ``}<div class="popup-controls"></div></div>`;
    } else {
      html = `<div class="popup-widget-host"></div>`;
    }

    body.innerHTML = `<div class="widget-popup-sheet"><div class="widget-popup-header"><div class="widget-popup-title">${Utils.text(this._popupFriendlyName(config, st) || "Steuerung")}</div><button class="widget-popup-close" type="button">Schließen</button></div><div class="widget-popup-content">${html}</div></div>`;
     const popupFocusCard = this._buildWidgetFocusCard(config, null, {
      width: "min(880px, 100%)",
      height: "min(500px, 58vh)",
      maxWidth: "100%",
      maxHeight: "min(500px, 58vh)",
      scale: Math.min(1.02, Number(config?.tap_scale || 1.02)),
    });
    body.querySelector(".popup-widget-host")?.appendChild(popupFocusCard);
    this._refreshFocusWidget(popupFocusCard, config);
    body.querySelector(".widget-popup-close")?.addEventListener("click", close);
    const hero = body.querySelector(".popup-hero") || body;
    const controls = body.querySelector(".popup-controls");

    if (controls && domain === "media_player") {
      this._renderPopupControlButton(controls, "⏮", false, async () => { await this.app.callEntityService("media_player", "media_previous_track", { entity_id: entityId }); });
      this._renderPopupControlButton(controls, "⏯", false, async () => { await this.app.callEntityService("media_player", "media_play_pause", { entity_id: entityId }); });
      this._renderPopupControlButton(controls, "⏭", false, async () => { await this.app.callEntityService("media_player", "media_next_track", { entity_id: entityId }); });
      this._renderPopupControlButton(controls, "−", false, async () => { await this.app.callEntityService("media_player", "volume_set", { entity_id: entityId, volume_level: Math.max(0, Number(attrs.volume_level ?? 0) - 0.1) }); });
      this._renderPopupControlButton(controls, "+", false, async () => { await this.app.callEntityService("media_player", "volume_set", { entity_id: entityId, volume_level: Math.min(1, Number(attrs.volume_level ?? 0) + 0.1) }); });
    } else if (controls && (domain === "switch" || domain === "input_boolean" || domain === "fan" || domain === "valve")) {
      this._renderPopupControlButton(controls, "Ein/Aus", false, async () => { await this._invokeToggleAction(entityId, 'toggle'); close(); });
      if (domain === "fan") {
        const fanRow = this._popupAppendSection(hero, "Lüfterstufen");
        [25, 50, 75, 100].forEach((pct) => this._renderPopupControlButton(fanRow, `${pct}%`, Number(attrs.percentage || 0) === pct, async () => { await this.app.callEntityService('fan', 'set_percentage', { entity_id: entityId, percentage: pct }); close(); }));
      }
    } else if (controls && domain === "light") {
      const currentBri = Math.round((Number(attrs.brightness ?? (Utils.isTruthyState(st.state) ? 255 : 0)) / 255) * 100);
      this._renderPopupControlButton(controls, "Ein", Utils.isTruthyState(st.state), async () => { await this._invokeToggleAction(entityId, 'on'); close(); });
      this._renderPopupControlButton(controls, "Aus", !Utils.isTruthyState(st.state), async () => { await this._invokeToggleAction(entityId, 'off'); close(); });
      this._renderPopupControlButton(controls, "− Helligkeit", false, async () => { await this.app.callEntityService('light', 'turn_on', { entity_id: entityId, brightness_pct: Math.max(1, currentBri - 15) }); close(); });
      this._renderPopupControlButton(controls, "+ Helligkeit", false, async () => { await this.app.callEntityService('light', 'turn_on', { entity_id: entityId, brightness_pct: Math.min(100, currentBri + 15) }); close(); });
      if (options.showPopupPositionPresets) {
        const briRow = this._popupAppendSection(hero, "Helligkeits-Presets");
        [10, 25, 50, 75, 100].forEach((pct) => this._renderPopupControlButton(briRow, `${pct}%`, currentBri === pct, async () => { await this.app.callEntityService('light', 'turn_on', { entity_id: entityId, brightness_pct: pct }); close(); }));
      }
      if (options.showPopupColors) {
        const colorRow = this._popupAppendSection(hero, "Farben", "popup-color-row");
        [
          ["Warm", "linear-gradient(135deg,#ffb74d,#ff7043)", () => this.app.callEntityAction(entityId, 'set_color_temp', { color_temp_kelvin: 2200 })],
          ["Neutral", "linear-gradient(135deg,#fff8e1,#cfd8dc)", () => this.app.callEntityAction(entityId, 'set_color_temp', { color_temp_kelvin: 4000 })],
          ["Kalt", "linear-gradient(135deg,#e3f2fd,#90caf9)", () => this.app.callEntityAction(entityId, 'set_color_temp', { color_temp_kelvin: 6500 })],
          ["Rot", "#ef5350", () => this.app.callEntityAction(entityId, 'set_rgb_color', { rgb_color: [239, 83, 80] })],
          ["Grün", "#66bb6a", () => this.app.callEntityAction(entityId, 'set_rgb_color', { rgb_color: [102, 187, 106] })],
          ["Blau", "#42a5f5", () => this.app.callEntityAction(entityId, 'set_rgb_color', { rgb_color: [66, 165, 245] })],
          ["Lila", "#ab47bc", () => this.app.callEntityAction(entityId, 'set_rgb_color', { rgb_color: [171, 71, 188] })],
        ].forEach(([label, tone, action]) => this._renderPopupColorButton(colorRow, label, tone, async () => { await action(); close(); }));
      }
      if (options.showPopupEffects && Utils.safeArray(attrs.effect_list).length) {
        const fxRow = this._popupAppendSection(hero, "Effekte");
        Utils.safeArray(attrs.effect_list).slice(0, 10).forEach((effect) => this._renderPopupControlButton(fxRow, String(effect), String(attrs.effect) === String(effect), async () => { await this.app.callEntityAction(entityId, 'set_effect', { effect }); close(); }));
      }
    } else if (controls && domain === "cover") {
      const currentPos = Math.max(0, Math.min(100, Math.round(Number(attrs.current_position ?? attrs.position ?? 0))));
      this._renderPopupControlButton(controls, "Öffnen", false, async () => { await this.app.callEntityService("cover", "open_cover", { entity_id: entityId }); close(); });
      this._renderPopupControlButton(controls, "Stopp", false, async () => { await this.app.callEntityService("cover", "stop_cover", { entity_id: entityId }); });
      this._renderPopupControlButton(controls, "Schließen", false, async () => { await this.app.callEntityService("cover", "close_cover", { entity_id: entityId }); close(); });
      if (options.showPopupPositionPresets) {
        const posRow = this._popupAppendSection(hero, "Positionen");
        [0, 25, 50, 75, 100].forEach((pct) => this._renderPopupControlButton(posRow, `${pct}%`, currentPos === pct, async () => { await this.app.callEntityService('cover', 'set_cover_position', { entity_id: entityId, position: pct }); close(); }));
      }
      if (options.showPopupTilt && (attrs.current_tilt_position != null || attrs.tilt_position != null)) {
        const currentTilt = Math.max(0, Math.min(100, Math.round(Number(attrs.current_tilt_position ?? attrs.tilt_position ?? 0))));
        const tiltRow = this._popupAppendSection(hero, "Lamellen / Tilt");
        this._renderPopupControlButton(tiltRow, "Auf", false, async () => { await this.app.callEntityService('cover', 'open_cover_tilt', { entity_id: entityId }); close(); });
        this._renderPopupControlButton(tiltRow, "Stopp", false, async () => { await this.app.callEntityService('cover', 'stop_cover_tilt', { entity_id: entityId }); });
        this._renderPopupControlButton(tiltRow, "Zu", false, async () => { await this.app.callEntityService('cover', 'close_cover_tilt', { entity_id: entityId }); close(); });
        [0, 50, 100].forEach((pct) => this._renderPopupControlButton(tiltRow, `${pct}%`, currentTilt === pct, async () => { await this.app.callEntityService('cover', 'set_cover_tilt_position', { entity_id: entityId, tilt_position: pct }); close(); }));
      }
    } else if (controls && domain === "climate") {
      this._renderPopupControlButton(controls, "−1°", false, async () => { await this.app.callEntityService("climate", "set_temperature", { entity_id: entityId, temperature: Number(attrs.temperature ?? 20) - 1 }); close(); });
      this._renderPopupControlButton(controls, "+1°", false, async () => { await this.app.callEntityService("climate", "set_temperature", { entity_id: entityId, temperature: Number(attrs.temperature ?? 20) + 1 }); close(); });
      if (options.showPopupModes) {
        const modeRow = this._popupAppendSection(hero, "HVAC-Modi");
        Utils.safeArray(attrs.hvac_modes).slice(0, 8).forEach((mode) => this._renderPopupControlButton(modeRow, String(mode), String(st.state) === String(mode), async () => { await this.app.callEntityAction(entityId, 'set_hvac_mode', { hvac_mode: mode }); close(); }));
      }
      if (options.showPopupPresets && Utils.safeArray(attrs.preset_modes).length) {
        const presetRow = this._popupAppendSection(hero, "Preset-Modi");
        Utils.safeArray(attrs.preset_modes).slice(0, 8).forEach((mode) => this._renderPopupControlButton(presetRow, String(mode), String(attrs.preset_mode) === String(mode), async () => { await this.app.callEntityAction(entityId, 'set_preset_mode', { preset_mode: mode }); close(); }));
      }
      if (options.showPopupFanModes && Utils.safeArray(attrs.fan_modes).length) {
        const fanModeRow = this._popupAppendSection(hero, "Lüfter-Modi");
        Utils.safeArray(attrs.fan_modes).slice(0, 8).forEach((mode) => this._renderPopupControlButton(fanModeRow, String(mode), String(attrs.fan_mode) === String(mode), async () => { await this.app.callEntityAction(entityId, 'set_fan_mode', { fan_mode: mode }); close(); }));
      }
    }

    overlay.hidden = false;
    const secs = Number(config.tap_autoclose || 0);
    if (secs > 0) { clearTimeout(this._popupTimer); this._popupTimer = setTimeout(close, secs * 1000); }
  }


  async _toggleWidgetEntity(widget, config) {
    const entityId = config.tap_target_entity || config.entity_id;
    if (!entityId) return;
    const ok = await this._invokeToggleAction(entityId, config.toggle_mode || 'toggle');
    if (!ok) return;
    setTimeout(() => this._syncWidgetToggleBadge(widget, config), 250);
  }

  async _invokeToggleAction(entityId, mode = 'toggle') {
    const st = this.app?.entityStates?.[entityId] || {};
    const domain = String(entityId || '').split('.')[0];
    const serviceDomain = domain === 'input_boolean' ? 'input_boolean' : domain;
    if (!entityId) return false;
    if (mode === 'on') {
      if (domain === 'cover') return this.app.callEntityService('cover', 'open_cover', { entity_id: entityId });
      if (domain === 'valve') return this.app.callEntityService('valve', 'open_valve', { entity_id: entityId });
      return this.app.callEntityService(serviceDomain, 'turn_on', { entity_id: entityId });
    }
    if (mode === 'off') {
      if (domain === 'cover') return this.app.callEntityService('cover', 'close_cover', { entity_id: entityId });
      if (domain === 'valve') return this.app.callEntityService('valve', 'close_valve', { entity_id: entityId });
      return this.app.callEntityService(serviceDomain, 'turn_off', { entity_id: entityId });
    }
    if (domain === 'cover') {
      const pos = Number(st.attributes?.current_position ?? (String(st.state).toLowerCase() === 'open' ? 100 : 0));
      return this.app.callEntityService('cover', pos > 10 ? 'close_cover' : 'open_cover', { entity_id: entityId });
    }
    if (domain === 'valve') {
      const open = Utils.isTruthyState(st.state) || String(st.state || '').toLowerCase() === 'open';
      return this.app.callEntityService('valve', open ? 'close_valve' : 'open_valve', { entity_id: entityId });
    }
    if (!this.app?.callEntityToggle) return false;
    return this.app.callEntityToggle(entityId);
  }

// ══════════════════════════════════════════════════════════
// TEIL 3 – ScreenManager Helpers + TickerManager + AlertManager + App
// ══════════════════════════════════════════════════════════

  /* ────── Helper-Methoden ────── */
  _normalizeEntityIdList(list) {
    return [...new Set(Utils.safeArray(list).map(item => typeof item === "string" ? item : item?.entity_id || item?.id || "").filter(Boolean))];
  }

  _truncateLabel(label, maxLen) {
    const text = Utils.text(label, "");
    const n = Number(maxLen || 0);
    if (!n || n < 1) return text;
    return text.length > n ? `${text.slice(0, Math.max(1, n)).trim()}…` : text;
  }

  _widgetPrimaryMeta(config) {
    const primaryId = config?.entity_id || config?.config?.camera_entity || "";
    if (!primaryId) return { alias: "", hide_name: false, color: "" };
    const meta = config?.config?.entity_meta || config?.entity_meta || {};
    const entry = meta?.[primaryId] || {};
    return { alias: entry.alias || "", hide_name: !!entry.hide_name, color: entry.color || "" };
  }

  _widgetName(config, fallback = "") {
    const show = config?.config?.show_name !== false && config?.show_name !== false;
    const primaryMeta = this._widgetPrimaryMeta(config);
    if (!show || primaryMeta.hide_name) return "";
    const raw = config?.name || primaryMeta.alias || fallback || "";
    const maxLen = config?.config?.name_max_length ?? config?.name_max_length ?? 0;
    return this._truncateLabel(raw, maxLen);
  }

  _widgetCameraTitle(config, fallback = "") {
    const show = config?.config?.camera_show_title !== false && config?.camera_show_title !== false;
    if (!show) return "";
    return this._widgetName(config, fallback);
  }

  _chartEntityEntries(config) {
    return this._chartEntityIds(config).map((entityId, idx) => ({
      entityId, state: this.app.entityStates[entityId] || {},
      meta: this._extraEntityMeta(config, entityId), idx
    }));
  }

  _chartSeriesLabel(config, entityId, fallback, idx = 0) {
    const meta = this._extraEntityMeta(config, entityId);
    if (meta.hide_name) return `Serie ${idx + 1}`;
    return meta.alias || fallback || entityId || `Serie ${idx + 1}`;
  }

  _chartPaletteSet(name = "default") {
    const palettes = {
      default: [[33,150,243],[76,175,80],[255,152,0],[156,39,176],[244,67,54],[0,188,212],[255,235,59],[255,87,34]],
      ocean: [[0,172,193],[33,150,243],[3,169,244],[0,121,107],[0,188,212],[38,198,218],[77,208,225],[129,212,250]],
      sunset: [[255,112,67],[255,171,64],[255,202,40],[236,64,122],[171,71,188],[126,87,194],[255,138,101],[255,204,128]],
      neon: [[0,230,255],[0,255,149],[255,61,113],[255,214,10],[188,19,254],[127,255,0],[255,0,110],[0,245,255]],
      mono: [[224,224,224],[189,189,189],[158,158,158],[117,117,117],[97,97,97],[66,66,66],[245,245,245],[176,190,197]]
    };
    return palettes[name] || palettes.default;
  }

  _chartPalette(index = 0, alpha = 1, config = null, entityId = "") {
    const metaColor = entityId ? this._extraEntityMeta(config, entityId)?.color : "";
    if (metaColor) {
      if (metaColor.startsWith("rgba") || metaColor.startsWith("rgb") || metaColor.startsWith("hsl")) return metaColor;
      if (metaColor.startsWith("#")) {
        const hex = metaColor.replace("#", "");
        const full = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
        if (full.length === 6) { const r = parseInt(full.slice(0,2),16); const g = parseInt(full.slice(2,4),16); const b = parseInt(full.slice(4,6),16); return `rgba(${r},${g},${b},${alpha})`; }
      }
      return metaColor;
    }
    const base = this._chartPaletteSet(config?.config?.chart_palette || config?.chart_palette || "default");
    const [r,g,b] = base[index % base.length];
    return `rgba(${r},${g},${b},${alpha})`;
  }

  _chartSamplePoints(points, maxPoints = 36) {
    const list = Utils.safeArray(points);
    if (list.length <= maxPoints) return list;
    const step = (list.length - 1) / Math.max(1, (maxPoints - 1));
    const out = [];
    for (let i = 0; i < maxPoints; i++) out.push(list[Math.round(i * step)]);
    return out;
  }

  _chartEntityIds(config) {
    const ids = [];
    if (config.entity_id) ids.push(config.entity_id);
    for (const extra of this._normalizeEntityIdList(config.config?.entities || config.entities)) {
      if (extra && !ids.includes(extra)) ids.push(extra);
    }
    return ids;
  }

  _extraEntityMeta(config, entityId) {
    const meta = config?.config?.entity_meta || config?.entity_meta || {};
    const entry = meta?.[entityId] || {};
    const showNames = config?.config?.show_extra_entity_names !== false && config?.show_extra_entity_names !== false;
    return { alias: entry.alias || "", hide_name: entry.hide_name || !showNames, color: entry.color || "" };
  }

  _renderExtraEntityList(widget, config) {
    const entityIds = this._normalizeEntityIdList(config.config?.entities || config.entities);
    if (!entityIds.length) return;
    const rows = entityIds.map(entityId => {
      const st = this.app.entityStates[entityId] || {};
      const meta = this._extraEntityMeta(config, entityId);
      const label = meta.hide_name ? "" : (meta.alias || st.attributes?.friendly_name || entityId);
      const unit = st.attributes?.unit_of_measurement || "";
      const val = Utils.formatStateWithUnit(st.state ?? "—", unit, { decimals: config.config?.extra_value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false });
      return `<div class="td-extra-row ${meta.hide_name ? "name-hidden" : ""}" data-entity-id="${entityId}"><span class="td-extra-name">${Utils.text(label)}</span><span class="td-extra-value">${val}</span></div>`;
    }).join("");
    widget.insertAdjacentHTML("beforeend", `<div class="td-extra-entities" data-count="${entityIds.length}">${rows}</div>`);
  }


  async _renderMetricSparkline(widget, config) {
    if (!widget || !config?.entity_id || !METRIC_WIDGET_TYPES.has(config.type || "")) return;
    if (config.config?.metric_graph === false) {
      widget.querySelector(".metric-history-mini")?.remove();
      return;
    }
    const hours = Number(config.config?.metric_graph_hours || config.config?.hours || this.app?.globalSettings?.default_chart_hours || 24);
    const history = await this.app.dataManager.fetchHistory(config.entity_id, hours);
    const maxPoints = Math.max(8, Math.min(32, Number(config.config?.metric_graph_points || 18)));
    const points = Utils.safeArray(history?.data).slice(-maxPoints);
    const svg = this._metricSparklineSvg(points, config);
    const existing = widget.querySelector(".metric-history-mini");
    if (!svg) {
      if (existing) existing.remove();
      return;
    }
    if (existing) {
      existing.innerHTML = svg;
      return;
    }
    const html = `<div class="metric-history-mini">${svg}</div>`;
    const extras = widget.querySelector(".td-extra-entities");
    if (extras) extras.insertAdjacentHTML("beforebegin", html);
    else widget.insertAdjacentHTML("beforeend", html);
  }

  _metricSparklineSvg(points, config) {
    const values = Utils.safeArray(points).map((point) => Utils.toNumber(point?.y, null)).filter((value) => value !== null);
    const width = 180;
    const height = 42;
    const pad = 4;
    const accent = config?.accent_color || config?.config?.accent_color || "var(--td-accent)";
    if (!values.length) {
      return `<svg class="metric-history-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true"><rect class="metric-history-placeholder" x="${pad}" y="14" width="${width - (pad * 2)}" height="2" rx="2"></rect><rect class="metric-history-placeholder" x="${pad}" y="26" width="${Math.round((width - (pad * 2)) * 0.72)}" height="2" rx="2"></rect></svg>`;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = (max - min) || 1;
    const coords = values.map((value, idx) => {
      const x = pad + ((width - (pad * 2)) * (idx / Math.max(1, values.length - 1)));
      const y = (height - pad) - (((value - min) / span) * (height - (pad * 2)));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const fill = [`${pad},${height - pad}`, ...coords, `${width - pad},${height - pad}`].join(" ");
    const [lastX, lastY] = coords[coords.length - 1].split(",");
    return `<svg class="metric-history-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polygon class="metric-history-fill" points="${fill}" fill="${accent}"></polygon><polyline class="metric-history-line" points="${coords.join(" ")}" stroke="${accent}"></polyline><circle class="metric-history-dot" cx="${lastX}" cy="${lastY}" r="2.6" fill="${accent}"></circle></svg>`;
  }

  _updateExtraEntityList(element, config) {
    const entityIds = this._normalizeEntityIdList(config.config?.entities || config.entities);
    const container = element.querySelector(".td-extra-entities");
    if (!entityIds.length) { if (container) container.remove(); return; }
    const rows = element.querySelectorAll(".td-extra-row");
    if (!container || rows.length !== entityIds.length) { if (container) container.remove(); this._renderExtraEntityList(element, config); return; }
    rows.forEach(row => {
      const entityId = row.dataset.entityId;
      const st = this.app.entityStates[entityId] || {};
      const unit = st.attributes?.unit_of_measurement || "";
      const meta = this._extraEntityMeta(config, entityId);
      const label = meta.hide_name ? "" : (meta.alias || st.attributes?.friendly_name || entityId);
      const nameEl = row.querySelector(".td-extra-name"); const valueEl = row.querySelector(".td-extra-value");
      row.classList.toggle("name-hidden", !!meta.hide_name);
      if (nameEl) nameEl.textContent = label;
      if (valueEl) valueEl.textContent = Utils.formatStateWithUnit(st.state ?? "—", unit, { decimals: config.config?.extra_value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false });
    });
  }

  _weatherVisual(condition, cfg = {}) {
    const text = String(condition || "").toLowerCase();
    const animate = cfg.weather_animation !== false;
    if (/(lightning|thunder|gewitter)/.test(text)) return { icon: "⛈️", label: "Gewitter", animClass: "storm", theme: "theme-storm", animate };
    if (/(snow|schnee|sleet|hail)/.test(text)) return { icon: "🌨️", label: "Schnee", animClass: "snow", theme: "theme-snow", animate };
    if (/(rain|regen|pouring|shower|drizzle)/.test(text)) return { icon: "🌧️", label: "Regen", animClass: "rain", theme: "theme-rain", animate };
    if (/(fog|mist|nebel|haze)/.test(text)) return { icon: "🌫️", label: "Nebel", animClass: "fog", theme: "theme-fog", animate };
    if (/(wind|breeze|gust|windy|sturm)/.test(text)) return { icon: "💨", label: "Windig", animClass: "wind", theme: "theme-wind", animate };
    if (/(cloud|bew|overcast)/.test(text)) return { icon: "☁️", label: "Bewölkt", animClass: "clouds", theme: "theme-clouds", animate };
    if (/(clear|sun|sonn)/.test(text)) return { icon: "☀️", label: "Sonnig", animClass: "sun", theme: "theme-sun", animate };
    return { icon: "🌤️", label: Utils.text(condition || "Wetter"), animClass: "clouds", theme: "theme-default", animate };
  }

  _weatherFxMarkup(kind, layers = 1) {
    const base = (kind === "rain" || kind === "storm" || kind === "snow") ? 6 : 3;
    const count = Math.max(1, Number(layers || 1)) * base;
    return Array.from({ length: count }, (_, i) => {
      const left = ((i * 17) % 96) + 2;
      const top = kind === "rain" || kind === "storm" ? -20 : ((i * 29) % 80) + 8;
      const delay = -((i % base) * 0.65);
      const size = kind === "clouds" || kind === "fog" || kind === "wind" ? 140 + ((i * 31) % 90) : (kind === "snow" ? 8 + (i % 4) * 2 : 3);
      const height = kind === "clouds" || kind === "fog" || kind === "wind" ? 36 + ((i * 13) % 22) : (kind === "snow" ? size : 38);
      return `<span style="--fx-left:${left}%;--fx-top:${top}%;--fx-delay:${delay}s;--fx-width:${size}px;--fx-height:${height}px"></span>`;
    }).join("");
  }

  _doTransition(newScreen, type) {
    const oldScreen = this.container.querySelector(".screen");
    const currentScreenCfg = this.screens[this.currentIndex] || this.temporaryScreen || {};
    if (currentScreenCfg?.screen_motion_enabled) {
      newScreen.classList.add("screen-motion");
      newScreen.style.setProperty("--td-screen-motion-cycle", `${Number(currentScreenCfg.screen_motion_cycle || 18)}s`);
      newScreen.dataset.motionStrength = currentScreenCfg.screen_motion_strength || "soft";
    }
    if (oldScreen && type !== "none") {
      oldScreen.style.zIndex = "1"; oldScreen.style.pointerEvents = "none";
      newScreen.classList.add(`screen-enter-${type}`);
      oldScreen.classList.add(`screen-exit-${type}`);
      this.container.appendChild(newScreen);
      setTimeout(() => { oldScreen.remove(); newScreen.classList.remove(`screen-enter-${type}`); }, 600);
    } else { if (oldScreen) oldScreen.remove(); this.container.appendChild(newScreen); }
  }

  _startRotation() {
    this._stopRotation(false);
    if (this.screens.length <= 1 || this.isPaused) return;
    const ms = (this.screens[this.currentIndex]?.duration || 15) * 1000;
    this.rotationTimer = setTimeout(() => { if (!this.isPaused && !this.temporaryScreen) this.next(); this._startRotation(); }, ms);
  }

  _stopRotation(clearTemps = true) {
    if (this.rotationTimer) { clearTimeout(this.rotationTimer); this.rotationTimer = null; }
    if (clearTemps) this._clearIntervals();
  }

  _clearIntervals() {
    this._clockIntervals.forEach(clearInterval); this._cameraIntervals.forEach(clearInterval);
    this._countdownIntervals.forEach(clearInterval);
    this._chartInstances.forEach(c => { try { c.destroy(); } catch (e) {} });
    this._clockIntervals = []; this._cameraIntervals = []; this._countdownIntervals = []; this._chartInstances = [];
  }

  _getZoneColor(value, zones) {
    if (!zones?.length) return "var(--td-accent)";
    for (const z of zones) { if (value >= z.from && value <= z.to) return z.color; }
    return "var(--td-accent)";
  }

  _defaultIconForType(type) {
    const map = { "simple-value": "🔢", "icon-value": "ℹ️", "mini-graph": "📉", "line-chart": "📈", "bar-chart": "📊", "area-chart": "🌊", "multi-line-chart": "📈", "stacked-bar-chart": "🧱", "horizontal-bar-chart": "↔️", "donut-chart": "🍩", "pie-chart": "🥧", "radar-chart": "🕸️", "heatmap-mini": "🔥", "timeline-chart": "🕒", "scatter-chart": "✳️", "bubble-chart": "🫧", "polar-area-chart": "🧿", "forecast-chart": "🔮", "energy-flow-mini": "⚡", "comparison-chart": "⚖️", "radial-gauge-advanced": "🎛️", "bullet-chart": "🎯", "sparkline": "〰️", "trend-arrow": "📈", "media-player-control": "🎵", "switch-control": "🎚️", "light-control": "💡", "climate-control": "🌡️", "cover-control": "🪟", "weather": "🌤️", "clock": "🕐", "image": "🖼️", "camera": "📹", "qr-code": "🔳", "countdown": "⏱️", "button": "🔘" };
    return map[type] || "📊";
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
    this.messages = [];
    this.entityTemplates = [];
  }

  init() {
    const tickerConfig = this.app.config.ticker || {};
    this._applyStyle(tickerConfig);
    if (!tickerConfig.enabled) {
      if (this.bar) this.bar.hidden = true;
      document.querySelector(".screen-container")?.classList.add("no-ticker");
      return;
    }
    this.entityTemplates = Utils.safeArray(tickerConfig.entities);
    this._rebuild();
  }

  rebuild() {
    const cfg = this.app.config.ticker || {};
    this.entityTemplates = Utils.safeArray(cfg.entities);
    this._applyStyle(cfg);
    this._rebuild();
  }

  _conditionMatches(state, condition) {
    if (!condition) return true;
    const raw = String(condition).trim(); const lower = raw.toLowerCase(); const value = Number(state?.state);
    if (lower.startsWith("state=")) return String(state?.state) === raw.slice(6);
    if (lower.startsWith("state!=")) return String(state?.state) !== raw.slice(7);
    if (lower.startsWith("gt:")) return Number.isFinite(value) && value > Number(raw.slice(3));
    if (lower.startsWith("gte:")) return Number.isFinite(value) && value >= Number(raw.slice(4));
    if (lower.startsWith("lt:")) return Number.isFinite(value) && value < Number(raw.slice(3));
    if (lower.startsWith("lte:")) return Number.isFinite(value) && value <= Number(raw.slice(4));
    if (lower.startsWith("contains:")) return String(state?.state || "").includes(raw.slice(9));
    return true;
  }

  _buildRuleItems() {
    const rules = Utils.safeArray(this.app.config.ticker?.rules).filter(r => r && (r.domain || r.entity_id || r.condition));
    const items = [];
    for (const rule of rules.sort((a,b) => (b.priority || 0) - (a.priority || 0))) {
      for (const [entityId, state] of Object.entries(this.app.entityStates || {})) {
        if (rule.entity_id && rule.entity_id !== entityId) continue;
        if (rule.domain && !String(entityId).startsWith(`${rule.domain}.`)) continue;
        if (!this._conditionMatches(state, rule.condition)) continue;
        const tpl = String(rule.template || '{friendly_name}: {state}{unit}');
        const text = tpl.replaceAll('{entity_id}', entityId).replaceAll('{state}', state?.state || '').replaceAll('{friendly_name}', state?.attributes?.friendly_name || entityId).replaceAll('{unit}', state?.attributes?.unit_of_measurement ? ` ${state.attributes.unit_of_measurement}` : '');
        items.push({ text, color: rule.color, icon: rule.icon, priority: rule.priority || 0 });
      }
    }
    return items;
  }

  _applyStyle(cfg = {}) {
    const root = document.documentElement;
    if (!root) return;
    const preset = { classic: {}, glass: { background_color: "rgba(20,24,32,.45)", text_color: "#ffffff", accent_color: "#7dd3fc", border_radius: 14, font_weight: 600, opacity: 0.92 }, alert: { background_color: "rgba(120,8,8,.85)", text_color: "#fff5f5", accent_color: "#ffd54f", border_radius: 0, font_weight: 700 }, minimal: { background_color: "rgba(0,0,0,.22)", text_color: "#f3f4f6", accent_color: "#9ca3af", border_radius: 10, font_weight: 500 } }[cfg.style_template || "classic"] || {};
    cfg = { ...preset, ...cfg };
    if (cfg.height) root.style.setProperty("--td-ticker-height", `${cfg.height}px`);
    if (cfg.font_size) root.style.setProperty("--td-ticker-font-size", `${cfg.font_size}px`);
    if (cfg.item_padding_x) root.style.setProperty("--td-ticker-padding-x", `${cfg.item_padding_x}px`);
    if (cfg.text_color) root.style.setProperty("--td-ticker-text-color", String(cfg.text_color));
    if (cfg.background_color) root.style.setProperty("--td-ticker-bg", String(cfg.background_color));
    if (cfg.accent_color) root.style.setProperty("--td-ticker-accent", String(cfg.accent_color));
    if (cfg.border_radius != null) root.style.setProperty("--td-ticker-radius", `${cfg.border_radius}px`);
    if (cfg.font_weight != null) root.style.setProperty("--td-ticker-font-weight", String(cfg.font_weight));
    if (cfg.opacity != null && this.bar) this.bar.style.opacity = String(cfg.opacity);
    if (this.bar) { this.bar.classList.toggle("top", (cfg.position || "bottom") === "top"); this.bar.classList.toggle("bottom", (cfg.position || "bottom") !== "top"); }
  }

  addMessages(msgs) {
    for (const m of Utils.safeArray(msgs)) {
      this.messages.push({ text: m.text || m.message || "", color: m.color, icon: m.icon, timestamp: Date.now(), duration: m.duration || 300 });
    }
    this._rebuild();
  }

  setEntities(data) { this.entityTemplates = Utils.safeArray(data.entities); this._rebuild(); }
  clear() { this.messages = []; this.entityTemplates = []; this._rebuild(); }

  onEntityUpdate(entityId) {
    if (this.entityTemplates.some(t => (typeof t === "string" ? t : t.entity_id) === entityId)) this._rebuild();
  }

  _rebuild() {
    if (!this.container) return;
    let items = [];
    for (const msg of Utils.safeArray(this.app.config.ticker?.fixed_messages)) {
      items.push({ text: typeof msg === "string" ? msg : (msg?.text || ""), color: typeof msg === "object" ? msg.color : null, icon: typeof msg === "object" ? msg.icon : null });
    }
    for (const tmpl of this.entityTemplates) {
      const eid = typeof tmpl === "string" ? tmpl : tmpl.entity_id;
      const tpl = typeof tmpl === "string" ? "{friendly_name}: {state}" : (tmpl.template || "{state}");
      const color = typeof tmpl === "object" ? tmpl.color : null;
      const state = this.app.entityStates[eid];
      if (state) {
        const text = tpl.replace("{state}", state.state || "").replace("{friendly_name}", state.attributes?.friendly_name || eid).replace("{unit}", state.attributes?.unit_of_measurement || "");
        items.push({ text, color });
      }
    }
    const now = Date.now();
    this.messages = this.messages.filter(m => (now - m.timestamp) / 1000 < m.duration);
    for (const m of this.messages) items.push({ text: m.text, color: m.color, icon: m.icon });
    items.push(...this._buildRuleItems());
    items.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    if (!items.length) { this.container.innerHTML = ""; this.container.classList.remove("scrolling"); return; }
    const separator = String(this.app.config.ticker?.separator || "│");
    const build = list => list.map((item, i) => {
      const style = item.color ? `color:${item.color}` : "";
      return `<span class="ticker-item" style="${style}">${item.icon ? `<span class="ticker-icon">${item.icon}</span>` : ""}${item.text}</span>` + (i < list.length - 1 ? `<span class="ticker-separator">${separator}</span>` : "");
    }).join("");
    this.container.innerHTML = build(items) + `<span class="ticker-separator">${separator}</span>` + build(items);
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
    this._timers = [];
    this._activeTag = null;
  }

  show(data = {}) {
    this.clearAll({ silent: true });
    const payload = { ...data };
    payload.duration = this._resolveDuration(payload);
    const mode = payload.mode || "fullscreen";
    this._activeTag = payload.tag || null;
    this._emit("alert_shown", { tag: payload.tag || "", title: payload.title || "", mode, severity: payload.severity || "info", duration: payload.duration || 0 });
    if (payload.wake_screen) this.app?.bridge?.setScreenPower?.(true);
    if (payload.tts_message) this.app?.bridge?.ttsSpeak?.(payload.tts_message, payload.tts_language || "de", payload.volume || 70);
    switch (mode) {
      case "banner":
      case "notification":
        this._showBanner(payload);
        break;
      case "overlay":
        this._showOverlay(payload);
        break;
      case "split":
        this._showSplit(payload);
        break;
      case "toast":
        this._showToast(payload);
        break;
      case "pip":
        this._showPip(payload);
        break;
      default:
        this._showFullscreen(payload);
    }
  }

  clearAll(opts = {}) {
    const tag = opts?.tag || null;
    if (tag && this._activeTag && tag !== this._activeTag) return;
    this._timers.forEach(clearTimeout);
    this._timers = [];
    if (this.overlay) { this.overlay.hidden = true; this.overlay.innerHTML = ""; }
    if (this.banner) { this.banner.hidden = true; this.banner.innerHTML = ""; }
    if (this.toastContainer) { this.toastContainer.hidden = true; this.toastContainer.innerHTML = ""; }
    if (!opts?.silent && this._activeTag) this._emit("alert_closed", { tag: this._activeTag, reason: opts?.reason || "clear" });
    this._activeTag = null;
  }

  _emit(event, data = {}) {
    try {
      this.app?.wsClient?.send({ type: "event", event, data });
    } catch (e) {
      console.warn("alert event emit failed", event, e);
    }
  }

  _resolveDuration(data = {}) {
    const raw = data.dismiss_after ?? data.auto_close_after ?? data.duration ?? 0;
    const duration = Number(raw || 0);
    if (!Number.isFinite(duration)) return 0;
    return Math.max(0, Math.min(3600, duration));
  }

  _showActionFeedback(label = "Aktion gesendet") {
    const text = Utils.text(label || "Aktion gesendet");
    try { this.app?.bridge?.showToast?.(text); } catch (e) {}
    if (!this.toastContainer) return;
    const el = document.createElement('div');
    el.className = 'alert-feedback-toast';
    el.textContent = text;
    this.toastContainer.hidden = false;
    this.toastContainer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    const timer = setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => {
        el.remove();
        if (!this.toastContainer?.children?.length) this.toastContainer.hidden = true;
      }, 220);
    }, 1800);
    this._timers.push(timer);
  }

  _armAutoClose(data) {
    if (data.persistent || data.require_ack) return;
    const duration = Math.max(0, Number(data.duration || 0));
    if (!duration) return;
    this._timers.push(setTimeout(() => this.clearAll({ reason: "timeout" }), duration * 1000));
  }

  _actionsMarkup(data) {
    const buttons = [];
    if (data.require_ack || data.ack_label) buttons.push({ id: "ack", label: data.ack_label || "Bestätigen", style: "primary", close: true });
    for (const action of Utils.safeArray(data.actions)) buttons.push(action);
    if (data.secondary_label) buttons.push({ id: data.secondary_action || "secondary", label: data.secondary_label, style: "ghost", close: true });
    if (!buttons.length && data.persistent) buttons.push({ id: "dismiss", label: "Schließen", style: "ghost", close: true });
    if (!buttons.length) return "";
    return `<div class="alert-actions">${buttons.map((action) => `<button type="button" class="alert-action-btn ${action.style || "ghost"}" data-alert-action="${Utils.text(action.id || action.event || "action")}" data-alert-close="${action.close === false ? "false" : "true"}">${Utils.text(action.label || "Aktion")}</button>`).join("")}</div>`;
  }

  _progressMarkup(data) {
    if (data.progress_value == null && !data.progress_text) return "";
    const pct = Math.max(0, Math.min(100, Number(data.progress_value || 0)));
    return `<div class="alert-progress-wrap"><div class="alert-progress"><span style="width:${pct}%"></span></div>${data.progress_text ? `<div class="alert-progress-text">${Utils.text(data.progress_text)}</div>` : ""}</div>`;
  }

  _bindAlertActions(root, data) {
    root.querySelectorAll('[data-alert-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-alert-action') || 'action';
        const close = btn.getAttribute('data-alert-close') !== 'false';
        const label = btn.textContent?.trim() || action;
        btn.classList.add('is-busy');
        this._emit('alert_action', { tag: data.tag || '', action, title: data.title || '', source: data.source || '' });
        this._showActionFeedback(`${label} gesendet`);
        setTimeout(() => btn.classList.remove('is-busy'), 500);
        if (close) this.clearAll({ reason: action });
      });
    });
  }

  _showFullscreen(data) {
    if (!this.overlay) return;
    const sev = data.severity || "info";
    this.overlay.className = `alert-overlay severity-${sev}`;
    this.overlay.innerHTML = `<div class="alert-card"><div class="alert-topline">${Utils.text(data.source || "Alert")}</div><div class="alert-icon">${data.icon || {info:"ℹ️",warning:"⚠️",critical:"🚨"}[sev] || "ℹ️"}</div><div class="alert-title">${Utils.text(data.title || "")}</div><div class="alert-message">${Utils.text(data.message || "")}</div>${this._progressMarkup(data)}${this._actionsMarkup(data)}${data.duration && !data.require_ack && !data.persistent ? `<div class="alert-timer">Schließt in ${data.duration}s</div>` : ""}</div>`;
    this.overlay.hidden = false;
    this._bindAlertActions(this.overlay, data);
    this._armAutoClose(data);
  }

  _showBanner(data) {
    if (!this.banner) return;
    const sev = data.severity || "info";
    this.banner.className = `notification-banner severity-${sev}`;
    this.banner.innerHTML = `<div class="banner-icon">${Utils.text(data.icon || {info:"ℹ️",warning:"⚠️",critical:"🚨"}[sev] || "ℹ️")}</div><div class="banner-main"><div class="banner-title-row"><div class="banner-title">${Utils.text(data.title || data.source || 'Hinweis')}</div>${data.tag ? `<div class="banner-tag">${Utils.text(data.tag)}</div>` : ''}</div><div class="banner-message">${Utils.text(data.message || '')}</div>${this._progressMarkup(data)}</div>${this._actionsMarkup(data)}`;
    this.banner.hidden = false;
    this._bindAlertActions(this.banner, data);
    this._armAutoClose(data);
  }

  _showOverlay(data) {
    if (!this.overlay) return;
    const sev = data.severity || "info";
    this.overlay.className = `alert-overlay overlay-card-mode severity-${sev}`;
    this.overlay.innerHTML = `<div class="alert-card alert-card-overlay"><div class="alert-topline">${Utils.text(data.source || 'Overlay')}</div><div class="alert-title">${Utils.text(data.title || '')}</div><div class="alert-message">${Utils.text(data.message || '')}</div>${this._progressMarkup(data)}${this._actionsMarkup(data)}</div>`;
    this.overlay.hidden = false;
    this._bindAlertActions(this.overlay, data);
    this._armAutoClose(data);
  }

  _showSplit(data) {
    if (!this.overlay) return;
    const sev = data.severity || "info";
    this.overlay.className = `alert-overlay split-mode severity-${sev}`;
    const cam = data.camera_entity_id || data.entity_id || '';
    const camUrl = cam ? `${this.app.apiBase}/api/image/camera/${encodeURIComponent(cam)}` : '';
    this.overlay.innerHTML = `<div class="alert-split-shell"><div class="alert-split-main"><div class="alert-topline">${Utils.text(data.source || 'Split')}</div><div class="alert-title">${Utils.text(data.title || '')}</div><div class="alert-message">${Utils.text(data.message || '')}</div>${this._progressMarkup(data)}${this._actionsMarkup(data)}</div><div class="alert-split-side">${camUrl ? `<img class="alert-split-camera" src="${camUrl}" alt="Kamera">` : `<div class="alert-split-placeholder">${Utils.text(data.icon || '📣')}</div>`}</div></div>`;
    this.overlay.hidden = false;
    this._bindAlertActions(this.overlay, data);
    this._armAutoClose(data);
  }

  _showPip(data) {
    this._showOverlay({ ...data, source: data.source || 'PIP' });
  }

  _showToast(data) {
    if (!this.toastContainer) return;
    this.toastContainer.innerHTML = `<div class="toast-message"><div class="toast-title">${Utils.text(data.title || data.source || 'Info')}</div><div>${Utils.text(data.message || '')}</div>${this._actionsMarkup(data)}</div>`;
    this.toastContainer.hidden = false;
    this._bindAlertActions(this.toastContainer, data);
    this._armAutoClose(data);
  }
}

class TickerDisplayApp {
  constructor() {
    this.config = window.TICKER_CONFIG || {};
    this.deviceId = window.TICKER_DEVICE_ID || "unknown";
    this.wsUrl = window.TICKER_WS_URL || "";
    this.apiBase = window.TICKER_API_BASE || "/ticker-display";
    this.globalSettings = window.TICKER_GLOBAL_SETTINGS || {};
    this.neededEntities = window.TICKER_ENTITIES || [];
    this.entityStates = {};
    this.previousEntityStates = {};
    this.dataManager = new DataManager(this.apiBase);
    this.isPreview = location.pathname.includes("/preview/");
    this._statePollTimer = null;
  }

  async init() {
    console.log("🚀 Ticker Display starting...", this.deviceId);
    try {
      const qp = new URLSearchParams(location.search);
      const previewKey = qp.get("td_preview_key");
      if (this.isPreview && previewKey) {
        const raw = localStorage.getItem(previewKey);
        if (raw) { const draft = JSON.parse(raw); if (draft && typeof draft === "object") this.config = { ...(this.config || {}), ...draft, screens: Array.isArray(draft.screens) ? draft.screens : (this.config.screens || []) }; }
      }
    } catch (e) { console.warn("Preview draft load failed", e); }

    try {
      this.bridge = new BridgeWrapper();
      await this._primeEntityStates();
      this.themeManager = new ThemeManager();
      this.screenManager = new ScreenManager(this);
      this.tickerManager = new TickerManager(this);
      this.alertManager = new AlertManager(this);
      this.wsClient = new WebSocketClient(this);

      this.screenManager.start();
      this.tickerManager.init();

      const loading = document.getElementById("loading-screen");
      if (loading) loading.style.display = "none";
      const offline = document.getElementById("offline-screen");
      if (offline && this.isPreview) offline.hidden = true;

      this.wsClient.connect()
        .then(() => { console.log("✅ WebSocket connected"); if (offline) offline.hidden = true; this.reportSensorsNow?.(); })
        .catch(e => { console.warn("⚠️ WebSocket connect failed, running offline:", e); if (offline && this.isPreview) offline.hidden = true; });

      this._startSensorReporting();
      this._startStatePolling();
      console.log("✅ Ticker Display ready!");
    } catch (e) { console.error("❌ Init error:", e); }
  }

  onEntityStateChanged(id, state) {
    this.previousEntityStates[id] = this.entityStates[id] || this.previousEntityStates[id] || null;
    this.entityStates[id] = state;
    this.screenManager.onEntityUpdate(id, state);
    this.tickerManager.onEntityUpdate(id, state);
  }

  onCommand(cmd, data) {
    const screenCmds = ["show_dashboard", "show_graph", "show_camera", "show_weather", "show_single_value", "show_clock", "show_status_board", "show_image", "show_template"];
    if (screenCmds.includes(cmd)) { this.screenManager.showTemporaryScreen(cmd, data); return; }
    if (cmd === "clear_alert") this.alertManager.clearAll(data || {});
    else if (cmd === "show_alert_sequence") {
      const alerts = Utils.safeArray(data?.alerts);
      if (!alerts.length) return;
      let delay = 0;
      alerts.forEach((alert, index) => {
        const startDelay = delay;
        setTimeout(() => this.alertManager.show(alert || {}), startDelay * 1000);
        const duration = Number(alert?.dismiss_after ?? alert?.auto_close_after ?? alert?.duration ?? 0) || 0;
        delay += Math.max(duration, index === alerts.length - 1 ? 0 : 1);
      });
    }
    else if (cmd === "set_ticker_entities") this.tickerManager.setEntities(data);
    else if (cmd === "clear_ticker") this.tickerManager.clear();
    else if (cmd === "identify") this._showIdentify();
  }

  onAlert(data) { this.alertManager.show(data); }
  onTickerMessages(msgs) { this.tickerManager.addMessages(msgs); }
  onDisplayControl(data) { if (data.brightness !== undefined) this.bridge.setScreenBrightness(data.brightness); if (data.screen_power !== undefined) this.bridge.setScreenPower(data.screen_power); }

  onAudio(data) {
    if (data.action === "play") this.bridge.playSound(data.url, data.volume, data.loop);
    else if (data.action === "tts") this.bridge.ttsSpeak(data.text, data.language, data.volume);
    else if (data.action === "stop") this.bridge.stopSound();
    else if (data.action === "set_volume") this.bridge.setVolume(data.volume);
  }

  _refreshEntityStateSoon(entityId) {
    if (!entityId) return;
    this._entityRefreshTimers = this._entityRefreshTimers || {};
    clearTimeout(this._entityRefreshTimers[entityId]);
    this._entityRefreshTimers[entityId] = setTimeout(async () => {
      const state = await this.dataManager.fetchState(entityId);
      if (state) this.onEntityStateChanged(entityId, state);
    }, 350);
  }

  async callEntityToggle(entityId) {
    if (!entityId) return false;
    try {
      const resp = await fetch(`${this.apiBase}/api/entity/toggle`, { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body: JSON.stringify({ entity_id: entityId }) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this._refreshEntityStateSoon(entityId);
      return true;
    } catch (e) { console.warn("toggle failed", entityId, e); return false; }
  }

  async callEntityAction(entityId, action, data = {}) {
    if (!entityId || !action) return false;
    try {
      const resp = await fetch(`${this.apiBase}/api/entity/action`, { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body: JSON.stringify({ entity_id: entityId, action, data }) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this._refreshEntityStateSoon(entityId);
      return true;
    } catch (e) { console.warn("action call failed", entityId, action, data, e); return false; }
  }

  async callEntityService(domain, service, data = {}) {
    try {
      const resp = await fetch(`${this.apiBase}/api/entity/service`, { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body: JSON.stringify({ domain, service, data }) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      if (data?.entity_id) this._refreshEntityStateSoon(data.entity_id);
      return true;
    } catch (e) { console.warn("service call failed", domain, service, data, e); return false; }
  }

  onNavigate(data) {
    if (data.action === "next") this.screenManager.next();
    else if (data.action === "previous") this.screenManager.previous();
    else if (data.action === "goto") this.screenManager.goto(data.screen_id);
    else if (data.action === "pause") this.screenManager.pauseRotation();
    else if (data.action === "resume") this.screenManager.resumeRotation();
  }

  onConfigChanged(cfg) {
    console.log("📥 Config changed", cfg);
    this.config = cfg || {};
    this.neededEntities = window.TICKER_ENTITIES || this.neededEntities;
    this._primeEntityStates();
    this.screenManager.rebuild();
    this.tickerManager.rebuild();
    this._startStatePolling();
    const offline = document.getElementById("offline-screen");
    if (offline) { if (this.isPreview) offline.hidden = true; else if (this.wsClient?.isConnected()) offline.hidden = true; }
    try { localStorage.setItem("ticker_config_cache", JSON.stringify(cfg)); } catch (e) {}
  }

  onThemeChanged(data) { this.themeManager.applyDynamic(data); }

  reportSensorsNow() {
    if (!this.bridge || !this.bridge.isAvailable()) return;
    const d = this.bridge.getAllSensorData();
    if (d && this.wsClient?.isConnected()) this.wsClient.send({ type: "sensor_update", data: { device_id: this.deviceId, ...d } });
  }

  async _primeEntityStates() { await this._pollEntityStates(false); }

  async _pollEntityStates(emitChanges = true) {
    const ids = [...new Set((this.neededEntities || []).filter(Boolean))].slice(0, 250);
    if (!ids.length) return;
    const results = await Promise.all(ids.map(id => this.dataManager.fetchState(id)));
    results.forEach((state, idx) => {
      const entityId = ids[idx];
      if (!state) return;
      const prev = this.entityStates[entityId];
      const changed = !prev || prev.state !== state.state || JSON.stringify(prev.attributes || {}) !== JSON.stringify(state.attributes || {});
      if (changed && prev) this.previousEntityStates[entityId] = prev;
      this.entityStates[entityId] = state;
      if (emitChanges && changed) this.onEntityStateChanged(entityId, state);
    });
  }

  _startStatePolling() {
    if (this._statePollTimer) clearInterval(this._statePollTimer);
    const ms = this.wsClient?.isConnected() ? 30000 : 12000;
    this._statePollTimer = setInterval(() => this._pollEntityStates(true), ms);
    setTimeout(() => this._pollEntityStates(true), 1500);
  }

  _startSensorReporting() {
    if (!this.bridge.isAvailable()) return;
    this._sensorTimer = setInterval(() => this.reportSensorsNow(), 30000);
    setTimeout(() => this.reportSensorsNow(), 2000);
  }

  _showIdentify() {
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;inset:0;background:var(--td-accent);z-index:10000;display:flex;align-items:center;justify-content:center;flex-direction:column;animation:blink .5s ease 6;`;
    overlay.innerHTML = `<div style="font-size:48px;font-weight:700;color:white">${this.config.name || this.deviceId}</div><div style="font-size:20px;color:rgba(255,255,255,.7);margin-top:12px">${this.deviceId}</div>`;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 3000);
  }
}

/* ══════════════════════════════════════════════════════════
   START
   ══════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
  window.tickerApp = new TickerDisplayApp();
  window.tickerApp.init();
});