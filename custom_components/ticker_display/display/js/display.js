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
  "mini-graph", "sparkline", "bar-chart", "area-chart", "multi-line-chart", "stacked-bar-chart",
  "horizontal-bar-chart", "donut-chart", "pie-chart", "radar-chart", "heatmap-mini", "timeline-chart",
  "scatter-chart", "forecast-chart", "energy-flow-mini", "comparison-chart", "radial-gauge-advanced", "bullet-chart"
]);

const CHART_TYPE_ICONS = {
  "mini-graph": "📉",
  "sparkline": "〰️",
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

    const screen = document.createElement("div");
    screen.className = "screen";
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

    const transition = config.transition || this.app.config.rotation?.transition || "fade";
    this._doTransition(screen, transition);
  }

  _applyScreenStyle(screen, config) {
    if (config.background_color) screen.style.background = config.background_color;
    if (config.background_image) {
      screen.style.backgroundImage = `url(${config.background_image})`;
      screen.style.backgroundRepeat = "no-repeat";
      screen.style.backgroundPosition = "center center";
      screen.style.backgroundSize = config.background_image_size || "cover";
    }
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
    screen.innerHTML = `
      <div class="full-screen-center">
        <div class="weather-emoji-large">🌤️</div>
        <div id="weather-temp" class="weather-temp-large">--°C</div>
        <div id="weather-condition" class="weather-cond-large">Laden...</div>
      </div>
    `;

    if (config.entity_id) {
      const s = this.app.entityStates[config.entity_id];
      if (s) {
        const t = screen.querySelector("#weather-temp");
        const c = screen.querySelector("#weather-condition");
        if (t) t.textContent = `${s.attributes?.temperature || "--"}°C`;
        if (c) c.textContent = s.state || "";
      }
    }
  }

  _buildCameraScreen(screen, config) {
    const eid = config.entity_id || "";
    const source = config.config?.camera_source || config.camera_source || "auto";
    screen.innerHTML = `
      <img id="camera-img" class="screen-image-contain" alt="Camera">
      <div class="screen-caption">${config.title || config.name || eid || "Kamera"}</div>
    `;

    const img = screen.querySelector("#camera-img");
    if (img && eid) this._loadCameraInto(img, eid, source);

    const ms = (config.refresh_interval || config.config?.refresh_interval || 5) * 1000;
    this._cameraIntervals.push(setInterval(() => {
      const nextImg = screen.querySelector("#camera-img");
      if (nextImg && eid) this._loadCameraInto(nextImg, eid, source);
    }, ms));
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

    const trackedIds = [config.entity_id, ...Utils.safeArray(config.config?.entities || config.entities)].filter(Boolean);
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
    const name = config.name || attrs.friendly_name || "";
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
      case "forecast-chart":
      case "energy-flow-mini":
      case "comparison-chart":
      case "radial-gauge-advanced":
      case "bullet-chart":
        this._renderChartWidget(widget, config, state, name);
        break;

      case "icon-value":
        this._renderIconValueWidget(widget, config, value, unit, name, icon);
        break;

      default:
        this._renderDefaultWidget(widget, config, value, unit, name, icon);
        break;
    }

    this._applyCommonWidgetStyle(widget, config);
    return widget;
  }

  _renderExtraEntityList(widget, config) {
    const entityIds = Utils.safeArray(config.config?.entities || config.entities).filter(Boolean);
    if (!entityIds.length) return;
    const rows = entityIds.slice(0, 6).map((entityId) => {
      const st = this.app.entityStates[entityId] || {};
      const friendly = st.attributes?.friendly_name || entityId;
      const unit = st.attributes?.unit_of_measurement || "";
      return `<div class="td-extra-row" data-entity-id="${entityId}"><span class="td-extra-name">${Utils.text(friendly)}</span><span class="td-extra-value">${Utils.text(st.state ?? "—")}${unit ? ` ${unit}` : ""}</span></div>`;
    }).join("");
    widget.insertAdjacentHTML("beforeend", `<div class="td-extra-entities">${rows}</div>`);
  }

  _updateExtraEntityList(element, config) {
    const rows = element.querySelectorAll(".td-extra-row");
    rows.forEach((row) => {
      const entityId = row.dataset.entityId;
      const st = this.app.entityStates[entityId] || {};
      const unit = st.attributes?.unit_of_measurement || "";
      const nameEl = row.querySelector(".td-extra-name");
      const valueEl = row.querySelector(".td-extra-value");
      if (nameEl) nameEl.textContent = st.attributes?.friendly_name || entityId;
      if (valueEl) valueEl.textContent = `${Utils.text(st.state ?? "—")}${unit ? ` ${unit}` : ""}`;
    });
  }

  _renderDefaultWidget(widget, config, value, unit, name, icon) {
    widget.innerHTML = `
      <div class="w-icon"><span style="font-size:24px">${icon}</span></div>
      <div><span class="w-value">${Utils.text(value)}</span><span class="w-unit">${unit}</span></div>
      <div class="w-name">${name}</div>
    `;
    this._renderExtraEntityList(widget, config);
  }

  _renderIconValueWidget(widget, config, value, unit, name, icon) {
    widget.innerHTML = `
      <div class="w-icon"><span style="font-size:28px">${icon}</span></div>
      <div><span class="w-value">${Utils.text(value)}</span><span class="w-unit">${unit}</span></div>
      <div class="w-name">${name}</div>
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
        <text x="100" y="95" class="gauge-text-value">${nv}${unit}</text>
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
      <div class="w-name" style="margin-bottom:4px">${name}</div>
      <div><span class="w-value">${nv}</span><span class="w-unit">${unit}</span></div>
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
      <div class="w-name">${name}</div>
      <div class="widget-subvalue">${Utils.text(value)}</div>
    `;
    this._renderExtraEntityList(widget, config);
  }

  _renderCameraWidget(widget, config, name) {
    widget.classList.add("widget-camera");
    const eid = config.entity_id || "";
    const source = config.config?.camera_source || config.camera_source || "auto";
    widget.innerHTML = `
      <img alt="Camera" class="widget-camera-image">
      <div class="camera-overlay">${name || eid}</div>
    `;

    const img = widget.querySelector("img");
    if (img && eid) this._loadCameraInto(img, eid, source);

    const ms = (config.config?.refresh_interval || 5) * 1000;
    const interval = setInterval(() => {
      const nextImg = widget.querySelector("img");
      if (nextImg && eid) this._loadCameraInto(nextImg, eid, source);
    }, ms);
    this._cameraIntervals.push(interval);
  }

  _renderWeatherWidget(widget, config, state) {
    const attrs = state?.attributes || {};
    const temp = attrs.temperature ?? "—";
    const condition = state?.state || "—";
    widget.innerHTML = `
      <div class="w-icon"><span style="font-size:24px">🌤️</span></div>
      <div><span class="w-value">${temp}</span><span class="w-unit">°C</span></div>
      <div class="w-name">${config.name || attrs.friendly_name || "Wetter"}</div>
      <div class="widget-subvalue">${condition}</div>
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
      <div class="w-name">${config.name || "Countdown"}</div>
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
        <div class="w-name">${name || "Button"}</div>
      </div>
    `;
  }

  _renderChartWidget(widget, config, state, name) {
    const unit = state?.attributes?.unit_of_measurement || config.unit || "";
    const title = config.name || name || state?.attributes?.friendly_name || config.entity_id || config.type || "Chart";

    widget.classList.add("widget-chart");
    widget.innerHTML = `
      <div class="chart-header">
        <div class="chart-title">${title}</div>
        <div class="chart-value">${Utils.text(state?.state)}${unit ? `<span class="chart-unit">${unit}</span>` : ""}</div>
      </div>
      <div class="chart-body">
        <canvas class="chart-canvas"></canvas>
      </div>
    `;

    this._renderExtraEntityList(widget, config);
    const canvas = widget.querySelector(".chart-canvas");
    if (!canvas || !window.Chart) return;
    this._buildChart(canvas, config, state);
  }

  _chartPalette(index = 0, alpha = 1) {
    const base = [
      [33,150,243],[76,175,80],[255,152,0],[156,39,176],[244,67,54],[0,188,212],[255,235,59],[255,87,34]
    ];
    const [r,g,b] = base[index % base.length];
    return `rgba(${r},${g},${b},${alpha})`;
  }

  _normalizePoints(rawPoints, fallbackValue = 0) {
    const points = Utils.safeArray(rawPoints).filter((p) => p && p.x !== undefined && p.y !== undefined);
    if (points.length) return points.map((p) => ({ x: p.x, y: Utils.toNumber(p.y, 0) }));
    return [{ x: new Date().toISOString(), y: Utils.toNumber(fallbackValue, 0) }];
  }

  _chartEntityIds(config) {
    const ids = [];
    if (config.entity_id) ids.push(config.entity_id);
    for (const extra of Utils.safeArray(config.config?.entities || config.entities)) {
      if (extra && !ids.includes(extra)) ids.push(extra);
    }
    return ids;
  }

  async _buildChart(canvas, config, state) {
    try {
      const entityIds = this._chartEntityIds(config);
      const hours = config.config?.hours || config.config?.period || 24;
      const histories = await Promise.all(entityIds.map(async (entityId) => {
        const liveState = this.app.entityStates[entityId] || (entityId === config.entity_id ? state : null) || {};
        const history = entityId ? await this.app.dataManager.fetchHistory(entityId, hours) : { data: [] };
        return {
          entityId,
          state: liveState,
          points: this._normalizePoints(history?.data, liveState?.state)
        };
      }));

      const primary = histories[0] || { state: state || {}, points: this._normalizePoints([], state?.state) };
      const labels = primary.points.map((p) => Utils.shortDateTime(p.x));
      const type = config.type || "mini-graph";
      const chartCfg = this._getChartConfig(type, histories, labels, config);
      const chart = new Chart(canvas, chartCfg);
      canvas.dataset.chartType = type;
      canvas.dataset.entityIds = JSON.stringify(entityIds);
      this._chartInstances.push(chart);
    } catch (e) {
      console.warn("Chart build failed:", e);
    }
  }

  _getChartConfig(type, histories, labels, config) {
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: { display: histories.length > 1 || ["donut-chart","pie-chart","radar-chart"].includes(type), labels: { color: "rgba(255,255,255,0.7)" } },
        tooltip: { enabled: true, displayColors: true }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, color: "rgba(255,255,255,0.45)" } },
        y: { beginAtZero: false, grid: { color: "rgba(255,255,255,0.06)" }, ticks: { maxTicksLimit: 5, color: "rgba(255,255,255,0.45)" } }
      }
    };

    const lineDatasets = histories.map((entry, idx) => ({
      label: entry.state?.attributes?.friendly_name || entry.entityId || `Serie ${idx + 1}` ,
      data: entry.points.map((p) => p.y),
      borderColor: this._chartPalette(idx, 0.95),
      backgroundColor: this._chartPalette(idx, type === "area-chart" ? 0.22 : 0.16),
      fill: type === "area-chart" || type === "forecast-chart" || type === "energy-flow-mini",
      tension: 0.35,
      pointRadius: type === "sparkline" ? 0 : 2,
      pointHoverRadius: 3,
      borderWidth: 2,
      stack: type === "energy-flow-mini" ? "energy" : undefined
    }));

    if (type === "mini-graph" || type === "sparkline" || type === "area-chart" || type === "multi-line-chart" || type === "forecast-chart" || type === "comparison-chart" || type === "energy-flow-mini" || type === "timeline-chart") {
      return {
        type: "line",
        data: { labels, datasets: lineDatasets },
        options: {
          ...baseOptions,
          plugins: { ...baseOptions.plugins, legend: { ...baseOptions.plugins.legend, display: histories.length > 1 || ["comparison-chart","multi-line-chart","forecast-chart"].includes(type) } },
          scales: {
            ...baseOptions.scales,
            x: { ...baseOptions.scales.x, display: type !== "sparkline" },
            y: { ...baseOptions.scales.y, display: type !== "sparkline" }
          }
        }
      };
    }

    if (type === "bar-chart" || type === "stacked-bar-chart" || type === "horizontal-bar-chart" || type === "heatmap-mini" || type === "bullet-chart") {
      const datasets = histories.map((entry, idx) => ({
        label: entry.state?.attributes?.friendly_name || entry.entityId || `Serie ${idx + 1}`,
        data: entry.points.map((p) => p.y),
        borderWidth: 1,
        borderColor: this._chartPalette(idx, 0.95),
        backgroundColor: this._chartPalette(idx, type === "heatmap-mini" ? 0.55 : 0.35),
        barPercentage: 0.8,
        categoryPercentage: 0.9
      }));
      return {
        type: "bar",
        data: { labels, datasets },
        options: {
          ...baseOptions,
          indexAxis: type === "horizontal-bar-chart" || type === "bullet-chart" ? "y" : "x",
          scales: {
            x: { ...baseOptions.scales.x, stacked: type === "stacked-bar-chart" },
            y: { ...baseOptions.scales.y, stacked: type === "stacked-bar-chart" }
          },
          plugins: { ...baseOptions.plugins, legend: { ...baseOptions.plugins.legend, display: histories.length > 1 || type === "stacked-bar-chart" } }
        }
      };
    }

    if (type === "donut-chart" || type === "pie-chart" || type === "radial-gauge-advanced") {
      const latest = histories.map((entry) => entry.points[entry.points.length - 1]?.y ?? 0);
      const doughnutLabels = histories.map((entry, idx) => entry.state?.attributes?.friendly_name || entry.entityId || `Wert ${idx + 1}`);
      const isGauge = type === "radial-gauge-advanced";
      const gaugeMax = config.config?.max ?? 100;
      const gaugeValue = latest[0] ?? 0;
      return {
        type: "doughnut",
        data: {
          labels: isGauge ? [doughnutLabels[0] || "Wert", "Rest"] : doughnutLabels,
          datasets: [{
            data: isGauge ? [gaugeValue, Math.max(gaugeMax - gaugeValue, 0)] : latest,
            backgroundColor: isGauge ? [this._chartPalette(0, 0.95), "rgba(255,255,255,0.08)"] : latest.map((_, idx) => this._chartPalette(idx, 0.78)),
            borderColor: "rgba(255,255,255,0.08)",
            borderWidth: 1,
            cutout: type === "pie-chart" ? "0%" : "70%"
          }]
        },
        options: { ...baseOptions, scales: {}, plugins: { ...baseOptions.plugins, legend: { ...baseOptions.plugins.legend, display: true } } }
      };
    }

    if (type === "radar-chart") {
      return {
        type: "radar",
        data: {
          labels,
          datasets: histories.map((entry, idx) => ({
            label: entry.state?.attributes?.friendly_name || entry.entityId || `Serie ${idx + 1}` ,
            data: entry.points.map((p) => p.y),
            borderColor: this._chartPalette(idx, 0.95),
            backgroundColor: this._chartPalette(idx, 0.20),
            pointBackgroundColor: this._chartPalette(idx, 0.95),
            pointRadius: 2
          }))
        },
        options: { ...baseOptions, scales: { r: { angleLines: { color: "rgba(255,255,255,0.08)" }, grid: { color: "rgba(255,255,255,0.08)" }, pointLabels: { color: "rgba(255,255,255,0.6)" }, ticks: { backdropColor: "transparent", color: "rgba(255,255,255,0.45)" } } } }
      };
    }

    if (type === "scatter-chart") {
      return {
        type: "scatter",
        data: {
          datasets: histories.map((entry, idx) => ({
            label: entry.state?.attributes?.friendly_name || entry.entityId || `Serie ${idx + 1}` ,
            data: entry.points.map((p, pidx) => ({ x: pidx + 1, y: p.y })),
            borderColor: this._chartPalette(idx, 0.95),
            backgroundColor: this._chartPalette(idx, 0.45),
            pointRadius: 4
          }))
        },
        options: baseOptions
      };
    }

    return { type: "line", data: { labels, datasets: lineDatasets }, options: baseOptions };
  }

  async _loadCameraInto(img, entityId, preferredMode = "auto") {
    if (!img || !entityId) return;
    const candidates = preferredMode === "auto"
      ? ["snapshot", "entity_picture", "camera_proxy", "camera_proxy_stream"]
      : [preferredMode, "snapshot", "entity_picture", "camera_proxy", "camera_proxy_stream"];

    const seen = new Set();
    for (const mode of candidates) {
      if (!mode || seen.has(mode)) continue;
      seen.add(mode);
      try {
        const resolved = await this.app.dataManager.resolveCameraUrl(entityId, mode);
        if (resolved?.url) {
          img.src = resolved.url;
          img.dataset.cameraMode = resolved.mode || mode;
          return;
        }
      } catch (e) {}
    }
    img.src = this.app.dataManager.getCameraUrl(entityId, preferredMode);
  }

  _applyCommonWidgetStyle(widget, config) {
    if (config.font) widget.style.fontFamily = `"${config.font}", sans-serif`;
    if (config.fontSize) {
      const ve = widget.querySelector(".w-value") || widget.querySelector(".chart-value");
      if (ve) ve.style.fontSize = `${config.fontSize}px`;
    }
    if (config.textColor) widget.style.color = config.textColor;
    if (config.bgColor && !widget.classList.contains("widget-color-block")) {
      widget.style.background = config.bgColor;
    }
    const opacity = config.bgOpacity ?? config.backgroundOpacity;
    if (opacity !== undefined && opacity !== null && !widget.classList.contains("widget-color-block")) {
      widget.style.backgroundColor = `rgba(30,30,30,${Utils.clamp(Utils.toNumber(opacity, 0.75), 0, 1)})`;
    }
    const blur = config.blur ?? config.backgroundBlur;
    if (blur) widget.style.backdropFilter = `blur(${blur}px)`;
    if (config.borderRadius !== undefined) widget.style.borderRadius = `${config.borderRadius}px`;

    if (config.customCss) {
      widget.style.cssText += `;${config.customCss}`;
    }
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
        if (txt) txt.textContent = `${nv}${unit}`;
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
        if (ve) ve.textContent = nv;
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
        const val = element.querySelector(".w-value");
        const sub = element.querySelector(".widget-subvalue");
        if (val) val.textContent = newState?.attributes?.temperature ?? "—";
        if (sub) sub.textContent = newState?.state || "—";
        break;
      }

      case "mini-graph":
      case "sparkline":
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
      case "forecast-chart":
      case "energy-flow-mini":
      case "comparison-chart":
      case "radial-gauge-advanced":
      case "bullet-chart": {
        const chartValue = element.querySelector(".chart-value");
        if (chartValue) {
          chartValue.innerHTML = `${Utils.text(value)}${unit ? `<span class="chart-unit">${unit}</span>` : ""}`;
        }
        break;
      }

      default: {
        const wv = element.querySelector(".w-value");
        if (wv) wv.textContent = Utils.text(value);
      }
    }

    this._updateExtraEntityList(element, config);
    element.classList.remove("value-changed");
    void element.offsetWidth;
    element.classList.add("value-changed");
  }

  _doTransition(newScreen, type) {
    const oldScreen = this.container.querySelector(".screen");

    if (oldScreen && type !== "none") {
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
    if (!tickerConfig.enabled) {
      if (this.bar) this.bar.hidden = true;
      document.querySelector(".screen-container")?.classList.add("no-ticker");
      return;
    }

    this.entityTemplates = Utils.safeArray(tickerConfig.entities);
    this._rebuild();
  }

  rebuild() {
    this.entityTemplates = Utils.safeArray(this.app.config.ticker?.entities);
    this._rebuild();
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

    if (!items.length) {
      this.container.innerHTML = "";
      this.container.classList.remove("scrolling");
      return;
    }

    const build = (list) => list.map((item, i) => {
      const style = item.color ? `color:${item.color}` : "";
      return `<span class="ticker-item" style="${style}">${item.icon ? `<span class="ticker-icon">${item.icon}</span>` : ""}${item.text}</span>` +
        (i < list.length - 1 ? `<span class="ticker-separator">│</span>` : "");
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
    this.dataManager = new DataManager(this.apiBase);
    this.isPreview = location.pathname.includes("/preview/");
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

      console.log("✅ Ticker Display ready!");
    } catch (e) {
      console.error("❌ Init error:", e);
    }
  }

  onEntityStateChanged(id, state) {
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
    this.screenManager.rebuild();
    this.tickerManager.rebuild();

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