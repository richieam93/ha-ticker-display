/**
 * Ticker Display – Enhanced Display Engine
 * Stable rendering, websocket-tolerant, better widgets and chart support
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
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  },

  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  },

  safeArray(v) {
    return Array.isArray(v) ? v : [];
  },

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
    } catch (e) {
      return "";
    }
  }
};

const CHART_WIDGET_TYPES = new Set([
  "mini-graph", "sparkline", "line-chart", "bar-chart", "area-chart", "multi-line-chart", "stacked-bar-chart",
  "horizontal-bar-chart", "donut-chart", "pie-chart", "radar-chart", "heatmap-mini", "timeline-chart",
  "scatter-chart", "bubble-chart", "polar-area-chart", "forecast-chart", "energy-flow-mini", "comparison-chart", "radial-gauge-advanced", "bullet-chart"
]);

const CHART_TYPE_ICONS = {
  "mini-graph": "📉",
  "sparkline": "〰️",
  "line-chart": "📈",
  "bar-chart": "📊",
  "area-chart": "🌊",
  "multi-line-chart": "📈",
  "stacked-bar-chart": "🧱",
  "horizontal-bar-chart": "↔️",
  "donut-chart": "🍩",
  "pie-chart": "🥧",
  "radar-chart": "🕸️",
  "heatmap-mini": "🔥",
  "timeline-chart": "🕒",
  "scatter-chart": "✳️",
  "bubble-chart": "🫧",
  "polar-area-chart": "🧿",
  "forecast-chart": "🔮",
  "energy-flow-mini": "⚡",
  "comparison-chart": "⚖️",
  "radial-gauge-advanced": "🎛️",
  "bullet-chart": "🎯"
};

class DataManager {
  constructor(apiBase) {
    this.apiBase = apiBase;
    this._cache = {};
  }

  async fetchHistory(entityId, hours = 24) {
    const key = `h_${entityId}_${hours}`;
    const cached = this._cache[key];
    if (cached && Date.now() - cached.t < 60000) return cached.d;

    try {
      const r = await fetch(`${this.apiBase}/api/history/${entityId}?hours=${hours}`);
      const d = await r.json();
      this._cache[key] = { d, t: Date.now() };
      return d;
    } catch (e) {
      return { entity_id: entityId, data: [] };
    }
  }

  async fetchWeather(entityId) {
    try {
      const r = await fetch(`${this.apiBase}/api/weather/${entityId}`);
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  async fetchState(entityId) {
    try {
      const r = await fetch(`${this.apiBase}/api/states/${entityId}`);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
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

  isAvailable() {
    return this._available;
  }

  setScreenBrightness(v) {
    if (this._bridge?.setScreenBrightness) {
      this._bridge.setScreenBrightness(Math.round(v));
    }
  }

  setScreenPower(on) {
    if (this._bridge?.setScreenPower) {
      this._bridge.setScreenPower(!!on);
    }
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
    if (this._bridge?.stopSound) {
      try { this._bridge.stopSound(); } catch (e) {}
      return;
    }
    if (this._audioElement) {
      this._audioElement.pause();
      this._audioElement = null;
    }
  }

  ttsSpeak(text, lang = "de") {
    if (this._bridge?.ttsSpeak) {
      try { this._bridge.ttsSpeak(text, lang); } catch (e) {}
    }
  }

  setVolume(v) {
    if (this._bridge?.setVolume) {
      try { this._bridge.setVolume(v); } catch (e) {}
    }
  }

  vibrate(ms = 500) {
    if (this._bridge?.vibrate) {
      try { this._bridge.vibrate(ms); } catch (e) {}
    } else if (navigator.vibrate) {
      navigator.vibrate(ms);
    }
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
    } catch (e) {
      return null;
    }
  }
}

/* ══════════════════════════════════════════════════════════
   THEME MANAGER
   ══════════════════════════════════════════════════════════ */

class ThemeManager {
  applyDynamic(data) {
    if (!data) return;
    const root = document.documentElement;

    if (data.accent_color) {
      root.style.setProperty("--td-accent", data.accent_color);
    }

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
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }

        const ws = new WebSocket(this.app.wsUrl);
        this.ws = ws;

        ws.onopen = () => {
          if (seq !== this._connectSeq || ws !== this.ws) {
            try { ws.close(); } catch (e) {}
            return;
          }

          this._connected = true;
          this._hadSuccessfulConnection = true;
          this._reconnectDelay = 1000;

          if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
          }

          const offline = document.getElementById("offline-screen");
          if (offline) offline.hidden = true;

          this.send({
            type: "subscribe",
            entities: this.app.neededEntities || []
          });

