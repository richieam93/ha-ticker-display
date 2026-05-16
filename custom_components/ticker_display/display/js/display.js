/*
 * Android-9/WebView compatibility build.
 * Source with modern syntax is kept as display.modern.js.
 */
(function () {
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (search, replacement) {
      var target = String(this);
      if (search instanceof RegExp) {
        if (!search.global) throw new TypeError('replaceAll called with a non-global RegExp argument');
        return target.replace(search, replacement);
      }
      return target.split(String(search)).join(String(replacement));
    };
  }
})();

/**
 * Ticker Display – Enhanced Display Engine v3
 * Komplett überarbeitet: Bugfixes, Ticker-Leiste, Charts, Animationen,
 * Fehlerbehandlung, Memory-Management, Lokalisierung
 */
/* ══════════════════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════════════════ */
const Utils = {
    /** Locale für Datums-/Zeitformatierung (konfigurierbar) */
    _locale: navigator.language || "de-DE",
    setLocale(locale) {
        if (locale && typeof locale === "string")
            Utils._locale = locale;
    },
    formatNumber(v, d = 1) {
        const n = parseFloat(v);
        return Number.isNaN(n) ? v : n.toFixed(d);
    },
    relativeTime(iso) {
        if (!iso)
            return "";
        const diff = (Date.now() - new Date(iso).getTime()) / 1000;
        if (diff < 0)
            return "in der Zukunft";
        if (diff < 60)
            return "gerade eben";
        if (diff < 3600) {
            const mins = Math.floor(diff / 60);
            return `vor ${mins} Min`;
        }
        if (diff < 86400) {
            const hrs = Math.floor(diff / 3600);
            return `vor ${hrs} Std`;
        }
        const days = Math.floor(diff / 86400);
        return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
    },
    debounce(fn, ms) {
        let t;
        return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    },
    throttle(fn, ms) {
        let last = 0;
        return (...a) => {
            const now = Date.now();
            if (now - last >= ms) {
                last = now;
                fn(...a);
            }
        };
    },
    clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
    safeArray(v) { return Array.isArray(v) ? v : []; },
    text(v, fallback = "—") {
        if (v === null || v === undefined || v === "")
            return fallback;
        return String(v);
    },
    escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },
    toNumber(v, fallback = 0) {
        const n = parseFloat(v);
        return Number.isNaN(n) ? fallback : n;
    },
    formatValue(v, opts = {}) {
        var _a;
        if (v === null || v === undefined || v === "")
            return (_a = opts.fallback) !== null && _a !== void 0 ? _a : "—";
        const raw = String(v).trim();
        const numeric = Number.parseFloat(raw.replace(',', '.'));
        if (!Number.isFinite(numeric) || !/^[-+]?\d+(?:[\.,]\d+)?$/.test(raw.replace(',', '.')))
            return raw;
        let decimals = opts.decimals;
        if (decimals === undefined || decimals === null || decimals === "")
            return String(numeric);
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
        if (!unit)
            return value;
        return `${value}${opts.spaceBeforeUnit === false ? '' : ' '}${unit}`;
    },
    isTruthyState(v) {
        return ["on", "true", "home", "open", "detected", "playing", "active", "unlocked", "armed"].includes(String(v).toLowerCase());
    },
    isFalsyState(v) {
        return ["off", "false", "away", "closed", "not_home", "idle", "standby", "unavailable", "unknown", "locked", "disarmed"].includes(String(v).toLowerCase());
    },
    shortDateTime(iso) {
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime()))
                return "";
            return d.toLocaleTimeString(Utils._locale, { hour: "2-digit", minute: "2-digit" });
        }
        catch (e) {
            return "";
        }
    },
    fullDateTime(iso) {
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime()))
                return "";
            return d.toLocaleString(Utils._locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
        }
        catch (e) {
            return "";
        }
    },
    timeoutSignal(ms) {
        try {
            if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
                return AbortSignal.timeout(ms);
            }
            if (typeof AbortController !== "undefined") {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), ms);
                return controller.signal;
            }
        }
        catch (e) { }
        return undefined;
    },
    applyAlpha(color, alpha = null) {
        if (color == null || color === "")
            return "";
        if (alpha === null || alpha === undefined || alpha === "")
            return String(color);
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
            if (parts.length >= 3)
                return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
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
        this._cacheMaxAge = 60000; // 60 Sekunden Standard-Cache
        this._maxCacheEntries = 200;
        this._pendingRequests = new Map();
    }
    /** Cache aufräumen wenn zu viele Einträge */
    _pruneCache() {
        const keys = Object.keys(this._cache);
        if (keys.length <= this._maxCacheEntries)
            return;
        const sorted = keys.sort((a, b) => { var _a, _b; return (((_a = this._cache[a]) === null || _a === void 0 ? void 0 : _a.t) || 0) - (((_b = this._cache[b]) === null || _b === void 0 ? void 0 : _b.t) || 0); });
        const toRemove = sorted.slice(0, keys.length - this._maxCacheEntries);
        for (const key of toRemove)
            delete this._cache[key];
    }
    async _fetchJson(path, options = {}) {
        const url = `${this.apiBase}${path}`;
        try {
            const response = await fetch(url, {
                credentials: "same-origin",
                cache: "no-store",
                signal: options.signal || Utils.timeoutSignal(15000),
                ...options,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} für ${path}`);
            }
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                console.warn(`Unerwarteter Content-Type für ${path}: ${contentType}`);
            }
            return response.json();
        }
        catch (e) {
            if (e.name === "AbortError") {
                console.warn(`Timeout für ${path}`);
            }
            throw e;
        }
    }
    async fetchHistory(entityId, hours = 24) {
        if (!entityId)
            return { entity_id: entityId, data: [] };
        const key = `h_${entityId}_${hours}`;
        const cached = this._cache[key];
        if (cached && Date.now() - cached.t < this._cacheMaxAge)
            return cached.d;
        // Deduplizierung: Wenn bereits ein Request für denselben Key läuft, darauf warten
        if (this._pendingRequests.has(key)) {
            return this._pendingRequests.get(key);
        }
        const promise = (async () => {
            try {
                const raw = await this._fetchJson(`/api/history/${encodeURIComponent(entityId)}?hours=${encodeURIComponent(hours)}`);
                let data = [];
                // Format A: {entity_id, data: [{x, y}]}
                if ((raw === null || raw === void 0 ? void 0 : raw.data) && Array.isArray(raw.data)) {
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
                // Format D: Objekt mit data-Property (nicht-Array)
                else if (raw && typeof raw === "object" && raw.data) {
                    data = this._convertHistoryPoints(Utils.safeArray(raw.data));
                }
                const result = { entity_id: entityId, data };
                this._cache[key] = { d: result, t: Date.now() };
                this._pruneCache();
                return result;
            }
            catch (e) {
                console.warn("fetchHistory fehlgeschlagen:", entityId, e.message || e);
                return { entity_id: entityId, data: [] };
            }
            finally {
                this._pendingRequests.delete(key);
            }
        })();
        this._pendingRequests.set(key, promise);
        return promise;
    }
    _convertHistoryPoints(arr) {
        return Utils.safeArray(arr)
            .map(p => {
            var _a, _b, _c, _d, _e;
            if (!p || typeof p !== "object")
                return null;
            // Ignoriere unavailable/unknown
            if (p.state === "unavailable" || p.state === "unknown")
                return null;
            const time = p.x || p.last_changed || p.last_updated || p.timestamp || p.t || p.date || p.time || null;
            const val = (_e = (_d = (_c = (_b = (_a = p.y) !== null && _a !== void 0 ? _a : p.value) !== null && _b !== void 0 ? _b : p.state) !== null && _c !== void 0 ? _c : p.v) !== null && _d !== void 0 ? _d : p.val) !== null && _e !== void 0 ? _e : null;
            if (val === null || val === undefined)
                return null;
            const y = Utils.toNumber(val, null);
            if (y === null)
                return null;
            return { x: time || new Date().toISOString(), y };
        })
            .filter(Boolean);
    }
    async fetchWeather(entityId) {
        try {
            return await this._fetchJson(`/api/weather/${encodeURIComponent(entityId)}`);
        }
        catch (e) {
            return null;
        }
    }
    async fetchState(entityId) {
        try {
            return await this._fetchJson(`/api/states/${encodeURIComponent(entityId)}`);
        }
        catch (e) {
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
                if (data === null || data === void 0 ? void 0 : data.redirect)
                    return { url: data.redirect, mode: data.mode || mode };
            }
            if (r.ok)
                return { url, mode };
        }
        catch (e) { }
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
        var _a;
        if ((_a = this._bridge) === null || _a === void 0 ? void 0 : _a.setScreenBrightness)
            this._bridge.setScreenBrightness(Math.round(v));
    }
    setScreenPower(on) {
        var _a;
        if ((_a = this._bridge) === null || _a === void 0 ? void 0 : _a.setScreenPower)
            this._bridge.setScreenPower(!!on);
    }
    playSound(url, volume = 100, loop = false) {
        if (!url)
            return;
        if (this._bridge) {
            try {
                loop ? this._bridge.playSoundLoop(url) : this._bridge.playSound(url);
                if (volume !== undefined)
                    this._bridge.setVolume(volume);
            }
            catch (e) { }
            return;
        }
        try {
            if (this._audioElement)
                this._audioElement.pause();
            this._audioElement = new Audio(url);
            this._audioElement.volume = Utils.clamp(volume / 100, 0, 1);
            this._audioElement.loop = loop;
            this._audioElement.play().catch(() => { });
        }
        catch (e) { }
    }
    stopSound() {
        var _a;
        if ((_a = this._bridge) === null || _a === void 0 ? void 0 : _a.stopSound) {
            try {
                this._bridge.stopSound();
            }
            catch (e) { }
            return;
        }
        if (this._audioElement) {
            this._audioElement.pause();
            this._audioElement = null;
        }
    }
    setVolume(v) {
        var _a;
        if ((_a = this._bridge) === null || _a === void 0 ? void 0 : _a.setVolume) {
            try {
                this._bridge.setVolume(v);
            }
            catch (e) { }
        }
    }
    vibrate(ms = 500) {
        var _a;
        if ((_a = this._bridge) === null || _a === void 0 ? void 0 : _a.vibrate) {
            try {
                this._bridge.vibrate(ms);
            }
            catch (e) { }
        }
        else if (navigator.vibrate)
            navigator.vibrate(ms);
    }
    getAllSensorData() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
        if (!this._bridge)
            return null;
        try {
            return {
                battery_level: (_b = (_a = this._bridge).getBatteryLevel) === null || _b === void 0 ? void 0 : _b.call(_a),
                battery_charging: (_d = (_c = this._bridge).isBatteryCharging) === null || _d === void 0 ? void 0 : _d.call(_c),
                battery_temperature: (_f = (_e = this._bridge).getBatteryTemperature) === null || _f === void 0 ? void 0 : _f.call(_e),
                wifi_signal: (_h = (_g = this._bridge).getWifiSignal) === null || _h === void 0 ? void 0 : _h.call(_g),
                wifi_ssid: (_k = (_j = this._bridge).getWifiSsid) === null || _k === void 0 ? void 0 : _k.call(_j),
                ip_address: (_m = (_l = this._bridge).getIpAddress) === null || _m === void 0 ? void 0 : _m.call(_l),
                light_level: (_p = (_o = this._bridge).getLightLevel) === null || _p === void 0 ? void 0 : _p.call(_o),
                motion_detected: (_r = (_q = this._bridge).isMotionDetected) === null || _r === void 0 ? void 0 : _r.call(_q),
                proximity_near: false,
                ambient_noise_db: 0,
                screen_on: (_t = (_s = this._bridge).isScreenOn) === null || _t === void 0 ? void 0 : _t.call(_s),
                screen_brightness: (_v = (_u = this._bridge).getScreenBrightness) === null || _v === void 0 ? void 0 : _v.call(_u),
                memory_free_mb: (_x = (_w = this._bridge).getMemoryFree) === null || _x === void 0 ? void 0 : _x.call(_w),
                cpu_usage: 0,
                app_version: (_z = (_y = this._bridge).getAppVersion) === null || _z === void 0 ? void 0 : _z.call(_y),
                uptime_seconds: 0,
            };
        }
        catch (e) {
            return null;
        }
    }
}
/* ══════════════════════════════════════════════════════════
   THEME MANAGER
   ══════════════════════════════════════════════════════════ */
class ThemeManager {
    applyDynamic(data) {
        if (!data)
            return;
        const root = document.documentElement;
        if (data.accent_color)
            root.style.setProperty("--td-accent", data.accent_color);
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
        if (!this.app.wsUrl) {
            console.warn("⚠️ Keine WebSocket-URL konfiguriert");
            return Promise.reject(new Error("No WebSocket URL"));
        }
        return new Promise((resolve, reject) => {
            try {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    resolve();
                    return;
                }
                // Alte Verbindung sauber schließen
                if (this.ws) {
                    try {
                        this.ws.close();
                    }
                    catch (e) { }
                    this.ws = null;
                }
                const ws = new WebSocket(this.app.wsUrl);
                this.ws = ws;
                let resolved = false;
                ws.onopen = () => {
                    if (seq !== this._connectSeq || ws !== this.ws) {
                        try {
                            ws.close();
                        }
                        catch (e) { }
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
                    if (offline)
                        offline.hidden = true;
                    this.send({ type: "subscribe", entities: this.app.neededEntities || [] });
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                };
                ws.onmessage = (e) => {
                    if (seq !== this._connectSeq || ws !== this.ws)
                        return;
                    try {
                        const msg = JSON.parse(e.data);
                        this._handleMessage(msg);
                    }
                    catch (err) {
                        console.error("WebSocket parse error:", err);
                    }
                };
                ws.onclose = (event) => {
                    var _a;
                    if (seq !== this._connectSeq || ws !== this.ws)
                        return;
                    this._connected = false;
                    console.log(`🔌 WebSocket geschlossen (Code: ${event.code}, Grund: ${event.reason || "keine"})`);
                    const offline = document.getElementById("offline-screen");
                    if (offline) {
                        if ((_a = this.app) === null || _a === void 0 ? void 0 : _a.isPreview)
                            offline.hidden = true;
                        else
                            offline.hidden = !this._hadSuccessfulConnection;
                    }
                    if (!this._manuallyClosed)
                        this._scheduleReconnect();
                    if (!resolved) {
                        resolved = true;
                        reject(new Error(`WebSocket closed: ${event.code}`));
                    }
                };
                ws.onerror = (err) => {
                    if (seq !== this._connectSeq || ws !== this.ws)
                        return;
                    console.warn("⚠️ WebSocket Fehler:", err);
                    if (!resolved) {
                        resolved = true;
                        reject(err);
                    }
                };
            }
            catch (e) {
                console.error("❌ WebSocket Verbindungsfehler:", e);
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
            try {
                this.ws.close();
            }
            catch (e) { }
        }
    }
    send(data) {
        if (this.ws && this._connected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    isConnected() { return this._connected; }
    _handleMessage(msg) {
        console.log("📡 WS Nachricht:", msg.type, msg);
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
                console.log("📨 Ticker Nachricht empfangen:", msg.messages);
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
        var _a;
        if ((_a = this.app) === null || _a === void 0 ? void 0 : _a.isPreview)
            return;
        if (this._reconnectTimer)
            return;
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
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4;
        const cfg = (config === null || config === void 0 ? void 0 : config.config) || {};
        const backgroundColor = config.background_color || config.bgColor || cfg.background_color || cfg.bgColor || "";
        const backgroundOpacity = (_e = (_d = (_c = (_b = (_a = config.background_opacity) !== null && _a !== void 0 ? _a : config.bgOpacity) !== null && _b !== void 0 ? _b : cfg.background_opacity) !== null && _c !== void 0 ? _c : cfg.bgOpacity) !== null && _d !== void 0 ? _d : cfg.opacity) !== null && _e !== void 0 ? _e : null;
        const gradientEnabled = cfg.gradient_enabled === true && cfg.gradient_to_color;
        const gradientAngle = Number(cfg.gradient_angle || 135);
        const resolvedBackground = backgroundColor
            ? (gradientEnabled
                ? `linear-gradient(${gradientAngle}deg, ${Utils.applyAlpha(backgroundColor, backgroundOpacity !== null && backgroundOpacity !== void 0 ? backgroundOpacity : 1)} 0%, ${Utils.applyAlpha(cfg.gradient_to_color, backgroundOpacity !== null && backgroundOpacity !== void 0 ? backgroundOpacity : 1)} 100%)`
                : Utils.applyAlpha(backgroundColor, backgroundOpacity))
            : "";
        const borderColor = config.border_color || config.borderColor || cfg.border_color || cfg.borderColor || "rgba(255,255,255,.08)";
        const borderWidth = (_j = (_h = (_g = (_f = config.border_width) !== null && _f !== void 0 ? _f : config.borderWidth) !== null && _g !== void 0 ? _g : cfg.border_width) !== null && _h !== void 0 ? _h : cfg.borderWidth) !== null && _j !== void 0 ? _j : 1;
        const borderRadius = (_m = (_l = (_k = config.border_radius) !== null && _k !== void 0 ? _k : config.borderRadius) !== null && _l !== void 0 ? _l : cfg.border_radius) !== null && _m !== void 0 ? _m : cfg.borderRadius;
        const borderStyle = cfg.border_style || "solid";
        const textColor = config.text_color || config.textColor || cfg.text_color || cfg.textColor || "";
        const fontSize = (_q = (_p = (_o = config.font_size) !== null && _o !== void 0 ? _o : config.fontSize) !== null && _p !== void 0 ? _p : cfg.font_size) !== null && _q !== void 0 ? _q : cfg.fontSize;
        const fontFamily = config.font_family || config.font || cfg.font_family || cfg.font || "";
        const blur = (_u = (_t = (_s = (_r = config.blur) !== null && _r !== void 0 ? _r : config.backdrop_blur) !== null && _s !== void 0 ? _s : cfg.blur) !== null && _t !== void 0 ? _t : cfg.backdrop_blur) !== null && _u !== void 0 ? _u : 0;
        const customCss = config.custom_css || config.customCss || cfg.custom_css || cfg.customCss || "";
        const padX = (_v = cfg.padding_x) !== null && _v !== void 0 ? _v : config.padding_x;
        const padY = (_w = cfg.padding_y) !== null && _w !== void 0 ? _w : config.padding_y;
        const innerGap = (_x = cfg.inner_gap) !== null && _x !== void 0 ? _x : config.inner_gap;
        const minHeight = (_y = cfg.min_height) !== null && _y !== void 0 ? _y : config.min_height;
        const iconSize = (_z = cfg.icon_size) !== null && _z !== void 0 ? _z : config.icon_size;
        const valueSize = (_0 = cfg.value_size) !== null && _0 !== void 0 ? _0 : config.value_size;
        const nameSize = (_1 = cfg.name_size) !== null && _1 !== void 0 ? _1 : config.name_size;
        const unitSize = (_2 = cfg.unit_size) !== null && _2 !== void 0 ? _2 : config.unit_size;
        const subtitleSize = (_3 = cfg.subtitle_size) !== null && _3 !== void 0 ? _3 : config.subtitle_size;
        const textAlign = cfg.text_align || config.text_align || "center";
        const contentAlign = cfg.content_align || config.content_align || "center";
        const contentJustify = cfg.content_justify || config.content_justify || "center";
        const widgetOpacity = (_4 = cfg.widget_opacity) !== null && _4 !== void 0 ? _4 : config.widget_opacity;
        const shadowPreset = cfg.shadow_preset || config.shadow_preset || config.shadow || "soft";
        const shadowMap = {
            none: "none",
            soft: "0 1px 2px rgba(0,0,0,.08), 0 10px 24px rgba(0,0,0,.14)",
            medium: "0 1px 2px rgba(0,0,0,.12), 0 14px 32px rgba(0,0,0,.20)",
            strong: "0 6px 16px rgba(0,0,0,.22), 0 20px 44px rgba(0,0,0,.28)",
            glow: `0 0 0 1px ${Utils.applyAlpha(borderColor || backgroundColor || '#40c4ff', .36)}, 0 0 28px ${Utils.applyAlpha(borderColor || backgroundColor || '#40c4ff', .24)}`,
        };
        const alignMap = { left: "flex-start", center: "center", right: "flex-end" };
        const justifyMap = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" };
        if (resolvedBackground)
            widget.style.background = resolvedBackground;
        if (backgroundOpacity !== null && backgroundOpacity !== undefined) {
            widget.classList.add("widget-translucent");
            widget.style.setProperty("--td-widget-bg-opacity", String(Utils.clamp(Number(backgroundOpacity), 0, 1)));
        }
        if (config.background_image || config.bgImage) {
            const widgetBg = gradientEnabled
                ? `linear-gradient(${gradientAngle}deg, ${Utils.applyAlpha(backgroundColor || 'rgba(30,30,30,1)', backgroundOpacity !== null && backgroundOpacity !== void 0 ? backgroundOpacity : 1)} 0%, ${Utils.applyAlpha(cfg.gradient_to_color, backgroundOpacity !== null && backgroundOpacity !== void 0 ? backgroundOpacity : 1)} 100%)`
                : Utils.applyAlpha(backgroundColor || "rgba(30,30,30,1)", backgroundOpacity !== null && backgroundOpacity !== void 0 ? backgroundOpacity : 1);
            const imageUrl = config.background_image || config.bgImage;
            widget.style.backgroundImage = `linear-gradient(${widgetBg}, ${widgetBg}), url(${imageUrl})`;
            widget.style.backgroundSize = `100% 100%, ${config.background_size || config.background_image_size || config.bgImageSize || "cover"}`;
            widget.style.backgroundPosition = "center center, center center";
            widget.style.backgroundRepeat = "no-repeat, no-repeat";
        }
        if (borderColor)
            widget.style.borderColor = borderColor;
        if (borderWidth !== undefined && borderWidth !== null && borderWidth !== "") {
            widget.style.borderWidth = `${Number(borderWidth)}px`;
            widget.style.borderStyle = borderStyle;
        }
        if (borderRadius !== undefined && borderRadius !== null && borderRadius !== "")
            widget.style.borderRadius = `${Number(borderRadius)}px`;
        if (textColor)
            widget.style.color = textColor;
        if (fontSize !== undefined && fontSize !== null && fontSize !== "")
            widget.style.fontSize = `${Number(fontSize)}px`;
        if (fontFamily)
            widget.style.fontFamily = `'${String(fontFamily)}', var(--td-font-main, "Roboto", sans-serif)`;
        if (blur) {
            widget.style.backdropFilter = `blur(${Number(blur)}px) saturate(1.08)`;
            widget.style.webkitBackdropFilter = `blur(${Number(blur)}px) saturate(1.08)`;
        }
        if (config.css_class)
            widget.classList.add(...String(config.css_class).split(/\s+/).filter(Boolean));
        if (config.glass || cfg.glass)
            widget.classList.add("widget-glass");
        if (config.glow || cfg.glow)
            widget.classList.add("widget-glow");
        if (shadowMap[shadowPreset])
            widget.style.boxShadow = shadowMap[shadowPreset];
        if (padX !== undefined || padY !== undefined) {
            const px = Number(padX !== null && padX !== void 0 ? padX : 14);
            const py = Number(padY !== null && padY !== void 0 ? padY : 14);
            widget.style.padding = `${py}px ${px}px`;
            widget.style.setProperty("--td-widget-padding", `${py}px ${px}px`);
        }
        else if (config.padding !== undefined) {
            widget.style.padding = typeof config.padding === "number" ? `${config.padding}px` : config.padding;
        }
        if (innerGap !== undefined && innerGap !== null && innerGap !== "")
            widget.style.setProperty("--td-widget-inner-gap", `${Number(innerGap)}px`);
        if (iconSize !== undefined && Number(iconSize) > 0)
            widget.style.setProperty("--td-widget-icon-size", `${Number(iconSize)}px`);
        if (valueSize !== undefined && Number(valueSize) > 0)
            widget.style.setProperty("--td-widget-value-size", `${Number(valueSize)}px`);
        if (nameSize !== undefined && Number(nameSize) > 0)
            widget.style.setProperty("--td-widget-name-size", `${Number(nameSize)}px`);
        if (unitSize !== undefined && Number(unitSize) > 0)
            widget.style.setProperty("--td-widget-unit-size", `${Number(unitSize)}px`);
        if (subtitleSize !== undefined && Number(subtitleSize) > 0)
            widget.style.setProperty("--td-widget-subtitle-size", `${Number(subtitleSize)}px`);
        if (textAlign)
            widget.style.setProperty("--td-widget-text-align", textAlign);
        if (contentAlign)
            widget.style.setProperty("--td-widget-align-items", alignMap[contentAlign] || contentAlign);
        if (contentJustify)
            widget.style.setProperty("--td-widget-justify-content", justifyMap[contentJustify] || contentJustify);
        if (minHeight !== undefined && minHeight !== null && minHeight !== "" && Number(minHeight) > 0) {
            widget.style.minHeight = `${Number(minHeight)}px`;
            widget.style.setProperty("--td-widget-min-height", `${Number(minHeight)}px`);
        }
        if (widgetOpacity !== undefined && widgetOpacity !== null && widgetOpacity !== "")
            widget.style.opacity = String(widgetOpacity);
        if (config.z_index)
            widget.style.zIndex = String(config.z_index);
        if (customCss)
            widget.style.cssText += `;${customCss}`;
    }
    /* ────── FEHLENDE METHODE: _loadCameraInto ────── */
    _loadCameraInto(imgElement, entityId, source = "auto") {
        if (!imgElement || !entityId)
            return;
        const sources = [];
        const preferred = source || "auto";
        if (preferred === "auto")
            sources.push("camera_proxy", "entity_picture", "snapshot", "camera_proxy_stream");
        else {
            sources.push(preferred);
            if (preferred !== "camera_proxy")
                sources.push("camera_proxy");
            if (preferred !== "entity_picture")
                sources.push("entity_picture");
            if (preferred !== "snapshot")
                sources.push("snapshot");
        }
        const tried = new Set();
        const next = () => {
            const mode = sources.find((item) => !tried.has(item));
            if (!mode) {
                imgElement.classList.add("camera-error");
                if (!imgElement.src)
                    imgElement.alt = "⚠️ Kamera nicht verfügbar";
                return;
            }
            tried.add(mode);
            const url = this._cameraUrlForEntity(entityId, mode);
            if (!url)
                return next();
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
        if (!entityId)
            return "";
        const base = this.app.apiBase || "/ticker-display";
        const mode = source || "auto";
        return `${base}/api/image/camera/${encodeURIComponent(entityId)}?mode=${encodeURIComponent(mode)}&t=${Date.now()}`;
    }
    /* ────── FIX: _normalizePoints ────── */
    _normalizePoints(rawPoints, fallbackValue = 0) {
        const raw = Utils.safeArray(rawPoints);
        const points = raw.map(p => {
            var _a;
            if (!p || typeof p !== "object")
                return null;
            if (p.x !== undefined && p.y !== undefined) {
                const y = Utils.toNumber(p.y, null);
                return y !== null ? { x: p.x, y } : null;
            }
            if (p.timestamp !== undefined && p.value !== undefined) {
                const y = Utils.toNumber(p.value, null);
                return y !== null ? { x: p.timestamp, y } : null;
            }
            if (p.last_changed !== undefined && p.state !== undefined) {
                const y = Utils.toNumber(p.state, null);
                return y !== null ? { x: p.last_changed, y } : null;
            }
            if (p.last_updated !== undefined && p.state !== undefined) {
                const y = Utils.toNumber(p.state, null);
                return y !== null ? { x: p.last_updated, y } : null;
            }
            if (p.t !== undefined && p.v !== undefined) {
                const y = Utils.toNumber(p.v, null);
                return y !== null ? { x: p.t, y } : null;
            }
            if (p.date !== undefined && p.value !== undefined) {
                const y = Utils.toNumber(p.value, null);
                return y !== null ? { x: p.date, y } : null;
            }
            if (p.time !== undefined && (p.val !== undefined || p.value !== undefined)) {
                const y = Utils.toNumber((_a = p.val) !== null && _a !== void 0 ? _a : p.value, null);
                return y !== null ? { x: p.time, y } : null;
            }
            return null;
        }).filter(Boolean);
        if (points.length > 0)
            return points;
        const now = new Date();
        const val = Utils.toNumber(fallbackValue, 0);
        return [
            { x: new Date(now.getTime() - 3600000).toISOString(), y: val * 0.95 },
            { x: now.toISOString(), y: val }
        ];
    }
    /* ────── Navigation ────── */
    start() {
        if (!this.container)
            return;
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
    next() { if (this.screens.length > 1)
        this._showScreen((this.currentIndex + 1) % this.screens.length); }
    previous() { if (this.screens.length > 1)
        this._showScreen((this.currentIndex - 1 + this.screens.length) % this.screens.length); }
    goto(screenId) {
        const i = this.screens.findIndex(s => s.id === screenId || s.name === screenId);
        if (i >= 0)
            this._showScreen(i);
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
                if (!this.isPaused)
                    this._startRotation();
            }, data.duration * 1000);
        }
    }
    onEntityUpdate(entityId, newState) {
        const widgets = this._widgetElements[entityId];
        if (widgets) {
            for (const w of widgets)
                this._updateWidget(w, entityId, newState);
        }
        const current = this.temporaryScreen || this.screens[this.currentIndex];
        if (!current)
            return;
        const weatherRelated = current.entity_id === entityId || Utils.safeArray(current.widgets).some(w => w.type === "weather" && w.entity_id === entityId);
        if ((current.type === "weather" || current.screen_weather_fx) && weatherRelated)
            this._renderScreen(current);
    }
    /* ────── Screen-Rendering ────── */
    _showScreen(index) {
        var _a;
        if (index >= this.screens.length)
            return;
        this.currentIndex = index;
        this._renderScreen(this.screens[index]);
        if ((_a = this.app.wsClient) === null || _a === void 0 ? void 0 : _a.isConnected()) {
            this.app.wsClient.send({ type: "status", screen: this.screens[index].name || `screen_${index}` });
        }
    }
    _renderScreen(config) {
        var _a;
        this._widgetElements = {};
        this._clearIntervals();
        if (this.app.tickerManager)
            this.app.tickerManager._applyStyle({ ...(this.app.config.ticker || {}), ...(config.ticker_style || {}) });
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
        const transition = config.transition || ((_a = this.app.config.rotation) === null || _a === void 0 ? void 0 : _a.transition) || "fade";
        this._doTransition(screen, transition);
    }
    _applyScreenStyle(screen, config) {
        var _a;
        screen.style.backgroundColor = config.background_color || "var(--td-bg, #121212)";
        if (config.background_image) {
            const overlay = Number((_a = config.background_overlay_opacity) !== null && _a !== void 0 ? _a : 1);
            const shade = Math.max(0, Math.min(1, 1 - overlay));
            screen.style.backgroundImage = `linear-gradient(rgba(0,0,0,${shade}), rgba(0,0,0,${shade})), url(${config.background_image})`;
            screen.style.backgroundRepeat = "no-repeat, no-repeat";
            screen.style.backgroundPosition = "center center, center center";
            screen.style.backgroundSize = `100% 100%, ${config.background_image_size || "cover"}`;
        }
    }
    _getScreenWeatherEffectConfig(config) {
        const enabled = config.screen_weather_fx === true || config.weather_fullscreen_fx === true;
        if (!enabled)
            return null;
        let entityId = config.entity_id || null;
        if (!entityId) {
            const ww = Utils.safeArray(config.widgets).find(w => w.type === "weather" && w.entity_id);
            entityId = (ww === null || ww === void 0 ? void 0 : ww.entity_id) || null;
        }
        if (!entityId)
            return null;
        const state = this.app.entityStates[entityId] || {};
        const visual = this._weatherVisual(state === null || state === void 0 ? void 0 : state.state, config.config || config);
        return { entityId, visual, intensity: config.screen_weather_fx_intensity || "normal", layers: Number(config.screen_weather_fx_layers || 1) };
    }
    _applyScreenWeatherOverlay(screen, config) {
        const fx = this._getScreenWeatherEffectConfig(config);
        if (!fx)
            return;
        const overlay = document.createElement("div");
        overlay.className = `screen-weather-overlay ${fx.visual.theme} ${fx.visual.animClass} ${fx.visual.animate ? "animate" : ""} intensity-${fx.intensity} layers-${fx.layers}`;
        overlay.innerHTML = this._weatherFxMarkup(fx.visual.animClass, fx.layers);
        screen.appendChild(overlay);
    }
    /* ────── Screen Builders ────── */
    /** Dashboard Screen - Verbessert */
    _buildDashboardScreen(screen, config) {
        var _a, _b, _c;
        console.log("📊 Dashboard erstellen:", config);
        const grid = document.createElement("div");
        grid.className = "dashboard-grid";
        // Grid-Konfiguration
        const cols = Math.max(1, ((_a = config.grid) === null || _a === void 0 ? void 0 : _a.columns) || 3);
        const rows = Math.max(1, ((_b = config.grid) === null || _b === void 0 ? void 0 : _b.rows) || 2);
        const gap = ((_c = config.grid) === null || _c === void 0 ? void 0 : _c.gap) || 12;
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        grid.style.gap = `${gap}px`;
        grid.style.padding = `${gap}px`;
        // Widgets erstellen
        const widgets = Utils.safeArray(config.widgets);
        console.log("📊 Widgets:", widgets.length);
        widgets.forEach((wc, index) => {
            if (!wc)
                return;
            const widget = this._createWidget(wc);
            widget.style.setProperty("--widget-enter-delay", `${index * 60}ms`);
            widget.classList.add("widget-enter");
            // Spalten und Zeilen
            if (wc.col !== undefined) {
                widget.style.gridColumn = `${wc.col + 1}/span ${wc.colspan || 1}`;
            }
            if (wc.row !== undefined) {
                widget.style.gridRow = `${wc.row + 1}/span ${wc.rowspan || 1}`;
            }
            // Responsive
            widget.style.setProperty("--widget-priority", wc.priority || "normal");
            grid.appendChild(widget);
        });
        screen.appendChild(grid);
        // Dashboard-Info anzeigen
        if (config.show_info !== false) {
            const info = document.createElement("div");
            info.className = "dashboard-info";
            info.innerHTML = `<span>${widgets.length} Widgets</span>`;
            screen.appendChild(info);
        }
        console.log("✅ Dashboard erstellt mit", widgets.length, "Widgets");
    }
    _buildClockScreen(screen) {
        screen.innerHTML = `<div class="full-screen-center"><div id="clock-time" class="clock-time-large clock-animated">--:--</div><div id="clock-date" class="clock-date-large"></div></div>`;
        const update = () => {
            const now = new Date();
            const t = screen.querySelector("#clock-time");
            const d = screen.querySelector("#clock-date");
            if (t)
                t.textContent = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
            if (d)
                d.textContent = now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        };
        update();
        this._clockIntervals.push(setInterval(update, 1000));
    }
    _buildWeatherScreen(screen, config) {
        var _a, _b, _c, _d;
        const state = config.entity_id ? (this.app.entityStates[config.entity_id] || {}) : {};
        const visual = this._weatherVisual(state === null || state === void 0 ? void 0 : state.state, config.config || config);
        const temp = (_b = (_a = state === null || state === void 0 ? void 0 : state.attributes) === null || _a === void 0 ? void 0 : _a.temperature) !== null && _b !== void 0 ? _b : "--";
        const feels = (_d = (_c = state === null || state === void 0 ? void 0 : state.attributes) === null || _c === void 0 ? void 0 : _c.temperature) !== null && _d !== void 0 ? _d : temp;
        screen.innerHTML = `<div class="weather-screen ${visual.theme}"><div class="weather-animated-bg ${visual.animClass} ${visual.animate ? "animate" : ""}">${this._weatherFxMarkup(visual.animClass)}</div><div class="weather-screen-card"><div class="weather-hero-icon">${visual.icon}</div><div id="weather-temp" class="weather-temp-large">${temp}°C</div><div id="weather-condition" class="weather-cond-large">${visual.label}</div><div class="weather-meta-row"><span>Gefühlt</span><strong>${feels}°C</strong></div></div></div>`;
    }
    _buildCameraScreen(screen, config) {
        var _a, _b, _c, _d, _e;
        const eid = config.entity_id || ((_a = config.config) === null || _a === void 0 ? void 0 : _a.camera_entity) || config.camera_entity || "";
        const preferredSource = ((_b = config.config) === null || _b === void 0 ? void 0 : _b.camera_source) || config.camera_source || "auto";
        const liveMode = (((_c = config.config) === null || _c === void 0 ? void 0 : _c.camera_view) || config.camera_view || "still") === "live";
        const source = liveMode && preferredSource === "auto" ? "camera_proxy_stream" : preferredSource;
        const fit = ((_d = config.config) === null || _d === void 0 ? void 0 : _d.camera_fit) || config.camera_fit || "contain";
        const title = this._widgetCameraTitle(config, config.title || config.name || eid || "Kamera");
        screen.innerHTML = `<img id="camera-img" class="screen-image-contain" style="object-fit:${fit}" alt="Camera">${title ? `<div class="screen-caption">${title}</div>` : ""}`;
        const img = screen.querySelector("#camera-img");
        if (img && eid)
            this._loadCameraInto(img, eid, source);
        if (!liveMode) {
            const ms = (config.refresh_interval || ((_e = config.config) === null || _e === void 0 ? void 0 : _e.refresh_interval) || 5) * 1000;
            this._cameraIntervals.push(setInterval(() => { const ni = screen.querySelector("#camera-img"); if (ni && eid)
                this._loadCameraInto(ni, eid, source); }, ms));
        }
    }
    _buildImageScreen(screen, config) {
        const src = config.image_url || config.imageUrl || config.url || "";
        screen.innerHTML = `<div class="image-screen-wrap">${src ? `<img src="${src}" class="screen-image-contain" style="object-fit:${config.image_fit || config.background_image_size || "contain"}" alt="Image">` : `<div class="empty-state"><div class="empty-state-icon">🖼️</div><div class="empty-state-title">Kein Bild gesetzt</div></div>`}</div>`;
    }
    /* ══════════════════════════════════════════════════════════
     WIDGET FACTORY -VERBESSERT
     ══════════════════════════════════════════════════════════ */
    _createWidget(config) {
        var _a, _b, _c;
        const widget = document.createElement("div");
        const widgetType = config.type || "simple-value";
        widget.className = `widget widget-${widgetType}`;
        // Tracking
        const trackedIds = [
            config.entity_id,
            (_a = config.config) === null || _a === void 0 ? void 0 : _a.camera_entity,
            config.camera_entity,
            ...Utils.safeArray(((_b = config.config) === null || _b === void 0 ? void 0 : _b.entities) || config.entities)
        ].filter(Boolean);
        for (const tid of [...new Set(trackedIds)]) {
            if (!this._widgetElements[tid])
                this._widgetElements[tid] = [];
            this._widgetElements[tid].push({ element: widget, config });
        }
        const state = this.app.entityStates[config.entity_id] || {};
        const value = (_c = state.state) !== null && _c !== void 0 ? _c : "—";
        const attrs = state.attributes || {};
        const unit = attrs.unit_of_measurement || config.unit || "";
        const name = this._widgetName(config, attrs.friendly_name || "");
        const icon = config.icon || this._defaultIconForType(widgetType);
        // Debug
        console.log("📦 Widget erstellen:", widgetType, config.entity_id, name);
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
            case "media-player-control":
                this._renderMediaPlayerControlWidget(widget, config, state, name, icon);
                break;
            case "switch-control":
                this._renderSwitchControlWidget(widget, config, state, name, icon);
                break;
            case "light-control":
                this._renderLightControlWidget(widget, config, state, name, icon);
                break;
            case "climate-control":
                this._renderClimateControlWidget(widget, config, state, name, icon);
                break;
            case "cover-control":
                this._renderCoverControlWidget(widget, config, state, name, icon);
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
            case "web-embed":
                this._renderWebEmbedWidget(widget, config, name);
                break;
            case "text-card":
                this._renderTextCardWidget(widget, config, state, name, icon);
                break;
            case "entity-list":
                this._renderEntityListWidget(widget, config, state, name, icon);
                break;
            case "chip-row":
                this._renderChipRowWidget(widget, config, state, name, icon);
                break;
            case "divider":
                this._renderDividerWidget(widget, config, state, name, icon);
                break;
            case "spacer":
                this._renderSpacerWidget(widget, config, state, name, icon);
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
            case "candlestick-chart":
            case "histogram-chart":
            case "waterfall-chart":
            case "treemap-chart":
            case "sunburst-chart":
            case "sankey-chart":
            case "boxplot-chart":
                this._renderChartWidget(widget, config, state, name);
                break;
            case "icon-value":
                if (String(config.entity_id || "").startsWith("media_player."))
                    this._renderMediaPlayerWidget(widget, config, state, name, icon);
                else
                    this._renderIconValueWidget(widget, config, value, unit, name, icon);
                break;
            default:
                this._renderDefaultWidget(widget, config, value, unit, name, icon);
                break;
        }
        this._applyCommonWidgetStyle(widget, config);
        if (METRIC_WIDGET_TYPES.has(config.type || ""))
            this._renderMetricSparkline(widget, config);
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
        var _a, _b;
        widget.innerHTML = `<div class="w-icon"><span style="font-size:24px">${icon}</span></div><div class="w-value-wrap"><span class="w-value">${Utils.formatValue(value, { decimals: (_a = config.config) === null || _a === void 0 ? void 0 : _a.value_decimals, trimTrailingZeros: ((_b = config.config) === null || _b === void 0 ? void 0 : _b.trim_trailing_zeros) !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div>${name ? `<div class="w-name">${name}</div>` : ""}`;
        this._renderExtraEntityList(widget, config);
    }
    _renderIconValueWidget(widget, config, value, unit, name, icon) {
        var _a, _b;
        widget.innerHTML = `<div class="w-icon"><span style="font-size:28px">${icon}</span></div><div class="w-value-wrap"><span class="w-value">${Utils.formatValue(value, { decimals: (_a = config.config) === null || _a === void 0 ? void 0 : _a.value_decimals, trimTrailingZeros: ((_b = config.config) === null || _b === void 0 ? void 0 : _b.trim_trailing_zeros) !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div>${name ? `<div class="w-name">${name}</div>` : ""}`;
        this._renderExtraEntityList(widget, config);
    }
    _textCardContentToHtml(text, markdown = true) {
        const raw = Utils.text(text, "");
        if (!markdown)
            return raw.replace(/\n/g, "<br>");
        return raw
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/__(.+?)__/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(/`([^`]+)`/g, "<code>$1</code>")
            .replace(/^\s*[-•]\s+(.+)$/gm, '<div class="text-card-bullet">• $1</div>')
            .replace(/\n/g, "<br>");
    }
    _renderTextCardWidget(widget, config, state, name, icon) {
        var _a, _b;
        const cfg = (config === null || config === void 0 ? void 0 : config.config) || {};
        const title = this._widgetName(config, name || "Text");
        const bodyHtml = this._textCardContentToHtml(cfg.text_content || cfg.subtitle_text || "Text hinzufügen…", cfg.text_markdown !== false);
        const stateText = cfg.text_show_entity && config.entity_id
            ? Utils.formatStateWithUnit((_a = state === null || state === void 0 ? void 0 : state.state) !== null && _a !== void 0 ? _a : "—", ((_b = state === null || state === void 0 ? void 0 : state.attributes) === null || _b === void 0 ? void 0 : _b.unit_of_measurement) || config.unit || "", { decimals: cfg.value_decimals, trimTrailingZeros: cfg.trim_trailing_zeros !== false })
            : "";
        widget.classList.add("widget-text-card");
        widget.innerHTML = `<div class="text-card-shell">${title ? `<div class="w-name">${title}</div>` : ""}${icon ? `<div class="w-icon">${icon}</div>` : ""}<div class="text-card-body">${bodyHtml}</div>${stateText ? `<div class="widget-subvalue">${stateText}</div>` : ""}</div>`;
    }
    _renderEntityListWidget(widget, config, state, name, icon) {
        const cfg = (config === null || config === void 0 ? void 0 : config.config) || {};
        const ids = [config.entity_id, ...this._normalizeEntityIdList(cfg.entities || config.entities)]
            .filter(Boolean)
            .slice(0, Math.max(1, Number(cfg.list_max_items || 8)));
        const rows = ids.map((entityId) => {
            var _a, _b;
            const st = this.app.entityStates[entityId] || {};
            const attrs = st.attributes || {};
            const label = cfg.list_show_names === false ? "" : Utils.text(this._extraEntityMeta(config, entityId).alias || attrs.friendly_name || entityId, entityId);
            const unit = cfg.list_show_units === false ? "" : (attrs.unit_of_measurement || "");
            const val = cfg.list_show_values === false ? "" : Utils.formatStateWithUnit((_a = st.state) !== null && _a !== void 0 ? _a : "—", unit, { decimals: (_b = cfg.extra_value_decimals) !== null && _b !== void 0 ? _b : cfg.value_decimals, trimTrailingZeros: cfg.trim_trailing_zeros !== false });
            const iconHtml = cfg.list_show_icons === false ? "" : `<span class="entity-list-icon">${attrs.icon || icon || '•'}</span>`;
            return `<div class="entity-list-row ${cfg.list_dense ? 'dense' : ''}">${iconHtml}<span class="entity-list-name">${label}</span><span class="entity-list-value">${val}</span></div>`;
        }).join("");
        widget.classList.add("widget-entity-list");
        widget.innerHTML = `<div class="entity-list-shell">${name ? `<div class="w-name">${name}</div>` : ""}<div class="entity-list-wrap">${rows || `<div class="widget-subvalue">Keine Entitäten gewählt</div>`}</div></div>`;
    }
    _renderChipRowWidget(widget, config, state, name, icon) {
        const cfg = (config === null || config === void 0 ? void 0 : config.config) || {};
        const ids = [config.entity_id, ...this._normalizeEntityIdList(cfg.entities || config.entities)].filter(Boolean).slice(0, Math.max(1, Number(cfg.list_max_items || 8)));
        const chips = ids.map((entityId) => {
            var _a;
            const st = this.app.entityStates[entityId] || {};
            const attrs = st.attributes || {};
            const label = cfg.chip_show_names === false ? "" : Utils.text(this._extraEntityMeta(config, entityId).alias || attrs.friendly_name || entityId, entityId);
            const valueText = cfg.chip_show_values === false ? "" : Utils.text((_a = st.state) !== null && _a !== void 0 ? _a : "—", "—");
            const iconHtml = cfg.chip_show_icons === false ? "" : `<span class="chip-row-icon">${attrs.icon || icon || '•'}</span>`;
            return `<span class="chip-row-chip ${cfg.chip_style || 'glass'}">${iconHtml}${label ? `<span class="chip-row-label">${label}</span>` : ''}${valueText ? `<span class="chip-row-value">${valueText}</span>` : ''}</span>`;
        }).join("");
        widget.classList.add("widget-chip-row");
        widget.innerHTML = `<div class="chip-row-shell">${name ? `<div class="w-name">${name}</div>` : ""}<div class="chip-row-wrap ${cfg.chip_wrap === false ? 'nowrap' : 'wrap'}">${chips || `<span class="chip-row-chip outline">Keine Entitäten</span>`}</div></div>`;
    }
    _renderDividerWidget(widget, config, state, name, icon) {
        const cfg = (config === null || config === void 0 ? void 0 : config.config) || {};
        const label = Utils.text(cfg.divider_label || name || config.name || "", "");
        const align = cfg.divider_align || "center";
        const style = cfg.divider_style || "solid";
        const thickness = Math.max(1, Number(cfg.divider_thickness || 1));
        const color = cfg.divider_color || config.text_color || config.textColor || "rgba(255,255,255,.24)";
        widget.classList.add("widget-divider");
        widget.innerHTML = `<div class="divider-shell ${align} ${style}" style="--divider-thickness:${thickness}px;--divider-color:${color};">${label ? `<span class="divider-label">${label}</span>` : ''}</div>`;
    }
    _renderSpacerWidget(widget, config) {
        widget.classList.add("widget-spacer");
        widget.innerHTML = `<div class="spacer-shell"><span>Spacer</span></div>`;
    }
    _renderMediaPlayerWidget(widget, config, state, name, icon) {
        const attrs = (state === null || state === void 0 ? void 0 : state.attributes) || {};
        const cover = attrs.entity_picture || "";
        const title = Utils.text(attrs.media_title || (state === null || state === void 0 ? void 0 : state.state) || "—");
        const subtitle = Utils.text(attrs.media_artist || attrs.source || attrs.friendly_name || "");
        const progress = Number(attrs.media_duration || 0) > 0 ? Math.max(0, Math.min(100, ((Number(attrs.media_position || 0) / Number(attrs.media_duration || 1)) * 100))) : 0;
        const vol = Math.round(Number(attrs.volume_level || 0) * 100);
        widget.classList.add("widget-media-modern");
        widget.innerHTML = `<div class="media-widget-shell">${cover ? `<img class="media-widget-cover" src="${cover}" alt="Cover">` : `<div class="media-widget-cover placeholder">${icon || "🎵"}</div>`}<div class="media-widget-meta">${name ? `<div class="w-name">${name}</div>` : ""}<div class="media-widget-title">${title}</div><div class="media-widget-subtitle">${subtitle}</div><div class="media-widget-state-row"><div class="media-widget-state">${Utils.text((state === null || state === void 0 ? void 0 : state.state) || "—")}</div><div class="media-widget-vol">🔊 ${vol}%</div></div><div class="media-widget-progress"><span style="width:${progress}%"></span></div><div class="media-widget-controls"><span>⏮</span><span>⏯</span><span>⏭</span></div></div></div>`;
        this._renderExtraEntityList(widget, config);
    }
    _controlDisplayOptions(config = {}) {
        const cfg = (config === null || config === void 0 ? void 0 : config.config) || {};
        return {
            layout: cfg.control_layout || "compact",
            showIcon: cfg.control_show_icon !== false,
            showName: cfg.control_show_name !== false && cfg.show_name !== false,
            showValue: cfg.control_show_value !== false,
            showSub: cfg.control_show_sub !== false,
            showMeter: cfg.control_show_meter !== false,
            showStatusChip: cfg.control_show_status_chip !== false,
            showToggleBadge: cfg.control_show_toggle_badge !== false && (config === null || config === void 0 ? void 0 : config.toggle_badge) !== false,
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
        const rgb = Utils.safeArray((attrs === null || attrs === void 0 ? void 0 : attrs.rgb_color) || []);
        if (rgb.length >= 3) {
            return `background:linear-gradient(135deg, rgba(${rgb[0]},${rgb[1]},${rgb[2]},.42), rgba(126,87,194,.18)); box-shadow:0 12px 24px rgba(0,0,0,.22), 0 0 0 1px rgba(${rgb[0]},${rgb[1]},${rgb[2]},.24) inset;`;
        }
        return "";
    }
    _controlSummary(config, state, name, icon) {
        var _a, _b, _c, _d, _e, _f;
        const entityId = this._resolvePrimaryEntityId(config, state);
        const domain = String(entityId || "").split(".")[0] || "switch";
        const attrs = (state === null || state === void 0 ? void 0 : state.attributes) || {};
        const rawState = String((state === null || state === void 0 ? void 0 : state.state) || "off");
        const active = Utils.isTruthyState(rawState) || rawState === "open" || rawState === "opening" || rawState === "playing";
        const friendly = Utils.text(name || attrs.friendly_name || entityId || domain || "Widget");
        const summary = {
            domain,
            entityId,
            name: friendly,
            icon: icon || this._defaultIconForType(config === null || config === void 0 ? void 0 : config.type),
            active,
            value: Utils.text((state === null || state === void 0 ? void 0 : state.state) || "—"),
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
            summary.value = Utils.text(attrs.media_title || (state === null || state === void 0 ? void 0 : state.state) || "—");
            summary.sub = Utils.text(attrs.media_artist || attrs.source || attrs.friendly_name || "");
            summary.meter = progress;
            summary.chip = `🔊 ${Math.round(Number(attrs.volume_level || 0) * 100)}%`;
            summary.chipClass = summary.active ? "on" : "off";
            return summary;
        }
        if (domain === "light") {
            const brightness = attrs.brightness == null ? (active ? 100 : 0) : Math.round((Number(attrs.brightness || 0) / 255) * 100);
            summary.value = active ? `${brightness}%` : "Aus";
            summary.sub = Utils.text(attrs.effect || attrs.color_mode || ((_a = attrs.supported_color_modes) === null || _a === void 0 ? void 0 : _a[0]) || "Licht");
            summary.meter = Math.max(0, Math.min(100, brightness));
            summary.chip = active ? "Licht an" : "Aus";
            summary.chipClass = active ? "on" : "off";
            summary.iconStyle = this._controlIconTint(attrs);
            return summary;
        }
        if (domain === "climate") {
            const currentTemp = (_b = attrs.current_temperature) !== null && _b !== void 0 ? _b : "—";
            const targetTemp = (_e = (_d = (_c = attrs.temperature) !== null && _c !== void 0 ? _c : attrs.target_temp_high) !== null && _d !== void 0 ? _d : attrs.target_temp_low) !== null && _e !== void 0 ? _e : "—";
            const mode = Utils.text((state === null || state === void 0 ? void 0 : state.state) || attrs.hvac_mode || "—");
            summary.value = `${Utils.text(currentTemp)}°C`;
            summary.sub = `Soll ${Utils.text(targetTemp)}°C · ${mode}`;
            summary.meter = Number.isFinite(Number(targetTemp)) ? Math.max(0, Math.min(100, (Number(targetTemp) / 30) * 100)) : 0;
            summary.chip = mode;
            summary.chipClass = String(mode).toLowerCase() === "off" ? "off" : "on";
            return summary;
        }
        if (domain === "cover") {
            const pos = (_f = attrs.current_position) !== null && _f !== void 0 ? _f : attrs.position;
            const pct = Number.isFinite(Number(pos)) ? Math.max(0, Math.min(100, Number(pos))) : 0;
            const stateText = Utils.text((state === null || state === void 0 ? void 0 : state.state) || (pct > 0 ? "open" : "closed"));
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
        if (summary.cover)
            return `<img class="td-control-icon td-control-cover ${summary.active ? "active" : ""}" src="${summary.cover}" alt="Cover">`;
        return `<div class="td-control-icon ${summary.active ? "active" : ""}" ${summary.iconStyle ? `style="${summary.iconStyle}"` : ""}>${summary.icon || "🎛️"}</div>`;
    }
    _controlQuickActions(config, state, summary) {
        const domainFromEntity = String(this._resolvePrimaryEntityId(config, state) || "").split(".")[0] || "";
        const domain = domainFromEntity || this._controlDomainFallback(config === null || config === void 0 ? void 0 : config.type);
        const attrs = (state === null || state === void 0 ? void 0 : state.attributes) || {};
        const actions = [];
        if (domain === "media_player") {
            actions.push({ key: "playpause", label: summary.active ? "Pause" : "Play", title: "Play / Pause", style: "primary", grow: true }, { key: "next", label: "Weiter", title: "Weiter", style: "ghost" }, { key: "stop", label: "Stopp", title: "Wiedergabe stoppen", style: "ghost" }, { key: "details", label: "Öffnen", title: "Popup öffnen", style: "ghost" });
        }
        else if (["switch", "input_boolean", "fan", "valve"].includes(domain)) {
            actions.push({ key: "toggle", label: summary.active ? "Ausschalten" : "Einschalten", title: "Umschalten", style: "primary", grow: true }, { key: "details", label: "Öffnen", title: "Popup öffnen", style: "ghost" });
            if (domain === "fan") {
                [25, 50, 100].forEach((pct) => actions.push({ key: `fan-${pct}`, label: `${pct}%`, title: `${pct}%`, style: Number(attrs.percentage || 0) === pct ? "active" : "ghost" }));
            }
        }
        else if (domain === "light") {
            actions.push({ key: "toggle", label: summary.active ? "Aus" : "Ein", title: "Licht schalten", style: "primary", grow: true }, { key: "brightness-down", label: "−", title: "Dunkler", style: "ghost" }, { key: "brightness-up", label: "+", title: "Heller", style: "ghost" }, { key: "details", label: "Öffnen", title: "Popup öffnen", style: "ghost" });
        }
        else if (domain === "cover") {
            actions.push({ key: "open", label: "Öffnen", title: "Öffnen", style: "ghost" }, { key: "stop", label: "Stopp", title: "Stopp", style: "primary" }, { key: "close", label: "Schließen", title: "Schließen", style: "ghost" }, { key: "details", label: "Öffnen", title: "Popup öffnen", style: "ghost", grow: true });
        }
        else if (domain === "climate") {
            actions.push({ key: "temp-down", label: "−1°", title: "Temperatur senken", style: "ghost" }, { key: "temp-up", label: "+1°", title: "Temperatur erhöhen", style: "primary" }, { key: "details", label: "Öffnen", title: "Popup öffnen", style: "ghost", grow: true });
        }
        return actions;
    }
    _resolvePrimaryEntityId(config, state = null) {
        var _a, _b;
        const candidates = [
            config === null || config === void 0 ? void 0 : config.tap_target_entity,
            config === null || config === void 0 ? void 0 : config.entity_id,
            (_a = config === null || config === void 0 ? void 0 : config.config) === null || _a === void 0 ? void 0 : _a.entity_id,
            ...(Array.isArray((_b = config === null || config === void 0 ? void 0 : config.config) === null || _b === void 0 ? void 0 : _b.entities) ? config.config.entities : []),
            ...(Array.isArray(config === null || config === void 0 ? void 0 : config.entities) ? config.entities : []),
            state === null || state === void 0 ? void 0 : state.entity_id,
        ].filter(Boolean);
        return String(candidates[0] || "").trim();
    }
    _controlDomainFallback(type) {
        const mapping = {
            "media-player-control": "media_player",
            "switch-control": "switch",
            "light-control": "light",
            "climate-control": "climate",
            "cover-control": "cover",
        };
        return mapping[String(type || "")] || "";
    }
    async _loadHaMediaItems(kind = "audio", limit = 24) {
        try {
            return await this.app.dataManager._fetchJson(`/api/ha-media/items?kind=${encodeURIComponent(kind)}&limit=${encodeURIComponent(limit)}`);
        }
        catch (e) {
            console.warn("ha media item loading failed", e);
            return [];
        }
    }
    async _renderHaMediaSources(host, entityId, close) {
        if (!host || !entityId)
            return;
        host.innerHTML = `<div class="popup-loading">Lade Medienquellen …</div>`;
        const items = await this._loadHaMediaItems("audio", 24);
        if (!Array.isArray(items) || !items.length) {
            host.innerHTML = `<div class="popup-empty">Keine Audio-Medienquellen gefunden</div>`;
            return;
        }
        const buttons = items.map((item) => {
            const title = Utils.text((item === null || item === void 0 ? void 0 : item.title) || (item === null || item === void 0 ? void 0 : item.path) || (item === null || item === void 0 ? void 0 : item.media_content_id) || "Medium");
            const sub = Utils.text((item === null || item === void 0 ? void 0 : item.path) || (item === null || item === void 0 ? void 0 : item.media_class) || "Medienquelle");
            const mediaId = Utils.text((item === null || item === void 0 ? void 0 : item.media_content_id) || (item === null || item === void 0 ? void 0 : item.id) || "");
            return `<button class="popup-control-btn popup-media-source-btn" type="button" data-media-id="${mediaId}" title="${sub}"><span>${title}</span><small>${sub}</small></button>`;
        }).join("");
        host.innerHTML = `<div class="popup-controls popup-media-source-grid">${buttons}</div>`;
        host.querySelectorAll("[data-media-id]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const mediaId = btn.getAttribute("data-media-id") || "";
                if (!mediaId)
                    return;
                btn.disabled = true;
                try {
                    await this.app.callEntityService("media_player", "play_media", {
                        entity_id: entityId,
                        media_content_id: mediaId,
                        media_content_type: "music",
                    });
                    close === null || close === void 0 ? void 0 : close();
                }
                catch (err) {
                    console.warn("media source play failed", mediaId, err);
                }
                finally {
                    btn.disabled = false;
                }
            });
        });
    }
    _controlQuickActionsMarkup(config, state, summary, compact = false) {
        const actions = this._controlQuickActions(config, state, summary);
        if (!actions.length)
            return compact ? `<div class="td-control-actions compact"><button class="td-control-action ghost grow" data-action="details" type="button">Details</button></div>` : "";
        const visible = compact ? actions.filter((action, index) => index < 1 || action.key === "details") : actions.filter((action, index) => index < 3 || action.key === "details");
        return `<div class="td-control-actions ${compact ? "compact" : ""}">${visible.map((action) => `<button class="td-control-action ${action.style || "ghost"} ${action.grow ? "grow" : ""}" type="button" data-action="${action.key}" title="${action.title || action.label}">${action.label}</button>`).join("")}</div>`;
    }
    async _handleControlQuickAction(config, state, action) {
        var _a, _b, _c, _d;
        const entityId = (config === null || config === void 0 ? void 0 : config.entity_id) || "";
        if (!entityId || !action)
            return;
        const domain = String(entityId).split(".")[0] || this._controlDomainFallback(config === null || config === void 0 ? void 0 : config.type);
        const attrs = (state === null || state === void 0 ? void 0 : state.attributes) || {};
        if (action === "details") {
            this._openWidgetPopup(config);
            return;
        }
        if (domain === "media_player") {
            if (action === "prev")
                return this.app.callEntityService("media_player", "media_previous_track", { entity_id: entityId });
            if (action === "playpause")
                return this.app.callEntityService("media_player", "media_play_pause", { entity_id: entityId });
            if (action === "next")
                return this.app.callEntityService("media_player", "media_next_track", { entity_id: entityId });
            if (action === "stop")
                return this.app.callEntityService("media_player", "media_stop", { entity_id: entityId });
            if (action === "vol-down")
                return this.app.callEntityService("media_player", "volume_set", { entity_id: entityId, volume_level: Math.max(0, Number((_a = attrs.volume_level) !== null && _a !== void 0 ? _a : 0) - 0.1) });
            if (action === "vol-up")
                return this.app.callEntityService("media_player", "volume_set", { entity_id: entityId, volume_level: Math.min(1, Number((_b = attrs.volume_level) !== null && _b !== void 0 ? _b : 0) + 0.1) });
        }
        if (["switch", "input_boolean", "fan", "valve", "light"].includes(domain) && action === "toggle")
            return this._invokeToggleAction(entityId, "toggle");
        if (domain === "fan" && action.startsWith("fan-")) {
            const pct = Number(action.split("-")[1]);
            if (Number.isFinite(pct))
                return this.app.callEntityService("fan", "set_percentage", { entity_id: entityId, percentage: pct });
        }
        if (domain === "light") {
            const currentBri = Math.round((Number((_c = attrs.brightness) !== null && _c !== void 0 ? _c : (Utils.isTruthyState(state === null || state === void 0 ? void 0 : state.state) ? 255 : 0)) / 255) * 100);
            if (action === "brightness-down")
                return this.app.callEntityService("light", "turn_on", { entity_id: entityId, brightness_pct: Math.max(1, currentBri - 15) });
            if (action === "brightness-up")
                return this.app.callEntityService("light", "turn_on", { entity_id: entityId, brightness_pct: Math.min(100, currentBri + 15) });
        }
        if (domain === "cover") {
            if (action === "open")
                return this.app.callEntityService("cover", "open_cover", { entity_id: entityId });
            if (action === "stop")
                return this.app.callEntityService("cover", "stop_cover", { entity_id: entityId });
            if (action === "close")
                return this.app.callEntityService("cover", "close_cover", { entity_id: entityId });
        }
        if (domain === "climate") {
            const temperature = Number((_d = attrs.temperature) !== null && _d !== void 0 ? _d : 20);
            if (action === "temp-down")
                return this.app.callEntityService("climate", "set_temperature", { entity_id: entityId, temperature: temperature - 1 });
            if (action === "temp-up")
                return this.app.callEntityService("climate", "set_temperature", { entity_id: entityId, temperature: temperature + 1 });
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
                }
                catch (err) {
                    console.warn("control quick action failed", config === null || config === void 0 ? void 0 : config.entity_id, btn.dataset.action, err);
                }
                finally {
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
        const attrs = (state === null || state === void 0 ? void 0 : state.attributes) || {};
        const progress = Number(attrs.media_duration || 0) > 0 ? Math.max(0, Math.min(100, ((Number(attrs.media_position || 0) / Number(attrs.media_duration || 1)) * 100))) : 0;
        widget.classList.remove("widget-media-modern");
        widget.classList.add("widget-control-card", "widget-media-horizontal");
        const cover = summary.cover ? `<img class="td-media-side-cover" src="${summary.cover}" alt="Cover">` : `<div class="td-media-side-cover placeholder">${icon || "🎵"}</div>`;
        widget.innerHTML = `<div class="td-media-side-shell"><div class="td-media-side-art">${cover}</div><div class="td-media-side-main"><div class="td-media-side-top"><div class="td-media-side-text"><div class="td-media-side-name">${summary.name}</div><div class="td-media-side-title">${summary.value}</div><div class="td-media-side-sub">${summary.sub || Utils.text((state === null || state === void 0 ? void 0 : state.state) || "—")}</div></div><div class="td-media-side-chip">${summary.chip}</div></div><div class="td-media-side-progress"><span style="width:${progress}%"></span></div><div class="td-media-side-actions"><button class="td-control-action ghost" type="button" data-action="prev">⏮</button><button class="td-control-action primary grow" type="button" data-action="playpause">${summary.active ? "Pause" : "Play"}</button><button class="td-control-action ghost" type="button" data-action="next">⏭</button><button class="td-control-action ghost" type="button" data-action="details">Öffnen</button></div></div></div>`;
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
        var _a, _b, _c, _d, _e, _f, _g;
        const min = (_b = (_a = config.config) === null || _a === void 0 ? void 0 : _a.min) !== null && _b !== void 0 ? _b : 0;
        const max = (_d = (_c = config.config) === null || _c === void 0 ? void 0 : _c.max) !== null && _d !== void 0 ? _d : 100;
        const nv = Utils.toNumber(value, 0);
        const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
        const color = this._getZoneColor(nv, (_e = config.config) === null || _e === void 0 ? void 0 : _e.zones);
        widget.innerHTML = `<svg viewBox="0 0 200 130" class="gauge-svg"><defs><linearGradient id="gauge-grad-${Math.round(pct)}" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${color}" stop-opacity="0.6"/><stop offset="100%" stop-color="${color}" stop-opacity="1"/></linearGradient></defs><path d="M 20 120 A 80 80 0 0 1 180 120" class="gauge-arc-bg"></path><path d="M 20 120 A 80 80 0 0 1 180 120" class="gauge-arc-value gauge-arc-animated" stroke="url(#gauge-grad-${Math.round(pct)})" stroke-dasharray="${pct * 2.51} 251"></path><text x="100" y="95" class="gauge-text-value">${Utils.formatStateWithUnit(nv, unit, { decimals: (_f = config.config) === null || _f === void 0 ? void 0 : _f.value_decimals, trimTrailingZeros: ((_g = config.config) === null || _g === void 0 ? void 0 : _g.trim_trailing_zeros) !== false })}</text><text x="100" y="118" class="gauge-text-label">${name}</text></svg>`;
        this._renderExtraEntityList(widget, config);
    }
    _renderProgressBarWidget(widget, config, value, unit, name) {
        var _a, _b, _c, _d, _e, _f, _g;
        const min = (_b = (_a = config.config) === null || _a === void 0 ? void 0 : _a.min) !== null && _b !== void 0 ? _b : 0;
        const max = (_d = (_c = config.config) === null || _c === void 0 ? void 0 : _c.max) !== null && _d !== void 0 ? _d : 100;
        const nv = Utils.toNumber(value, 0);
        const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
        const color = ((_e = config.config) === null || _e === void 0 ? void 0 : _e.color) || "var(--td-accent)";
        widget.innerHTML = `${name ? `<div class="w-name" style="margin-bottom:4px">${name}</div>` : ""}<div><span class="w-value">${Utils.formatValue(nv, { decimals: (_f = config.config) === null || _f === void 0 ? void 0 : _f.value_decimals, trimTrailingZeros: ((_g = config.config) === null || _g === void 0 ? void 0 : _g.trim_trailing_zeros) !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div><div class="progress-container"><div class="progress-fill progress-animated" style="width:${pct}%;background:${color}"></div></div>`;
        this._renderExtraEntityList(widget, config);
    }
    _renderStatusDotWidget(widget, config, value, name) {
        const isOn = Utils.isTruthyState(value);
        const color = isOn ? "var(--td-positive)" : "var(--td-text-secondary)";
        widget.innerHTML = `<div class="status-dot-indicator ${isOn ? "on" : ""} status-dot-animated" style="background:${color};color:${color}"></div>${name ? `<div class="w-name">${name}</div>` : ""}<div class="widget-subvalue">${Utils.text(value)}</div>`;
        this._renderExtraEntityList(widget, config);
    }
    _renderTrendArrowWidget(widget, config, state, name, icon) {
        var _a, _b, _c, _d, _e, _f, _g;
        const current = Utils.toNumber(state === null || state === void 0 ? void 0 : state.state, null);
        const previous = Utils.toNumber((_b = (_a = this.app.previousEntityStates) === null || _a === void 0 ? void 0 : _a[config.entity_id]) === null || _b === void 0 ? void 0 : _b.state, null);
        const diff = (Number.isFinite(current) && Number.isFinite(previous)) ? current - previous : 0;
        const direction = diff > 0 ? "up" : (diff < 0 ? "down" : "flat");
        const arrow = direction === "up" ? "▲" : (direction === "down" ? "▼" : "▶");
        const trendColor = direction === "up" ? "var(--td-positive)" : (direction === "down" ? "var(--td-danger)" : "var(--td-warning)");
        const unit = ((_c = state === null || state === void 0 ? void 0 : state.attributes) === null || _c === void 0 ? void 0 : _c.unit_of_measurement) || config.unit || "";
        widget.classList.add("widget-trend-arrow");
        widget.innerHTML = `<div class="w-icon trend-arrow-icon"><span style="font-size:24px">${icon}</span></div><div class="trend-main"><div><span class="w-value">${Utils.formatValue((_d = state === null || state === void 0 ? void 0 : state.state) !== null && _d !== void 0 ? _d : "—", { decimals: (_e = config.config) === null || _e === void 0 ? void 0 : _e.value_decimals, trimTrailingZeros: ((_f = config.config) === null || _f === void 0 ? void 0 : _f.trim_trailing_zeros) !== false })}</span><span class="w-unit">${unit ? ` ${unit}` : ''}</span></div><div class="trend-arrow-chip ${direction} trend-chip-animated" style="color:${trendColor}">${arrow} <span class="trend-delta">${Number.isFinite(diff) ? (diff > 0 ? '+' : '') + diff.toFixed(1) : '0.0'}${unit}</span></div></div><div class="w-name">${name || ((_g = state === null || state === void 0 ? void 0 : state.attributes) === null || _g === void 0 ? void 0 : _g.friendly_name) || config.entity_id || 'Trend'}</div>`;
        this._renderExtraEntityList(widget, config);
    }
    _renderCameraWidget(widget, config, name) {
        var _a, _b, _c, _d, _e;
        widget.classList.add("widget-camera");
        const eid = config.entity_id || ((_a = config.config) === null || _a === void 0 ? void 0 : _a.camera_entity) || config.camera_entity || "";
        const preferredSource = ((_b = config.config) === null || _b === void 0 ? void 0 : _b.camera_source) || config.camera_source || "auto";
        const liveMode = (((_c = config.config) === null || _c === void 0 ? void 0 : _c.camera_view) || config.camera_view || "still") === "live";
        const source = liveMode && preferredSource === "auto" ? "camera_proxy_stream" : preferredSource;
        const fit = ((_d = config.config) === null || _d === void 0 ? void 0 : _d.camera_fit) || config.camera_fit || "cover";
        const title = this._widgetCameraTitle(config, name || eid);
        widget.innerHTML = `<img alt="Camera" class="widget-camera-image" style="object-fit:${fit}">${title ? `<div class="camera-overlay">${title}</div>` : ""}`;
        const img = widget.querySelector("img");
        if (img && eid)
            this._loadCameraInto(img, eid, source);
        if (!liveMode) {
            const ms = (((_e = config.config) === null || _e === void 0 ? void 0 : _e.refresh_interval) || 5) * 1000;
            this._cameraIntervals.push(setInterval(() => { const ni = widget.querySelector("img"); if (ni && eid)
                this._loadCameraInto(ni, eid, source); }, ms));
        }
    }
    _renderWeatherWidget(widget, config, state) {
        var _a;
        const attrs = (state === null || state === void 0 ? void 0 : state.attributes) || {};
        const temp = (_a = attrs.temperature) !== null && _a !== void 0 ? _a : "—";
        const condition = (state === null || state === void 0 ? void 0 : state.state) || "—";
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
            if (t)
                t.textContent = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
            if (d)
                d.textContent = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
        };
        update();
        this._clockIntervals.push(setInterval(update, 1000));
    }
    _renderCountdownWidget(widget, config) {
        const target = config.target_date || config.targetDate || config.date || null;
        widget.innerHTML = `<div class="w-icon"><span style="font-size:24px">⏱️</span></div><div><span class="w-value js-countdown-value countdown-animated">--</span></div>${this._widgetName(config, "Countdown") ? `<div class="w-name">${this._widgetName(config, "Countdown")}</div>` : ""}`;
        const update = () => {
            const el = widget.querySelector(".js-countdown-value");
            if (!el || !target) {
                if (el)
                    el.textContent = "—";
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
        var _a;
        const value = config.text || config.value || config.qr_value || config.qrValue || "QR";
        widget.classList.add("widget-qr");
        const holder = document.createElement("div");
        holder.className = "widget-qr-holder";
        widget.appendChild(holder);
        if ((_a = window.QRCode) === null || _a === void 0 ? void 0 : _a.toString) {
            window.QRCode.toString(value, { width: 192 }).then(svg => { holder.innerHTML = svg; }).catch(() => { holder.innerHTML = `<div class="qr-fallback">QR</div>`; });
        }
        else {
            holder.innerHTML = `<div class="qr-fallback">QR</div>`;
        }
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
    _renderWebEmbedWidget(widget, config, name) {
        widget.classList.add("widget-web-embed");
        const cfg = config.config || {};
        const rawUrl = String(cfg.embed_url || cfg.page_url || "/lovelace").trim();
        const isExternal = /^https?:\/\//i.test(rawUrl);
        const normalizedPath = isExternal ? rawUrl : (rawUrl.startsWith('/') ? rawUrl : `/${rawUrl.replace(/^\/+/, '')}`);
        const kiosk = cfg.embed_kiosk !== false;
        const embedUrl = !isExternal && kiosk ? this._applyHaEmbedKiosk(normalizedPath) : normalizedPath;
        const height = Math.max(140, Math.min(Number(cfg.embed_height || 350), 2000));
        const interactive = cfg.embed_interactive !== false;
        const fullscreen = cfg.embed_fullscreen !== false;
        const title = fullscreen ? "" : this._widgetName(config, name || cfg.embed_title || "Webseite / Einbettung");
        widget.classList.toggle("is-fullscreen-embed", fullscreen);
        const iframeStyle = fullscreen
            ? `width:100%;height:100%;border:0;border-radius:0;background:#0b1220;pointer-events:${interactive ? 'auto' : 'none'};`
            : `width:100%;height:${height}px;border:0;border-radius:14px;background:#0b1220;pointer-events:${interactive ? 'auto' : 'none'};`;
        widget.innerHTML = `${title ? `<div class="w-name">${title}</div>` : ""}<div class="widget-web-embed-frame-wrap ${interactive ? 'interactive' : 'locked'} ${fullscreen ? 'fullscreen' : ''}"><iframe class="widget-web-embed-frame" src="${embedUrl}" style="${iframeStyle}" loading="lazy"></iframe>${interactive ? '' : '<div class="widget-web-embed-overlay">Vorschau</div>'}</div>`;
        const iframe = widget.querySelector('.widget-web-embed-frame');
        if (iframe && kiosk && !isExternal) {
            const hideUi = () => this._applyHaEmbedKioskStyles(iframe);
            iframe.addEventListener('load', hideUi);
            window.setTimeout(hideUi, 1200);
        }
    }
    _applyHaEmbedKiosk(path) {
        try {
            const base = window.location.origin || '';
            const url = new URL(path, base);
            if (!url.searchParams.has('kiosk'))
                url.searchParams.set('kiosk', '1');
            if (!url.searchParams.has('hide_header'))
                url.searchParams.set('hide_header', '1');
            if (!url.searchParams.has('hide_sidebar'))
                url.searchParams.set('hide_sidebar', '1');
            if (!url.searchParams.has('embed'))
                url.searchParams.set('embed', '1');
            return `${url.pathname}${url.search}${url.hash}`;
        }
        catch (_err) {
            return path;
        }
    }
    _applyHaEmbedKioskStyles(iframe) {
        var _a, _b, _c;
        try {
            const doc = (iframe === null || iframe === void 0 ? void 0 : iframe.contentDocument) || ((_a = iframe === null || iframe === void 0 ? void 0 : iframe.contentWindow) === null || _a === void 0 ? void 0 : _a.document);
            if (!doc || !doc.head)
                return;
            if (doc.getElementById('td-kiosk-style'))
                return;
            const style = doc.createElement('style');
            style.id = 'td-kiosk-style';
            style.textContent = `
        app-header, app-toolbar, ha-top-app-bar-fixed, ha-drawer, partial-panel-resolver > app-drawer-layout > [slot="drawer"],
        .toolbar, .header, .mdc-top-app-bar, hui-masonry-view > .header, hui-panel-view > .header,
        ha-menu-button, ha-sidebar, paper-drawer-panel [drawer], mwc-drawer, .edit-mode-toolbar {
          display: none !important;
          visibility: hidden !important;
          max-height: 0 !important;
        }
        home-assistant, home-assistant-main, app-drawer-layout, partial-panel-resolver, ha-panel-lovelace, hui-root, ha-app-layout {
          --app-header-height: 0px !important;
          --mdc-top-app-bar-height: 0px !important;
        }
        ha-panel-lovelace, hui-root, .view, .container, main, #view, #root, body {
          margin-top: 0 !important;
          padding-top: 0 !important;
          top: 0 !important;
        }
      `;
            doc.head.appendChild(style);
            (_c = (_b = doc.body) === null || _b === void 0 ? void 0 : _b.classList) === null || _c === void 0 ? void 0 : _c.add('td-kiosk-embed');
        }
        catch (_err) { }
    }
    // ══════════════════════════════════════════════════════════
    // TEIL 2 – ScreenManager Fortsetzung: Charts, Updates, Interactions
    // ══════════════════════════════════════════════════════════
    /* ────── Chart Widget ────── */
    _renderChartWidget(widget, config, state, name) {
        var _a, _b, _c, _d;
        const unit = ((_a = state === null || state === void 0 ? void 0 : state.attributes) === null || _a === void 0 ? void 0 : _a.unit_of_measurement) || config.unit || "";
        const title = this._widgetName(config, name || ((_b = state === null || state === void 0 ? void 0 : state.attributes) === null || _b === void 0 ? void 0 : _b.friendly_name) || config.entity_id || config.type || "Chart");
        widget.classList.add("widget-chart");
        widget.innerHTML = `<div class="chart-header"><div class="chart-title">${title}</div><div class="chart-value chart-value-animated">${Utils.formatValue(state === null || state === void 0 ? void 0 : state.state, { decimals: (_c = config.config) === null || _c === void 0 ? void 0 : _c.value_decimals, trimTrailingZeros: ((_d = config.config) === null || _d === void 0 ? void 0 : _d.trim_trailing_zeros) !== false })}${unit ? `<span class="chart-unit"> ${unit}</span>` : ""}</div></div><div class="chart-body"><canvas class="chart-canvas"></canvas></div><div class="chart-type-badge">${CHART_TYPE_ICONS[config.type] || "📊"} ${config.type || "chart"}</div>`;
        this._renderExtraEntityList(widget, config);
        const canvas = widget.querySelector(".chart-canvas");
        if (!canvas || !window.Chart) {
            if (!window.Chart)
                console.warn("⚠️ Chart.js nicht geladen!");
            return;
        }
        this._scheduleChartBuild(widget, canvas, config, state);
    }
    _scheduleChartBuild(element, canvas, config, state, attempt = 0) {
        clearTimeout(element._chartBuildTimer);
        element._chartBuildTimer = setTimeout(() => {
            if (!document.body.contains(canvas))
                return;
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
        if (element === null || element === void 0 ? void 0 : element._chartInstance) {
            try {
                element._chartInstance.destroy();
            }
            catch (e) { }
            element._chartInstance = null;
        }
    }
    async _buildChart(canvas, config, state, element = null) {
        var _a, _b, _c, _d, _e;
        try {
            const entityIds = this._chartEntityIds(config);
            const useHistory = ((_a = config.config) === null || _a === void 0 ? void 0 : _a.chart_use_history) !== false;
            const hours = ((_b = config.config) === null || _b === void 0 ? void 0 : _b.hours) || ((_c = config.config) === null || _c === void 0 ? void 0 : _c.period) || 24;
            const maxPoints = ((_d = config.config) === null || _d === void 0 ? void 0 : _d.chart_mobile_compact) ? 20 : (((_e = config.config) === null || _e === void 0 ? void 0 : _e.chart_max_points) || 36);
            const histories = await Promise.all(entityIds.map(async (entityId) => {
                const liveState = this.app.entityStates[entityId] || (entityId === config.entity_id ? state : null) || {};
                let points = [];
                if (entityId && useHistory) {
                    const history = await this.app.dataManager.fetchHistory(entityId, hours);
                    points = this._normalizePoints(history === null || history === void 0 ? void 0 : history.data, liveState === null || liveState === void 0 ? void 0 : liveState.state);
                }
                else {
                    points = this._normalizePoints([], liveState === null || liveState === void 0 ? void 0 : liveState.state);
                }
                points = this._chartSamplePoints(points, maxPoints);
                return { entityId, state: liveState, points, meta: this._extraEntityMeta(config, entityId) };
            }));
            const primary = histories[0] || { state: state || {}, points: this._normalizePoints([], state === null || state === void 0 ? void 0 : state.state), meta: this._extraEntityMeta(config, config.entity_id || "") };
            const maxLen = Math.max(...histories.map(e => e.points.length), primary.points.length, 1);
            const labels = Array.from({ length: maxLen }, (_, idx) => {
                const point = primary.points[idx] || primary.points[primary.points.length - 1] || { x: new Date().toISOString() };
                return Utils.shortDateTime(point.x);
            });
            const type = config.type || "mini-graph";
            const chartCfg = this._getChartConfig(type, histories, labels, config);
            try {
                const existing = Chart.getChart ? Chart.getChart(canvas) : null;
                if (existing)
                    existing.destroy();
            }
            catch (e) { }
            try {
                if (canvas._chartInstance && typeof canvas._chartInstance.destroy === "function")
                    canvas._chartInstance.destroy();
            }
            catch (e) { }
            const chart = new Chart(canvas, chartCfg);
            canvas._chartInstance = chart;
            canvas.dataset.chartType = type;
            canvas.dataset.entityIds = JSON.stringify(entityIds);
            if (element)
                element._chartInstance = chart;
            this._chartInstances.push(chart);
        }
        catch (e) {
            console.error("❌ Chart build failed:", e);
        }
    }
    _getChartConfig(type, histories, labels, config) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23;
        const showLegend = ((_a = config.config) === null || _a === void 0 ? void 0 : _a.chart_show_legend) !== false;
        const showAxes = ((_b = config.config) === null || _b === void 0 ? void 0 : _b.chart_show_axes) !== false;
        const showGrid = ((_c = config.config) === null || _c === void 0 ? void 0 : _c.chart_show_grid) !== false;
        const showPoints = ((_d = config.config) === null || _d === void 0 ? void 0 : _d.chart_show_points) !== false;
        const lineWidth = Number(((_e = config.config) === null || _e === void 0 ? void 0 : _e.chart_line_width) || 2);
        const tension = Number((_g = (_f = config.config) === null || _f === void 0 ? void 0 : _f.chart_tension) !== null && _g !== void 0 ? _g : ((type === "line-chart" || type === "multi-line-chart" || type === "area-chart") ? 0.35 : 0.25));
        const fillOpacity = Number((_j = (_h = config.config) === null || _h === void 0 ? void 0 : _h.chart_fill_opacity) !== null && _j !== void 0 ? _j : (type === "area-chart" ? 0.22 : 0.14));
        const stacked = ((_k = config.config) === null || _k === void 0 ? void 0 : _k.chart_stacked) === true || type === "stacked-bar-chart";
        const compact = ((_l = config.config) === null || _l === void 0 ? void 0 : _l.chart_mobile_compact) === true;
        const beginAtZero = ((_m = config.config) === null || _m === void 0 ? void 0 : _m.chart_begin_at_zero) === true;
        const legendPosition = ((_o = config.config) === null || _o === void 0 ? void 0 : _o.chart_legend_position) || (compact ? "bottom" : "top");
        const curveMode = ((_p = config.config) === null || _p === void 0 ? void 0 : _p.chart_curve_mode) || "default";
        const pointStyle = ((_q = config.config) === null || _q === void 0 ? void 0 : _q.chart_point_style) || "circle";
        const yMinRaw = (_r = config.config) === null || _r === void 0 ? void 0 : _r.chart_y_min;
        const yMaxRaw = (_s = config.config) === null || _s === void 0 ? void 0 : _s.chart_y_max;
        const xTickLimit = Number(((_t = config.config) === null || _t === void 0 ? void 0 : _t.chart_x_tick_limit) || 0);
        const yTickLimit = Number(((_u = config.config) === null || _u === void 0 ? void 0 : _u.chart_y_tick_limit) || 0);
        const cutout = Number(((_v = config.config) === null || _v === void 0 ? void 0 : _v.chart_cutout) || (type === "pie-chart" ? 0 : 68));
        const barRadius = Number(((_w = config.config) === null || _w === void 0 ? void 0 : _w.chart_bar_radius) || (compact ? 6 : 8));
        const goalValue = (_x = config.config) === null || _x === void 0 ? void 0 : _x.chart_goal_value;
        const bubbleScale = Math.max(2, Number(((_y = config.config) === null || _y === void 0 ? void 0 : _y.chart_bubble_scale) || 8));
        const legendOptions = {
            display: showLegend && (histories.length > 1 || ["donut-chart", "pie-chart", "radar-chart", "line-chart", "multi-line-chart", "candlestick-chart", "histogram-chart", "waterfall-chart", "boxplot-chart"].includes(type)),
            position: legendPosition,
            labels: { color: "rgba(255,255,255,0.72)", boxWidth: compact ? 10 : 14, usePointStyle: true, padding: compact ? 10 : 14, filter: (item, data) => { var _a, _b; return !((_b = (_a = data === null || data === void 0 ? void 0 : data.datasets) === null || _a === void 0 ? void 0 : _a[item.datasetIndex]) === null || _b === void 0 ? void 0 : _b.tdHideName); } }
        };
        const chartAnimationEnabled = (((_z = config.config) === null || _z === void 0 ? void 0 : _z.chart_animation) !== false) && (((_1 = (_0 = this.app) === null || _0 === void 0 ? void 0 : _0.globalSettings) === null || _1 === void 0 ? void 0 : _1.default_chart_widget_animations) !== false);
        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: chartAnimationEnabled ? { duration: compact ? 220 : 600, easing: "easeOutCubic" } : false,
            interaction: { mode: "nearest", intersect: false },
            plugins: { legend: legendOptions, tooltip: { enabled: true, displayColors: true } },
            scales: {
                x: { display: showAxes, grid: { display: showGrid, color: "rgba(255,255,255,0.05)" }, ticks: { maxTicksLimit: xTickLimit || (compact ? 4 : 6), color: "rgba(255,255,255,0.5)" } },
                y: { display: showAxes, beginAtZero, min: yMinRaw === "" || yMinRaw == null ? undefined : Number(yMinRaw), max: yMaxRaw === "" || yMaxRaw == null ? undefined : Number(yMaxRaw), grid: { display: showGrid, color: "rgba(255,255,255,0.06)" }, ticks: { maxTicksLimit: yTickLimit || (compact ? 4 : 5), color: "rgba(255,255,255,0.5)" } }
            }
        };
        const lineTypes = new Set(["mini-graph", "sparkline", "line-chart", "area-chart", "multi-line-chart", "forecast-chart", "comparison-chart", "energy-flow-mini", "timeline-chart"]);
        if (lineTypes.has(type)) {
            const datasets = histories.map((entry, idx) => {
                var _a, _b, _c;
                return ({
                    label: this._chartSeriesLabel(config, entry.entityId, ((_b = (_a = entry.state) === null || _a === void 0 ? void 0 : _a.attributes) === null || _b === void 0 ? void 0 : _b.friendly_name) || entry.entityId, idx),
                    tdHideName: !!((_c = entry.meta) === null || _c === void 0 ? void 0 : _c.hide_name),
                    data: labels.map((_, pidx) => { var _a, _b, _c, _d; return (_d = (_b = (_a = entry.points[pidx]) === null || _a === void 0 ? void 0 : _a.y) !== null && _b !== void 0 ? _b : (_c = entry.points[entry.points.length - 1]) === null || _c === void 0 ? void 0 : _c.y) !== null && _d !== void 0 ? _d : 0; }),
                    borderColor: this._chartPalette(idx, 0.96, config, entry.entityId),
                    backgroundColor: this._chartPalette(idx, fillOpacity, config, entry.entityId),
                    fill: type === "area-chart" || type === "forecast-chart" || type === "energy-flow-mini",
                    tension: curveMode === "stepped" ? 0 : tension,
                    stepped: curveMode === "stepped",
                    cubicInterpolationMode: curveMode === "monotone" ? "monotone" : "default",
                    pointStyle, pointRadius: showPoints ? (compact ? 1.5 : 2.5) : 0,
                    pointHoverRadius: showPoints ? 4 : 0, borderWidth: lineWidth, spanGaps: true,
                    stack: stacked ? "stack" : undefined
                });
            });
            return { type: "line", data: { labels, datasets }, options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: showLegend && (histories.length > 1 || ["line-chart", "multi-line-chart", "comparison-chart", "forecast-chart"].includes(type)) } }, scales: { ...baseOptions.scales, x: { ...baseOptions.scales.x, display: showAxes && type !== "sparkline" }, y: { ...baseOptions.scales.y, display: showAxes && type !== "sparkline", stacked } } } };
        }
        if (type === "histogram-chart") {
            const values = ((_3 = (_2 = histories[0]) === null || _2 === void 0 ? void 0 : _2.points) === null || _3 === void 0 ? void 0 : _3.map((p) => Number(p === null || p === void 0 ? void 0 : p.y)).filter((v) => Number.isFinite(v))) || [];
            const bins = Math.max(4, Number(((_4 = config.config) === null || _4 === void 0 ? void 0 : _4.histogram_bins) || 8));
            const min = values.length ? Math.min(...values) : 0;
            const max = values.length ? Math.max(...values) : 1;
            const span = Math.max(1, max - min);
            const step = span / bins;
            const counts = Array.from({ length: bins }, () => 0);
            values.forEach((value) => {
                const idx = Math.min(bins - 1, Math.floor((value - min) / Math.max(step, 0.0001)));
                counts[Math.max(0, idx)] += 1;
            });
            const hLabels = Array.from({ length: bins }, (_, idx) => {
                const start = min + (idx * step);
                const end = start + step;
                return `${Utils.formatValue(start, { decimals: 1, trimTrailingZeros: true })}–${Utils.formatValue(end, { decimals: 1, trimTrailingZeros: true })}`;
            });
            return { type: "bar", data: { labels: hLabels, datasets: [{ label: this._chartSeriesLabel(config, (_5 = histories[0]) === null || _5 === void 0 ? void 0 : _5.entityId, ((_8 = (_7 = (_6 = histories[0]) === null || _6 === void 0 ? void 0 : _6.state) === null || _7 === void 0 ? void 0 : _7.attributes) === null || _8 === void 0 ? void 0 : _8.friendly_name) || ((_9 = histories[0]) === null || _9 === void 0 ? void 0 : _9.entityId) || "Histogramm", 0), data: counts, borderColor: this._chartPalette(0, .96, config, (_10 = histories[0]) === null || _10 === void 0 ? void 0 : _10.entityId), backgroundColor: this._chartPalette(0, .38, config, (_11 = histories[0]) === null || _11 === void 0 ? void 0 : _11.entityId), borderRadius: barRadius }] }, options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: showLegend } } } };
        }
        if (type === "waterfall-chart") {
            const primary = histories[0] || { points: [] };
            const pts = primary.points.slice(-Math.max(4, Math.min(16, labels.length)));
            let running = 0;
            const wfLabels = pts.map((p) => Utils.shortDateTime(p.x));
            const wfData = pts.map((p, idx) => {
                var _a, _b;
                const prev = idx === 0 ? Number(((_a = pts[0]) === null || _a === void 0 ? void 0 : _a.y) || 0) : Number(((_b = pts[idx - 1]) === null || _b === void 0 ? void 0 : _b.y) || 0);
                const cur = Number((p === null || p === void 0 ? void 0 : p.y) || 0);
                const delta = idx === 0 ? cur : (cur - prev);
                const start = running;
                running += delta;
                return [start, running];
            });
            const wfColors = wfData.map((range) => range[1] >= range[0] ? this._chartPalette(0, .5, config, primary.entityId) : 'rgba(239,83,80,.55)');
            return { type: 'bar', data: { labels: wfLabels, datasets: [{ label: 'Waterfall', data: wfData, borderColor: wfColors, backgroundColor: wfColors, borderRadius: barRadius }] }, options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: false } } } };
        }
        if (type === "candlestick-chart") {
            const primary = histories[0] || { points: [] };
            const pts = primary.points;
            const buckets = Math.max(4, Math.min(12, Number(((_12 = config.config) === null || _12 === void 0 ? void 0 : _12.chart_max_points) || 12)));
            const size = Math.max(1, Math.ceil(pts.length / Math.max(1, buckets)));
            const grouped = [];
            for (let i = 0; i < pts.length; i += size) {
                const chunk = pts.slice(i, i + size).map((p) => Number(p === null || p === void 0 ? void 0 : p.y)).filter((v) => Number.isFinite(v));
                if (!chunk.length)
                    continue;
                grouped.push({ label: Utils.shortDateTime((_13 = pts[Math.min(i + size - 1, pts.length - 1)]) === null || _13 === void 0 ? void 0 : _13.x), low: Math.min(...chunk), high: Math.max(...chunk), open: chunk[0], close: chunk[chunk.length - 1] });
            }
            const cLabels = grouped.map((g) => g.label);
            const cData = grouped.map((g) => [g.low, g.high]);
            const cColors = grouped.map((g) => g.close >= g.open ? 'rgba(76,175,80,.48)' : 'rgba(239,83,80,.48)');
            const cBorders = grouped.map((g) => g.close >= g.open ? 'rgba(76,175,80,.98)' : 'rgba(239,83,80,.98)');
            return { type: 'bar', data: { labels: cLabels, datasets: [{ label: 'OHLC', data: cData, backgroundColor: cColors, borderColor: cBorders, borderWidth: 1.5, borderRadius: Math.max(1, Math.round(barRadius / 2)), barPercentage: .5, categoryPercentage: .7 }] }, options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: false } } } };
        }
        const barTypes = new Set(["bar-chart", "stacked-bar-chart", "horizontal-bar-chart", "heatmap-mini", "bullet-chart", "sankey-chart", "boxplot-chart"]);
        if (barTypes.has(type)) {
            if (type === 'boxplot-chart') {
                const values = ((_15 = (_14 = histories[0]) === null || _14 === void 0 ? void 0 : _14.points) === null || _15 === void 0 ? void 0 : _15.map((p) => Number(p === null || p === void 0 ? void 0 : p.y)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b)) || [];
                const pick = (ratio) => values.length ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))] : 0;
                const stats = [values.length ? values[0] : 0, pick(.25), pick(.5), pick(.75), values.length ? values[values.length - 1] : 0];
                return { type: 'bar', data: { labels: ['Min', 'Q1', 'Median', 'Q3', 'Max'], datasets: [{ label: 'Verteilung', data: stats, borderColor: this._chartPalette(0, .96, config, (_16 = histories[0]) === null || _16 === void 0 ? void 0 : _16.entityId), backgroundColor: this._chartPalette(0, .38, config, (_17 = histories[0]) === null || _17 === void 0 ? void 0 : _17.entityId), borderRadius: barRadius }] }, options: { ...baseOptions, plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: false } } } };
            }
            const heatmapMode = ((_18 = config.config) === null || _18 === void 0 ? void 0 : _18.heatmap_mode) || "intensity";
            const datasets = histories.map((entry, idx) => {
                var _a, _b, _c;
                return ({
                    label: this._chartSeriesLabel(config, entry.entityId, ((_b = (_a = entry.state) === null || _a === void 0 ? void 0 : _a.attributes) === null || _b === void 0 ? void 0 : _b.friendly_name) || entry.entityId, idx),
                    tdHideName: !!((_c = entry.meta) === null || _c === void 0 ? void 0 : _c.hide_name),
                    data: labels.map((_, pidx) => { var _a, _b, _c, _d; return (_d = (_b = (_a = entry.points[pidx]) === null || _a === void 0 ? void 0 : _a.y) !== null && _b !== void 0 ? _b : (_c = entry.points[entry.points.length - 1]) === null || _c === void 0 ? void 0 : _c.y) !== null && _d !== void 0 ? _d : 0; }),
                    borderWidth: 1, borderRadius: barRadius,
                    borderColor: this._chartPalette(idx, 0.96, config, entry.entityId),
                    backgroundColor: type === "heatmap-mini"
                        ? labels.map((_, pidx) => { var _a, _b; const val = (_b = (_a = entry.points[pidx]) === null || _a === void 0 ? void 0 : _a.y) !== null && _b !== void 0 ? _b : 0; const alpha = heatmapMode === "zones" ? (Math.abs(val) >= 75 ? 0.78 : Math.abs(val) >= 50 ? 0.58 : Math.abs(val) >= 25 ? 0.38 : 0.22) : Utils.clamp(Math.abs(val) / 100, 0.18, 0.82); return this._chartPalette(idx, alpha, config, entry.entityId); })
                        : this._chartPalette(idx, 0.42, config, entry.entityId),
                    barPercentage: type === "bullet-chart" ? 0.55 : 0.78,
                    categoryPercentage: type === "bullet-chart" ? 0.92 : 0.84
                });
            });
            if (type === 'bullet-chart' && goalValue !== undefined && goalValue !== '') {
                datasets.push({ label: 'Ziel', data: labels.map(() => Number(goalValue) || 0), type: 'line', borderColor: 'rgba(255,255,255,.82)', borderDash: [6, 4], pointRadius: 0, fill: false });
            }
            return { type: "bar", data: { labels, datasets }, options: { ...baseOptions, indexAxis: (type === "horizontal-bar-chart" || type === "bullet-chart" || type === 'sankey-chart') ? "y" : "x", scales: { x: { ...baseOptions.scales.x, stacked }, y: { ...baseOptions.scales.y, stacked } }, plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: showLegend && (histories.length > 1 || stacked || type === 'sankey-chart') } } } };
        }
        if (["donut-chart", "pie-chart", "radial-gauge-advanced", "polar-area-chart", "treemap-chart", "sunburst-chart"].includes(type)) {
            const latest = histories.map(e => { var _a, _b; return (_b = (_a = e.points[e.points.length - 1]) === null || _a === void 0 ? void 0 : _a.y) !== null && _b !== void 0 ? _b : 0; });
            const dLabels = histories.map((e, idx) => { var _a, _b; return this._chartSeriesLabel(config, e.entityId, ((_b = (_a = e.state) === null || _a === void 0 ? void 0 : _a.attributes) === null || _b === void 0 ? void 0 : _b.friendly_name) || e.entityId, idx); });
            const isGauge = type === "radial-gauge-advanced";
            const gaugeMax = Number((_21 = (_20 = (_19 = config.config) === null || _19 === void 0 ? void 0 : _19.max) !== null && _20 !== void 0 ? _20 : goalValue) !== null && _21 !== void 0 ? _21 : 100);
            const gaugeValue = Number((_22 = latest[0]) !== null && _22 !== void 0 ? _22 : 0);
            return {
                type: type === "polar-area-chart" || type === 'sunburst-chart' ? "polarArea" : "doughnut",
                data: {
                    labels: isGauge ? [dLabels[0] || "Wert", "Rest"] : dLabels,
                    datasets: [{ tdHideName: false, data: isGauge ? [gaugeValue, Math.max(gaugeMax - gaugeValue, 0)] : latest, backgroundColor: isGauge ? [this._chartPalette(0, 0.95, config, (_23 = histories[0]) === null || _23 === void 0 ? void 0 : _23.entityId), "rgba(255,255,255,0.08)"] : histories.map((e, idx) => this._chartPalette(idx, 0.82, config, e.entityId)), borderColor: "rgba(255,255,255,0.08)", borderWidth: 1 }]
                },
                options: { ...baseOptions, cutout: (type === "pie-chart" || type === "polar-area-chart" || type === 'sunburst-chart') ? "0%" : `${Utils.clamp(cutout, 0, 95)}%`, scales: {}, plugins: { ...baseOptions.plugins, legend: { ...legendOptions, display: showLegend } } }
            };
        }
        if (type === "radar-chart") {
            return { type: "radar", data: { labels, datasets: histories.map((entry, idx) => { var _a, _b, _c; return ({ label: this._chartSeriesLabel(config, entry.entityId, ((_b = (_a = entry.state) === null || _a === void 0 ? void 0 : _a.attributes) === null || _b === void 0 ? void 0 : _b.friendly_name) || entry.entityId, idx), tdHideName: !!((_c = entry.meta) === null || _c === void 0 ? void 0 : _c.hide_name), data: labels.map((_, pidx) => { var _a, _b, _c, _d; return (_d = (_b = (_a = entry.points[pidx]) === null || _a === void 0 ? void 0 : _a.y) !== null && _b !== void 0 ? _b : (_c = entry.points[entry.points.length - 1]) === null || _c === void 0 ? void 0 : _c.y) !== null && _d !== void 0 ? _d : 0; }), borderColor: this._chartPalette(idx, 0.95, config, entry.entityId), backgroundColor: this._chartPalette(idx, 0.2, config, entry.entityId), pointBackgroundColor: this._chartPalette(idx, 0.95, config, entry.entityId), pointRadius: showPoints ? 2 : 0, borderWidth: lineWidth }); }) }, options: { ...baseOptions, scales: { r: { angleLines: { color: "rgba(255,255,255,0.08)" }, grid: { color: "rgba(255,255,255,0.08)" }, pointLabels: { color: "rgba(255,255,255,0.6)" }, ticks: { backdropColor: "transparent", color: "rgba(255,255,255,0.45)" } } } } };
        }
        if (type === "scatter-chart" || type === "bubble-chart") {
            return { type: type === "bubble-chart" ? "bubble" : "scatter", data: { datasets: histories.map((entry, idx) => { var _a, _b, _c; return ({ label: this._chartSeriesLabel(config, entry.entityId, ((_b = (_a = entry.state) === null || _a === void 0 ? void 0 : _a.attributes) === null || _b === void 0 ? void 0 : _b.friendly_name) || entry.entityId, idx), tdHideName: !!((_c = entry.meta) === null || _c === void 0 ? void 0 : _c.hide_name), data: entry.points.map((p, pidx) => ({ x: pidx + 1, y: p.y, r: type === "bubble-chart" ? Utils.clamp(Math.abs(Number(p.y) || 0) / bubbleScale, 4, compact ? 11 : 16) : undefined })), borderColor: this._chartPalette(idx, 0.95, config, entry.entityId), backgroundColor: this._chartPalette(idx, 0.48, config, entry.entityId), pointStyle, pointRadius: showPoints ? 4 : 0, pointHoverRadius: showPoints ? 5 : 0 }); }) }, options: { ...baseOptions, scales: { x: { display: showAxes, type: "linear", position: "bottom", grid: { display: showGrid, color: "rgba(255,255,255,0.06)" }, ticks: { color: "rgba(255,255,255,0.45)" } }, y: baseOptions.scales.y } } };
        }
        const fallbackDS = histories.map((entry, idx) => { var _a, _b, _c; return ({ label: this._chartSeriesLabel(config, entry.entityId, ((_b = (_a = entry.state) === null || _a === void 0 ? void 0 : _a.attributes) === null || _b === void 0 ? void 0 : _b.friendly_name) || entry.entityId, idx), tdHideName: !!((_c = entry.meta) === null || _c === void 0 ? void 0 : _c.hide_name), data: labels.map((_, pidx) => { var _a, _b, _c, _d; return (_d = (_b = (_a = entry.points[pidx]) === null || _a === void 0 ? void 0 : _a.y) !== null && _b !== void 0 ? _b : (_c = entry.points[entry.points.length - 1]) === null || _c === void 0 ? void 0 : _c.y) !== null && _d !== void 0 ? _d : 0; }), borderColor: this._chartPalette(idx, 0.96, config, entry.entityId), backgroundColor: this._chartPalette(idx, 0.14, config, entry.entityId), fill: false, tension, pointRadius: showPoints ? 2.5 : 0, borderWidth: lineWidth, spanGaps: true }); });
        return { type: "line", data: { labels, datasets: fallbackDS }, options: baseOptions };
    }
    /* ────── Widget Updates ────── */
    _updateWidget(widgetInfo, entityId, newState) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4;
        const { element, config } = widgetInfo;
        const value = (_a = newState === null || newState === void 0 ? void 0 : newState.state) !== null && _a !== void 0 ? _a : "—";
        const unit = ((_b = newState === null || newState === void 0 ? void 0 : newState.attributes) === null || _b === void 0 ? void 0 : _b.unit_of_measurement) || config.unit || "";
        switch (config.type) {
            case "gauge": {
                const min = (_d = (_c = config.config) === null || _c === void 0 ? void 0 : _c.min) !== null && _d !== void 0 ? _d : 0;
                const max = (_f = (_e = config.config) === null || _e === void 0 ? void 0 : _e.max) !== null && _f !== void 0 ? _f : 100;
                const nv = Utils.toNumber(value, 0);
                const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
                const arc = element.querySelector(".gauge-arc-value");
                const txt = element.querySelector(".gauge-text-value");
                if (arc) {
                    arc.setAttribute("stroke-dasharray", `${pct * 2.51} 251`);
                    arc.setAttribute("stroke", this._getZoneColor(nv, (_g = config.config) === null || _g === void 0 ? void 0 : _g.zones));
                }
                if (txt)
                    txt.textContent = Utils.formatStateWithUnit(nv, unit, { decimals: (_h = config.config) === null || _h === void 0 ? void 0 : _h.value_decimals, trimTrailingZeros: ((_j = config.config) === null || _j === void 0 ? void 0 : _j.trim_trailing_zeros) !== false });
                break;
            }
            case "progress-bar": {
                const min = (_l = (_k = config.config) === null || _k === void 0 ? void 0 : _k.min) !== null && _l !== void 0 ? _l : 0;
                const max = (_o = (_m = config.config) === null || _m === void 0 ? void 0 : _m.max) !== null && _o !== void 0 ? _o : 100;
                const nv = Utils.toNumber(value, 0);
                const pct = Utils.clamp(((nv - min) / (max - min)) * 100, 0, 100);
                const fill = element.querySelector(".progress-fill");
                const ve = element.querySelector(".w-value");
                if (fill)
                    fill.style.width = `${pct}%`;
                if (ve)
                    ve.textContent = Utils.formatValue(nv, { decimals: (_p = config.config) === null || _p === void 0 ? void 0 : _p.value_decimals, trimTrailingZeros: ((_q = config.config) === null || _q === void 0 ? void 0 : _q.trim_trailing_zeros) !== false });
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
                if (sub)
                    sub.textContent = Utils.text(value);
                break;
            }
            case "weather":
                this._renderWeatherWidget(element, config, newState || this.app.entityStates[config.entity_id] || {});
                break;
            case "trend-arrow":
                this._renderTrendArrowWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, config.name || "", config.icon || this._defaultIconForType(config.type));
                break;
            case "media-player-control":
                this._renderMediaPlayerControlWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, ((_r = newState === null || newState === void 0 ? void 0 : newState.attributes) === null || _r === void 0 ? void 0 : _r.friendly_name) || ""), config.icon || this._defaultIconForType(config.type));
                break;
            case "switch-control":
                this._renderSwitchControlWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, ((_s = newState === null || newState === void 0 ? void 0 : newState.attributes) === null || _s === void 0 ? void 0 : _s.friendly_name) || ""), config.icon || this._defaultIconForType(config.type));
                break;
            case "light-control":
                this._renderLightControlWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, ((_t = newState === null || newState === void 0 ? void 0 : newState.attributes) === null || _t === void 0 ? void 0 : _t.friendly_name) || ""), config.icon || this._defaultIconForType(config.type));
                break;
            case "climate-control":
                this._renderClimateControlWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, ((_u = newState === null || newState === void 0 ? void 0 : newState.attributes) === null || _u === void 0 ? void 0 : _u.friendly_name) || ""), config.icon || this._defaultIconForType(config.type));
                break;
            case "cover-control":
                this._renderCoverControlWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, ((_v = newState === null || newState === void 0 ? void 0 : newState.attributes) === null || _v === void 0 ? void 0 : _v.friendly_name) || ""), config.icon || this._defaultIconForType(config.type));
                break;
            case "text-card":
                this._renderTextCardWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, ((_w = newState === null || newState === void 0 ? void 0 : newState.attributes) === null || _w === void 0 ? void 0 : _w.friendly_name) || ""), config.icon || this._defaultIconForType(config.type));
                break;
            case "entity-list":
                this._renderEntityListWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, ((_x = newState === null || newState === void 0 ? void 0 : newState.attributes) === null || _x === void 0 ? void 0 : _x.friendly_name) || ""), config.icon || this._defaultIconForType(config.type));
                break;
            case "chip-row":
                this._renderChipRowWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, ((_y = newState === null || newState === void 0 ? void 0 : newState.attributes) === null || _y === void 0 ? void 0 : _y.friendly_name) || ""), config.icon || this._defaultIconForType(config.type));
                break;
            case "divider":
                this._renderDividerWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, ((_z = newState === null || newState === void 0 ? void 0 : newState.attributes) === null || _z === void 0 ? void 0 : _z.friendly_name) || ""), config.icon || this._defaultIconForType(config.type));
                break;
            case "spacer":
                this._renderSpacerWidget(element, config, newState || this.app.entityStates[config.entity_id] || {}, this._widgetName(config, ((_0 = newState === null || newState === void 0 ? void 0 : newState.attributes) === null || _0 === void 0 ? void 0 : _0.friendly_name) || ""), config.icon || this._defaultIconForType(config.type));
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
            case "candlestick-chart":
            case "histogram-chart":
            case "waterfall-chart":
            case "treemap-chart":
            case "sunburst-chart":
            case "sankey-chart":
            case "boxplot-chart": {
                const cv = element.querySelector(".chart-value");
                if (cv)
                    cv.innerHTML = `${Utils.formatValue(value, { decimals: (_1 = config.config) === null || _1 === void 0 ? void 0 : _1.value_decimals, trimTrailingZeros: ((_2 = config.config) === null || _2 === void 0 ? void 0 : _2.trim_trailing_zeros) !== false })}${unit ? `<span class="chart-unit"> ${unit}</span>` : ""}`;
                const canvas = element.querySelector(".chart-canvas");
                if (canvas && window.Chart)
                    this._scheduleChartBuild(element, canvas, config, this.app.entityStates[config.entity_id] || newState);
                break;
            }
            default: {
                const wv = element.querySelector(".w-value");
                if (wv)
                    wv.textContent = Utils.formatValue(value, { decimals: (_3 = config.config) === null || _3 === void 0 ? void 0 : _3.value_decimals, trimTrailingZeros: ((_4 = config.config) === null || _4 === void 0 ? void 0 : _4.trim_trailing_zeros) !== false });
            }
        }
        this._updateExtraEntityList(element, config);
        if (METRIC_WIDGET_TYPES.has(config.type || ""))
            this._renderMetricSparkline(element, config);
        element.classList.remove("value-changed");
        void element.offsetWidth;
        element.classList.add("value-changed");
    }
    /* ────── Interactions ────── */
    _effectiveWidgetInteractionConfig(config) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (!config)
            return {};
        const hasOwnAction = config.tap_action && config.tap_action !== "none";
        const cameraFullscreen = (config.type === "camera" && (((_a = config.config) === null || _a === void 0 ? void 0 : _a.camera_tap_fullscreen) || config.camera_tap_fullscreen));
        if (hasOwnAction || cameraFullscreen)
            return config;
        const defaultToggleTypes = new Set(["switch-control", "light-control"]);
        const defaultPopupTypes = new Set(["media-player-control", "climate-control", "cover-control"]);
        if (defaultToggleTypes.has(config.type)) {
            const compactPopup = (((_b = config === null || config === void 0 ? void 0 : config.config) === null || _b === void 0 ? void 0 : _b.control_layout) || "card") === "compact";
            return {
                ...config,
                tap_action: compactPopup ? "popup" : "toggle",
                tap_target_entity: config.tap_target_entity || config.entity_id || this._resolvePrimaryEntityId(config) || "",
                toggle_badge: (_c = config.toggle_badge) !== null && _c !== void 0 ? _c : true,
            };
        }
        if (defaultPopupTypes.has(config.type)) {
            return {
                ...config,
                tap_action: "popup",
                tap_target_entity: config.tap_target_entity || config.entity_id || this._resolvePrimaryEntityId(config) || "",
            };
        }
        const group = String(config.group || "").trim();
        if (!group)
            return config;
        const current = this.temporaryScreen || this.screens[this.currentIndex] || {};
        const widgets = Utils.safeArray(current.widgets);
        const master = widgets.find(w => String((w === null || w === void 0 ? void 0 : w.group) || "").trim() === group && (w === null || w === void 0 ? void 0 : w.group_touch_enabled));
        if (!master)
            return config;
        return { ...config, tap_action: master.group_tap_action || master.tap_action || "none", tap_target_entity: master.group_tap_target_entity || master.tap_target_entity || config.tap_target_entity || config.entity_id || this._resolvePrimaryEntityId(config) || "", toggle_mode: master.group_toggle_mode || master.toggle_mode || config.toggle_mode || "toggle", toggle_badge: (_e = (_d = master.group_toggle_badge) !== null && _d !== void 0 ? _d : master.toggle_badge) !== null && _e !== void 0 ? _e : config.toggle_badge, tap_popup_kind: master.group_tap_popup_kind || master.tap_popup_kind || config.tap_popup_kind, tap_screen_id: master.group_tap_screen_id || master.tap_screen_id || config.tap_screen_id, tap_url: master.group_tap_url || master.tap_url || config.tap_url, tap_autoclose: (_g = (_f = master.group_tap_autoclose) !== null && _f !== void 0 ? _f : master.tap_autoclose) !== null && _g !== void 0 ? _g : config.tap_autoclose, tap_scale: (_j = (_h = master.group_tap_scale) !== null && _h !== void 0 ? _h : master.tap_scale) !== null && _j !== void 0 ? _j : config.tap_scale };
    }
    _bindWidgetInteraction(widget, config) {
        var _a;
        const cameraFullscreen = (config.type === "camera" && (((_a = config.config) === null || _a === void 0 ? void 0 : _a.camera_tap_fullscreen) || config.camera_tap_fullscreen));
        const action = (config === null || config === void 0 ? void 0 : config.tap_action) || "none";
        if ((action === "none" || !action) && !cameraFullscreen)
            return;
        widget.classList.add("widget-interactive");
        widget.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            this._createRipple(widget, ev);
            if (cameraFullscreen)
                return this._openCameraFullscreen(config);
            if (action === "expand")
                this._openWidgetDetail(widget, config);
            else if (action === "popup")
                this._openWidgetPopup(config);
            else if (action === "toggle")
                this._toggleWidgetEntity(widget, config);
            else if (action === "goto_screen")
                this._gotoTargetScreen(config);
            else if (action === "open_url")
                this._openWidgetUrl(config);
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
        var _a, _b, _c;
        if (((config === null || config === void 0 ? void 0 : config.tap_action) || "none") !== "toggle" || (config === null || config === void 0 ? void 0 : config.toggle_badge) === false || ((_a = config === null || config === void 0 ? void 0 : config.config) === null || _a === void 0 ? void 0 : _a.control_show_toggle_badge) === false) {
            const ex = widget.querySelector(".widget-toggle-badge");
            if (ex)
                ex.remove();
            return;
        }
        const entityId = this._resolvePrimaryEntityId(config, null);
        if (!entityId)
            return;
        const st = ((_c = (_b = this.app) === null || _b === void 0 ? void 0 : _b.entityStates) === null || _c === void 0 ? void 0 : _c[entityId]) || {};
        this._showWidgetToggleBadge(widget, Utils.isTruthyState(st.state), st.state);
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
    _openWidgetUrl(config) { var _a; const url = config.tap_url || ((_a = config.config) === null || _a === void 0 ? void 0 : _a.tap_url) || ""; if (url)
        window.open(url, "_blank", "noopener,noreferrer"); }
    _gotoTargetScreen(config) { var _a; const target = config.tap_screen_id || ((_a = config.config) === null || _a === void 0 ? void 0 : _a.tap_screen_id) || ""; if (target)
        this.goto(target); }
    _openWidgetDetail(widget, config) {
        const popupTypes = new Set(["mini-graph", "sparkline", "line-chart", "area-chart", "multi-line-chart", "forecast-chart", "comparison-chart", "energy-flow-mini", "timeline-chart", "bar-chart", "stacked-bar-chart", "horizontal-bar-chart", "heatmap-mini", "bullet-chart", "donut-chart", "pie-chart", "radial-gauge-advanced", "polar-area-chart", "radar-chart", "camera", "image", "media-player-control", "switch-control", "light-control", "climate-control", "cover-control"]);
        if (popupTypes.has(config === null || config === void 0 ? void 0 : config.type) || ["media_player", "light", "switch", "input_boolean", "fan", "cover", "climate", "camera", "image"].includes(String((config === null || config === void 0 ? void 0 : config.entity_id) || "").split(".")[0])) {
            this._openWidgetPopup(config);
            return;
        }
        const overlay = document.getElementById("widget-detail-overlay") || this._createWidgetDetailOverlay();
        const body = overlay.querySelector(".widget-detail-body");
        const clone = widget.cloneNode(true);
        clone.classList.add("widget-detail-card");
        clone.style.width = "100%";
        clone.style.height = "100%";
        clone.style.transform = `scale(${config.tap_scale || 1.45})`;
        body.innerHTML = "";
        body.appendChild(clone);
        overlay.hidden = false;
        const close = () => { overlay.hidden = true; body.innerHTML = ""; };
        overlay.querySelector(".widget-detail-close").onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay)
            close(); };
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
            overlay.innerHTML = `<div class="widget-popup-panel"><div class="widget-popup-body"></div></div>`;
            document.body.appendChild(overlay);
        }
        return overlay;
    }
    _closeWidgetPopup() { const o = document.getElementById("widget-popup-overlay"); if (!o)
        return; o.hidden = true; const b = o.querySelector(".widget-popup-body"); if (b)
        b.innerHTML = ""; }
    _openCameraFullscreen(config) { this._openWidgetPopup({ ...config, tap_popup_kind: "camera" }); }
    _popupFriendlyName(config, st) { var _a; const eid = this._resolvePrimaryEntityId(config, st); return this._widgetName(config, ((_a = st === null || st === void 0 ? void 0 : st.attributes) === null || _a === void 0 ? void 0 : _a.friendly_name) || eid || config.type || "Widget"); }
    _popupWeatherMarkup(config, st) {
        var _a, _b, _c, _d, _e;
        const attrs = (st === null || st === void 0 ? void 0 : st.attributes) || {};
        const visual = this._weatherVisual((st === null || st === void 0 ? void 0 : st.state) || "", config.config || config);
        return `<div class="popup-hero popup-weather ${visual.theme}"><div class="popup-weather-bg ${visual.animClass} ${visual.animate ? "animate" : ""}">${this._weatherFxMarkup(visual.animClass, 2)}</div><div class="popup-eyebrow">${this._popupFriendlyName(config, st)}</div><div class="popup-big-icon">${visual.icon}</div><div class="popup-big-value">${Utils.text((_a = attrs.temperature) !== null && _a !== void 0 ? _a : "—")}<span>°C</span></div><div class="popup-subtitle">${visual.label || (st === null || st === void 0 ? void 0 : st.state) || ""}</div><div class="popup-grid-info"><div><span>Feuchte</span><strong>${Utils.text((_b = attrs.humidity) !== null && _b !== void 0 ? _b : "—")}${attrs.humidity !== undefined ? "%" : ""}</strong></div><div><span>Wind</span><strong>${Utils.text((_d = (_c = attrs.wind_speed) !== null && _c !== void 0 ? _c : attrs.wind_bearing) !== null && _d !== void 0 ? _d : "—")}</strong></div><div><span>Druck</span><strong>${Utils.text((_e = attrs.pressure) !== null && _e !== void 0 ? _e : "—")}</strong></div></div></div>`;
    }
    _popupCameraMarkup(config) {
        var _a, _b, _c, _d;
        const eid = config.entity_id || ((_a = config.config) === null || _a === void 0 ? void 0 : _a.camera_entity) || config.camera_entity || "";
        const preferred = ((_b = config.config) === null || _b === void 0 ? void 0 : _b.camera_source) || config.camera_source || "auto";
        const live = (((_c = config.config) === null || _c === void 0 ? void 0 : _c.camera_view) || config.camera_view || "still") === "live";
        const source = live && preferred === "auto" ? "camera_proxy_stream" : preferred;
        const fit = ((_d = config.config) === null || _d === void 0 ? void 0 : _d.camera_fit) || config.camera_fit || "contain";
        const src = this._cameraUrlForEntity(eid, source) || "";
        if (!src)
            return `<div class="popup-empty">Keine Kamera verfügbar</div>`;
        return `<div class="popup-hero popup-camera"><div class="popup-eyebrow">${Utils.text(this._widgetCameraTitle(config, eid) || eid)}</div><img class="popup-camera-image" style="object-fit:${fit}" src="${src}" alt="${eid}"></div>`;
    }
    _popupImageMarkup(config) {
        var _a, _b;
        const entityId = this._resolvePrimaryEntityId(config, null);
        const st = ((_b = (_a = this.app) === null || _a === void 0 ? void 0 : _a.entityStates) === null || _b === void 0 ? void 0 : _b[entityId]) || {};
        const attrs = st.attributes || {};
        const src = config.image_url || config.imageUrl || config.url || attrs.entity_picture || attrs.image_url || "";
        if (!src)
            return `<div class="popup-empty">Kein Bild konfiguriert</div>`;
        return `<div class="popup-hero popup-image"><div class="popup-eyebrow">${Utils.text(this._widgetName(config, attrs.friendly_name || "Bild") || "Bild")}</div><img class="popup-camera-image" style="object-fit:contain" src="${src}" alt="Bild"></div>`;
    }
    _renderPopupControlButton(body, label, active, onClick) {
        const btn = document.createElement("button");
        btn.className = `popup-control-btn ${active ? "active" : ""}`;
        btn.textContent = label;
        btn.onclick = onClick;
        body.appendChild(btn);
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
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        const overlay = this._widgetPopupOverlay();
        const body = overlay.querySelector(".widget-popup-body");
        const close = () => this._closeWidgetPopup();
        overlay.onclick = (e) => { if (e.target === overlay)
            close(); };
        const entityId = this._resolvePrimaryEntityId(config, null);
        const st = this.app.entityStates[entityId] || {};
        const attrs = st.attributes || {};
        const domain = String(entityId || "").split(".")[0] || this._controlDomainFallback(config.type);
        const chartTypes = new Set(["mini-graph", "sparkline", "line-chart", "area-chart", "multi-line-chart", "forecast-chart", "comparison-chart", "energy-flow-mini", "timeline-chart", "bar-chart", "stacked-bar-chart", "horizontal-bar-chart", "heatmap-mini", "bullet-chart", "donut-chart", "pie-chart", "radial-gauge-advanced", "polar-area-chart", "radar-chart"]);
        const kind = config.tap_popup_kind || (config.type === "weather" || domain === "weather" ? "weather" : config.type === "camera" ? "camera" : config.type === "image" ? "image" : domain);
        const options = this._controlDisplayOptions(config);
        let html = "";
        if (chartTypes.has(config.type)) {
            html = `<div class="popup-hero popup-chart"><div class="popup-eyebrow">${Utils.text(this._popupFriendlyName(config, st) || "Chart")}</div><div class="popup-chart-wrap"><canvas class="chart-canvas popup-chart-canvas"></canvas></div></div>`;
        }
        else if (kind === "weather")
            html = this._popupWeatherMarkup(config, st);
        else if (kind === "camera")
            html = this._popupCameraMarkup(config);
        else if (kind === "image")
            html = this._popupImageMarkup(config);
        else if (domain === "media_player") {
            const cover = attrs.entity_picture || "";
            const progress = Number(attrs.media_duration || 0) > 0 ? Math.max(0, Math.min(100, ((Number(attrs.media_position || 0) / Number(attrs.media_duration || 1)) * 100))) : 0;
            html = `<div class="popup-hero popup-media popup-media-landscape"><div class="popup-media-art-wrap">${cover ? `<img class="popup-media-cover" src="${cover}" alt="Cover">` : `<div class="popup-media-cover placeholder">🎵</div>`}</div><div class="popup-media-info"><div class="popup-eyebrow">${Utils.text(attrs.friendly_name || entityId)}</div><div class="popup-big-value popup-media-big">${Utils.text(attrs.media_title || attrs.media_channel || attrs.source || st.state || "—")}</div><div class="popup-subtitle popup-media-subtitle">${Utils.text(attrs.media_artist || attrs.app_name || attrs.media_album_name || "Keine Wiedergabe")}</div><div class="popup-media-progress"><span style="width:${progress}%"></span></div><div class="popup-mini-grid"><div class="popup-mini-row"><span>Status</span><strong>${Utils.text(st.state || "—")}</strong></div><div class="popup-mini-row"><span>Lautstärke</span><strong>${Math.round(Number(attrs.volume_level || 0) * 100)}%</strong></div><div class="popup-mini-row"><span>Quelle</span><strong>${Utils.text(attrs.source || "—")}</strong></div><div class="popup-mini-row"><span>Dauer</span><strong>${Utils.text(attrs.media_duration ? Math.round(Number(attrs.media_duration)) + " s" : "—")}</strong></div></div><div class="popup-controls popup-controls-media"></div></div></div>`;
        }
        else if (domain === "light" || domain === "switch" || domain === "input_boolean" || domain === "fan") {
            const summary = this._controlSummary(config, st, this._popupFriendlyName(config, st), config.icon || this._defaultIconForType(config.type));
            html = `<div class="popup-hero popup-control popup-light"><div class="popup-eyebrow">${Utils.text(attrs.friendly_name || entityId)}</div><div class="popup-big-icon">${domain === "light" ? (summary.active ? "💡" : "🔅") : (summary.active ? "🟢" : "⚪")}</div><div class="popup-big-value">${Utils.text(summary.value || "—")}</div><div class="popup-subtitle">${Utils.text(summary.sub || st.state || "—")}</div>${domain === "light" || domain === "fan" ? `<div class="popup-meter"><span style="width:${summary.meter || 0}%"></span></div><div class="popup-mini-row"><span>${domain === "light" ? "Helligkeit" : "Leistung"}</span><strong>${Math.round(summary.meter || 0)}%</strong></div>` : ``}<div class="popup-controls"></div></div>`;
        }
        else if (domain === "cover") {
            const pos = (_a = attrs.current_position) !== null && _a !== void 0 ? _a : attrs.position;
            const pct = pos == null ? 0 : Math.max(0, Math.min(100, Math.round(Number(pos))));
            const tilt = attrs.current_tilt_position;
            html = `<div class="popup-hero popup-control popup-cover"><div class="popup-eyebrow">${Utils.text(attrs.friendly_name || entityId)}</div><div class="popup-big-icon">🪟</div><div class="popup-big-value">${pos == null ? Utils.text(st.state || "—") : `${pct}<span>%</span>`}</div><div class="popup-subtitle">${Utils.text(st.state || "—")}</div><div class="popup-meter"><span style="width:${pct}%"></span></div><div class="popup-mini-row"><span>Position</span><strong>${pct}%</strong></div>${tilt != null ? `<div class="popup-mini-row"><span>Lamellen</span><strong>${Math.max(0, Math.min(100, Math.round(Number(tilt))))}%</strong></div>` : ``}<div class="popup-controls"></div></div>`;
        }
        else if (domain === "valve") {
            const isOpen = Utils.isTruthyState(st.state) || String(st.state || '').toLowerCase() === 'open';
            html = `<div class="popup-hero popup-control"><div class="popup-eyebrow">${Utils.text(attrs.friendly_name || entityId)}</div><div class="popup-big-icon">${isOpen ? "💧" : "🚫"}</div><div class="popup-big-value">${isOpen ? "Offen" : "Zu"}</div><div class="popup-subtitle">${Utils.text(st.state || "—")}</div><div class="popup-controls"></div></div>`;
        }
        else if (domain === "climate") {
            const hvacModes = Utils.safeArray(attrs.hvac_modes);
            html = `<div class="popup-hero popup-control popup-climate"><div class="popup-eyebrow">${Utils.text(attrs.friendly_name || entityId)}</div><div class="popup-big-icon">🌡️</div><div class="popup-big-value">${Utils.text((_b = attrs.current_temperature) !== null && _b !== void 0 ? _b : "—")}<span>°C</span></div><div class="popup-subtitle">Soll ${Utils.text((_c = attrs.temperature) !== null && _c !== void 0 ? _c : "—")} °C · ${Utils.text(st.state || "—")}</div><div class="popup-mini-row"><span>Modus</span><strong>${Utils.text(st.state || "—")}</strong></div>${options.showPopupModes && hvacModes.length ? `<div class="popup-mode-row">${hvacModes.map(m => `<span class="popup-mode-chip ${String(st.state) === String(m) ? 'active' : ''}">${Utils.text(m)}</span>`).join("")}</div>` : ``}<div class="popup-controls"></div></div>`;
        }
        else {
            html = `<div class="popup-hero"><div class="popup-eyebrow">${Utils.text(attrs.friendly_name || entityId || this._widgetName(config, "Widget"))}</div><div class="popup-big-value">${Utils.formatStateWithUnit((_d = st.state) !== null && _d !== void 0 ? _d : "—", attrs.unit_of_measurement || "", { decimals: (_e = config.config) === null || _e === void 0 ? void 0 : _e.value_decimals, trimTrailingZeros: ((_f = config.config) === null || _f === void 0 ? void 0 : _f.trim_trailing_zeros) !== false })}</div><div class="popup-subtitle">${Utils.text((_g = st.state) !== null && _g !== void 0 ? _g : "—")}</div></div>`;
        }
        body.innerHTML = `<div class="widget-popup-sheet"><div class="widget-popup-header"><div class="widget-popup-title">${Utils.text(this._popupFriendlyName(config, st) || "Steuerung")}</div><button class="widget-popup-close" type="button">Schließen</button></div><div class="widget-popup-content">${html}</div></div>`;
        (_h = body.querySelector(".widget-popup-close")) === null || _h === void 0 ? void 0 : _h.addEventListener("click", close);
        const hero = body.querySelector(".popup-hero") || body;
        const controls = body.querySelector(".popup-controls");
        const popupChart = body.querySelector('.popup-chart-canvas');
        if (popupChart) {
            requestAnimationFrame(() => this._buildChart(popupChart, config, st, { _chartInstance: null }));
        }
        if (controls && domain === "media_player") {
            this._renderPopupControlButton(controls, "Zurück", false, async () => { await this.app.callEntityService("media_player", "media_previous_track", { entity_id: entityId }); });
            this._renderPopupControlButton(controls, (String(st.state || "") === "playing") ? "Pause" : "Play", false, async () => { await this.app.callEntityService("media_player", "media_play_pause", { entity_id: entityId }); });
            this._renderPopupControlButton(controls, "Weiter", false, async () => { await this.app.callEntityService("media_player", "media_next_track", { entity_id: entityId }); });
            this._renderPopupControlButton(controls, "Stopp", false, async () => { await this.app.callEntityService("media_player", "media_stop", { entity_id: entityId }); });
            this._renderPopupControlButton(controls, "Leiser", false, async () => { var _a; await this.app.callEntityService("media_player", "volume_set", { entity_id: entityId, volume_level: Math.max(0, Number((_a = attrs.volume_level) !== null && _a !== void 0 ? _a : 0) - 0.1) }); });
            this._renderPopupControlButton(controls, "Lauter", false, async () => { var _a; await this.app.callEntityService("media_player", "volume_set", { entity_id: entityId, volume_level: Math.min(1, Number((_a = attrs.volume_level) !== null && _a !== void 0 ? _a : 0) + 0.1) }); });
            const mediaSourceHost = this._popupAppendSection(hero, "Home Assistant Medienquellen");
            this._renderHaMediaSources(mediaSourceHost, entityId, close);
        }
        else if (controls && (domain === "switch" || domain === "input_boolean" || domain === "fan" || domain === "valve")) {
            this._renderPopupControlButton(controls, "Ein/Aus", false, async () => { await this._invokeToggleAction(entityId, 'toggle'); close(); });
            if (domain === "fan") {
                const fanRow = this._popupAppendSection(hero, "Lüfterstufen");
                [25, 50, 75, 100].forEach((pct) => this._renderPopupControlButton(fanRow, `${pct}%`, Number(attrs.percentage || 0) === pct, async () => { await this.app.callEntityService('fan', 'set_percentage', { entity_id: entityId, percentage: pct }); close(); }));
            }
        }
        else if (controls && domain === "light") {
            const currentBri = Math.round((Number((_j = attrs.brightness) !== null && _j !== void 0 ? _j : (Utils.isTruthyState(st.state) ? 255 : 0)) / 255) * 100);
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
        }
        else if (controls && domain === "cover") {
            const currentPos = Math.max(0, Math.min(100, Math.round(Number((_l = (_k = attrs.current_position) !== null && _k !== void 0 ? _k : attrs.position) !== null && _l !== void 0 ? _l : 0))));
            this._renderPopupControlButton(controls, "Öffnen", false, async () => { await this.app.callEntityService("cover", "open_cover", { entity_id: entityId }); close(); });
            this._renderPopupControlButton(controls, "Stopp", false, async () => { await this.app.callEntityService("cover", "stop_cover", { entity_id: entityId }); });
            this._renderPopupControlButton(controls, "Schließen", false, async () => { await this.app.callEntityService("cover", "close_cover", { entity_id: entityId }); close(); });
            if (options.showPopupPositionPresets) {
                const posRow = this._popupAppendSection(hero, "Positionen");
                [0, 25, 50, 75, 100].forEach((pct) => this._renderPopupControlButton(posRow, `${pct}%`, currentPos === pct, async () => { await this.app.callEntityService('cover', 'set_cover_position', { entity_id: entityId, position: pct }); close(); }));
            }
            if (options.showPopupTilt && (attrs.current_tilt_position != null || attrs.tilt_position != null)) {
                const currentTilt = Math.max(0, Math.min(100, Math.round(Number((_o = (_m = attrs.current_tilt_position) !== null && _m !== void 0 ? _m : attrs.tilt_position) !== null && _o !== void 0 ? _o : 0))));
                const tiltRow = this._popupAppendSection(hero, "Lamellen / Tilt");
                this._renderPopupControlButton(tiltRow, "Auf", false, async () => { await this.app.callEntityService('cover', 'open_cover_tilt', { entity_id: entityId }); close(); });
                this._renderPopupControlButton(tiltRow, "Stopp", false, async () => { await this.app.callEntityService('cover', 'stop_cover_tilt', { entity_id: entityId }); });
                this._renderPopupControlButton(tiltRow, "Zu", false, async () => { await this.app.callEntityService('cover', 'close_cover_tilt', { entity_id: entityId }); close(); });
                [0, 50, 100].forEach((pct) => this._renderPopupControlButton(tiltRow, `${pct}%`, currentTilt === pct, async () => { await this.app.callEntityService('cover', 'set_cover_tilt_position', { entity_id: entityId, tilt_position: pct }); close(); }));
            }
        }
        else if (controls && domain === "climate") {
            this._renderPopupControlButton(controls, "−1°", false, async () => { var _a; await this.app.callEntityService("climate", "set_temperature", { entity_id: entityId, temperature: Number((_a = attrs.temperature) !== null && _a !== void 0 ? _a : 20) - 1 }); close(); });
            this._renderPopupControlButton(controls, "+1°", false, async () => { var _a; await this.app.callEntityService("climate", "set_temperature", { entity_id: entityId, temperature: Number((_a = attrs.temperature) !== null && _a !== void 0 ? _a : 20) + 1 }); close(); });
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
        if (secs > 0) {
            clearTimeout(this._popupTimer);
            this._popupTimer = setTimeout(close, secs * 1000);
        }
    }
    async _toggleWidgetEntity(widget, config) {
        const entityId = this._resolvePrimaryEntityId(config, null);
        if (!entityId)
            return;
        try {
            const ok = await this._invokeToggleAction(entityId, config.toggle_mode || 'toggle');
            if (!ok)
                return;
            setTimeout(() => this._syncWidgetToggleBadge(widget, config), 250);
        }
        catch (e) {
            console.warn("Toggle failed for", entityId, e);
        }
    }
    async _invokeToggleAction(entityId, mode = 'toggle') {
        var _a, _b, _c, _d, _e;
        const st = ((_b = (_a = this.app) === null || _a === void 0 ? void 0 : _a.entityStates) === null || _b === void 0 ? void 0 : _b[entityId]) || {};
        const domain = String(entityId || '').split('.')[0];
        const serviceDomain = domain === 'input_boolean' ? 'input_boolean' : domain;
        if (!entityId)
            return false;
        if (mode === 'on') {
            if (domain === 'cover')
                return this.app.callEntityService('cover', 'open_cover', { entity_id: entityId });
            if (domain === 'valve')
                return this.app.callEntityService('valve', 'open_valve', { entity_id: entityId });
            return this.app.callEntityService(serviceDomain, 'turn_on', { entity_id: entityId });
        }
        if (mode === 'off') {
            if (domain === 'cover')
                return this.app.callEntityService('cover', 'close_cover', { entity_id: entityId });
            if (domain === 'valve')
                return this.app.callEntityService('valve', 'close_valve', { entity_id: entityId });
            return this.app.callEntityService(serviceDomain, 'turn_off', { entity_id: entityId });
        }
        if (domain === 'cover') {
            const pos = Number((_d = (_c = st.attributes) === null || _c === void 0 ? void 0 : _c.current_position) !== null && _d !== void 0 ? _d : (String(st.state).toLowerCase() === 'open' ? 100 : 0));
            return this.app.callEntityService('cover', pos > 10 ? 'close_cover' : 'open_cover', { entity_id: entityId });
        }
        if (domain === 'valve') {
            const open = Utils.isTruthyState(st.state) || String(st.state || '').toLowerCase() === 'open';
            return this.app.callEntityService('valve', open ? 'close_valve' : 'open_valve', { entity_id: entityId });
        }
        if (!((_e = this.app) === null || _e === void 0 ? void 0 : _e.callEntityToggle))
            return false;
        return this.app.callEntityToggle(entityId);
    }
    // ══════════════════════════════════════════════════════════
    // TEIL 3 – ScreenManager Helpers + TickerManager + AlertManager + App
    // ══════════════════════════════════════════════════════════
    /* ────── Helper-Methoden ────── */
    _normalizeEntityIdList(list) {
        return [...new Set(Utils.safeArray(list).map(item => typeof item === "string" ? item : (item === null || item === void 0 ? void 0 : item.entity_id) || (item === null || item === void 0 ? void 0 : item.id) || "").filter(Boolean))];
    }
    _truncateLabel(label, maxLen) {
        const text = Utils.text(label, "");
        const n = Number(maxLen || 0);
        if (!n || n < 1)
            return text;
        return text.length > n ? `${text.slice(0, Math.max(1, n)).trim()}…` : text;
    }
    _widgetPrimaryMeta(config) {
        var _a, _b;
        const primaryId = (config === null || config === void 0 ? void 0 : config.entity_id) || ((_a = config === null || config === void 0 ? void 0 : config.config) === null || _a === void 0 ? void 0 : _a.camera_entity) || "";
        if (!primaryId)
            return { alias: "", hide_name: false, color: "" };
        const meta = ((_b = config === null || config === void 0 ? void 0 : config.config) === null || _b === void 0 ? void 0 : _b.entity_meta) || (config === null || config === void 0 ? void 0 : config.entity_meta) || {};
        const entry = (meta === null || meta === void 0 ? void 0 : meta[primaryId]) || {};
        return { alias: entry.alias || "", hide_name: !!entry.hide_name, color: entry.color || "" };
    }
    _widgetName(config, fallback = "") {
        var _a, _b, _c, _d;
        const show = ((_a = config === null || config === void 0 ? void 0 : config.config) === null || _a === void 0 ? void 0 : _a.show_name) !== false && (config === null || config === void 0 ? void 0 : config.show_name) !== false;
        const primaryMeta = this._widgetPrimaryMeta(config);
        if (!show || primaryMeta.hide_name)
            return "";
        const raw = (config === null || config === void 0 ? void 0 : config.name) || primaryMeta.alias || fallback || "";
        const maxLen = (_d = (_c = (_b = config === null || config === void 0 ? void 0 : config.config) === null || _b === void 0 ? void 0 : _b.name_max_length) !== null && _c !== void 0 ? _c : config === null || config === void 0 ? void 0 : config.name_max_length) !== null && _d !== void 0 ? _d : 0;
        return this._truncateLabel(raw, maxLen);
    }
    _widgetCameraTitle(config, fallback = "") {
        var _a;
        const show = ((_a = config === null || config === void 0 ? void 0 : config.config) === null || _a === void 0 ? void 0 : _a.camera_show_title) !== false && (config === null || config === void 0 ? void 0 : config.camera_show_title) !== false;
        if (!show)
            return "";
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
        if (meta.hide_name)
            return `Serie ${idx + 1}`;
        return meta.alias || fallback || entityId || `Serie ${idx + 1}`;
    }
    _chartPaletteSet(name = "default") {
        const palettes = {
            default: [[33, 150, 243], [76, 175, 80], [255, 152, 0], [156, 39, 176], [244, 67, 54], [0, 188, 212], [255, 235, 59], [255, 87, 34]],
            ocean: [[0, 172, 193], [33, 150, 243], [3, 169, 244], [0, 121, 107], [0, 188, 212], [38, 198, 218], [77, 208, 225], [129, 212, 250]],
            sunset: [[255, 112, 67], [255, 171, 64], [255, 202, 40], [236, 64, 122], [171, 71, 188], [126, 87, 194], [255, 138, 101], [255, 204, 128]],
            neon: [[0, 230, 255], [0, 255, 149], [255, 61, 113], [255, 214, 10], [188, 19, 254], [127, 255, 0], [255, 0, 110], [0, 245, 255]],
            mono: [[224, 224, 224], [189, 189, 189], [158, 158, 158], [117, 117, 117], [97, 97, 97], [66, 66, 66], [245, 245, 245], [176, 190, 197]]
        };
        return palettes[name] || palettes.default;
    }
    _chartPalette(index = 0, alpha = 1, config = null, entityId = "") {
        var _a, _b;
        const metaColor = entityId ? (_a = this._extraEntityMeta(config, entityId)) === null || _a === void 0 ? void 0 : _a.color : "";
        if (metaColor) {
            if (metaColor.startsWith("rgba") || metaColor.startsWith("rgb") || metaColor.startsWith("hsl"))
                return metaColor;
            if (metaColor.startsWith("#")) {
                const hex = metaColor.replace("#", "");
                const full = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
                if (full.length === 6) {
                    const r = parseInt(full.slice(0, 2), 16);
                    const g = parseInt(full.slice(2, 4), 16);
                    const b = parseInt(full.slice(4, 6), 16);
                    return `rgba(${r},${g},${b},${alpha})`;
                }
            }
            return metaColor;
        }
        const base = this._chartPaletteSet(((_b = config === null || config === void 0 ? void 0 : config.config) === null || _b === void 0 ? void 0 : _b.chart_palette) || (config === null || config === void 0 ? void 0 : config.chart_palette) || "default");
        const [r, g, b] = base[index % base.length];
        return `rgba(${r},${g},${b},${alpha})`;
    }
    _chartSamplePoints(points, maxPoints = 36) {
        const list = Utils.safeArray(points);
        if (list.length <= maxPoints)
            return list;
        const step = (list.length - 1) / Math.max(1, (maxPoints - 1));
        const out = [];
        for (let i = 0; i < maxPoints; i++)
            out.push(list[Math.round(i * step)]);
        return out;
    }
    _chartEntityIds(config) {
        var _a;
        const ids = [];
        if (config.entity_id)
            ids.push(config.entity_id);
        for (const extra of this._normalizeEntityIdList(((_a = config.config) === null || _a === void 0 ? void 0 : _a.entities) || config.entities)) {
            if (extra && !ids.includes(extra))
                ids.push(extra);
        }
        return ids;
    }
    _extraEntityMeta(config, entityId) {
        var _a, _b;
        const meta = ((_a = config === null || config === void 0 ? void 0 : config.config) === null || _a === void 0 ? void 0 : _a.entity_meta) || (config === null || config === void 0 ? void 0 : config.entity_meta) || {};
        const entry = (meta === null || meta === void 0 ? void 0 : meta[entityId]) || {};
        const showNames = ((_b = config === null || config === void 0 ? void 0 : config.config) === null || _b === void 0 ? void 0 : _b.show_extra_entity_names) !== false && (config === null || config === void 0 ? void 0 : config.show_extra_entity_names) !== false;
        return { alias: entry.alias || "", hide_name: entry.hide_name || !showNames, color: entry.color || "" };
    }
    _renderExtraEntityList(widget, config) {
        var _a;
        const entityIds = this._normalizeEntityIdList(((_a = config.config) === null || _a === void 0 ? void 0 : _a.entities) || config.entities);
        if (!entityIds.length)
            return;
        const rows = entityIds.map(entityId => {
            var _a, _b, _c, _d, _e;
            const st = this.app.entityStates[entityId] || {};
            const meta = this._extraEntityMeta(config, entityId);
            const label = meta.hide_name ? "" : (meta.alias || ((_a = st.attributes) === null || _a === void 0 ? void 0 : _a.friendly_name) || entityId);
            const unit = ((_b = st.attributes) === null || _b === void 0 ? void 0 : _b.unit_of_measurement) || "";
            const val = Utils.formatStateWithUnit((_c = st.state) !== null && _c !== void 0 ? _c : "—", unit, { decimals: (_d = config.config) === null || _d === void 0 ? void 0 : _d.extra_value_decimals, trimTrailingZeros: ((_e = config.config) === null || _e === void 0 ? void 0 : _e.trim_trailing_zeros) !== false });
            return `<div class="td-extra-row ${meta.hide_name ? "name-hidden" : ""}" data-entity-id="${entityId}"><span class="td-extra-name">${Utils.text(label)}</span><span class="td-extra-value">${val}</span></div>`;
        }).join("");
        widget.insertAdjacentHTML("beforeend", `<div class="td-extra-entities" data-count="${entityIds.length}">${rows}</div>`);
    }
    async _renderMetricSparkline(widget, config) {
        var _a, _b, _c, _d, _e, _f, _g;
        if (!widget || !(config === null || config === void 0 ? void 0 : config.entity_id) || !METRIC_WIDGET_TYPES.has(config.type || ""))
            return;
        if (((_a = config.config) === null || _a === void 0 ? void 0 : _a.metric_graph) === false) {
            (_b = widget.querySelector(".metric-history-mini")) === null || _b === void 0 ? void 0 : _b.remove();
            return;
        }
        const hours = Number(((_c = config.config) === null || _c === void 0 ? void 0 : _c.metric_graph_hours) || ((_d = config.config) === null || _d === void 0 ? void 0 : _d.hours) || ((_f = (_e = this.app) === null || _e === void 0 ? void 0 : _e.globalSettings) === null || _f === void 0 ? void 0 : _f.default_chart_hours) || 24);
        const history = await this.app.dataManager.fetchHistory(config.entity_id, hours);
        const maxPoints = Math.max(8, Math.min(32, Number(((_g = config.config) === null || _g === void 0 ? void 0 : _g.metric_graph_points) || 18)));
        const points = Utils.safeArray(history === null || history === void 0 ? void 0 : history.data).slice(-maxPoints);
        const svg = this._metricSparklineSvg(points, config);
        const existing = widget.querySelector(".metric-history-mini");
        if (!svg) {
            if (existing)
                existing.remove();
            return;
        }
        if (existing) {
            existing.innerHTML = svg;
            return;
        }
        const html = `<div class="metric-history-mini">${svg}</div>`;
        const extras = widget.querySelector(".td-extra-entities");
        if (extras)
            extras.insertAdjacentHTML("beforebegin", html);
        else
            widget.insertAdjacentHTML("beforeend", html);
    }
    _metricSparklineSvg(points, config) {
        var _a;
        const values = Utils.safeArray(points).map((point) => Utils.toNumber(point === null || point === void 0 ? void 0 : point.y, null)).filter((value) => value !== null);
        const width = 180;
        const height = 42;
        const pad = 4;
        const accent = (config === null || config === void 0 ? void 0 : config.accent_color) || ((_a = config === null || config === void 0 ? void 0 : config.config) === null || _a === void 0 ? void 0 : _a.accent_color) || "var(--td-accent)";
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
        var _a;
        const entityIds = this._normalizeEntityIdList(((_a = config.config) === null || _a === void 0 ? void 0 : _a.entities) || config.entities);
        const container = element.querySelector(".td-extra-entities");
        if (!entityIds.length) {
            if (container)
                container.remove();
            return;
        }
        const rows = element.querySelectorAll(".td-extra-row");
        if (!container || rows.length !== entityIds.length) {
            if (container)
                container.remove();
            this._renderExtraEntityList(element, config);
            return;
        }
        rows.forEach(row => {
            var _a, _b, _c, _d, _e;
            const entityId = row.dataset.entityId;
            const st = this.app.entityStates[entityId] || {};
            const unit = ((_a = st.attributes) === null || _a === void 0 ? void 0 : _a.unit_of_measurement) || "";
            const meta = this._extraEntityMeta(config, entityId);
            const label = meta.hide_name ? "" : (meta.alias || ((_b = st.attributes) === null || _b === void 0 ? void 0 : _b.friendly_name) || entityId);
            const nameEl = row.querySelector(".td-extra-name");
            const valueEl = row.querySelector(".td-extra-value");
            row.classList.toggle("name-hidden", !!meta.hide_name);
            if (nameEl)
                nameEl.textContent = label;
            if (valueEl)
                valueEl.textContent = Utils.formatStateWithUnit((_c = st.state) !== null && _c !== void 0 ? _c : "—", unit, { decimals: (_d = config.config) === null || _d === void 0 ? void 0 : _d.extra_value_decimals, trimTrailingZeros: ((_e = config.config) === null || _e === void 0 ? void 0 : _e.trim_trailing_zeros) !== false });
        });
    }
    _weatherVisual(condition, cfg = {}) {
        const text = String(condition || "").toLowerCase();
        const animate = cfg.weather_animation !== false;
        if (/(lightning|thunder|gewitter)/.test(text))
            return { icon: "⛈️", label: "Gewitter", animClass: "storm", theme: "theme-storm", animate };
        if (/(snow|schnee|sleet|hail)/.test(text))
            return { icon: "🌨️", label: "Schnee", animClass: "snow", theme: "theme-snow", animate };
        if (/(rain|regen|pouring|shower|drizzle)/.test(text))
            return { icon: "🌧️", label: "Regen", animClass: "rain", theme: "theme-rain", animate };
        if (/(fog|mist|nebel|haze)/.test(text))
            return { icon: "🌫️", label: "Nebel", animClass: "fog", theme: "theme-fog", animate };
        if (/(wind|breeze|gust|windy|sturm)/.test(text))
            return { icon: "💨", label: "Windig", animClass: "wind", theme: "theme-wind", animate };
        if (/(cloud|bew|overcast)/.test(text))
            return { icon: "☁️", label: "Bewölkt", animClass: "clouds", theme: "theme-clouds", animate };
        if (/(clear|sun|sonn)/.test(text))
            return { icon: "☀️", label: "Sonnig", animClass: "sun", theme: "theme-sun", animate };
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
        if (currentScreenCfg === null || currentScreenCfg === void 0 ? void 0 : currentScreenCfg.screen_motion_enabled) {
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
            setTimeout(() => { oldScreen.remove(); newScreen.classList.remove(`screen-enter-${type}`); }, 600);
        }
        else {
            if (oldScreen)
                oldScreen.remove();
            this.container.appendChild(newScreen);
        }
    }
    _startRotation() {
        var _a;
        this._stopRotation(false);
        if (this.screens.length <= 1 || this.isPaused)
            return;
        const ms = (((_a = this.screens[this.currentIndex]) === null || _a === void 0 ? void 0 : _a.duration) || 15) * 1000;
        this.rotationTimer = setTimeout(() => { if (!this.isPaused && !this.temporaryScreen)
            this.next(); this._startRotation(); }, ms);
    }
    _stopRotation(clearTemps = true) {
        if (this.rotationTimer) {
            clearTimeout(this.rotationTimer);
            this.rotationTimer = null;
        }
        if (clearTemps)
            this._clearIntervals();
    }
    _clearIntervals() {
        this._clockIntervals.forEach(clearInterval);
        this._cameraIntervals.forEach(clearInterval);
        this._countdownIntervals.forEach(clearInterval);
        this._chartInstances.forEach(c => { try {
            c.destroy();
        }
        catch (e) { } });
        this._clockIntervals = [];
        this._cameraIntervals = [];
        this._countdownIntervals = [];
        this._chartInstances = [];
    }
    _getZoneColor(value, zones) {
        if (!(zones === null || zones === void 0 ? void 0 : zones.length))
            return "var(--td-accent)";
        for (const z of zones) {
            if (value >= z.from && value <= z.to)
                return z.color;
        }
        return "var(--td-accent)";
    }
    _defaultIconForType(type) {
        const map = { "simple-value": "🔢", "icon-value": "ℹ️", "mini-graph": "📉", "line-chart": "📈", "bar-chart": "📊", "area-chart": "🌊", "multi-line-chart": "📈", "stacked-bar-chart": "🧱", "horizontal-bar-chart": "↔️", "donut-chart": "🍩", "pie-chart": "🥧", "radar-chart": "🕸️", "heatmap-mini": "🔥", "timeline-chart": "🕒", "scatter-chart": "✳️", "bubble-chart": "🫧", "polar-area-chart": "🧿", "forecast-chart": "🔮", "energy-flow-mini": "⚡", "comparison-chart": "⚖️", "radial-gauge-advanced": "🎛️", "bullet-chart": "🎯", "sparkline": "〰️", "trend-arrow": "📈", "media-player-control": "🎵", "switch-control": "🎚️", "light-control": "💡", "climate-control": "🌡️", "cover-control": "🪟", "weather": "🌤️", "clock": "🕐", "image": "🖼️", "camera": "📹", "qr-code": "🔳", "countdown": "⏱️", "button": "🔘", "web-embed": "🌐" };
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
        this._autoHideTimer = null;
        this._isVisible = true;
        console.log("📺 TickerManager init");
    }
    /** Debug-Hilfe */
    debug() {
        console.log("=== TICKER DEBUG ===", "Messages:", this.messages.length, "Visible:", this._isVisible);
    }
    /** Initialisierung */
    init() {
        console.log("📺 Ticker init gestartet");
        const tickerConfig = this.app.config.ticker || {};
        console.log("📺 Ticker Config:", tickerConfig);
        this._applyStyle(tickerConfig);
        if (!tickerConfig.enabled) {
            console.log("📺 Ticker deaktiviert");
            this._setBarVisible(false);
            return;
        }
        this.entityTemplates = Utils.safeArray(tickerConfig.entities);
        this._setBarVisible(true);
        this._rebuild();
        console.log("📺 Ticker init abgeschlossen");
    }
    rebuild() {
        const cfg = this.app.config.ticker || {};
        this.entityTemplates = Utils.safeArray(cfg.entities);
        this._applyStyle(cfg);
        this._rebuild();
    }
    _conditionMatches(state, condition) {
        if (!condition)
            return true;
        const raw = String(condition).trim();
        const lower = raw.toLowerCase();
        const value = Number(state === null || state === void 0 ? void 0 : state.state);
        if (lower.startsWith("state="))
            return String(state === null || state === void 0 ? void 0 : state.state) === raw.slice(6);
        if (lower.startsWith("state!="))
            return String(state === null || state === void 0 ? void 0 : state.state) !== raw.slice(7);
        if (lower.startsWith("gt:"))
            return Number.isFinite(value) && value > Number(raw.slice(3));
        if (lower.startsWith("gte:"))
            return Number.isFinite(value) && value >= Number(raw.slice(4));
        if (lower.startsWith("lt:"))
            return Number.isFinite(value) && value < Number(raw.slice(3));
        if (lower.startsWith("lte:"))
            return Number.isFinite(value) && value <= Number(raw.slice(4));
        if (lower.startsWith("contains:"))
            return String((state === null || state === void 0 ? void 0 : state.state) || "").includes(raw.slice(9));
        return true;
    }
    _buildRuleItems() {
        var _a, _b, _c;
        const rules = Utils.safeArray((_a = this.app.config.ticker) === null || _a === void 0 ? void 0 : _a.rules).filter(r => r && (r.domain || r.entity_id || r.condition));
        const items = [];
        for (const rule of rules.sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
            for (const [entityId, state] of Object.entries(this.app.entityStates || {})) {
                if (rule.entity_id && rule.entity_id !== entityId)
                    continue;
                if (rule.domain && !String(entityId).startsWith(`${rule.domain}.`))
                    continue;
                if (!this._conditionMatches(state, rule.condition))
                    continue;
                const tpl = String(rule.template || '{friendly_name}: {state}{unit}');
                const text = tpl.replaceAll('{entity_id}', entityId).replaceAll('{state}', (state === null || state === void 0 ? void 0 : state.state) || '').replaceAll('{friendly_name}', ((_b = state === null || state === void 0 ? void 0 : state.attributes) === null || _b === void 0 ? void 0 : _b.friendly_name) || entityId).replaceAll('{unit}', ((_c = state === null || state === void 0 ? void 0 : state.attributes) === null || _c === void 0 ? void 0 : _c.unit_of_measurement) ? ` ${state.attributes.unit_of_measurement}` : '');
                items.push({ text, color: rule.color, icon: rule.icon, priority: rule.priority || 0 });
            }
        }
        return items;
    }
    _applyStyle(cfg = {}) {
        const root = document.documentElement;
        if (!root)
            return;
        const preset = { classic: {}, glass: { background_color: "rgba(20,24,32,.45)", text_color: "#ffffff", accent_color: "#7dd3fc", border_radius: 14, font_weight: 600, opacity: 0.92 }, alert: { background_color: "rgba(120,8,8,.85)", text_color: "#fff5f5", accent_color: "#ffd54f", border_radius: 0, font_weight: 700 }, minimal: { background_color: "rgba(0,0,0,.22)", text_color: "#f3f4f6", accent_color: "#9ca3af", border_radius: 10, font_weight: 500 } }[cfg.style_template || "classic"] || {};
        cfg = { ...preset, ...cfg };
        if (cfg.height)
            root.style.setProperty("--td-ticker-height", `${cfg.height}px`);
        if (cfg.font_size)
            root.style.setProperty("--td-ticker-font-size", `${cfg.font_size}px`);
        if (cfg.item_padding_x)
            root.style.setProperty("--td-ticker-padding-x", `${cfg.item_padding_x}px`);
        if (cfg.text_color)
            root.style.setProperty("--td-ticker-text-color", String(cfg.text_color));
        if (cfg.background_color)
            root.style.setProperty("--td-ticker-bg", String(cfg.background_color));
        if (cfg.accent_color)
            root.style.setProperty("--td-ticker-accent", String(cfg.accent_color));
        if (cfg.border_radius != null)
            root.style.setProperty("--td-ticker-radius", `${cfg.border_radius}px`);
        if (cfg.font_weight != null)
            root.style.setProperty("--td-ticker-font-weight", String(cfg.font_weight));
        if (cfg.opacity != null && this.bar)
            this.bar.style.opacity = String(cfg.opacity);
        if (this.bar) {
            this.bar.classList.toggle("top", (cfg.position || "bottom") === "top");
            this.bar.classList.toggle("bottom", (cfg.position || "bottom") !== "top");
        }
    }
    /** Sichtbarkeit der Ticker-Leiste setzen */
    _setBarVisible(visible) {
        this._isVisible = visible;
        console.log("📺 Ticker sichtbar:", visible);
        if (this.bar) {
            this.bar.hidden = !visible;
            this.bar.style.display = visible ? "flex" : "none";
        }
        const screen = document.querySelector(".screen-container");
        if (screen)
            screen.classList.toggle("no-ticker", !visible);
    }
    /** Auto-Hide Timer planen */
    _scheduleAutoHide() {
        if (this._autoHideTimer) {
            clearTimeout(this._autoHideTimer);
            this._autoHideTimer = null;
        }
        const cfg = this.app.config.ticker || {};
        if (!cfg.auto_show_on_message) {
            console.log("⏰ Auto-Hide deaktiviert");
            return;
        }
        const seconds = Math.max(2, Number(cfg.auto_hide_seconds || 15));
        console.log("⏰ Auto-Hide geplant in", seconds, "Sekunden");
        this._autoHideTimer = setTimeout(() => {
            console.log("⏰ Auto-Hide ausgelöst!");
            this._autoHideTimer = null;
            this._rebuild();
        }, seconds * 1000);
    }
    /** Nachrichten von WebSocket hinzufügen */
    addMessages(msgs) {
        console.log("📨 addMessages erhalten:", msgs);
        const cfg = this.app.config.ticker || {};
        // msgs kann Array oder Objekt sein
        const msgArray = Array.isArray(msgs) ? msgs : [msgs];
        const now = Date.now();
        const duration = Number(cfg.message_duration || cfg.auto_hide_seconds || 15);
        const incoming = msgArray.map((m) => {
            const text = m.text || m.message || m.msg || "";
            if (!text || !text.trim())
                return null;
            console.log("📨 Neue Nachricht:", text);
            return {
                text: text.trim(),
                color: m.color || null,
                icon: m.icon || null,
                priority: Number(m.priority) || 0,
                timestamp: now,
                duration: Number(m.duration) || duration,
            };
        }).filter(Boolean);
        if (!incoming.length) {
            console.warn("⚠️ Keine gültigen Nachrichten!");
            return;
        }
        // Alte oder neue Nachrichten
        if (cfg.replace_on_new_message) {
            this.messages = incoming;
        }
        else {
            this.messages.push(...incoming);
        }
        console.log("📨 Nachrichten gesamt:", this.messages.length);
        if (cfg.auto_show_on_message)
            this._setBarVisible(true);
        this._scheduleAutoHide();
        this._rebuild();
    }
    setEntities(data) { this.entityTemplates = Utils.safeArray(data.entities); this._rebuild(); }
    clear() { this.messages = []; this.entityTemplates = []; this._rebuild(); }
    onEntityUpdate(entityId) {
        if (this.entityTemplates.some(t => (typeof t === "string" ? t : t.entity_id) === entityId))
            this._rebuild();
    }
    /** Ticker-Leiste komplett neu bauen */
    _rebuild() {
        var _a, _b, _c;
        if (!this.container) {
            console.warn("⚠️ Ticker Container fehlt!");
            return;
        }
        const cfg = this.app.config.ticker || {};
        const direction = cfg.direction || "ltr";
        console.log("🔨 _rebuild() Richtung:", direction, "Nachrichten:", this.messages.length);
        let items = [];
        const showList = cfg.show_list !== false;
        // Fixed Messages
        if (showList) {
            for (const msg of Utils.safeArray(cfg.fixed_messages || [])) {
                const text = typeof msg === "string" ? msg : ((msg === null || msg === void 0 ? void 0 : msg.text) || "");
                if (text && text.trim()) {
                    items.push({
                        text: text.trim(),
                        color: typeof msg === "object" ? msg.color : null,
                        icon: typeof msg === "object" ? msg.icon : null,
                        priority: typeof msg === "object" ? (Number(msg.priority) || 0) : 0
                    });
                }
            }
            // Entity-Templates
            for (const tmpl of this.entityTemplates) {
                const eid = typeof tmpl === "string" ? tmpl : tmpl.entity_id;
                if (!eid)
                    continue;
                const tpl = typeof tmpl === "string" ? "{friendly_name}: {state}" : (tmpl.template || "{friendly_name}: {state}{unit}");
                const color = typeof tmpl === "object" ? tmpl.color : null;
                const icon = typeof tmpl === "object" ? tmpl.icon : null;
                const priority = typeof tmpl === "object" ? (Number(tmpl.priority) || 0) : 0;
                const state = (_a = this.app.entityStates) === null || _a === void 0 ? void 0 : _a[eid];
                if (state) {
                    const unitStr = ((_b = state.attributes) === null || _b === void 0 ? void 0 : _b.unit_of_measurement) ? ` ${state.attributes.unit_of_measurement}` : "";
                    const text = tpl
                        .replaceAll("{state}", String(state.state || ""))
                        .replaceAll("{friendly_name}", ((_c = state.attributes) === null || _c === void 0 ? void 0 : _c.friendly_name) || eid)
                        .replaceAll("{unit}", unitStr)
                        .replaceAll("{entity_id}", eid);
                    if (text && text.trim()) {
                        items.push({ text: text.trim(), color, icon, priority });
                    }
                }
            }
        }
        // Aktive Nachrichten (von WebSocket)
        const now = Date.now();
        this.messages = this.messages.filter(m => {
            const age = (now - m.timestamp) / 1000;
            return age < (m.duration || 60);
        });
        for (const m of this.messages) {
            if (m.text && m.text.trim()) {
                items.push({
                    text: m.text.trim(),
                    color: m.color || null,
                    icon: m.icon || null,
                    priority: Number(m.priority) || 0
                });
            }
        }
        // Rule-basierte Items
        if (showList) {
            items.push(...this._buildRuleItems());
        }
        // Leere entfernen und sortieren
        items = items.filter(item => item && item.text && item.text.trim());
        items.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        const shouldHide = cfg.enabled === false || (!items.length && cfg.hide_when_empty !== false);
        if (shouldHide) {
            this._setBarVisible(false);
            this.container.innerHTML = "";
            this.container.classList.remove("scrolling");
            this.container.style.animation = "none";
            console.log("📺 Ticker ausgeblendet");
            return;
        }
        this._setBarVisible(true);
        // HTML bauen
        const separator = String(cfg.separator || " | ");
        const buildItem = (item, idx) => {
            const style = item.color ? `color:${item.color}` : "";
            const iconHtml = item.icon ? `<span class="ticker-icon">${item.icon}</span>` : "";
            return `<span class="ticker-item" data-index="${idx}" ${style ? `style="${style}"` : ""}>${iconHtml}${item.text}</span>`;
        };
        const buildList = (list) => list.map((item, i) => {
            return buildItem(item, i) + (i < list.length - 1 ? `<span class="ticker-separator">${separator}</span>` : "");
        }).join("");
        // CSS-Klassen
        this.container.classList.remove("single-item", "direction-ltr", "direction-rtl", "scrolling");
        this.container.classList.add(direction === "rtl" ? "direction-rtl" : "direction-ltr");
        // Animation stoppen
        this.container.style.animation = "none";
        this.container.style.display = "inline-flex";
        this.container.style.width = "auto";
        this.container.style.whiteSpace = "nowrap";
        // Items anzeigen
        const itemCount = items.length;
        if (itemCount === 0) {
            this.container.innerHTML = "";
            this.container.classList.remove("scrolling");
            return;
        }
        if (itemCount === 1 && !cfg.force_scroll) {
            // Einzelnes Item
            this.container.innerHTML = buildList(items);
            this.container.classList.add("single-item");
            if (cfg.scroll_single !== false) {
                this.container.classList.add("scrolling");
                // RTL = von rechts nach links, LTR = von links nach rechts
                const animName = direction === "rtl" ? "tickerScrollSingleRtl" : "tickerScrollSingleLtr";
                this.container.style.animation = `${animName} 15s linear infinite`;
            }
        }
        else {
            // Mehrere Items duplizieren
            const content = buildList(items);
            const sepHtml = `<span class="ticker-separator">${separator}</span>`;
            this.container.innerHTML = content + sepHtml + content;
            this.container.classList.add("scrolling");
            // RTL = von rechts nach links, LTR = von links nach rechts
            const animName = direction === "rtl" ? "tickerScrollRtl" : "tickerScrollLtr";
            const speed = cfg.speed || "normal";
            const mult = { slow: 1.8, normal: 1.0, fast: 0.5 }[speed] || 1;
            const totalChars = items.reduce((sum, item) => { var _a; return sum + (((_a = item.text) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
            const duration = Math.max(8, Math.min(60, totalChars * 0.25 * mult));
            this.container.style.animation = `${animName} ${duration}s linear infinite`;
        }
        console.log("✅ Ticker rebuild abgeschlossen, Items:", itemCount, "Animation:", direction);
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
    async show(data = {}) {
        var _a, _b, _c, _d, _e;
        this.clearAll();
        const toastDefaults = ((_b = (_a = this.app) === null || _a === void 0 ? void 0 : _a.config) === null || _b === void 0 ? void 0 : _b.toast) || {};
        const payload = ((data === null || data === void 0 ? void 0 : data.mode) === "toast") ? { ...toastDefaults, ...data } : { ...data };
        const mode = payload.mode || "fullscreen";
        // TTS URL is prepared by the backend to avoid unauthenticated /api/tts_get_url calls.
        this._activeTag = payload.tag || null;
        this._emit("alert_shown", { tag: payload.tag || "", title: payload.title || "", mode, severity: payload.severity || "info" });
        if (payload.wake_screen)
            (_e = (_d = (_c = this.app) === null || _c === void 0 ? void 0 : _c.bridge) === null || _d === void 0 ? void 0 : _d.setScreenPower) === null || _e === void 0 ? void 0 : _e.call(_d, true);
        this._startAttentionEffects(payload);
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
        const tag = (opts === null || opts === void 0 ? void 0 : opts.tag) || null;
        if (tag && this._activeTag && tag !== this._activeTag)
            return;
        this._timers.forEach(clearTimeout);
        this._timers = [];
        this._stopAttentionEffects();
        if (this.overlay) {
            this.overlay.hidden = true;
            this.overlay.innerHTML = "";
        }
        if (this.banner) {
            this.banner.hidden = true;
            this.banner.innerHTML = "";
        }
        if (this.toastContainer) {
            this.toastContainer.hidden = true;
            this.toastContainer.innerHTML = "";
        }
        if (this._activeTag)
            this._emit("alert_closed", { tag: this._activeTag, reason: (opts === null || opts === void 0 ? void 0 : opts.reason) || "clear" });
        this._activeTag = null;
    }
    _emit(event, data = {}) {
        var _a, _b;
        try {
            (_b = (_a = this.app) === null || _a === void 0 ? void 0 : _a.wsClient) === null || _b === void 0 ? void 0 : _b.send({ type: "event", event, data });
        }
        catch (e) {
            console.warn("alert event emit failed", event, e);
        }
    }
    _startAttentionEffects(data = {}) {
        var _a, _b, _c, _d, _e, _f, _g;
        this._stopAttentionEffects();
        const volume = Number((_a = data.volume) !== null && _a !== void 0 ? _a : 70);
        const audioUrl = data.sound_url || "";
        const shouldLoop = !!(data.sound_url && !data.tts_url && (data.persistent || data.require_ack));
        if (audioUrl)
            (_d = (_c = (_b = this.app) === null || _b === void 0 ? void 0 : _b.bridge) === null || _c === void 0 ? void 0 : _c.playSound) === null || _d === void 0 ? void 0 : _d.call(_c, audioUrl, volume, shouldLoop);
        if (data.vibrate) {
            (_g = (_f = (_e = this.app) === null || _e === void 0 ? void 0 : _e.bridge) === null || _f === void 0 ? void 0 : _f.vibrate) === null || _g === void 0 ? void 0 : _g.call(_f, 700);
            if (data.persistent || data.require_ack) {
                this._attentionVibrateTimer = setInterval(() => { var _a, _b, _c; return (_c = (_b = (_a = this.app) === null || _a === void 0 ? void 0 : _a.bridge) === null || _b === void 0 ? void 0 : _b.vibrate) === null || _c === void 0 ? void 0 : _c.call(_b, 700); }, 1800);
            }
        }
        if (data.flash_screen || data.blink_screen) {
            document.body.classList.add("td-alert-flash", "td-alert-flash-active");
            this._attentionFlashTimer = setInterval(() => document.body.classList.toggle("td-alert-flash-active"), 500);
        }
    }
    _stopAttentionEffects() {
        var _a, _b, _c;
        if (this._attentionVibrateTimer) {
            clearInterval(this._attentionVibrateTimer);
            this._attentionVibrateTimer = null;
        }
        if (this._attentionFlashTimer) {
            clearInterval(this._attentionFlashTimer);
            this._attentionFlashTimer = null;
        }
        document.body.classList.remove("td-alert-flash", "td-alert-flash-active");
        (_c = (_b = (_a = this.app) === null || _a === void 0 ? void 0 : _a.bridge) === null || _b === void 0 ? void 0 : _b.stopSound) === null || _c === void 0 ? void 0 : _c.call(_b);
    }
    _armAutoClose(data) {
        if (data.persistent || data.require_ack)
            return;
        const duration = Math.max(0, Number(data.duration || 0));
        if (!duration)
            return;
        this._timers.push(setTimeout(() => this.clearAll({ reason: "timeout" }), duration * 1000));
    }
    _actionsMarkup(data) {
        const buttons = [];
        if (data.require_ack || data.ack_label)
            buttons.push({ id: "ack", label: data.ack_label || "Bestätigen", style: "primary", close: true });
        for (const action of Utils.safeArray(data.actions))
            buttons.push(action);
        if (data.secondary_label)
            buttons.push({ id: data.secondary_action || "secondary", label: data.secondary_label, style: "ghost", close: true });
        if (!buttons.length && data.persistent)
            buttons.push({ id: "dismiss", label: "Schließen", style: "ghost", close: true });
        if (!buttons.length)
            return "";
        return `<div class="alert-actions">${buttons.map((action) => `<button type="button" class="alert-action-btn ${action.style || "ghost"}" data-alert-action="${Utils.text(action.id || action.event || "action")}" data-alert-close="${action.close === false ? "false" : "true"}">${Utils.text(action.label || "Aktion")}</button>`).join("")}</div>`;
    }
    _progressMarkup(data) {
        if (data.progress_value == null && !data.progress_text)
            return "";
        const pct = Math.max(0, Math.min(100, Number(data.progress_value || 0)));
        return `<div class="alert-progress-wrap"><div class="alert-progress"><span style="width:${pct}%"></span></div>${data.progress_text ? `<div class="alert-progress-text">${Utils.text(data.progress_text)}</div>` : ""}</div>`;
    }
    _bindAlertActions(root, data) {
        root.querySelectorAll('[data-alert-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-alert-action') || 'action';
                const close = btn.getAttribute('data-alert-close') !== 'false';
                this._emit('alert_action', { tag: data.tag || '', action, title: data.title || '', source: data.source || '' });
                if (close)
                    this.clearAll({ reason: action });
            });
        });
    }
    _showFullscreen(data) {
        if (!this.overlay)
            return;
        const sev = data.severity || "info";
        const colorStyle = data.color ? ` style="background:${Utils.text(data.color)};"` : "";
        this.overlay.className = `alert-overlay severity-${sev}`;
        this.overlay.innerHTML = `<div class="alert-card"${colorStyle}><div class="alert-topline">${Utils.text(data.source || "Alert")}</div><div class="alert-icon">${data.icon || { info: "ℹ️", warning: "⚠️", critical: "🚨" }[sev] || "ℹ️"}</div><div class="alert-title">${Utils.text(data.title || "")}</div><div class="alert-message">${Utils.text(data.message || "")}</div>${this._progressMarkup(data)}${this._actionsMarkup(data)}${data.duration && !data.require_ack && !data.persistent ? `<div class="alert-timer">Schließt in ${data.duration}s</div>` : ""}</div>`;
        this.overlay.hidden = false;
        this._bindAlertActions(this.overlay, data);
        this._armAutoClose(data);
    }
    _showBanner(data) {
        if (!this.banner)
            return;
        const sev = data.severity || "info";
        this.banner.className = `notification-banner severity-${sev}`;
        if (data.color)
            this.banner.style.background = String(data.color);
        else
            this.banner.style.background = "";
        this.banner.innerHTML = `<div class="banner-icon">${Utils.text(data.icon || { info: "ℹ️", warning: "⚠️", critical: "🚨" }[sev] || "ℹ️")}</div><div class="banner-main"><div class="banner-title-row"><div class="banner-title">${Utils.text(data.title || data.source || 'Hinweis')}</div>${data.tag ? `<div class="banner-tag">${Utils.text(data.tag)}</div>` : ''}</div><div class="banner-message">${Utils.text(data.message || '')}</div>${this._progressMarkup(data)}</div>${this._actionsMarkup(data)}`;
        this.banner.hidden = false;
        this._bindAlertActions(this.banner, data);
        this._armAutoClose(data);
    }
    _showOverlay(data) {
        if (!this.overlay)
            return;
        const sev = data.severity || "info";
        this.overlay.className = `alert-overlay overlay-card-mode severity-${sev}`;
        this.overlay.innerHTML = `<div class="alert-card alert-card-overlay"><div class="alert-topline">${Utils.text(data.source || 'Overlay')}</div><div class="alert-title">${Utils.text(data.title || '')}</div><div class="alert-message">${Utils.text(data.message || '')}</div>${this._progressMarkup(data)}${this._actionsMarkup(data)}</div>`;
        this.overlay.hidden = false;
        this._bindAlertActions(this.overlay, data);
        this._armAutoClose(data);
    }
    _showSplit(data) {
        if (!this.overlay)
            return;
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
        var _a, _b;
        if (!this.toastContainer)
            return;
        const position = data.position || "bottom";
        this.toastContainer.className = `toast-container pos-${position}`;
        const bg = data.color || "#111827";
        const color = data.text_color || "#f9fafb";
        const accent = data.accent_color || "#60a5fa";
        const radius = Number((_a = data.border_radius) !== null && _a !== void 0 ? _a : 16);
        const fontSize = Number((_b = data.font_size) !== null && _b !== void 0 ? _b : 16);
        this.toastContainer.innerHTML = `<div class="toast-message" style="background:${bg};color:${color};border-radius:${radius}px;font-size:${fontSize}px;border-left:4px solid ${accent}"><div class="toast-title">${Utils.text(data.title || data.source || 'Info')}</div><div>${Utils.text(data.message || '')}</div>${this._actionsMarkup(data)}</div>`;
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
        this._entityRefreshTimers = {};
        this._initTime = Date.now();
    }
    async init() {
        var _a, _b, _c, _d, _e;
        console.log("🚀 Ticker Display v3 startet...", this.deviceId);
        // Locale aus Config setzen falls vorhanden
        if ((_a = this.globalSettings) === null || _a === void 0 ? void 0 : _a.locale)
            Utils.setLocale(this.globalSettings.locale);
        else if ((_b = this.config) === null || _b === void 0 ? void 0 : _b.locale)
            Utils.setLocale(this.config.locale);
        // Preview-Modus: Draft aus localStorage laden
        try {
            const qp = new URLSearchParams(location.search);
            const previewKey = qp.get("td_preview_key");
            if (this.isPreview && previewKey) {
                const raw = localStorage.getItem(previewKey);
                if (raw) {
                    const draft = JSON.parse(raw);
                    if (draft && typeof draft === "object") {
                        this.config = {
                            ...(this.config || {}),
                            ...draft,
                            screens: Array.isArray(draft.screens) ? draft.screens : (this.config.screens || []),
                        };
                    }
                }
            }
        }
        catch (e) {
            console.warn("Preview-Draft laden fehlgeschlagen:", e);
        }
        // Gecachte Config als Fallback laden
        try {
            if (!((_d = (_c = this.config) === null || _c === void 0 ? void 0 : _c.screens) === null || _d === void 0 ? void 0 : _d.length)) {
                const cached = localStorage.getItem("ticker_config_cache");
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if ((_e = parsed === null || parsed === void 0 ? void 0 : parsed.screens) === null || _e === void 0 ? void 0 : _e.length) {
                        console.log("📦 Verwende gecachte Konfiguration");
                        this.config = { ...this.config, ...parsed };
                    }
                }
            }
        }
        catch (e) { /* Cache-Fehler ignorieren */ }
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
            if (loading) {
                loading.style.opacity = "0";
                loading.style.transition = "opacity 0.3s ease";
                setTimeout(() => { loading.style.display = "none"; }, 350);
            }
            const offline = document.getElementById("offline-screen");
            if (offline && this.isPreview)
                offline.hidden = true;
            this.wsClient.connect()
                .then(() => {
                var _a;
                console.log("✅ WebSocket verbunden");
                if (offline)
                    offline.hidden = true;
                (_a = this.reportSensorsNow) === null || _a === void 0 ? void 0 : _a.call(this);
            })
                .catch(e => {
                console.warn("⚠️ WebSocket-Verbindung fehlgeschlagen, Offline-Modus:", e.message || e);
                if (offline && this.isPreview)
                    offline.hidden = true;
            });
            this._startSensorReporting();
            this._startStatePolling();
            // Visibility-Change: Bei Tab-Wechsel Daten aktualisieren
            document.addEventListener("visibilitychange", () => {
                var _a, _b, _c;
                if (!document.hidden) {
                    this._pollEntityStates(true);
                    if (!((_a = this.wsClient) === null || _a === void 0 ? void 0 : _a.isConnected()))
                        (_c = (_b = this.wsClient) === null || _b === void 0 ? void 0 : _b.connect) === null || _c === void 0 ? void 0 : _c.call(_b).catch(() => { });
                }
            });
            const initDuration = Date.now() - this._initTime;
            console.log(`✅ Ticker Display bereit! (${initDuration}ms)`);
        }
        catch (e) {
            console.error("❌ Initialisierungsfehler:", e);
            const loading = document.getElementById("loading-screen");
            if (loading) {
                loading.innerHTML = `<div style="text-align:center;color:#ef5350"><div style="font-size:48px">❌</div><div style="margin-top:12px">Fehler beim Laden</div><div style="font-size:14px;opacity:.7;margin-top:8px">${Utils.escapeHtml(e.message || "Unbekannter Fehler")}</div></div>`;
            }
        }
    }
    onEntityStateChanged(id, state) {
        this.previousEntityStates[id] = this.entityStates[id] || this.previousEntityStates[id] || null;
        this.entityStates[id] = state;
        this.screenManager.onEntityUpdate(id, state);
        this.tickerManager.onEntityUpdate(id, state);
    }
    onCommand(cmd, data) {
        var _a, _b, _c;
        const screenCmds = ["show_dashboard", "show_graph", "show_camera", "show_weather", "show_single_value", "show_clock", "show_status_board", "show_image", "show_template"];
        if (screenCmds.includes(cmd)) {
            this.screenManager.showTemporaryScreen(cmd, data);
            return;
        }
        if (cmd === "clear_alert")
            this.alertManager.clearAll(data || {});
        else if (cmd === "set_ticker_entities")
            this.tickerManager.setEntities(data);
        else if (cmd === "clear_ticker")
            this.tickerManager.clear();
        else if (cmd === "identify")
            this._showIdentify();
        else if (cmd === "assist_command") {
            try {
                (_c = (_b = (_a = this.bridge) === null || _a === void 0 ? void 0 : _a._bridge) === null || _b === void 0 ? void 0 : _b.assistCommand) === null || _c === void 0 ? void 0 : _c.call(_b, JSON.stringify(data || {}));
            }
            catch (e) {
                console.warn("assist command failed", e);
            }
        }
    }
    onAlert(data) { this.alertManager.show(data); }
    onTickerMessages(msgs) { this.tickerManager.addMessages(msgs); }
    onDisplayControl(data) { if (data.brightness !== undefined)
        this.bridge.setScreenBrightness(data.brightness); if (data.screen_power !== undefined)
        this.bridge.setScreenPower(data.screen_power); }
    async onAudio(data) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        if (data.action === "play")
            this.bridge.playSound(data.url, data.volume, data.loop);
        else if (data.action === "announce")
            (_b = (_a = this.bridge._bridge) === null || _a === void 0 ? void 0 : _a.playAnnouncement) === null || _b === void 0 ? void 0 : _b.call(_a, data.url, (_c = data.volume) !== null && _c !== void 0 ? _c : 90);
        else if (data.action === "stop")
            this.bridge.stopSound();
        else if (data.action === "pause")
            (_e = (_d = this.bridge._bridge) === null || _d === void 0 ? void 0 : _d.pauseSound) === null || _e === void 0 ? void 0 : _e.call(_d);
        else if (data.action === "resume" || data.action === "play_resume")
            (_g = (_f = this.bridge._bridge) === null || _f === void 0 ? void 0 : _f.resumeSound) === null || _g === void 0 ? void 0 : _g.call(_f);
        else if (data.action === "next")
            (_j = (_h = this.bridge._bridge) === null || _h === void 0 ? void 0 : _h.nextSound) === null || _j === void 0 ? void 0 : _j.call(_h);
        else if (data.action === "previous")
            (_l = (_k = this.bridge._bridge) === null || _k === void 0 ? void 0 : _k.previousSound) === null || _l === void 0 ? void 0 : _l.call(_k);
        else if (data.action === "set_volume")
            this.bridge.setVolume(data.volume);
    }
    _refreshEntityStateSoon(entityId) {
        if (!entityId)
            return;
        this._entityRefreshTimers = this._entityRefreshTimers || {};
        clearTimeout(this._entityRefreshTimers[entityId]);
        this._entityRefreshTimers[entityId] = setTimeout(async () => {
            const state = await this.dataManager.fetchState(entityId);
            if (state)
                this.onEntityStateChanged(entityId, state);
        }, 350);
    }
    async callEntityToggle(entityId) {
        if (!entityId)
            return false;
        try {
            const resp = await fetch(`${this.apiBase}/api/entity/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ entity_id: entityId }) });
            if (!resp.ok)
                throw new Error(`HTTP ${resp.status}`);
            this._refreshEntityStateSoon(entityId);
            return true;
        }
        catch (e) {
            console.warn("toggle failed", entityId, e);
            return false;
        }
    }
    async callEntityAction(entityId, action, data = {}) {
        if (!entityId || !action)
            return false;
        try {
            const resp = await fetch(`${this.apiBase}/api/entity/action`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ entity_id: entityId, action, data }) });
            if (!resp.ok)
                throw new Error(`HTTP ${resp.status}`);
            this._refreshEntityStateSoon(entityId);
            return true;
        }
        catch (e) {
            console.warn("action call failed", entityId, action, data, e);
            return false;
        }
    }
    async callEntityService(domain, service, data = {}) {
        try {
            const resp = await fetch(`${this.apiBase}/api/entity/service`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ domain, service, data }) });
            if (!resp.ok)
                throw new Error(`HTTP ${resp.status}`);
            if (data === null || data === void 0 ? void 0 : data.entity_id)
                this._refreshEntityStateSoon(data.entity_id);
            return true;
        }
        catch (e) {
            console.warn("service call failed", domain, service, data, e);
            return false;
        }
    }
    onNavigate(data) {
        if (data.action === "next")
            this.screenManager.next();
        else if (data.action === "previous")
            this.screenManager.previous();
        else if (data.action === "goto")
            this.screenManager.goto(data.screen_id);
        else if (data.action === "pause")
            this.screenManager.pauseRotation();
        else if (data.action === "resume")
            this.screenManager.resumeRotation();
    }
    onConfigChanged(cfg) {
        var _a;
        console.log("📥 Config changed", cfg);
        this.config = cfg || {};
        this.neededEntities = window.TICKER_ENTITIES || this.neededEntities;
        this._primeEntityStates();
        this.screenManager.rebuild();
        this.tickerManager.rebuild();
        this._startStatePolling();
        const offline = document.getElementById("offline-screen");
        if (offline) {
            if (this.isPreview)
                offline.hidden = true;
            else if ((_a = this.wsClient) === null || _a === void 0 ? void 0 : _a.isConnected())
                offline.hidden = true;
        }
        try {
            localStorage.setItem("ticker_config_cache", JSON.stringify(cfg));
        }
        catch (e) { }
    }
    onThemeChanged(data) { this.themeManager.applyDynamic(data); }
    reportSensorsNow() {
        var _a;
        if (!this.bridge || !this.bridge.isAvailable())
            return;
        const d = this.bridge.getAllSensorData();
        if (d && ((_a = this.wsClient) === null || _a === void 0 ? void 0 : _a.isConnected()))
            this.wsClient.send({ type: "sensor_update", data: { device_id: this.deviceId, ...d } });
    }
    async _primeEntityStates() { await this._pollEntityStates(false); }
    async _pollEntityStates(emitChanges = true) {
        const ids = [...new Set((this.neededEntities || []).filter(Boolean))].slice(0, 250);
        if (!ids.length)
            return;
        const results = await Promise.all(ids.map(id => this.dataManager.fetchState(id)));
        results.forEach((state, idx) => {
            const entityId = ids[idx];
            if (!state)
                return;
            const prev = this.entityStates[entityId];
            const changed = !prev || prev.state !== state.state || JSON.stringify(prev.attributes || {}) !== JSON.stringify(state.attributes || {});
            if (changed && prev)
                this.previousEntityStates[entityId] = prev;
            this.entityStates[entityId] = state;
            if (emitChanges && changed)
                this.onEntityStateChanged(entityId, state);
        });
    }
    _startStatePolling() {
        var _a;
        if (this._statePollTimer)
            clearInterval(this._statePollTimer);
        const ms = ((_a = this.wsClient) === null || _a === void 0 ? void 0 : _a.isConnected()) ? 30000 : 12000;
        this._statePollTimer = setInterval(() => this._pollEntityStates(true), ms);
        setTimeout(() => this._pollEntityStates(true), 1500);
    }
    _startSensorReporting() {
        if (!this.bridge.isAvailable())
            return;
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
