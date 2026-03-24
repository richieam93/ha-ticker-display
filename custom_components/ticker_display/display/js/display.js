/**
 * Ticker Display - Enhanced Display Engine
 * Stable rendering, websocket-tolerant, better widgets and chart support
 */

/* ----------------------------------------------------------
   UTILS
   ---------------------------------------------------------- */

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
  },

  rgbaFromHex(hex, alpha = 1) {
    const value = String(hex || "#4dabf7").replace("#", "").trim();
    const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
    const int = parseInt(full, 16);
    if (Number.isNaN(int) || full.length !== 6) return `rgba(77,171,247,${alpha})`;
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
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

  getCameraUrl(entityId, src = "auto") {
    return `${this.apiBase}/api/image/camera/${encodeURIComponent(entityId)}?src=${encodeURIComponent(src)}&t=${Date.now()}`;
  }
}

/* ----------------------------------------------------------
   BRIDGE WRAPPER
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   THEME MANAGER
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   WEBSOCKET CLIENT
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   SCREEN MANAGER
   ---------------------------------------------------------- */

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

  _buildDashboardScreen(screen, config) {
    const grid = document.createElement("div");
    grid.className = "dashboard-grid";

    const cols = config.grid?.columns || 3;
    const rows = config.grid?.rows || 2;

    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    const gap = config.widgetSpacing ?? config.widgetGap ?? 10;
    grid.style.gap = `${gap}px`;
    grid.style.padding = `${gap}px`;

    for (const widgetConfig of Utils.safeArray(config.widgets)) {
      const widget = this._createWidget(widgetConfig);
      widget.style.gridColumn = `${(widgetConfig.col || 0) + 1}/span ${widgetConfig.colspan || 1}`;
      widget.style.gridRow = `${(widgetConfig.row || 0) + 1}/span ${widgetConfig.rowspan || 1}`;
      grid.appendChild(widget);
    }

    screen.appendChild(grid);
  }

  _applyScreenStyle(screen, config) {
    const bg = config.backgroundColor || config.bgColor || config.screenBgColor;
    const bgImage = config.backgroundImage || config.screenBackgroundImage || config.bgImage || "";
    const bgSize = config.backgroundSize || "cover";
    const overlay = config.overlayColor || "rgba(0,0,0,.0)";
    const overlayOpacity = config.overlayOpacity ?? 0;
    if (bg) screen.style.setProperty("--td-screen-bg", bg);
    if (bgImage) screen.style.setProperty("--td-screen-bg-image", `url(${bgImage})`);
    if (bgSize) screen.style.setProperty("--td-screen-bg-size", bgSize);
    screen.style.setProperty("--td-screen-overlay", overlay);
    screen.style.setProperty("--td-screen-overlay-opacity", String(overlayOpacity));
  }

  _cameraSourceOrder(config) {
    const src = config.config?.camera_source || config.camera_source || "auto";
    if (src && src !== "auto") return [src];
    return ["snapshot", "entity_picture", "camera_proxy", "stream"];
  }

  _setCameraImageWithFallback(img, entityId, config) {
    const order = this._cameraSourceOrder(config);
    let idx = 0;
    const tryNext = () => {
      if (!img || idx >= order.length) return;
      const src = order[idx++];
      img.onerror = tryNext;
      img.src = this.app.dataManager.getCameraUrl(entityId, src);
    };
    tryNext();
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
    screen.innerHTML = `
      <img id="camera-img" class="screen-image-contain" alt="Camera">
      <div class="screen-caption">${config.title || eid || "Kamera"}</div>
    `;

    const ms = (config.refresh_interval || 5) * 1000;
    const update = () => {
      const img = screen.querySelector("#camera-img");
      if (img) this._setCameraImageWithFallback(img, eid, config);
    };
    update();
    this._cameraIntervals.push(setInterval(update, ms));
  }

  _buildImageScreen(screen, config) {
    const src = config.image_url || config.imageUrl || config.url || "";
    screen.innerHTML = `
      <div class="image-screen-wrap">
        ${src ? `<img src="${src}" class="screen-image-contain" alt="Image">` : `<div class="empty-state"><div class="empty-state-icon">🖼️</div><div class="empty-state-title">Kein Bild gesetzt</div></div>`}
      </div>
    `;
  }

  _registerWidgetEntities(widget, config) {
    const ids = [
      config.entity_id,
      ...(config.entities || []),
      ...((config.config && config.config.entities) || []),
      config.config?.solar_entity,
      config.config?.battery_entity,
      config.config?.grid_entity,
      config.config?.load_entity,
      config.config?.target_entity,
      config.config?.comparison_entity,
      config.visibilityEntity,
      config.serviceTargetEntity
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    for (const entityId of ids) {
      if (!this._widgetElements[entityId]) this._widgetElements[entityId] = [];
      this._widgetElements[entityId].push({ element: widget, config });
    }
  }

  _createWidget(config) {
    const widget = document.createElement("div");
    widget.className = `widget widget-${config.type || "simple-value"}`;
    if (config.className) widget.classList.add(...String(config.className).split(/\s+/).filter(Boolean));
    if (config.zIndex !== undefined) widget.style.zIndex = String(config.zIndex);

    this._registerWidgetEntities(widget, config);

    const state = this.app.entityStates[config.entity_id] || {};
    const value = state.state ?? "—";
    const attrs = state.attributes || {};
    const unit = attrs.unit_of_measurement || config.unit || "";
    const name = config.name || attrs.friendly_name || "";
    const icon = config.icon || this._defaultIconForType(config.type);

    if (!this._isWidgetVisible(config)) {
      widget.style.display = "none";
    }

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

      case "forecast-chart":
        this._renderForecastWidget(widget, config, state, name);
        break;

      case "energy-flow-mini":
        this._renderEnergyFlowWidget(widget, config, state, name);
        break;

      case "bullet-chart":
        this._renderBulletChartWidget(widget, config, state, name);
        break;

      case "heatmap-mini":
        this._renderHeatmapWidget(widget, config, state, name);
        break;

      case "timeline-chart":
        this._renderTimelineWidget(widget, config, state, name);
        break;

      case "comparison-chart":
        this._renderComparisonWidget(widget, config, state, name);
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
      case "area-chart":
      case "multi-line-chart":
      case "stacked-bar-chart":
      case "horizontal-bar-chart":
      case "donut-chart":
      case "pie-chart":
      case "radar-chart":
      case "scatter-chart":
        this._renderAdvancedChartWidget(widget, config, state, name);
        break;

      case "bar-chart":
        this._renderLineChartWidget(widget, config, state, name, true);
        break;

      case "radial-gauge-advanced":
      case "radial-gauge":
        this._renderGaugeWidget(widget, config, value, unit, name);
        break;

      case "icon-value":
        this._renderIconValueWidget(widget, value, unit, name, icon);
        break;

      default:
        this._renderDefaultWidget(widget, config, value, unit, name, icon);
        break;
    }

    this._applyCommonWidgetStyle(widget, config);
    this._attachWidgetAction(widget, config);
    return widget;
  }

  _renderDefaultWidget(widget, config, value, unit, name, icon) {
    widget.innerHTML = `
      <div class="w-icon"><span style="font-size:24px">${icon}</span></div>
      <div><span class="w-value">${Utils.text(value)}</span><span class="w-unit">${unit}</span></div>
      <div class="w-name">${name}</div>
    `;
  }

  _renderIconValueWidget(widget, value, unit, name, icon) {
    widget.innerHTML = `
      <div class="w-icon"><span style="font-size:28px">${icon}</span></div>
      <div><span class="w-value">${Utils.text(value)}</span><span class="w-unit">${unit}</span></div>
      <div class="w-name">${name}</div>
    `;
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
  }

  _renderStatusDotWidget(widget, config, value, name) {
    const isOn = Utils.isTruthyState(value);
    const color = isOn ? "var(--td-positive)" : "var(--td-text-secondary)";
    widget.innerHTML = `
      <div class="status-dot-indicator ${isOn ? "on" : ""}" style="background:${color};color:${color}"></div>
      <div class="w-name">${name}</div>
      <div class="widget-subvalue">${Utils.text(value)}</div>
    `;
  }

  _renderCameraWidget(widget, config, name) {
    widget.classList.add("widget-camera");
    const eid = config.entity_id || "";
    widget.innerHTML = `
      <img alt="Camera" class="widget-camera-image">
      <div class="camera-overlay">${name || eid}</div>
    `;

    const img = widget.querySelector("img");
    if (img) this._setCameraImageWithFallback(img, eid, config);
    const ms = (config.config?.refresh_interval || 5) * 1000;
    const interval = setInterval(() => {
      const img = widget.querySelector("img");
      if (img) this._setCameraImageWithFallback(img, eid, config);
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
    const actionLabel = config.tapAction && config.tapAction !== "none" ? `<div class="widget-subvalue">${config.tapAction}</div>` : "";
    widget.innerHTML = `
      <div class="widget-button-face">
        <div class="w-icon"><span style="font-size:24px">${config.icon || "🔘"}</span></div>
        <div class="w-name">${name || "Button"}</div>
        ${actionLabel}
      </div>
    `;
  }

  _renderLineChartWidget(widget, config, state, name, asBar = false) {
    const currentValue = Utils.toNumber(state?.state, 0);
    const unit = state?.attributes?.unit_of_measurement || config.unit || "";
    const title = name || state?.attributes?.friendly_name || config.entity_id || (asBar ? "Balken" : "Graph");
    const hours = config.config?.hours || 24;

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

    const canvas = widget.querySelector(".chart-canvas");
    if (!canvas || !window.Chart || !config.entity_id) return;

    this._buildChart(canvas, config.entity_id, hours, asBar, currentValue);
  }

  async _buildChart(canvas, entityId, hours, asBar, currentValue) {
    try {
      const history = await this.app.dataManager.fetchHistory(entityId, hours);
      const points = Utils.safeArray(history?.data).filter((p) => p && p.x !== undefined && p.y !== undefined);

      const labels = points.map((p) => Utils.shortDateTime(p.x));
      const values = points.map((p) => Utils.toNumber(p.y, 0));

      if (!values.length) {
        labels.push("Jetzt");
        values.push(currentValue);
      }

      const type = asBar ? "bar" : "line";
      const chart = new Chart(canvas, {
        type,
        data: {
          labels,
          datasets: [{
            data: values,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: asBar ? 0 : 0,
            pointHoverRadius: 3,
            fill: !asBar,
            backgroundColor: asBar ? "rgba(33,150,243,0.35)" : "rgba(33,150,243,0.18)",
            borderColor: "rgba(33,150,243,0.95)",
            barPercentage: 0.8,
            categoryPercentage: 0.9
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 350
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              displayColors: false
            }
          },
          scales: {
            x: {
              display: !asBar,
              grid: { display: false },
              ticks: {
                maxTicksLimit: 4,
                color: "rgba(255,255,255,0.45)"
              }
            },
            y: {
              display: true,
              grid: {
                color: "rgba(255,255,255,0.06)"
              },
              ticks: {
                maxTicksLimit: 4,
                color: "rgba(255,255,255,0.45)"
              }
            }
          }
        }
      });

      this._chartInstances.push(chart);
    } catch (e) {
      console.warn("Chart build failed:", e);
    }
  }

  _chartEntityIds(config) {
    return [config.entity_id, ...(config.entities || []), ...((config.config && config.config.entities) || [])]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);
  }


  _renderForecastWidget(widget, config, state, name) {
    const title = name || state?.attributes?.friendly_name || config.entity_id || "Forecast";
    widget.classList.add("widget-forecast");
    const forecast = state?.attributes?.forecast || [];
    const rows = forecast.slice(0, 5).map((item) => {
      const temp = item.temperature ?? item.templow ?? "—";
      const label = item.datetime ? new Date(item.datetime).toLocaleDateString("de-DE", { weekday: "short" }) : "—";
      const precip = item.precipitation_probability ?? item.precipitation ?? null;
      return `<div class="forecast-row"><span class="forecast-day">${label}</span><span class="forecast-icon">${this._weatherEmoji(item.condition || item.state || "sunny")}</span><span class="forecast-temp">${temp}°</span><span class="forecast-extra">${precip !== null ? `${precip}%` : ""}</span></div>`;
    }).join("");
    widget.innerHTML = `
      <div class="special-card-head"><div class="special-title">${title}</div><div class="special-badge">${state?.state || "Forecast"}</div></div>
      <div class="forecast-list">${rows || '<div class="empty-mini">Keine Forecast-Daten</div>'}</div>
    `;
  }

  async _renderHeatmapWidget(widget, config, state, name) {
    const title = name || state?.attributes?.friendly_name || config.entity_id || "Heatmap";
    widget.classList.add("widget-heatmap");
    widget.innerHTML = `
      <div class="special-card-head"><div class="special-title">${title}</div><div class="special-badge">${Utils.text(state?.state)}</div></div>
      <div class="heatmap-grid"><div class="empty-mini">Lade Verlauf…</div></div>
    `;
    const container = widget.querySelector('.heatmap-grid');
    if (!config.entity_id || !container) return;
    try {
      const hours = config.config?.hours || 24;
      const history = await this.app.dataManager.fetchHistory(config.entity_id, hours);
      const points = Utils.safeArray(history?.data).filter((p) => p && p.y !== undefined).slice(-24);
      const values = points.map((p) => Utils.toNumber(p.y, 0));
      const min = Math.min(...values, 0);
      const max = Math.max(...values, 1);
      container.innerHTML = points.map((p, idx) => {
        const v = Utils.toNumber(p.y, 0);
        const n = max === min ? 0.8 : (v - min) / (max - min);
        return `<div class="heat-cell" title="${Utils.shortDateTime(p.x)} · ${v}" style="opacity:${0.2 + n * 0.8}"><span>${new Date(p.x).getHours().toString().padStart(2, '0')}</span></div>`;
      }).join('') || '<div class="empty-mini">Keine Verlaufsdaten</div>';
    } catch (e) {
      container.innerHTML = '<div class="empty-mini">Heatmap konnte nicht geladen werden</div>';
    }
  }

  async _renderTimelineWidget(widget, config, state, name) {
    const title = name || state?.attributes?.friendly_name || config.entity_id || "Timeline";
    widget.classList.add("widget-timeline");
    widget.innerHTML = `
      <div class="special-card-head"><div class="special-title">${title}</div><div class="special-badge">${Utils.text(state?.state)}</div></div>
      <div class="timeline-strip"><div class="empty-mini">Lade Verlauf…</div></div>
    `;
    const container = widget.querySelector('.timeline-strip');
    if (!config.entity_id || !container) return;
    try {
      const hours = config.config?.hours || 24;
      const history = await this.app.dataManager.fetchHistory(config.entity_id, hours);
      const points = Utils.safeArray(history?.data).filter((p) => p && p.y !== undefined).slice(-32);
      container.innerHTML = points.map((p) => {
        const on = Utils.isTruthyState(p.y) || Utils.toNumber(p.y, 0) > 0;
        const lbl = Utils.shortDateTime(p.x);
        return `<div class="timeline-seg ${on ? 'on' : 'off'}" title="${lbl} · ${p.y}"></div>`;
      }).join('') || '<div class="empty-mini">Keine Zustandsdaten</div>';
    } catch (e) {
      container.innerHTML = '<div class="empty-mini">Timeline konnte nicht geladen werden</div>';
    }
  }

  _renderEnergyFlowWidget(widget, config, state, name) {
    const c = config.config || {};
    const getVal = (id) => Utils.toNumber(this.app.entityStates[id]?.state, 0);
    const solar = getVal(c.solar_entity);
    const battery = getVal(c.battery_entity);
    const grid = getVal(c.grid_entity);
    const load = getVal(c.load_entity || config.entity_id);
    const title = name || "Energy Flow";
    const total = Math.max(Math.abs(solar), Math.abs(battery), Math.abs(grid), Math.abs(load), 1);
    const sw = 2 + (Math.abs(solar) / total) * 8;
    const bw = 2 + (Math.abs(battery) / total) * 8;
    const gw = 2 + (Math.abs(grid) / total) * 8;
    widget.classList.add('widget-energy-flow');
    widget.innerHTML = `
      <div class="special-card-head"><div class="special-title">${title}</div><div class="special-badge">${load.toFixed(0)} W</div></div>
      <svg class="energy-svg" viewBox="0 0 320 180">
        <defs><linearGradient id="flowA" x1="0" x2="1"><stop offset="0%" stop-color="rgba(255,215,64,.95)"/><stop offset="100%" stop-color="rgba(77,171,247,.95)"/></linearGradient></defs>
        <rect x="18" y="22" width="72" height="42" rx="14" class="energy-box"/><text x="54" y="48" text-anchor="middle" class="energy-label">PV</text><text x="54" y="62" text-anchor="middle" class="energy-value">${solar.toFixed(0)}W</text>
        <rect x="18" y="116" width="72" height="42" rx="14" class="energy-box"/><text x="54" y="142" text-anchor="middle" class="energy-label">Netz</text><text x="54" y="156" text-anchor="middle" class="energy-value">${grid.toFixed(0)}W</text>
        <rect x="124" y="68" width="72" height="42" rx="14" class="energy-box center"/><text x="160" y="94" text-anchor="middle" class="energy-label">Akku</text><text x="160" y="108" text-anchor="middle" class="energy-value">${battery.toFixed(0)}W</text>
        <rect x="230" y="68" width="72" height="42" rx="14" class="energy-box load"/><text x="266" y="94" text-anchor="middle" class="energy-label">Haus</text><text x="266" y="108" text-anchor="middle" class="energy-value">${load.toFixed(0)}W</text>
        <path d="M90 43 C116 43, 112 78, 124 88" class="energy-line solar" style="stroke-width:${sw}"/>
        <path d="M90 137 C116 137, 112 98, 124 88" class="energy-line grid" style="stroke-width:${gw}"/>
        <path d="M196 88 L230 88" class="energy-line battery" style="stroke-width:${bw}"/>
      </svg>
    `;
  }

  _renderBulletChartWidget(widget, config, state, name) {
    const c = config.config || {};
    const title = name || state?.attributes?.friendly_name || config.entity_id || "Bullet";
    const value = Utils.toNumber(state?.state, 0);
    const target = Utils.toNumber(c.target ?? (c.target_entity ? this.app.entityStates[c.target_entity]?.state : 0), 100);
    const max = Utils.toNumber(c.max, Math.max(target, value, 100));
    const pct = Utils.clamp((value / max) * 100, 0, 100);
    const targetPct = Utils.clamp((target / max) * 100, 0, 100);
    const s1 = Utils.clamp((Utils.toNumber(c.threshold_low, max * 0.4) / max) * 100, 0, 100);
    const s2 = Utils.clamp((Utils.toNumber(c.threshold_mid, max * 0.7) / max) * 100, 0, 100);
    const unit = state?.attributes?.unit_of_measurement || config.unit || "";
    widget.classList.add('widget-bullet');
    widget.innerHTML = `
      <div class="special-card-head"><div class="special-title">${title}</div><div class="special-badge">${value}${unit}</div></div>
      <div class="bullet-wrap">
        <div class="bullet-track">
          <div class="bullet-zone z1" style="width:${s1}%"></div>
          <div class="bullet-zone z2" style="left:${s1}%;width:${Math.max(0, s2 - s1)}%"></div>
          <div class="bullet-zone z3" style="left:${s2}%;width:${Math.max(0, 100 - s2)}%"></div>
          <div class="bullet-fill" style="width:${pct}%"></div>
          <div class="bullet-marker" style="left:${targetPct}%"></div>
        </div>
        <div class="bullet-meta"><span>Ist ${value}${unit}</span><span>Ziel ${target}${unit}</span><span>Max ${max}${unit}</span></div>
      </div>
    `;
  }

  async _renderComparisonWidget(widget, config, state, name) {
    const title = name || state?.attributes?.friendly_name || config.entity_id || 'Vergleich';
    const current = Utils.toNumber(state?.state, 0);
    const comparisonEntity = config.config?.comparison_entity;
    const previous = comparisonEntity ? Utils.toNumber(this.app.entityStates[comparisonEntity]?.state, 0) : current * 0.92;
    const delta = previous === 0 ? 0 : ((current - previous) / Math.abs(previous)) * 100;
    const unit = state?.attributes?.unit_of_measurement || config.unit || '';
    widget.classList.add('widget-comparison');
    widget.innerHTML = `
      <div class="special-card-head"><div class="special-title">${title}</div><div class="special-badge ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}%</div></div>
      <div class="compare-wrap">
        <div class="compare-bar"><span>Heute</span><div><i style="width:${Utils.clamp((current / Math.max(current, previous, 1))*100, 0, 100)}%"></i></div><b>${current}${unit}</b></div>
        <div class="compare-bar"><span>Vergleich</span><div><i style="width:${Utils.clamp((previous / Math.max(current, previous, 1))*100, 0, 100)}%"></i></div><b>${previous}${unit}</b></div>
      </div>
    `;
  }

  _renderAdvancedChartWidget(widget, config, state, name) {
    widget.classList.add("widget-chart");
    const ids = this._chartEntityIds(config);
    const primaryId = ids[0] || config.entity_id;
    const primaryState = this.app.entityStates[primaryId] || state || {};
    const unit = primaryState?.attributes?.unit_of_measurement || config.unit || "";
    const title = name || primaryState?.attributes?.friendly_name || primaryId || config.type;
    widget.innerHTML = `
      <div class="chart-header">
        <div class="chart-title">${title}</div>
        <div class="chart-value">${Utils.text(primaryState?.state)}${unit ? `<span class="chart-unit">${unit}</span>` : ""}</div>
      </div>
      <div class="chart-body">
        <canvas class="chart-canvas"></canvas>
      </div>
    `;
    const canvas = widget.querySelector(".chart-canvas");
    if (!canvas || !window.Chart || !ids.length) return;
    this._buildAdvancedChart(canvas, config, ids, primaryState);
  }

  async _buildAdvancedChart(canvas, config, entityIds, primaryState) {
    try {
      const hours = config.config?.hours || 24;
      const chartType = config.type || "line-chart";
      const histories = await Promise.all(entityIds.map((id) => this.app.dataManager.fetchHistory(id, hours)));
      const pointsByEntity = histories.map((history, idx) => ({
        entityId: entityIds[idx],
        points: Utils.safeArray(history?.data).filter((p) => p && p.x !== undefined && p.y !== undefined)
      }));
      const labels = [...new Set(pointsByEntity.flatMap((entry) => entry.points.map((p) => Utils.shortDateTime(p.x))))].slice(-48);
      const baseTypeMap = {
        "bar-chart": "bar",
        "stacked-bar-chart": "bar",
        "horizontal-bar-chart": "bar",
        "donut-chart": "doughnut",
        "pie-chart": "pie",
        "radar-chart": "radar",
        "scatter-chart": "scatter",
        "bullet-chart": "bar",
        "timeline-chart": "bar"
      };
      const baseType = baseTypeMap[chartType] || "line";
      const mkColor = (i, alpha = 1) => `hsla(${(i * 67) % 360}, 80%, 60%, ${alpha})`;
      const datasets = pointsByEntity.map((entry, idx) => {
        const values = entry.points.map((p) => Utils.toNumber(p.y, 0));
        const friendly = this.app.entityStates[entry.entityId]?.attributes?.friendly_name || entry.entityId;
        if (["donut-chart", "pie-chart", "radar-chart"].includes(chartType)) {
          const val = values.length ? values[values.length - 1] : Utils.toNumber(this.app.entityStates[entry.entityId]?.state, 0);
          return { label: friendly, data: [val], backgroundColor: mkColor(idx, .45), borderColor: mkColor(idx, .95), borderWidth: 2, fill: chartType === 'radar-chart' };
        }
        if (chartType === "scatter-chart") {
          return { label: friendly, data: entry.points.map((p, i) => ({ x: i + 1, y: Utils.toNumber(p.y, 0) })), backgroundColor: mkColor(idx, .55), borderColor: mkColor(idx, .95) };
        }
        const labelValues = labels.map((lbl, i) => values[i] ?? null).slice(-48);
        const dataset = { label: friendly, data: labelValues, tension: .35, borderWidth: 2, pointRadius: chartType === 'sparkline' ? 0 : 1.5, pointHoverRadius: 3, fill: ["area-chart", "forecast-chart"].includes(chartType), backgroundColor: mkColor(idx, chartType === 'bar-chart' || chartType === 'stacked-bar-chart' || chartType === 'horizontal-bar-chart' || chartType === 'timeline-chart' || chartType === 'bullet-chart' ? .35 : .16), borderColor: mkColor(idx, .95) };
        if (chartType === 'timeline-chart') dataset.data = labelValues.map(v => v > 0 ? 1 : 0);
        return dataset;
      });
      const finalLabels = ["donut-chart", "pie-chart", "radar-chart"].includes(chartType) ? datasets.map((d) => d.label) : labels;
      const finalDatasets = ["donut-chart", "pie-chart"].includes(chartType)
        ? [{ data: datasets.map((d) => d.data[0] || 0), backgroundColor: datasets.map((_, i) => mkColor(i, .45)), borderColor: datasets.map((_, i) => mkColor(i, .95)), borderWidth: 2 }]
        : datasets;
      const chart = new Chart(canvas, {
        type: baseType,
        data: { labels: finalLabels.length ? finalLabels : ["Jetzt"], datasets: finalDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: chartType === 'horizontal-bar-chart' ? 'y' : 'x',
          animation: { duration: 350 },
          plugins: { legend: { display: entityIds.length > 1 || ["donut-chart","pie-chart","radar-chart"].includes(chartType), labels: { color: 'rgba(255,255,255,.68)', boxWidth: 10 } }, tooltip: { enabled: true } },
          scales: baseType === 'doughnut' || baseType === 'pie' || baseType === 'radar' ? {} : {
            x: { stacked: chartType === 'stacked-bar-chart', display: chartType !== 'sparkline', grid: { display: false }, ticks: { maxTicksLimit: 4, color: 'rgba(255,255,255,.45)' } },
            y: { stacked: chartType === 'stacked-bar-chart', beginAtZero: true, grid: { color: 'rgba(255,255,255,.06)' }, ticks: { maxTicksLimit: 4, color: 'rgba(255,255,255,.45)' } }
          }
        }
      });
      this._chartInstances.push(chart);
    } catch (e) {
      console.warn("Advanced chart build failed:", e);
    }
  }

  _applyCommonWidgetStyle(widget, config) {
    if (config.font) widget.style.fontFamily = `"${config.font}", sans-serif`;
    if (config.fontSize) {
      const ve = widget.querySelector(".w-value");
      if (ve) ve.style.fontSize = `${config.fontSize}px`;
    }
    if (config.textColor) widget.style.color = config.textColor;
    if (config.bgColor && !widget.classList.contains("widget-color-block")) {
      widget.style.background = config.bgColor;
    }
    if (config.borderRadius) widget.style.borderRadius = `${config.borderRadius}px`;
    if (config.opacity !== undefined) { widget.classList.add("transparent-enabled"); widget.style.setProperty("--td-widget-opacity", String(Math.max(0, Math.min(1, config.opacity)))); }
    if (config.blur !== undefined) widget.style.setProperty("--td-widget-blur", `${config.blur}px`);
    if (config.borderColor) widget.style.setProperty("--td-widget-border", config.borderColor);
    if (config.boxShadow) widget.style.setProperty("--td-widget-shadow", config.boxShadow);
    if (config.zIndex !== undefined) widget.style.zIndex = String(config.zIndex);
    if (config.tapAction && config.tapAction !== "none") widget.style.cursor = "pointer";

    if (config.customCss) {
      widget.style.cssText += `;${config.customCss}`;
    }
  }

  _isWidgetVisible(config) {
    const legacyEntity = config.entity_id;
    const ruleEntity = config.visibilityEntity || legacyEntity;
    if (!ruleEntity && !config.visibleWhen) return true;
    const stateObj = this.app.entityStates[ruleEntity];
    const current = stateObj?.state ?? '';
    const expected = config.visibilityValue ?? config.visibleWhen ?? '';
    const op = config.visibilityOperator || 'eq';
    const numCurrent = Utils.toNumber(current, Number.NaN);
    const numExpected = Utils.toNumber(expected, Number.NaN);
    switch (op) {
      case 'neq': return String(current) !== String(expected);
      case 'gt': return !Number.isNaN(numCurrent) && !Number.isNaN(numExpected) && numCurrent > numExpected;
      case 'gte': return !Number.isNaN(numCurrent) && !Number.isNaN(numExpected) && numCurrent >= numExpected;
      case 'lt': return !Number.isNaN(numCurrent) && !Number.isNaN(numExpected) && numCurrent < numExpected;
      case 'lte': return !Number.isNaN(numCurrent) && !Number.isNaN(numExpected) && numCurrent <= numExpected;
      case 'contains': return String(current).toLowerCase().includes(String(expected).toLowerCase());
      case 'truthy': return Utils.isTruthyState(current);
      case 'falsy': return !Utils.isTruthyState(current);
      case 'eq':
      default: return expected === '' ? true : String(current) === String(expected);
    }
  }

  _attachWidgetAction(widget, config) {
    const action = config.tapAction || 'none';
    if (!action || action === 'none') return;
    widget.classList.add('widget-actionable');
    widget.tabIndex = 0;
    const run = async (ev) => {
      ev.preventDefault();
      try {
        if (action === 'navigate' && config.navigationPath) {
          window.location.assign(config.navigationPath);
        } else if (action === 'url' && config.url) {
          window.open(config.url, config.openInNewTab === false ? '_self' : '_blank');
        } else if (action === 'service' && config.service) {
          let serviceData = {};
          try { serviceData = JSON.parse(config.serviceData || '{}'); } catch (e) { console.warn('Invalid service JSON', e); }
          if (!serviceData.entity_id && config.serviceTargetEntity) serviceData.entity_id = config.serviceTargetEntity;
          const [domain, service] = String(config.service).split('.');
          if (domain && service) {
            if (window.hassConnection?.sendMessagePromise) {
              await window.hassConnection.sendMessagePromise({ type: 'call_service', domain, service, service_data: serviceData });
            } else {
              await fetch(`/api/services/${domain}/${service}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(serviceData || {}) });
            }
          } else {
            console.warn('Service action unavailable', config.service);
          }
        }
      } catch (e) {
        console.warn('Widget action failed', e);
      }
    };
    widget.addEventListener('click', run);
    widget.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') run(ev);
    });
  }

  _updateWidget(widgetInfo, entityId, newState) {
    const { element, config } = widgetInfo;
    element.style.display = this._isWidgetVisible(config) ? "" : "none";
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
      case "bar-chart": {
        const chartValue = element.querySelector(".chart-value");
        if (chartValue) {
          chartValue.innerHTML = `${Utils.text(value)}${unit ? `<span class="chart-unit">${unit}</span>` : ""}`;
        }
        break;
      }

      case "forecast-chart":
        this._renderForecastWidget(element, config, newState, config.name);
        break;

      case "energy-flow-mini":
        this._renderEnergyFlowWidget(element, config, newState, config.name);
        break;

      case "bullet-chart":
        this._renderBulletChartWidget(element, config, newState, config.name);
        break;

      case "comparison-chart":
        this._renderComparisonWidget(element, config, newState, config.name);
        break;

      default: {
        const wv = element.querySelector(".w-value");
        if (wv) wv.textContent = Utils.text(value);
      }
    }

    element.classList.remove("value-changed");
    void element.offsetWidth;
    element.classList.add("value-changed");
  }

  _weatherEmoji(condition) {
    const value = String(condition || '').toLowerCase();
    if (value.includes('rain')) return '🌧️';
    if (value.includes('cloud')) return '☁️';
    if (value.includes('snow')) return '❄️';
    if (value.includes('storm') || value.includes('lightning')) return '⛈️';
    if (value.includes('fog')) return '🌫️';
    return '☀️';
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

/* ----------------------------------------------------------
   TICKER MANAGER
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   ALERT MANAGER
   ---------------------------------------------------------- */

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

/* ----------------------------------------------------------
   MAIN APP
   ---------------------------------------------------------- */

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