          resolve();
        };

        ws.onmessage = (e) => {
          if (seq !== this._connectSeq || ws !== this.ws) return;
          try {
            this._handleMessage(JSON.parse(e.data));
          } catch (err) {
            console.error("WebSocket parse error:", err);
          }
        };

        ws.onclose = () => {
          if (seq !== this._connectSeq || ws !== this.ws) return;

          this._connected = false;

          const offline = document.getElementById("offline-screen");
          if (offline) {
            if (this.app?.isPreview) {
              offline.hidden = true;
            } else {
              // Nur anzeigen, wenn es vorher wirklich mal verbunden war
              offline.hidden = !this._hadSuccessfulConnection;
            }
          }

          if (!this._manuallyClosed) {
            this._scheduleReconnect();
          }
        };

        ws.onerror = (err) => {
          if (seq !== this._connectSeq || ws !== this.ws) return;
          reject(err);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  disconnect() {
    this._manuallyClosed = true;
    this._connected = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
  }

  send(data) {
    if (this.ws && this._connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  isConnected() {
    return this._connected;
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case "state_changed":
        this.app.onEntityStateChanged(msg.entity_id, msg.new_state);
        break;
      case "command":
        this.app.onCommand(msg.command, msg.data || {});
        break;
      case "alert":
        this.app.onAlert(msg.data || {});
        break;
      case "ticker":
        this.app.onTickerMessages(msg.messages || []);
        break;
      case "display_control":
        this.app.onDisplayControl(msg);
        break;
      case "audio":
        this.app.onAudio(msg);
        break;
      case "navigate":
        this.app.onNavigate(msg);
        break;
      case "config_changed":
        this.app.onConfigChanged(msg.config);
        break;
      case "theme_changed":
        this.app.onThemeChanged(msg.theme || msg);
        break;
      case "reload":
        location.reload();
        break;
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
   SCREEN MANAGER
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

  start() {
    if (!this.container) return;

    if (!this.screens.length) {
      this.container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📱</div>
          <div class="empty-state-title">Warte auf Konfiguration...</div>
          <div class="empty-state-subtitle">${this.app.deviceId}</div>
        </div>
      `;
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

  next() {
    if (this.screens.length > 1) {
      this._showScreen((this.currentIndex + 1) % this.screens.length);
    }
  }

  previous() {
    if (this.screens.length > 1) {
      this._showScreen((this.currentIndex - 1 + this.screens.length) % this.screens.length);
    }
  }

  goto(screenId) {
    const i = this.screens.findIndex(
      (s) => s.id === screenId || s.name === screenId
    );
    if (i >= 0) this._showScreen(i);
  }

  pauseRotation() {
    this.isPaused = true;
    this._stopRotation();
  }

  resumeRotation() {
    this.isPaused = false;
    this.temporaryScreen = null;
    this._showScreen(this.currentIndex);
    this._startRotation();
  }

  showTemporaryScreen(command, data) {
    const typeMap = {
      show_dashboard: "dashboard",
      show_graph: "graph",
      show_camera: "camera",
      show_weather: "weather",
      show_single_value: "single-value",
      show_clock: "clock",
      show_status_board: "status-board",
      show_image: "image",
      show_template: "dashboard"
    };

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
    if (widgets) {
      for (const w of widgets) {
        this._updateWidget(w, entityId, newState);
      }
    }
    const current = this.temporaryScreen || this.screens[this.currentIndex];
    if (!current) return;
    const weatherRelated = current.entity_id === entityId || Utils.safeArray(current.widgets).some((w) => w.type === "weather" && w.entity_id === entityId);
    if ((current.type === "weather" || current.screen_weather_fx) && weatherRelated) {
      this._renderScreen(current);
    }
  }

  _showScreen(index) {
    if (index >= this.screens.length) return;
    this.currentIndex = index;
    this._renderScreen(this.screens[index]);

    if (this.app.wsClient?.isConnected()) {
      this.app.wsClient.send({
        type: "status",
        screen: this.screens[index].name || `screen_${index}`
      });
    }
  }

  _renderScreen(config) {
    this._widgetElements = {};
    this._clearIntervals();
    if (this.app.tickerManager) {
      this.app.tickerManager._applyStyle({ ...(this.app.config.ticker || {}), ...(config.ticker_style || {}) });
    }

    const screen = document.createElement("div");
    screen.className = "screen";
    screen.style.zIndex = "2";
    screen.style.isolation = "isolate";
    this._applyScreenStyle(screen, config);

    switch (config.type) {
      case "clock":
        this._buildClockScreen(screen, config);
        break;
      case "weather":
        this._buildWeatherScreen(screen, config);
        break;
      case "camera":
        this._buildCameraScreen(screen, config);
        break;
      case "image":
        this._buildImageScreen(screen, config);
        break;
      default:
        this._buildDashboardScreen(screen, config);
        break;
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
    if (!entityId) {
      const weatherWidget = Utils.safeArray(config.widgets).find((w) => w.type === "weather" && w.entity_id);
      entityId = weatherWidget?.entity_id || null;
    }
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

  _buildDashboardScreen(screen, config) {
    const grid = document.createElement("div");
    grid.className = "dashboard-grid";

    const cols = config.grid?.columns || 3;
    const rows = config.grid?.rows || 2;

    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    for (const widgetConfig of Utils.safeArray(config.widgets)) {
      const widget = this._createWidget(widgetConfig);
      widget.style.gridColumn = `${(widgetConfig.col || 0) + 1}/span ${widgetConfig.colspan || 1}`;
      widget.style.gridRow = `${(widgetConfig.row || 0) + 1}/span ${widgetConfig.rowspan || 1}`;
      grid.appendChild(widget);
    }

    screen.appendChild(grid);
  }

  _buildClockScreen(screen) {
    screen.innerHTML = `
      <div class="full-screen-center">
        <div id="clock-time" class="clock-time-large">--:--</div>
        <div id="clock-date" class="clock-date-large"></div>
      </div>
    `;

    const update = () => {
      const now = new Date();
      const t = screen.querySelector("#clock-time");
      const d = screen.querySelector("#clock-date");
      if (t) {
        t.textContent = now.toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit"
        });
      }
      if (d) {
        d.textContent = now.toLocaleDateString("de-DE", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        });
      }
    };

    update();
    this._clockIntervals.push(setInterval(update, 1000));
  }

  _buildWeatherScreen(screen, config) {
    const state = config.entity_id ? (this.app.entityStates[config.entity_id] || {}) : {};
    const visual = this._weatherVisual(state?.state, config.config || config);
    const temp = state?.attributes?.temperature ?? "--";
    const feels = state?.attributes?.temperature ?? temp;
    screen.innerHTML = `
      <div class="weather-screen ${visual.theme}">
        <div class="weather-animated-bg ${visual.animClass} ${visual.animate ? "animate" : ""}">${this._weatherFxMarkup(visual.animClass)}</div>
        <div class="weather-screen-card">
          <div class="weather-hero-icon">${visual.icon}</div>
          <div id="weather-temp" class="weather-temp-large">${temp}°C</div>
          <div id="weather-condition" class="weather-cond-large">${visual.label}</div>
          <div class="weather-meta-row"><span>Gefühlt</span><strong>${feels}°C</strong></div>
        </div>
      </div>
    `;
  }

  _buildCameraScreen(screen, config) {
    const eid = config.entity_id || config.config?.camera_entity || config.camera_entity || "";
    const preferredSource = config.config?.camera_source || config.camera_source || "auto";
    const liveMode = (config.config?.camera_view || config.camera_view || "still") === "live";
    const source = liveMode && preferredSource === "auto" ? "camera_proxy_stream" : preferredSource;
    const fit = config.config?.camera_fit || config.camera_fit || "contain";
    const title = this._widgetCameraTitle(config, config.title || config.name || eid || "Kamera");
    screen.innerHTML = `
      <img id="camera-img" class="screen-image-contain" style="object-fit:${fit}" alt="Camera">
      ${title ? `<div class="screen-caption">${title}</div>` : ""}
    `;

    const img = screen.querySelector("#camera-img");
    if (img && eid) this._loadCameraInto(img, eid, source);

    if (!liveMode) {
      const ms = (config.refresh_interval || config.config?.refresh_interval || 5) * 1000;
      this._cameraIntervals.push(setInterval(() => {
        const nextImg = screen.querySelector("#camera-img");
        if (nextImg && eid) this._loadCameraInto(nextImg, eid, source);
      }, ms));
    }
  }

  _buildImageScreen(screen, config) {
    const src = config.image_url || config.imageUrl || config.url || "";
    screen.innerHTML = `
      <div class="image-screen-wrap">
        ${src ? `<img src="${src}" class="screen-image-contain" style="object-fit:${config.image_fit || config.background_image_size || "contain"}" alt="Image">` : `<div class="empty-state"><div class="empty-state-icon">🖼️</div><div class="empty-state-title">Kein Bild gesetzt</div></div>`}
      </div>
    `;
  }

  _createWidget(config) {
    const widget = document.createElement("div");
    widget.className = `widget widget-${config.type || "simple-value"}`;

    const trackedIds = [config.entity_id, config.config?.camera_entity, config.camera_entity, ...Utils.safeArray(config.config?.entities || config.entities)].filter(Boolean);
    for (const trackedId of [...new Set(trackedIds)]) {
      if (!this._widgetElements[trackedId]) {
        this._widgetElements[trackedId] = [];
      }
      this._widgetElements[trackedId].push({ element: widget, config });
    }

    const state = this.app.entityStates[config.entity_id] || {};
    const value = state.state ?? "—";
    const attrs = state.attributes || {};
    const unit = attrs.unit_of_measurement || config.unit || "";
    const name = this._widgetName(config, attrs.friendly_name || "");
    const icon = config.icon || this._defaultIconForType(config.type);

    switch (config.type) {
      case "gauge":
        this._renderGaugeWidget(widget, config, value, unit, name);
        break;

      case "progress-bar":
        this._renderProgressBarWidget(widget, config, value, unit, name);
        break;

      case "status-dot":
        this._renderStatusDotWidget(widget, config, value, name);
        break;

      case "trend-arrow":
        this._renderTrendArrowWidget(widget, config, state, name, icon);
        break;

      case "camera":
        this._renderCameraWidget(widget, config, name);
        break;

      case "weather":
        this._renderWeatherWidget(widget, config, state);
        break;

      case "clock":
        this._renderClockWidget(widget, config);
        break;

      case "countdown":
        this._renderCountdownWidget(widget, config);
        break;

      case "image":
        this._renderImageWidget(widget, config, name);
        break;

      case "qr-code":
        this._renderQrWidget(widget, config);
        break;

      case "color-block":
        this._renderColorBlockWidget(widget, config, name);
        break;

      case "button":
        this._renderButtonWidget(widget, config, name);
        break;

      case "mini-graph":
      case "sparkline":
      case "line-chart":
      case "bar-chart":
      case "area-chart":
      case "multi-line-chart":
      case "stacked-bar-chart":
      case "horizontal-bar-chart":
      case "donut-chart":
      case "pie-chart":
      case "radar-chart":
      case "heatmap-mini":
      case "timeline-chart":
      case "scatter-chart":
      case "bubble-chart":
      case "polar-area-chart":
      case "forecast-chart":
      case "energy-flow-mini":
      case "comparison-chart":
      case "radial-gauge-advanced":
      case "bullet-chart":
        this._renderChartWidget(widget, config, state, name);
        break;

      case "icon-value":
        if (String(config.entity_id || "").startsWith("media_player.")) this._renderMediaPlayerWidget(widget, config, state, name, icon);
        else this._renderIconValueWidget(widget, config, value, unit, name, icon);
        break;

      default:
        this._renderDefaultWidget(widget, config, value, unit, name, icon);
        break;
    }

    this._applyCommonWidgetStyle(widget, config);
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


  _effectiveWidgetInteractionConfig(config) {
    if (!config) return {};
    const hasOwnAction = config.tap_action && config.tap_action !== "none";
    const cameraFullscreen = (config.type === "camera" && (config.config?.camera_tap_fullscreen || config.camera_tap_fullscreen));
    if (hasOwnAction || cameraFullscreen) return config;
    const group = String(config.group || "").trim();
    if (!group) return config;
    const current = this.temporaryScreen || this.screens[this.currentIndex] || {};
    const widgets = Utils.safeArray(current.widgets);
    const master = widgets.find((w) => String(w?.group || "").trim() === group && w?.group_touch_enabled);
    if (!master) return config;
    return {
      ...config,
      tap_action: master.group_tap_action || master.tap_action || "none",
      tap_target_entity: master.group_tap_target_entity || master.tap_target_entity || config.tap_target_entity || config.entity_id || "",
      toggle_mode: master.group_toggle_mode || master.toggle_mode || config.toggle_mode || "toggle",
      toggle_badge: master.group_toggle_badge ?? master.toggle_badge ?? config.toggle_badge,
      tap_popup_kind: master.group_tap_popup_kind || master.tap_popup_kind || config.tap_popup_kind,
      tap_screen_id: master.group_tap_screen_id || master.tap_screen_id || config.tap_screen_id,
      tap_url: master.group_tap_url || master.tap_url || config.tap_url,
      tap_autoclose: master.group_tap_autoclose ?? master.tap_autoclose ?? config.tap_autoclose,
      tap_scale: master.group_tap_scale ?? master.tap_scale ?? config.tap_scale,
    };
  }

  _bindWidgetInteraction(widget, config) {
    const cameraFullscreen = (config.type === "camera" && (config.config?.camera_tap_fullscreen || config.camera_tap_fullscreen));
    const action = config?.tap_action || "none";
    if ((action === "none" || !action) && !cameraFullscreen) return;
    widget.classList.add("widget-interactive");
    widget.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (cameraFullscreen) return this._openCameraFullscreen(config);
      if (action === "expand") this._openWidgetDetail(widget, config);
      else if (action === "popup") this._openWidgetPopup(config);
      else if (action === "toggle") this._toggleWidgetEntity(widget, config);
      else if (action === "goto_screen") this._gotoTargetScreen(config);
      else if (action === "open_url") this._openWidgetUrl(config);
    });
  }

  _syncWidgetToggleBadge(widget, config) {
    if ((config?.tap_action || "none") !== "toggle" || config?.toggle_badge === false) {
      const existing = widget.querySelector(".widget-toggle-badge");
      if (existing) existing.remove();
      return;
    }
    const entityId = config.tap_target_entity || config.entity_id;
    if (!entityId) return;
    const st = this.app?.entityStates?.[entityId] || {};
    const on = Utils.isTruthyState(st.state);
    this._showWidgetToggleBadge(widget, on, st.state);
  }

  _openWidgetUrl(config) {
    const url = config.tap_url || config.config?.tap_url || "";
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  _gotoTargetScreen(config) {
    const target = config.tap_screen_id || config.config?.tap_screen_id || "";
    if (!target) return;
    this.app.screenManager.goto(target);
  }

  _openWidgetDetail(widget, config) {
    const overlay = document.getElementById("widget-detail-overlay") || this._createWidgetDetailOverlay();
    const panel = overlay.querySelector(".widget-detail-panel");
    const clone = widget.cloneNode(true);
    clone.classList.add("widget-detail-card");
    clone.style.width = "100%";
    clone.style.height = "100%";
    clone.style.transform = `scale(${config.tap_scale || 1.45})`;
    const body = overlay.querySelector(".widget-detail-body");
    body.innerHTML = "";
    body.appendChild(clone);
    overlay.hidden = false;
    const close = () => { overlay.hidden = true; body.innerHTML = ""; };
    overlay.querySelector(".widget-detail-close").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    const secs = Number(config.tap_autoclose || 0);
    if (secs > 0) {
      clearTimeout(this._detailTimer);
      this._detailTimer = setTimeout(close, secs * 1000);
    }
  }

  _createWidgetDetailOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "widget-detail-overlay";
    overlay.className = "widget-detail-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="widget-detail-panel"><button class="widget-detail-close">✕</button><div class="widget-detail-body"></div></div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  _widgetPopupOverlay() {
    let overlay = document.getElementById("widget-popup-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "widget-popup-overlay";
      overlay.className = "widget-popup-overlay";
      overlay.hidden = true;
      overlay.innerHTML = `<div class="widget-popup-panel"><button class="widget-popup-close">✕</button><div class="widget-popup-body"></div></div>`;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  _closeWidgetPopup() {
    const overlay = document.getElementById("widget-popup-overlay");
    if (!overlay) return;
    overlay.hidden = true;
    const body = overlay.querySelector(".widget-popup-body");
    if (body) body.innerHTML = "";
  }

  _openCameraFullscreen(config) {
    this._openWidgetPopup({ ...config, tap_popup_kind: "camera" });
  }

  _popupFriendlyName(config, st) {
    return this._widgetName(config, st?.attributes?.friendly_name || config.entity_id || config.type || "Widget");
  }

  _popupWeatherMarkup(config, st) {
    const attrs = st?.attributes || {};
    const visual = this._weatherVisual(st?.state || "", config.config || config);
    return `<div class="popup-hero popup-weather ${visual.theme}">
      <div class="popup-weather-bg ${visual.animClass} ${visual.animate ? "animate" : ""}">${this._weatherFxMarkup(visual.animClass, 2)}</div>
      <div class="popup-eyebrow">${this._popupFriendlyName(config, st)}</div>
      <div class="popup-big-icon">${visual.icon}</div>
      <div class="popup-big-value">${Utils.text(attrs.temperature ?? "—")}<span>°C</span></div>
      <div class="popup-subtitle">${visual.label || st?.state || ""}</div>
      <div class="popup-grid-info">
        <div><span>Feuchte</span><strong>${Utils.text(attrs.humidity ?? "—")}${attrs.humidity !== undefined ? "%" : ""}</strong></div>
        <div><span>Wind</span><strong>${Utils.text(attrs.wind_speed ?? attrs.wind_bearing ?? "—")}</strong></div>
        <div><span>Druck</span><strong>${Utils.text(attrs.pressure ?? "—")}</strong></div>
      </div>
    </div>`;
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
    const btn = document.createElement("button");
    btn.className = `popup-control-btn ${active ? "active" : ""}`;
    btn.textContent = label;
    btn.onclick = onClick;
    body.appendChild(btn);
  }

  _openWidgetPopup(config) {
    const overlay = this._widgetPopupOverlay();
    const body = overlay.querySelector(".widget-popup-body");
    const close = () => this._closeWidgetPopup();
    overlay.querySelector(".widget-popup-close").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    const entityId = config.tap_target_entity || config.entity_id || "";
    const st = this.app.entityStates[entityId] || {};
    const domain = String(entityId || "").split(".")[0];
    const kind = config.tap_popup_kind || (config.type === "weather" || domain === "weather" ? "weather" : config.type === "camera" ? "camera" : config.type === "image" ? "image" : domain);
    let html = "";
    if (kind === "weather") html = this._popupWeatherMarkup(config, st);
    else if (kind === "camera") html = this._popupCameraMarkup(config);
    else if (kind === "image") html = this._popupImageMarkup(config);
    else if (domain === "media_player") {
      const cover = st.attributes?.entity_picture || "";
      const progress = Number(st.attributes?.media_duration || 0) > 0 ? Math.max(0, Math.min(100, ((Number(st.attributes?.media_position || 0) / Number(st.attributes?.media_duration || 1)) * 100))) : 0;
      html = `<div class="popup-hero popup-media">${cover ? `<img class="popup-media-cover" src="${cover}" alt="Cover">` : `<div class="popup-media-cover placeholder">🎵</div>`}<div class="popup-media-info"><div class="popup-eyebrow">${Utils.text(st.attributes?.friendly_name || entityId)}</div><div class="popup-big-value">${Utils.text(st.attributes?.media_title || st.state || "—")}</div><div class="popup-subtitle">${Utils.text(st.attributes?.media_artist || st.attributes?.source || "")}</div><div class="popup-media-progress"><span style="width:${progress}%"></span></div><div class="popup-controls"></div></div></div>`;
    } else if (domain === "light" || domain === "switch" || domain === "input_boolean" || domain === "fan") {
      const isOn = Utils.isTruthyState(st.state);
      const bri = Number(st.attributes?.brightness ?? 0);
      const briPct = bri ? Math.round((bri / 255) * 100) : 0;
      html = `<div class="popup-hero popup-control popup-light"><div class="popup-eyebrow">${Utils.text(st.attributes?.friendly_name || entityId)}</div><div class="popup-big-icon">${isOn ? "🟢" : "🔴"}</div><div class="popup-big-value">${isOn ? "Ein" : "Aus"}</div><div class="popup-subtitle">${Utils.text(st.state || "—")}</div>${domain === "light" ? `<div class="popup-meter"><span style="width:${briPct}%"></span></div><div class="popup-mini-row"><span>Helligkeit</span><strong>${briPct}%</strong></div>` : ``}<div class="popup-controls"></div></div>`;
    } else if (domain === "cover") {
      const pos = st.attributes?.current_position;
      const pct = pos == null ? 0 : Math.max(0, Math.min(100, Math.round(Number(pos))));
      html = `<div class="popup-hero popup-control popup-cover"><div class="popup-eyebrow">${Utils.text(st.attributes?.friendly_name || entityId)}</div><div class="popup-big-icon">🪟</div><div class="popup-big-value">${pos == null ? Utils.text(st.state || "—") : `${pct}<span>%</span>`}</div><div class="popup-subtitle">${Utils.text(st.state || "—")}</div><div class="popup-meter"><span style="width:${pct}%"></span></div><div class="popup-controls"></div></div>`;
    } else if (domain === "valve") {
      const isOpen = Utils.isTruthyState(st.state) || String(st.state || '').toLowerCase() === 'open';
      html = `<div class="popup-hero popup-control"><div class="popup-eyebrow">${Utils.text(st.attributes?.friendly_name || entityId)}</div><div class="popup-big-icon">${isOpen ? "💧" : "🚫"}</div><div class="popup-big-value">${isOpen ? "Offen" : "Zu"}</div><div class="popup-subtitle">${Utils.text(st.state || "—")}</div><div class="popup-controls"></div></div>`;
    } else if (domain === "climate") {
      const hvacModes = Utils.safeArray(st.attributes?.hvac_modes);
      html = `<div class="popup-hero popup-control popup-climate"><div class="popup-eyebrow">${Utils.text(st.attributes?.friendly_name || entityId)}</div><div class="popup-big-icon">🌡️</div><div class="popup-big-value">${Utils.text(st.attributes?.current_temperature ?? "—")}<span>°C</span></div><div class="popup-subtitle">Soll ${Utils.text(st.attributes?.temperature ?? "—")} °C · ${Utils.text(st.state || "—")}</div><div class="popup-mini-row"><span>Modus</span><strong>${Utils.text(st.state || "—")}</strong></div>${hvacModes.length ? `<div class="popup-mode-row">${hvacModes.map((m) => `<span class="popup-mode-chip ${String(st.state) === String(m) ? 'active' : ''}">${Utils.text(m)}</span>`).join("")}</div>` : ``}<div class="popup-controls"></div></div>`;
    } else {
      html = `<div class="popup-hero"><div class="popup-eyebrow">${Utils.text(st.attributes?.friendly_name || entityId || this._widgetName(config, "Widget"))}</div><div class="popup-big-value">${Utils.formatStateWithUnit(st.state ?? "—", st.attributes?.unit_of_measurement || "", { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}</div><div class="popup-subtitle">${Utils.text(st.state ?? "—")}</div></div>`;
    }
    body.innerHTML = html;
    const controls = body.querySelector(".popup-controls");
    if (controls && domain === "media_player") {
      this._renderPopupControlButton(controls, "⏮", false, () => this.app.callEntityService("media_player", "media_previous_track", { entity_id: entityId }));
      this._renderPopupControlButton(controls, "⏯", false, () => this.app.callEntityService("media_player", "media_play_pause", { entity_id: entityId }));
      this._renderPopupControlButton(controls, "⏭", false, () => this.app.callEntityService("media_player", "media_next_track", { entity_id: entityId }));
      this._renderPopupControlButton(controls, "−", false, async () => { const level = Math.max(0, Number(st.attributes?.volume_level ?? 0) - 0.1); await this.app.callEntityService("media_player", "volume_set", { entity_id: entityId, volume_level: level }); });
      this._renderPopupControlButton(controls, "+", false, async () => { const level = Math.min(1, Number(st.attributes?.volume_level ?? 0) + 0.1); await this.app.callEntityService("media_player", "volume_set", { entity_id: entityId, volume_level: level }); });
    } else if (controls && (domain === "switch" || domain === "input_boolean" || domain === "fan" || domain === "valve")) {
      this._renderPopupControlButton(controls, "Ein/Aus", false, async () => { await this._invokeToggleAction(entityId, 'toggle'); close(); });
    } else if (controls && domain === "light") {
      this._renderPopupControlButton(controls, "Ein", Utils.isTruthyState(st.state), async () => { await this._invokeToggleAction(entityId, 'on'); close(); });
      this._renderPopupControlButton(controls, "Aus", !Utils.isTruthyState(st.state), async () => { await this._invokeToggleAction(entityId, 'off'); close(); });
      this._renderPopupControlButton(controls, "− Helligkeit", false, async () => { const level = Math.max(1, Math.round((Number(st.attributes?.brightness ?? 128) / 255) * 100) - 15); await this.app.callEntityService('light', 'turn_on', { entity_id: entityId, brightness_pct: level }); close(); });
      this._renderPopupControlButton(controls, "+ Helligkeit", false, async () => { const level = Math.min(100, Math.round((Number(st.attributes?.brightness ?? 128) / 255) * 100) + 15); await this.app.callEntityService('light', 'turn_on', { entity_id: entityId, brightness_pct: level }); close(); });
      [25, 50, 100].forEach((pct) => this._renderPopupControlButton(controls, `${pct}%`, false, async () => { await this.app.callEntityService('light', 'turn_on', { entity_id: entityId, brightness_pct: pct }); close(); }));
    } else if (controls && domain === "cover") {
      this._renderPopupControlButton(controls, "Öffnen", false, async () => { await this.app.callEntityService("cover", "open_cover", { entity_id: entityId }); close(); });
      this._renderPopupControlButton(controls, "Stopp", false, async () => { await this.app.callEntityService("cover", "stop_cover", { entity_id: entityId }); });
      this._renderPopupControlButton(controls, "Schließen", false, async () => { await this.app.callEntityService("cover", "close_cover", { entity_id: entityId }); close(); });
      [0, 25, 50, 75, 100].forEach((pct) => this._renderPopupControlButton(controls, `${pct}%`, false, async () => { await this.app.callEntityService('cover', 'set_cover_position', { entity_id: entityId, position: pct }); close(); }));
    } else if (controls && domain === "climate") {
      this._renderPopupControlButton(controls, "−1°", false, async () => { const t = Number(st.attributes?.temperature ?? 20) - 1; await this.app.callEntityService("climate", "set_temperature", { entity_id: entityId, temperature: t }); close(); });
      this._renderPopupControlButton(controls, "+1°", false, async () => { const t = Number(st.attributes?.temperature ?? 20) + 1; await this.app.callEntityService("climate", "set_temperature", { entity_id: entityId, temperature: t }); close(); });
      Utils.safeArray(st.attributes?.hvac_modes).slice(0, 6).forEach((mode) => this._renderPopupControlButton(controls, String(mode), String(st.state) === String(mode), async () => { await this.app.callEntityService('climate', 'set_hvac_mode', { entity_id: entityId, hvac_mode: mode }); close(); }));
    }
    overlay.hidden = false;
    const secs = Number(config.tap_autoclose || 0);
    if (secs > 0) {
      clearTimeout(this._popupTimer);
      this._popupTimer = setTimeout(close, secs * 1000);
    }
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

  _showWidgetToggleBadge(widget, on, rawState = null) {
    let badge = widget.querySelector(".widget-toggle-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "widget-toggle-badge";
      widget.appendChild(badge);
    }
    badge.classList.toggle("on", !!on);
    badge.classList.toggle("off", !on);
    badge.textContent = on ? "Ein" : "Aus";
    badge.title = rawState == null ? badge.textContent : `Status: ${rawState}`;
  }

  _normalizeEntityIdList(list) {
    return [...new Set(Utils.safeArray(list).map((item) => typeof item === "string" ? item : item?.entity_id || item?.id || "").filter(Boolean))];
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
    const ids = this._chartEntityIds(config);
    return ids.map((entityId, idx) => {
      const meta = this._extraEntityMeta(config, entityId);
      const state = this.app.entityStates[entityId] || {};
      return { entityId, state, meta, idx };
    });
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
        const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
        if (full.length === 6) {
          const r = parseInt(full.slice(0, 2), 16);
          const g = parseInt(full.slice(2, 4), 16);
          const b = parseInt(full.slice(4, 6), 16);
          return `rgba(${r},${g},${b},${alpha})`;
        }
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
    for (let i = 0; i < maxPoints; i += 1) {
      out.push(list[Math.round(i * step)]);
    }
    return out;
  }

  _widgetCameraTitle(config, fallback = "") {
    const show = config?.config?.camera_show_title !== false && config?.camera_show_title !== false;
    if (!show) return "";
    return this._widgetName(config, fallback);
  }

  _renderExtraEntityList(widget, config) {
    const entityIds = this._normalizeEntityIdList(config.config?.entities || config.entities);
    if (!entityIds.length) return;
    const rows = entityIds.map((entityId) => {
      const st = this.app.entityStates[entityId] || {};
      const meta = this._extraEntityMeta(config, entityId);
      const label = meta.hide_name ? "" : (meta.alias || st.attributes?.friendly_name || entityId);
      const unit = st.attributes?.unit_of_measurement || "";
      const val = Utils.formatStateWithUnit(st.state ?? "—", unit, { decimals: config.config?.extra_value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false });
      return `<div class="td-extra-row ${meta.hide_name ? "name-hidden" : ""}" data-entity-id="${entityId}"><span class="td-extra-name">${Utils.text(label)}</span><span class="td-extra-value">${val}</span></div>`;
    }).join("");
    widget.insertAdjacentHTML("beforeend", `<div class="td-extra-entities" data-count="${entityIds.length}">${rows}</div>`);
  }

  _updateExtraEntityList(element, config) {
    const entityIds = this._normalizeEntityIdList(config.config?.entities || config.entities);
    const container = element.querySelector(".td-extra-entities");
    if (!entityIds.length) {
      if (container) container.remove();
      return;
    }
    const rows = element.querySelectorAll(".td-extra-row");
    if (!container || rows.length !== entityIds.length) {
      if (container) container.remove();
      this._renderExtraEntityList(element, config);
      return;
    }
    rows.forEach((row) => {
      const entityId = row.dataset.entityId;
      const st = this.app.entityStates[entityId] || {};
      const unit = st.attributes?.unit_of_measurement || "";
      const meta = this._extraEntityMeta(config, entityId);
      const label = meta.hide_name ? "" : (meta.alias || st.attributes?.friendly_name || entityId);
      const nameEl = row.querySelector(".td-extra-name");
      const valueEl = row.querySelector(".td-extra-value");
      row.classList.toggle("name-hidden", !!meta.hide_name);
      if (nameEl) nameEl.textContent = label;
      if (valueEl) valueEl.textContent = Utils.formatStateWithUnit(st.state ?? "—", unit, { decimals: config.config?.extra_value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false });
    });
  }


  _extraEntityMeta(config, entityId) {
    const meta = config?.config?.entity_meta || config?.entity_meta || {};
    const entry = meta?.[entityId] || {};
    const showNames = config?.config?.show_extra_entity_names !== false && config?.show_extra_entity_names !== false;
    return { alias: entry.alias || "", hide_name: entry.hide_name || !showNames };
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

  _renderDefaultWidget(widget, config, value, unit, name, icon) {
    widget.innerHTML = `
      <div class="w-icon"><span style="font-size:24px">${icon}</span></div>
      <div><span class="w-value">${Utils.formatValue(value, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div>
      ${name ? `<div class="w-name">${name}</div>` : ""}
    `;
    this._renderExtraEntityList(widget, config);
  }

  _renderIconValueWidget(widget, config, value, unit, name, icon) {
    widget.innerHTML = `
      <div class="w-icon"><span style="font-size:28px">${icon}</span></div>
      <div><span class="w-value">${Utils.formatValue(value, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div>
      ${name ? `<div class="w-name">${name}</div>` : ""}
    `;
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
    widget.innerHTML = `
      <div class="media-widget-shell">
        ${cover ? `<img class="media-widget-cover" src="${cover}" alt="Cover">` : `<div class="media-widget-cover placeholder">${icon || "🎵"}</div>`}
        <div class="media-widget-meta">
          ${name ? `<div class="w-name">${name}</div>` : ""}
          <div class="media-widget-title">${title}</div>
          <div class="media-widget-subtitle">${subtitle}</div>
          <div class="media-widget-state-row"><div class="media-widget-state">${Utils.text(state?.state || "—")}</div><div class="media-widget-vol">🔊 ${vol}%</div></div>
          <div class="media-widget-progress"><span style="width:${progress}%"></span></div>
          <div class="media-widget-controls"><span>⏮</span><span>⏯</span><span>⏭</span></div>
        </div>
      </div>
    `;
    this._renderExtraEntityList(widget, config);
  }

  _renderGaugeWidget(widget, config, value, unit, name) {
    const min = config.config?.min ?? 0;
    const max = config.config?.max ?? 100;
    const nv = Utils.toNumber(value, 0);
    const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
    const color = this._getZoneColor(nv, config.config?.zones);

    widget.innerHTML = `
      <svg viewBox="0 0 200 130">
        <path d="M 20 120 A 80 80 0 0 1 180 120" class="gauge-arc-bg"></path>
        <path d="M 20 120 A 80 80 0 0 1 180 120" class="gauge-arc-value" stroke="${color}" stroke-dasharray="${pct * 2.51} 251"></path>
        <text x="100" y="95" class="gauge-text-value">${Utils.formatStateWithUnit(nv, unit, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}</text>
        <text x="100" y="118" class="gauge-text-label">${name}</text>
      </svg>
    `;
    this._renderExtraEntityList(widget, config);
  }

  _renderProgressBarWidget(widget, config, value, unit, name) {
    const min = config.config?.min ?? 0;
    const max = config.config?.max ?? 100;
    const nv = Utils.toNumber(value, 0);
    const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
    const color = config.config?.color || "var(--td-accent)";

    widget.innerHTML = `
      ${name ? `<div class="w-name" style="margin-bottom:4px">${name}</div>` : ""}
      <div><span class="w-value">${Utils.formatValue(nv, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div>
      <div class="progress-container">
        <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    `;
    this._renderExtraEntityList(widget, config);
  }

  _renderStatusDotWidget(widget, config, value, name) {
    const isOn = Utils.isTruthyState(value);
    const color = isOn ? "var(--td-positive)" : "var(--td-text-secondary)";
    widget.innerHTML = `
      <div class="status-dot-indicator ${isOn ? "on" : ""}" style="background:${color};color:${color}"></div>
      ${name ? `<div class="w-name">${name}</div>` : ""}
      <div class="widget-subvalue">${Utils.text(value)}</div>
    `;
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
    widget.innerHTML = `
      <div class="w-icon trend-arrow-icon"><span style="font-size:24px">${icon}</span></div>
      <div class="trend-main">
        <div><span class="w-value">${Utils.formatValue(state?.state ?? "—", { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div>
        <div class="trend-arrow-chip ${direction}" style="color:${trendColor}">${arrow} <span class="trend-delta">${Number.isFinite(diff) ? (diff > 0 ? '+' : '') + diff.toFixed(1) : '0.0'}${unit}</span></div>
      </div>
      <div class="w-name">${name || state?.attributes?.friendly_name || config.entity_id || 'Trend'}</div>
    `;
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
    widget.innerHTML = `
      <img alt="Camera" class="widget-camera-image" style="object-fit:${fit}">
      ${title ? `<div class="camera-overlay">${title}</div>` : ""}
    `;

    const img = widget.querySelector("img");
    if (img && eid) this._loadCameraInto(img, eid, source);

    if (!liveMode) {
      const ms = (config.config?.refresh_interval || 5) * 1000;
      const interval = setInterval(() => {
        const nextImg = widget.querySelector("img");
        if (nextImg && eid) this._loadCameraInto(nextImg, eid, source);
      }, ms);
      this._cameraIntervals.push(interval);
    }
  }

  _renderWeatherWidget(widget, config, state) {
    const attrs = state?.attributes || {};
    const temp = attrs.temperature ?? "—";
    const condition = state?.state || "—";
    const visual = this._weatherVisual(condition, config.config || config);
    widget.classList.add("widget-weather-modern");
    widget.innerHTML = `
      <div class="weather-card ${visual.theme}">
        <div class="weather-animated-bg ${visual.animClass} ${visual.animate ? "animate" : ""}">${this._weatherFxMarkup(visual.animClass)}</div>
        <div class="weather-card-top">
          <div class="weather-card-icon">${visual.icon}</div>
          <div class="weather-card-reading"><span class="w-value">${temp}</span><span class="w-unit">°C</span></div>
        </div>
        ${this._widgetName(config, attrs.friendly_name || "Wetter") ? `<div class="w-name">${this._widgetName(config, attrs.friendly_name || "Wetter")}</div>` : ""}
        <div class="widget-subvalue">${visual.label || condition}</div>
      </div>
    `;
  }

  _renderClockWidget(widget) {
    widget.innerHTML = `
      <div class="w-icon"><span style="font-size:24px">🕐</span></div>
      <div><span class="w-value js-clock-time">--:--</span></div>
      <div class="w-name js-clock-date">--</div>
    `;

    const update = () => {
      const now = new Date();
      const t = widget.querySelector(".js-clock-time");
      const d = widget.querySelector(".js-clock-date");
      if (t) {
        t.textContent = now.toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit"
        });
      }
      if (d) {
        d.textContent = now.toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        });
      }
    };

    update();
    this._clockIntervals.push(setInterval(update, 1000));
  }

  _renderCountdownWidget(widget, config) {
    const target = config.target_date || config.targetDate || config.date || null;

    widget.innerHTML = `
      <div class="w-icon"><span style="font-size:24px">⏱️</span></div>
      <div><span class="w-value js-countdown-value">--</span></div>
      ${this._widgetName(config, "Countdown") ? `<div class="w-name">${this._widgetName(config, "Countdown")}</div>` : ""}
    `;

    const update = () => {
      const el = widget.querySelector(".js-countdown-value");
      if (!el || !target) {
        if (el) el.textContent = "—";
        return;
      }

      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) {
        el.textContent = "00:00";
        return;
      }

      const totalSec = Math.floor(diff / 1000);
      const hrs = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      if (hrs > 0) {
        el.textContent = `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      } else {
        el.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      }
    };

    update();
    this._countdownIntervals.push(setInterval(update, 1000));
  }

  _renderImageWidget(widget, config, name) {
    const src = config.image_url || config.imageUrl || config.url || "";
    widget.classList.add("widget-image");
    widget.innerHTML = src
      ? `<img src="${src}" class="widget-image-tag" alt="${name || "Bild"}"><div class="camera-overlay">${name || "Bild"}</div>`
      : `<div class="empty-state"><div class="empty-state-icon">🖼️</div><div class="empty-state-title">Kein Bild</div></div>`;
  }

  _renderQrWidget(widget, config) {
    const value = config.text || config.value || config.qr_value || config.qrValue || "QR";
    widget.classList.add("widget-qr");

    const holder = document.createElement("div");
    holder.className = "widget-qr-holder";
    widget.appendChild(holder);

    if (window.QRCode?.toString) {
      window.QRCode.toString(value, { width: 192 })
        .then((svg) => {
          holder.innerHTML = svg;
        })
        .catch(() => {
          holder.innerHTML = `<div class="qr-fallback">QR</div>`;
        });
    } else {
      holder.innerHTML = `<div class="qr-fallback">QR</div>`;
    }

    const label = document.createElement("div");
    label.className = "w-name";
    label.textContent = config.name || "QR-Code";
    widget.appendChild(label);
  }

  _renderColorBlockWidget(widget, config, name) {
    widget.style.background = config.bgColor || config.color || "var(--td-accent)";
    widget.innerHTML = `
      <div class="w-value">${name || "Block"}</div>
    `;
  }

  _renderButtonWidget(widget, config, name) {
    widget.innerHTML = `
      <div class="widget-button-face">
        <div class="w-icon"><span style="font-size:24px">${config.icon || "🔘"}</span></div>
        ${this._widgetName(config, name || "Button") ? `<div class="w-name">${this._widgetName(config, name || "Button")}</div>` : ""}
      </div>
    `;
  }

  _renderChartWidget(widget, config, state, name) {
    const unit = state?.attributes?.unit_of_measurement || config.unit || "";
    const title = this._widgetName(config, name || state?.attributes?.friendly_name || config.entity_id || config.type || "Chart");

    widget.classList.add("widget-chart");
    widget.innerHTML = `
      <div class="chart-header">
        <div class="chart-title">${title}</div>
        <div class="chart-value">${Utils.formatValue(state?.state, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}${unit ? `<span class="chart-unit"> ${unit}</span>` : ""}</div>
      </div>
      <div class="chart-body">
        <canvas class="chart-canvas"></canvas>
      </div>
    `;

    this._renderExtraEntityList(widget, config);
    const canvas = widget.querySelector(".chart-canvas");
    if (!canvas || !window.Chart) return;
    this._scheduleChartBuild(widget, canvas, config, state);
  }

  _normalizePoints(rawPoints, fallbackValue = 0) {
    const points = Utils.safeArray(rawPoints).filter((p) => p && p.x !== undefined && p.y !== undefined);
    if (points.length) return points.map((p) => ({ x: p.x, y: Utils.toNumber(p.y, 0) }));
    return [{ x: new Date().toISOString(), y: Utils.toNumber(fallbackValue, 0) }];
  }

  _chartEntityIds(config) {
    const ids = [];
    if (config.entity_id) ids.push(config.entity_id);
    for (const extra of this._normalizeEntityIdList(config.config?.entities || config.entities)) {
      if (extra && !ids.includes(extra)) ids.push(extra);
    }
    return ids;
  }


  _destroyElementChart(element) {
    if (element?._chartInstance) {
      try { element._chartInstance.destroy(); } catch (e) {}
      element._chartInstance = null;
    }
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

  async _buildChart(canvas, config, state, element = null) {
    try {
      const entityIds = this._chartEntityIds(config);
      const useHistory = config.config?.chart_use_history !== false;
      const hours = config.config?.hours || config.config?.period || 24;
      const maxPoints = config.config?.chart_mobile_compact ? 20 : (config.config?.chart_max_points || 36);
      const histories = await Promise.all(entityIds.map(async (entityId) => {
        const liveState = this.app.entityStates[entityId] || (entityId === config.entity_id ? state : null) || {};
        let points = this._normalizePoints([], liveState?.state);
        if (entityId && useHistory) {
          const history = await this.app.dataManager.fetchHistory(entityId, hours);
          points = this._normalizePoints(history?.data, liveState?.state);
        }
        points = this._chartSamplePoints(points, maxPoints);
        return {
          entityId,
          state: liveState,
          points,
          meta: this._extraEntityMeta(config, entityId)
        };
      }));

      const primary = histories[0] || { state: state || {}, points: this._normalizePoints([], state?.state), meta: this._extraEntityMeta(config, config.entity_id || "") };
      const maxLen = Math.max(...histories.map((entry) => entry.points.length), primary.points.length, 1);
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
      console.warn("Chart build failed:", e);
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
      labels: {
        color: "rgba(255,255,255,0.72)",
        boxWidth: compact ? 10 : 14,
        usePointStyle: true,
        padding: compact ? 10 : 14,
        filter: (item, data) => {
          const ds = data?.datasets?.[item.datasetIndex];
          return !ds?.tdHideName;
        }
      }
    };

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: compact ? 220 : 360 },
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: legendOptions,
        tooltip: { enabled: true, displayColors: true }
      },
      scales: {
        x: { display: showAxes, grid: { display: showGrid, color: "rgba(255,255,255,0.05)" }, ticks: { maxTicksLimit: compact ? 4 : 6, color: "rgba(255,255,255,0.5)" } },
        y: { display: showAxes, beginAtZero: beginAtZero, grid: { display: showGrid, color: "rgba(255,255,255,0.06)" }, ticks: { maxTicksLimit: compact ? 4 : 5, color: "rgba(255,255,255,0.5)" } }
      }
    };

    const lineDatasets = histories.map((entry, idx) => ({
      label: this._chartSeriesLabel(config, entry.entityId, entry.state?.attributes?.friendly_name || entry.entityId, idx),
      tdHideName: !!entry.meta?.hide_name,
      data: labels.map((_, pidx) => entry.points[pidx]?.y ?? entry.points[entry.points.length - 1]?.y ?? 0),
      borderColor: this._chartPalette(idx, 0.96, config, entry.entityId),
      backgroundColor: this._chartPalette(idx, fillOpacity, config, entry.entityId),
      fill: type === "area-chart" || type === "forecast-chart" || type === "energy-flow-mini",
      tension: curveMode === "stepped" ? 0 : tension,
      stepped: curveMode === "stepped",
      cubicInterpolationMode: curveMode === "monotone" ? "monotone" : "default",
      pointStyle,
      pointRadius: showPoints ? (compact ? 1.5 : 2.5) : 0,
      pointHoverRadius: showPoints ? 4 : 0,
      borderWidth: lineWidth,
      spanGaps: true,
      stack: stacked ? "stack" : undefined
    }));

    if (["mini-graph", "sparkline", "line-chart", "area-chart", "multi-line-chart", "forecast-chart", "comparison-chart", "energy-flow-mini", "timeline-chart"].includes(type)) {
      return {
        type: "line",
        data: { labels, datasets: lineDatasets },
        options: {
          ...baseOptions,
          plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: showLegend && (histories.length > 1 || ["line-chart","multi-line-chart","comparison-chart","forecast-chart"].includes(type)) } },
          scales: {
            ...baseOptions.scales,
            x: { ...baseOptions.scales.x, display: showAxes && type !== "sparkline" },
            y: { ...baseOptions.scales.y, display: showAxes && type !== "sparkline", stacked }
          }
        }
      };
    }

    if (["bar-chart", "stacked-bar-chart", "horizontal-bar-chart", "heatmap-mini", "bullet-chart"].includes(type)) {
      const heatmapMode = config.config?.heatmap_mode || "intensity";
      const datasets = histories.map((entry, idx) => ({
        label: this._chartSeriesLabel(config, entry.entityId, entry.state?.attributes?.friendly_name || entry.entityId, idx),
        tdHideName: !!entry.meta?.hide_name,
        data: labels.map((_, pidx) => entry.points[pidx]?.y ?? entry.points[entry.points.length - 1]?.y ?? 0),
        borderWidth: 1,
        borderRadius: compact ? 6 : 8,
        borderColor: this._chartPalette(idx, 0.96, config, entry.entityId),
        backgroundColor: type === "heatmap-mini"
          ? labels.map((_, pidx) => {
              const val = entry.points[pidx]?.y ?? 0;
              const alpha = heatmapMode === "zones"
                ? (Math.abs(val) >= 75 ? 0.78 : Math.abs(val) >= 50 ? 0.58 : Math.abs(val) >= 25 ? 0.38 : 0.22)
                : Utils.clamp(Math.abs(val) / 100, 0.18, 0.82);
              return this._chartPalette(idx, alpha, config, entry.entityId);
            })
          : this._chartPalette(idx, 0.42, config, entry.entityId),
        barPercentage: type === "bullet-chart" ? 0.55 : 0.78,
        categoryPercentage: type === "bullet-chart" ? 0.92 : 0.84
      }));
      return {
        type: "bar",
        data: { labels, datasets },
        options: {
          ...baseOptions,
          indexAxis: type === "horizontal-bar-chart" || type === "bullet-chart" ? "y" : "x",
          scales: {
            x: { ...baseOptions.scales.x, stacked },
            y: { ...baseOptions.scales.y, stacked }
          },
          plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: showLegend && (histories.length > 1 || stacked) } }
        }
      };
    }

    if (["donut-chart", "pie-chart", "radial-gauge-advanced", "polar-area-chart"].includes(type)) {
      const latest = histories.map((entry) => entry.points[entry.points.length - 1]?.y ?? 0);
      const doughnutLabels = histories.map((entry, idx) => this._chartSeriesLabel(config, entry.entityId, entry.state?.attributes?.friendly_name || entry.entityId, idx));
      const isGauge = type === "radial-gauge-advanced";
      const gaugeMax = Number(config.config?.max ?? 100);
      const gaugeValue = Number(latest[0] ?? 0);
      return {
        type: type === "polar-area-chart" ? "polarArea" : "doughnut",
        data: {
          labels: isGauge ? [doughnutLabels[0] || "Wert", "Rest"] : doughnutLabels,
          datasets: [{
            tdHideName: false,
            data: isGauge ? [gaugeValue, Math.max(gaugeMax - gaugeValue, 0)] : latest,
            backgroundColor: isGauge ? [this._chartPalette(0, 0.95, config, histories[0]?.entityId), "rgba(255,255,255,0.08)"] : histories.map((entry, idx) => this._chartPalette(idx, 0.82, config, entry.entityId)),
            borderColor: "rgba(255,255,255,0.08)",
            borderWidth: 1
          }]
        },
        options: { ...baseOptions, cutout: type === "pie-chart" || type === "polar-area-chart" ? "0%" : "68%", scales: {}, plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: showLegend } } }
      };
    }

    if (type === "radar-chart") {
      return {
        type: "radar",
        data: {
          labels,
          datasets: histories.map((entry, idx) => ({
            label: this._chartSeriesLabel(config, entry.entityId, entry.state?.attributes?.friendly_name || entry.entityId, idx),
            tdHideName: !!entry.meta?.hide_name,
            data: labels.map((_, pidx) => entry.points[pidx]?.y ?? entry.points[entry.points.length - 1]?.y ?? 0),
            borderColor: this._chartPalette(idx, 0.95, config, entry.entityId),
            backgroundColor: this._chartPalette(idx, 0.2, config, entry.entityId),
            pointBackgroundColor: this._chartPalette(idx, 0.95, config, entry.entityId),
            pointRadius: showPoints ? 2 : 0,
            borderWidth: lineWidth
          }))
        },
        options: { ...baseOptions, scales: { r: { angleLines: { color: "rgba(255,255,255,0.08)" }, grid: { color: "rgba(255,255,255,0.08)" }, pointLabels: { color: "rgba(255,255,255,0.6)" }, ticks: { backdropColor: "transparent", color: "rgba(255,255,255,0.45)" } } } }
      };
    }

    if (type === "scatter-chart" || type === "bubble-chart") {
      return {
        type: type === "bubble-chart" ? "bubble" : "scatter",
        data: {
          datasets: histories.map((entry, idx) => ({
            label: this._chartSeriesLabel(config, entry.entityId, entry.state?.attributes?.friendly_name || entry.entityId, idx),
            tdHideName: !!entry.meta?.hide_name,
            data: entry.points.map((p, pidx) => ({ x: pidx + 1, y: p.y, r: type === "bubble-chart" ? Utils.clamp(Math.abs(Number(p.y) || 0) / 8, 4, compact ? 11 : 16) : undefined })),
            borderColor: this._chartPalette(idx, 0.95, config, entry.entityId),
            backgroundColor: this._chartPalette(idx, 0.48, config, entry.entityId),
            pointStyle,
            pointRadius: showPoints ? 4 : 0,
            pointHoverRadius: showPoints ? 5 : 0
          }))
        },
        options: {
          ...baseOptions,
          scales: {
            x: { display: showAxes, type: "linear", position: "bottom", grid: { display: showGrid, color: "rgba(255,255,255,0.06)" }, ticks: { color: "rgba(255,255,255,0.45)" } },
            y: baseOptions.scales.y
          }
        }
      };
    }

    return { type: "line", data: { labels, datasets: lineDatasets }, options: baseOptions };
  }

  _updateWidget(widgetInfo, entityId, newState) {
    const { element, config } = widgetInfo;
    const value = newState?.state ?? "—";
    const unit = newState?.attributes?.unit_of_measurement || config.unit || "";

    switch (config.type) {
      case "gauge": {
        const min = config.config?.min ?? 0;
        const max = config.config?.max ?? 100;
        const nv = Utils.toNumber(value, 0);
        const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
        const arc = element.querySelector(".gauge-arc-value");
        const txt = element.querySelector(".gauge-text-value");
        if (arc) {
          arc.setAttribute("stroke-dasharray", `${pct * 2.51} 251`);
          arc.setAttribute("stroke", this._getZoneColor(nv, config.config?.zones));
        }
        if (txt) txt.textContent = Utils.formatStateWithUnit(nv, unit, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false });
        break;
      }

      case "progress-bar": {
        const min = config.config?.min ?? 0;
        const max = config.config?.max ?? 100;
        const nv = Utils.toNumber(value, 0);
        const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
        const fill = element.querySelector(".progress-fill");
        const ve = element.querySelector(".w-value");
        if (fill) fill.style.width = `${pct}%`;
        if (ve) ve.textContent = Utils.formatValue(nv, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false });
        break;
      }

      case "status-dot": {
        const isOn = Utils.isTruthyState(value);
        const dot = element.querySelector(".status-dot-indicator");
        const sub = element.querySelector(".widget-subvalue");
        const color = isOn ? "var(--td-positive)" : "var(--td-text-secondary)";
        if (dot) {
          dot.style.background = color;
          dot.style.color = color;
          dot.classList.toggle("on", isOn);
        }
        if (sub) sub.textContent = Utils.text(value);
        break;
      }

      case "weather": {
        this._renderWeatherWidget(element, config, newState || this.app.entityStates[config.entity_id] || {});
        break;
      }

      case "trend-arrow": {
        this._renderTrendArrowWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, config.name || "", config.icon || this._defaultIconForType(config.type));
        break;
      }

      case "mini-graph":
      case "sparkline":
      case "line-chart":
      case "bar-chart":
      case "area-chart":
      case "multi-line-chart":
      case "stacked-bar-chart":
      case "horizontal-bar-chart":
      case "donut-chart":
      case "pie-chart":
      case "radar-chart":
      case "heatmap-mini":
      case "timeline-chart":
      case "scatter-chart":
      case "bubble-chart":
      case "polar-area-chart":
      case "forecast-chart":
      case "energy-flow-mini":
      case "comparison-chart":
      case "radial-gauge-advanced":
      case "bullet-chart": {
        const chartValue = element.querySelector(".chart-value");
        if (chartValue) {
          chartValue.innerHTML = `${Utils.formatValue(value, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false })}${unit ? `<span class="chart-unit"> ${unit}</span>` : ""}`;
        }
        const canvas = element.querySelector(".chart-canvas");
        if (canvas && window.Chart) this._scheduleChartBuild(element, canvas, config, this.app.entityStates[config.entity_id] || newState);
        break;
      }

      default: {
        const wv = element.querySelector(".w-value");
        if (wv) wv.textContent = Utils.formatValue(value, { decimals: config.config?.value_decimals, trimTrailingZeros: config.config?.trim_trailing_zeros !== false });
      }
    }

    this._updateExtraEntityList(element, config);
    element.classList.remove("value-changed");
    void element.offsetWidth;
    element.classList.add("value-changed");
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
      oldScreen.style.zIndex = "1";
      oldScreen.style.pointerEvents = "none";
      newScreen.classList.add(`screen-enter-${type}`);
      oldScreen.classList.add(`screen-exit-${type}`);
      this.container.appendChild(newScreen);

      setTimeout(() => {
        oldScreen.remove();
        newScreen.classList.remove(`screen-enter-${type}`);
      }, 600);
    } else {
      if (oldScreen) oldScreen.remove();
      this.container.appendChild(newScreen);
    }
  }

  _startRotation() {
    this._stopRotation(false);
    if (this.screens.length <= 1 || this.isPaused) return;

    const ms = (this.screens[this.currentIndex]?.duration || 15) * 1000;
    this.rotationTimer = setTimeout(() => {
      if (!this.isPaused && !this.temporaryScreen) this.next();
      this._startRotation();
    }, ms);
  }

  _stopRotation(clearTemps = true) {
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (clearTemps) this._clearIntervals();
  }

  _clearIntervals() {
    this._clockIntervals.forEach(clearInterval);
    this._cameraIntervals.forEach(clearInterval);
    this._countdownIntervals.forEach(clearInterval);
    this._chartInstances.forEach((c) => {
      try { c.destroy(); } catch (e) {}
    });

    this._clockIntervals = [];
    this._cameraIntervals = [];
    this._countdownIntervals = [];
    this._chartInstances = [];
  }

  _getZoneColor(value, zones) {
    if (!zones?.length) return "var(--td-accent)";
    for (const z of zones) {
      if (value >= z.from && value <= z.to) return z.color;
    }
    return "var(--td-accent)";
  }

  _defaultIconForType(type) {
    const map = {
      "simple-value": "🔢",
      "icon-value": "ℹ️",
      "mini-graph": "📉",
      "bar-chart": "📊",
      "area-chart": "🌊",
      "multi-line-chart": "📈",
      "stacked-bar-chart": "🧱",
      "horizontal-bar-chart": "↔️",
      "donut-chart": "🍩",
      "pie-chart": "🥧",
      "radar-chart": "🕸️",
      "heatmap-mini": "🔥",
      "timeline-chart": "🕒",
      "scatter-chart": "✳️",
      "bubble-chart": "🫧",
      "polar-area-chart": "🧿",
      "forecast-chart": "🔮",
      "energy-flow-mini": "⚡",
      "comparison-chart": "⚖️",
      "radial-gauge-advanced": "🎛️",
      "bullet-chart": "🎯",
      "sparkline": "〰️",
      "trend-arrow": "📈",
      "weather": "🌤️",
      "clock": "🕐",
      "image": "🖼️",
      "camera": "📹",
      "qr-code": "🔳",
      "countdown": "⏱️",
      "button": "🔘"
    };
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
    const raw = String(condition).trim();
    const lower = raw.toLowerCase();
    const value = Number(state?.state);
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
    const rules = Utils.safeArray(this.app.config.ticker?.rules).filter((r) => r && (r.domain || r.entity_id || r.condition));
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
    if (this.bar) {
      this.bar.classList.toggle("top", (cfg.position || "bottom") === "top");
      this.bar.classList.toggle("bottom", (cfg.position || "bottom") !== "top");
    }
  }

  addMessages(msgs) {
    for (const m of Utils.safeArray(msgs)) {
      this.messages.push({
        text: m.text || m.message || "",
        color: m.color,
        icon: m.icon,
        timestamp: Date.now(),
        duration: m.duration || 300
      });
    }
    this._rebuild();
  }

  setEntities(data) {
    this.entityTemplates = Utils.safeArray(data.entities);
    this._rebuild();
  }

  clear() {
    this.messages = [];
    this.entityTemplates = [];
    this._rebuild();
  }

  onEntityUpdate(entityId) {
    if (this.entityTemplates.some((t) => (typeof t === "string" ? t : t.entity_id) === entityId)) {
      this._rebuild();
    }
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
        const text = tpl
          .replace("{state}", state.state || "")
          .replace("{friendly_name}", state.attributes?.friendly_name || eid)
          .replace("{unit}", state.attributes?.unit_of_measurement || "");
        items.push({ text, color });
      }
    }

    const now = Date.now();
    this.messages = this.messages.filter((m) => (now - m.timestamp) / 1000 < m.duration);

    for (const m of this.messages) {
      items.push({ text: m.text, color: m.color, icon: m.icon });
    }

    items.push(...this._buildRuleItems());
    items.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    if (!items.length) {
      this.container.innerHTML = "";
      this.container.classList.remove("scrolling");
      return;
    }

    const separator = String(this.app.config.ticker?.separator || "│");
    const build = (list) => list.map((item, i) => {
      const style = item.color ? `color:${item.color}` : "";
      return `<span class="ticker-item" style="${style}">${item.icon ? `<span class="ticker-icon">${item.icon}</span>` : ""}${item.text}</span>` +
        (i < list.length - 1 ? `<span class="ticker-separator">${separator}</span>` : "");
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
    this.pipContainer = document.getElementById("pip-container");
    this._timers = [];
    this._pipInterval = null;
  }

  show(data) {
    const mode = data.mode || "fullscreen";

    switch (mode) {
      case "fullscreen":
        this._showFullscreen(data);
        break;
      case "notification":
      case "banner":
        this._showBanner(data);
        break;
      case "toast":
        this._showToast(data);
        break;
      case "pip":
        this._showPip(data);
        break;
      default:
        this._showFullscreen(data);
    }

    if (data.sound_url) {
      this.app.bridge.playSound(data.sound_url, data.volume || 100, data.sound_loop || false);
    }
    if (data.vibrate) {
      this.app.bridge.vibrate(500);
    }
  }

  clearAll() {
    if (this.overlay) this.overlay.hidden = true;
    if (this.banner) this.banner.hidden = true;
    if (this.toastContainer) this.toastContainer.hidden = true;
    if (this.pipContainer) this.pipContainer.hidden = true;

    this.app.bridge.stopSound();

    this._timers.forEach(clearTimeout);
    this._timers = [];

    if (this._pipInterval) clearInterval(this._pipInterval);
    this._pipInterval = null;
  }

  _showFullscreen(data) {
    const sev = data.severity || "info";
    const icons = { info: "ℹ️", warning: "⚠️", critical: "🚨" };

    this.overlay.className = `alert-overlay severity-${sev}`;
    this.overlay.innerHTML = `
      <div class="alert-card">
        <div class="alert-icon">${data.icon || icons[sev] || "ℹ️"}</div>
        <div class="alert-title">${data.title || ""}</div>
        <div class="alert-message">${data.message || ""}</div>
        ${data.duration ? `<div class="alert-timer">Schließt in ${data.duration}s</div>` : ""}
      </div>
    `;
    this.overlay.hidden = false;

    if (data.duration && data.duration > 0 && !data.persistent) {
      this._timers.push(setTimeout(() => {
        this.overlay.hidden = true;
      }, data.duration * 1000));
    }
  }

  _showBanner(data) {
    this.banner.style.background = data.color || "var(--td-accent)";
    this.banner.innerHTML = `
      <span style="font-size:20px">${data.icon || "ℹ️"}</span>
      <div>
        <div style="font-weight:600">${data.title || ""}</div>
        <div style="font-size:14px;opacity:.9">${data.message || ""}</div>
      </div>
    `;
    this.banner.hidden = false;

    this._timers.push(setTimeout(() => {
      this.banner.hidden = true;
    }, (data.duration || 10) * 1000));
  }

  _showToast(data) {
    this.toastContainer.innerHTML = `<div class="toast-message">${data.message || ""}</div>`;
    this.toastContainer.hidden = false;

    this._timers.push(setTimeout(() => {
      this.toastContainer.hidden = true;
    }, (data.duration || 5) * 1000));
  }

  _showPip(data) {
    const pos = data.pip_position || "top-right";
    const size = data.pip_size || "medium";
    const eid = data.entity_id || "";

    this.pipContainer.className = `pip-container ${pos} ${size}`;
    const img = this.pipContainer.querySelector("#pip-image");

    if (img) {
      img.src = `${this.app.apiBase}/api/image/camera/${eid}?t=${Date.now()}`;
      this._pipInterval = setInterval(() => {
        img.src = `${this.app.apiBase}/api/image/camera/${eid}?t=${Date.now()}`;
      }, (data.refresh_interval || 5) * 1000);
    }

    this.pipContainer.hidden = false;

    if (data.duration && data.duration > 0) {
      this._timers.push(setTimeout(() => {
        this.pipContainer.hidden = true;
        if (this._pipInterval) clearInterval(this._pipInterval);
        this._pipInterval = null;
      }, data.duration * 1000));
    }
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
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft && typeof draft === "object") this.config = { ...(this.config || {}), ...draft, screens: Array.isArray(draft.screens) ? draft.screens : (this.config.screens || []) };
        }
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
      if (offline && this.isPreview) {
        offline.hidden = true;
      }

      this.wsClient.connect()
        .then(() => {
          console.log("✅ WebSocket connected");
          if (offline) offline.hidden = true;
          this.reportSensorsNow?.();
        })
        .catch((e) => {
          console.warn("⚠️ WebSocket connect failed, running in offline mode:", e);
          if (offline && this.isPreview) {
            offline.hidden = true;
          }
        });

      this._startSensorReporting();
      this._startStatePolling();

      console.log("✅ Ticker Display ready!");
    } catch (e) {
      console.error("❌ Init error:", e);
    }
  }

  onEntityStateChanged(id, state) {
    this.previousEntityStates[id] = this.entityStates[id] || this.previousEntityStates[id] || null;
    this.entityStates[id] = state;
    this.screenManager.onEntityUpdate(id, state);
    this.tickerManager.onEntityUpdate(id, state);
  }

  onCommand(cmd, data) {
    const screenCmds = [
      "show_dashboard",
      "show_graph",
      "show_camera",
      "show_weather",
      "show_single_value",
      "show_clock",
      "show_status_board",
      "show_image",
      "show_template"
    ];

    if (screenCmds.includes(cmd)) {
      this.screenManager.showTemporaryScreen(cmd, data);
      return;
    }

    if (cmd === "clear_alert") this.alertManager.clearAll();
    else if (cmd === "set_ticker_entities") this.tickerManager.setEntities(data);
    else if (cmd === "clear_ticker") this.tickerManager.clear();
    else if (cmd === "identify") this._showIdentify();
  }

  onAlert(data) {
    this.alertManager.show(data);
  }

  onTickerMessages(msgs) {
    this.tickerManager.addMessages(msgs);
  }

  onDisplayControl(data) {
    if (data.brightness !== undefined) this.bridge.setScreenBrightness(data.brightness);
    if (data.screen_power !== undefined) this.bridge.setScreenPower(data.screen_power);
  }

  onAudio(data) {
    if (data.action === "play") {
      this.bridge.playSound(data.url, data.volume, data.loop);
    } else if (data.action === "tts") {
      this.bridge.ttsSpeak(data.text, data.language, data.volume);
    } else if (data.action === "stop") {
      this.bridge.stopSound();
    } else if (data.action === "set_volume") {
      this.bridge.setVolume(data.volume);
    }
  }

  async callEntityToggle(entityId) {
    const domain = String(entityId || "").split(".")[0];
    if (!domain) return false;
    const serviceDomain = ["switch","light","input_boolean","fan","media_player","valve"].includes(domain) ? domain : "homeassistant";
    const service = serviceDomain === "media_player" ? "media_play_pause" : serviceDomain === 'valve' ? 'open_valve' : "toggle";
    try {
      const resp = await fetch(`/api/services/${serviceDomain}/${service}`, { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body: JSON.stringify({ entity_id: entityId }) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return true;
    } catch (e) {
      console.warn("toggle failed", entityId, e);
      return false;
    }
  }

  async callEntityService(domain, service, data = {}) {
    try {
      const resp = await fetch(`/api/services/${domain}/${service}`, { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body: JSON.stringify(data) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return true;
    } catch (e) {
      console.warn("service call failed", domain, service, data, e);
      return false;
    }
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
    if (offline) {
      if (this.isPreview) {
        offline.hidden = true;
      } else if (this.wsClient?.isConnected()) {
        offline.hidden = true;
      }
    }

    try {
      localStorage.setItem("ticker_config_cache", JSON.stringify(cfg));
    } catch (e) {}
  }

  onThemeChanged(data) {
    this.themeManager.applyDynamic(data);
  }

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

  async _primeEntityStates() {
    await this._pollEntityStates(false);
  }

  async _pollEntityStates(emitChanges = true) {
    const ids = [...new Set((this.neededEntities || []).filter(Boolean))].slice(0, 250);
    if (!ids.length) return;
    const results = await Promise.all(ids.map((id) => this.dataManager.fetchState(id)));
    results.forEach((state, idx) => {
      const entityId = ids[idx];
      if (!state) return;
      const prev = this.entityStates[entityId];
      const changed = !prev || prev.state !== state.state || JSON.stringify(prev.attributes || {}) !== JSON.stringify(state.attributes || {});
      if (changed && prev) this.previousEntityStates[entityId] = prev;
      this.entityStates[entityId] = state;
      if (emitChanges && changed) {
        this.onEntityStateChanged(entityId, state);
      }
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
    overlay.style.cssText = `
      position:fixed;
      inset:0;
      background:var(--td-accent);
      z-index:10000;
      display:flex;
      align-items:center;
      justify-content:center;
      flex-direction:column;
      animation:blink .5s ease 6;
    `;
    overlay.innerHTML = `
      <div style="font-size:48px;font-weight:700;color:white">${this.config.name || this.deviceId}</div>
      <div style="font-size:20px;color:rgba(255,255,255,.7);margin-top:12px">${this.deviceId}</div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 3000);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.tickerApp = new TickerDisplayApp();
  window.tickerApp.init();
});