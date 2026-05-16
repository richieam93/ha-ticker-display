/*
 * Ticker Display 3.0.4 - Kiosk-only display engine.
 * Kiosk-only display. Shows Home Assistant pages in a fullscreen iframe,
 * plus ticker/toast/banner/alert.
 */
(function () {
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (search, replacement) {
      var target = String(this);
      if (search instanceof RegExp) {
        if (!search.global) throw new TypeError("replaceAll called with a non-global RegExp argument");
        return target.replace(search, replacement);
      }
      return target.split(String(search)).join(String(replacement));
    };
  }
})();

var Utils = {
  escapeHtml: function (value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },
  safeArray: function (value) { return Array.isArray(value) ? value : []; },
  clamp: function (value, min, max) {
    var n = Number(value);
    if (!isFinite(n)) n = min;
    return Math.max(min, Math.min(max, n));
  },
  cleanInt: function (value, fallback, min, max) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = fallback;
    return Math.max(min, Math.min(max, n));
  },
  text: function (value, fallback) {
    if (fallback === undefined) fallback = "";
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }
};

function callBridge(bridge, name, args) {
  try {
    if (bridge && typeof bridge[name] === "function") {
      return bridge[name].apply(bridge, args || []);
    }
  } catch (err) {
    console.warn("Bridge call failed", name, err);
  }
  return null;
}

function BridgeWrapper() {
  this._bridge = window.TickerBridge || null;
  this._audioElement = null;
}
BridgeWrapper.prototype.isAvailable = function () { return !!this._bridge; };
BridgeWrapper.prototype.setScreenBrightness = function (value) { callBridge(this._bridge, "setScreenBrightness", [Math.round(Number(value) || 0)]); };
BridgeWrapper.prototype.setScreenPower = function (on) { callBridge(this._bridge, "setScreenPower", [!!on]); };
BridgeWrapper.prototype.setScreenOrientation = function (value) { callBridge(this._bridge, "setScreenOrientation", [Math.round(Number(value) || 0)]); };
BridgeWrapper.prototype.setVolume = function (value) { callBridge(this._bridge, "setVolume", [Number(value) || 0]); };
BridgeWrapper.prototype.setNativeSetting = function (setting, value) { return callBridge(this._bridge, "setDeviceSetting", [String(setting), String(value)]); };
BridgeWrapper.prototype.restartApp = function () { callBridge(this._bridge, "restartApp", []); };
BridgeWrapper.prototype.openAndroidSettings = function () { callBridge(this._bridge, "openAndroidSettings", []); };
BridgeWrapper.prototype.reportDeviceStateNow = function () { callBridge(this._bridge, "reportDeviceStateNow", []); };
BridgeWrapper.prototype.vibrate = function (ms) {
  if (ms === undefined) ms = 500;
  if (!callBridge(this._bridge, "vibrate", [Number(ms) || 500]) && navigator.vibrate) navigator.vibrate(Number(ms) || 500);
};
BridgeWrapper.prototype.playSound = function (url, volume, loop) {
  if (!url) return;
  if (volume === undefined) volume = 100;
  if (this._bridge) {
    if (loop) callBridge(this._bridge, "playSoundLoop", [String(url)]);
    else callBridge(this._bridge, "playSound", [String(url)]);
    this.setVolume(volume);
    return;
  }
  try {
    if (this._audioElement) this._audioElement.pause();
    this._audioElement = new Audio(url);
    this._audioElement.volume = Utils.clamp(Number(volume) / 100, 0, 1);
    this._audioElement.loop = !!loop;
    this._audioElement.play().catch(function () {});
  } catch (err) {}
};
BridgeWrapper.prototype.pauseSound = function () {
  if (this._bridge) { callBridge(this._bridge, "pauseSound", []); return; }
  if (this._audioElement) this._audioElement.pause();
};
BridgeWrapper.prototype.resumeSound = function () {
  if (this._bridge) { callBridge(this._bridge, "resumeSound", []); return; }
  if (this._audioElement) this._audioElement.play().catch(function () {});
};
BridgeWrapper.prototype.nextSound = function () { callBridge(this._bridge, "nextSound", []); };
BridgeWrapper.prototype.previousSound = function () { callBridge(this._bridge, "previousSound", []); };
BridgeWrapper.prototype.stopSound = function () {
  if (this._bridge) {
    callBridge(this._bridge, "stopSound", []);
    return;
  }
  if (this._audioElement) {
    this._audioElement.pause();
    this._audioElement = null;
  }
};
BridgeWrapper.prototype.getAllSensorData = function () {
  var b = this._bridge;
  if (!b) return null;
  return {
    battery_level: callBridge(b, "getBatteryLevel", []),
    battery_charging: callBridge(b, "isBatteryCharging", []),
    battery_temperature: callBridge(b, "getBatteryTemperature", []),
    wifi_signal: callBridge(b, "getWifiSignal", []),
    wifi_ssid: callBridge(b, "getWifiSsid", []),
    ip_address: callBridge(b, "getIpAddress", []),
    light_level: callBridge(b, "getLightLevel", []),
    motion_detected: callBridge(b, "isMotionDetected", []),
    screen_on: callBridge(b, "isScreenOn", []),
    screen_brightness: callBridge(b, "getScreenBrightness", []),
    memory_free_mb: callBridge(b, "getMemoryFree", []),
    app_version: callBridge(b, "getAppVersion", []),
    webview_url: location.href,
    webview_user_agent: navigator.userAgent || "",
    webview_version: navigator.userAgent || ""
  };
};

function WebSocketClient(app) {
  this.app = app;
  this.ws = null;
  this.connected = false;
  this.reconnectDelay = 1000;
  this.timer = null;
  this.manualClose = false;
}
WebSocketClient.prototype.connect = function () {
  var self = this;
  this.manualClose = false;
  if (!this.app.wsUrl) return Promise.reject(new Error("No WebSocket URL"));
  return new Promise(function (resolve, reject) {
    var resolved = false;
    try {
      if (self.ws) {
        try { self.ws.close(); } catch (e) {}
        self.ws = null;
      }
      var ws = new WebSocket(self.app.wsUrl);
      self.ws = ws;
      ws.onopen = function () {
        self.connected = true;
        self.reconnectDelay = 1000;
        if (self.timer) { clearTimeout(self.timer); self.timer = null; }
        self.app.setOffline(null, null, true);
        self.send({ type: "subscribe", entities: self.app.neededEntities || [] });
        if (!resolved) { resolved = true; resolve(); }
      };
      ws.onmessage = function (ev) {
        try { self.handle(JSON.parse(ev.data)); } catch (err) { console.warn("WS parse error", err); }
      };
      ws.onclose = function (ev) {
        self.connected = false;
        if (!self.app.isPreview) self.app.setOffline("Live-Verbindung unterbrochen", "Automatischer Neuversuch läuft.");
        if (!self.manualClose) self.scheduleReconnect();
        if (!resolved) { resolved = true; reject(new Error("WebSocket closed: " + ev.code)); }
      };
      ws.onerror = function (err) {
        if (!resolved) { resolved = true; reject(err); }
      };
    } catch (err) {
      if (!resolved) { resolved = true; reject(err); }
    }
  });
};
WebSocketClient.prototype.scheduleReconnect = function () {
  var self = this;
  if (this.app.isPreview || this.timer) return;
  this.timer = setTimeout(function () {
    self.timer = null;
    self.connect().catch(function () {
      self.reconnectDelay = Math.min(self.reconnectDelay * 2, 30000);
      self.scheduleReconnect();
    });
  }, this.reconnectDelay);
};
WebSocketClient.prototype.send = function (data) {
  if (this.ws && this.connected && this.ws.readyState === WebSocket.OPEN) {
    this.ws.send(JSON.stringify(data));
  }
};
WebSocketClient.prototype.isConnected = function () { return this.connected; };
WebSocketClient.prototype.handle = function (msg) {
  if (!msg || !msg.type) return;
  if (msg.type === "command") this.app.onCommand(msg.command, msg.data || {});
  else if (msg.type === "alert") this.app.onAlert(msg.data || {});
  else if (msg.type === "ticker") this.app.onTickerMessages(msg.messages || []);
  else if (msg.type === "display_control") this.app.onDisplayControl(msg);
  else if (msg.type === "audio") this.app.onAudio(msg);
  else if (msg.type === "native_control") this.app.onNativeControl(msg);
  else if (msg.type === "native_action") this.app.onNativeAction(msg);
  else if (msg.type === "module") this.app.onModule(msg.module, msg.data || {});
  else if (msg.type === "navigate") this.app.onNavigate(msg);
  else if (msg.type === "config_changed") this.app.onConfigChanged(msg.config);
  else if (msg.type === "reload") location.reload();
};

function normalizePageUrl(raw, kiosk) {
  var value = String(raw || "").trim();
  if (!value) value = "/lovelace";
  var isExternal = /^https?:\/\//i.test(value);
  try {
    var u = new URL(value, window.location.origin);
    isExternal = u.origin !== window.location.origin;
    if (!isExternal && kiosk !== false) {
      if (!u.searchParams.has("kiosk")) u.searchParams.set("kiosk", "1");
      if (!u.searchParams.has("hide_header")) u.searchParams.set("hide_header", "1");
      if (!u.searchParams.has("hide_sidebar")) u.searchParams.set("hide_sidebar", "1");
      if (!u.searchParams.has("embed")) u.searchParams.set("embed", "1");
    }
    return isExternal ? u.href : (u.pathname + u.search + u.hash);
  } catch (err) {
    if (value.charAt(0) !== "/") value = "/" + value.replace(/^\/+/, "");
    return value;
  }
}

function pageFromConfig(raw, index) {
  raw = raw && typeof raw === "object" ? raw : {};
  var url = raw.url || raw.page_url || raw.kiosk_url || "/lovelace";
  return {
    id: raw.id || ("page_" + index),
    name: raw.name || raw.title || ("Seite " + (index + 1)),
    url: normalizePageUrl(url, raw.kiosk !== false),
    duration: Utils.cleanInt(raw.duration, 60, 5, 86400),
    enabled: raw.enabled !== false,
    kiosk: raw.kiosk !== false
  };
}

function KioskPageManager(app) {
  this.app = app;
  this.container = document.getElementById("screen-container");
  this.pages = [];
  this.currentIndex = 0;
  this.timer = null;
  this.pauseTimer = null;
  this.pausedUntil = 0;
}
KioskPageManager.prototype.rebuild = function () {
  this.stop();
  this.pages = [];
  var screens = Utils.safeArray(this.app.config.screens);
  for (var i = 0; i < screens.length; i++) {
    var p = pageFromConfig(screens[i], i);
    if (p.enabled && p.url) this.pages.push(p);
  }
  if (!this.pages.length) this.pages.push(pageFromConfig({ name: "Home Assistant", url: "/lovelace", duration: 60 }, 0));
  if (this.currentIndex >= this.pages.length) this.currentIndex = 0;
  this.show(this.currentIndex);
  this.schedule();
};
KioskPageManager.prototype.start = function () { this.rebuild(); };
KioskPageManager.prototype.stop = function () {
  if (this.timer) clearTimeout(this.timer);
  if (this.pauseTimer) clearTimeout(this.pauseTimer);
  this.timer = null;
  this.pauseTimer = null;
};
KioskPageManager.prototype.show = function (index) {
  if (!this.container) return;
  if (index < 0) index = this.pages.length - 1;
  if (index >= this.pages.length) index = 0;
  this.currentIndex = index;
  var page = this.pages[index];
  var old = this.container.querySelector(".screen");
  var screen = document.createElement("div");
  screen.className = "screen ha-kiosk-screen";
  var title = Utils.escapeHtml(page.name || "Home Assistant");
  var src = Utils.escapeHtml(page.url || "/lovelace");
  screen.innerHTML = '<iframe class="ha-kiosk-frame" src="' + src + '" title="' + title + '" allow="fullscreen; clipboard-read; clipboard-write; autoplay" referrerpolicy="same-origin"></iframe><div class="ha-kiosk-loading"><div class="loading-spinner"></div><span>' + title + '</span></div>';
  this.container.appendChild(screen);
  if (old) setTimeout(function () { try { old.remove(); } catch (e) {} }, 80);
  var self = this;
  var iframe = screen.querySelector("iframe");
  var loading = screen.querySelector(".ha-kiosk-loading");
  var pause = function () { self.pauseForTouch(); };
  screen.addEventListener("pointerdown", pause, true);
  screen.addEventListener("touchstart", pause, true);
  screen.addEventListener("click", pause, true);
  if (iframe) {
    iframe.addEventListener("load", function () {
      if (loading) loading.className += " hidden";
      self.applyKioskStyles(iframe);
      self.attachPauseHooks(iframe, pause);
    });
    setTimeout(function () {
      self.applyKioskStyles(iframe);
      self.attachPauseHooks(iframe, pause);
    }, 1500);
  }
  if (this.app.wsClient) this.app.wsClient.send({ type: "status", screen: page.name || page.id || "page" });
};
KioskPageManager.prototype.applyKioskStyles = function (iframe) {
  try {
    var doc = iframe && (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document));
    if (!doc || !doc.head || doc.getElementById("td-kiosk-style")) return;
    var style = doc.createElement("style");
    style.id = "td-kiosk-style";
    style.textContent = 'app-header,app-toolbar,ha-top-app-bar-fixed,ha-drawer,ha-sidebar,ha-menu-button,.toolbar,.header,.mdc-top-app-bar,.edit-mode-toolbar{display:none!important;visibility:hidden!important;max-height:0!important}home-assistant,home-assistant-main,app-drawer-layout,partial-panel-resolver,ha-panel-lovelace,hui-root,ha-app-layout{--app-header-height:0px!important;--mdc-top-app-bar-height:0px!important}ha-panel-lovelace,hui-root,.view,.container,main,#view,#root,body{margin-top:0!important;padding-top:0!important;top:0!important}';
    doc.head.appendChild(style);
  } catch (err) {}
};
KioskPageManager.prototype.attachPauseHooks = function (iframe, pause) {
  try {
    var doc = iframe && (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document));
    if (!doc || doc.__tickerDisplayPauseHooked) return;
    doc.__tickerDisplayPauseHooked = true;
    ["pointerdown", "touchstart", "mousedown", "click", "keydown"].forEach(function (name) {
      doc.addEventListener(name, pause, true);
    });
  } catch (err) {}
};
KioskPageManager.prototype.schedule = function () {
  var self = this;
  if (this.timer) clearTimeout(this.timer);
  if (this.pages.length <= 1) return;
  var page = this.pages[this.currentIndex] || {};
  var seconds = Utils.cleanInt(page.duration, 60, 5, 86400);
  this.timer = setTimeout(function () {
    if (Date.now() < self.pausedUntil) {
      self.schedule();
      return;
    }
    self.next();
  }, seconds * 1000);
};
KioskPageManager.prototype.next = function () { this.show(this.currentIndex + 1); this.schedule(); };
KioskPageManager.prototype.previous = function () { this.show(this.currentIndex - 1); this.schedule(); };
KioskPageManager.prototype.goto = function (id) {
  for (var i = 0; i < this.pages.length; i++) {
    if (this.pages[i].id === id || this.pages[i].name === id) { this.show(i); this.schedule(); return; }
  }
};
KioskPageManager.prototype.pauseForTouch = function () {
  var rotation = this.app.config.rotation || {};
  var seconds = Utils.cleanInt(rotation.touch_pause_seconds, 300, 0, 86400);
  if (seconds <= 0) return;
  this.pauseRotationFor(seconds);
};
KioskPageManager.prototype.pauseRotationFor = function (seconds) {
  var self = this;
  this.pausedUntil = Date.now() + seconds * 1000;
  this.showPauseHint(seconds);
  if (this.pauseTimer) clearTimeout(this.pauseTimer);
  this.pauseTimer = setTimeout(function () { self.pausedUntil = 0; self.schedule(); }, seconds * 1000);
};
KioskPageManager.prototype.pauseRotation = function () { this.pauseRotationFor(86400); };
KioskPageManager.prototype.resumeRotation = function () { this.pausedUntil = 0; this.schedule(); };
KioskPageManager.prototype.showPauseHint = function (seconds) {
  try {
    var old = document.getElementById("td-kiosk-pause-hint");
    if (old) old.remove();
    var el = document.createElement("div");
    el.id = "td-kiosk-pause-hint";
    el.className = "td-kiosk-pause-hint";
    el.textContent = "Rotation pausiert für " + Math.round(seconds / 60) + " Min.";
    document.body.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 2600);
  } catch (err) {}
};

function TickerManager(app) {
  this.app = app;
  this.bar = document.getElementById("ticker-bar");
  this.content = document.getElementById("ticker-content");
  this.messages = [];
  this.hideTimer = null;
}
TickerManager.prototype.init = function () { this.rebuild(); };
TickerManager.prototype.rebuild = function () {
  var cfg = this.app.config.ticker || {};
  if (!this.bar || !this.content) return;
  if (cfg.enabled === false) {
    this.bar.hidden = true;
    document.documentElement.style.setProperty("--td-ticker-offset", "0px");
    var sc = document.getElementById("screen-container");
    if (sc) sc.classList.add("no-ticker");
    return;
  }
  var position = cfg.position || "bottom";
  document.documentElement.classList.toggle("td-ticker-top", position === "top");
  document.documentElement.classList.toggle("td-ticker-bottom", position !== "top");
  this.bar.className = "ticker-bar ticker-" + position;
  this.bar.hidden = false;
  var height = Utils.cleanInt(cfg.height || cfg.ticker_height || 36, 36, 20, 120);
  document.documentElement.style.setProperty("--td-ticker-height", height + "px");
  document.documentElement.style.setProperty("--td-ticker-offset", height + "px");
  var screen = document.getElementById("screen-container");
  if (screen) screen.classList.remove("no-ticker");
  var fixed = Utils.safeArray(cfg.fixed_messages || cfg.messages).map(function (m) {
    return typeof m === "string" ? m : (m && (m.text || m.message)) || "";
  }).filter(Boolean);
  this.messages = fixed;
  this.render();
};
TickerManager.prototype.render = function () {
  if (!this.content) return;
  var list = this.messages.length ? this.messages : [];
  if (!list.length) {
    this.content.innerHTML = "";
    return;
  }
  var text = list.map(function (m) { return Utils.escapeHtml(m); }).join(' <span class="ticker-separator">│</span> ');
  this.content.innerHTML = '<span class="ticker-track">' + text + '</span>';
};
TickerManager.prototype.addMessages = function (messages) {
  var cfg = this.app.config.ticker || {};
  var incoming = Utils.safeArray(messages).map(function (m) {
    return typeof m === "string" ? { message: m } : (m || {});
  });
  if (!incoming.length) return;
  var first = incoming[0];
  var text = first.message || first.text || "";
  if (!text) return;
  if (first.color && this.bar) this.bar.style.background = first.color;
  if (cfg.replace_on_new_message !== false || first.replace === true) this.messages = [text];
  else this.messages.push(text);
  this.render();
  var duration = Utils.cleanInt(first.duration || cfg.auto_hide_seconds || 0, 0, 0, 3600);
  if (duration > 0) {
    var self = this;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(function () { self.rebuild(); }, duration * 1000);
  }
};
TickerManager.prototype.clear = function () { this.messages = []; this.render(); };
TickerManager.prototype.onEntityUpdate = function () {};
TickerManager.prototype.setEntities = function () {};

function AlertManager(app) {
  this.app = app;
  this.overlay = document.getElementById("alert-overlay");
  this.banner = document.getElementById("notification-banner");
  this.toastContainer = document.getElementById("toast-container");
  this.timer = null;
}
AlertManager.prototype.clearAll = function () {
  if (this.overlay) { this.overlay.hidden = true; this.overlay.innerHTML = ""; }
  if (this.banner) { this.banner.hidden = true; this.banner.innerHTML = ""; }
  if (this.toastContainer) { this.toastContainer.hidden = true; this.toastContainer.innerHTML = ""; }
  if (this.timer) clearTimeout(this.timer);
};
AlertManager.prototype.show = function (data) {
  data = data || {};
  var mode = data.mode || data.display_mode || "fullscreen";
  if (mode === "toast" || mode === "notification") this.showToast(data);
  else if (mode === "banner") this.showBanner(data);
  else this.showFullscreen(data);
  if (data.sound_url || data.sound) this.app.bridge.playSound(data.sound_url || data.sound, data.volume || 100, false);
  if (data.vibrate) this.app.bridge.vibrate(500);
};
AlertManager.prototype.actionsMarkup = function (data) {
  var actions = Utils.safeArray(data.actions);
  if (!actions.length && data.require_ack) actions = [{ label: data.ack_label || "Bestätigen", close: true }];
  if (!actions.length) return "";
  return '<div class="alert-actions">' + actions.map(function (a, i) {
    return '<button data-alert-action="' + i + '">' + Utils.escapeHtml(a.label || ("Aktion " + (i + 1))) + '</button>';
  }).join("") + '</div>';
};
AlertManager.prototype.bindActions = function (root, data) {
  var self = this;
  var actions = Utils.safeArray(data.actions);
  var nodes = root.querySelectorAll("[data-alert-action]");
  Array.prototype.forEach.call(nodes, function (btn) {
    btn.addEventListener("click", function () {
      var index = Number(btn.getAttribute("data-alert-action"));
      var action = actions[index] || { close: true };
      if (action.close !== false) self.clearAll();
      if (self.app.wsClient) self.app.wsClient.send({ type: "event", event: "alert_action", action: action });
    });
  });
};
AlertManager.prototype.armClose = function (data) {
  var self = this;
  var duration = Utils.cleanInt(data.duration, 0, 0, 86400);
  if (this.timer) clearTimeout(this.timer);
  if (duration > 0) this.timer = setTimeout(function () { self.clearAll(); }, duration * 1000);
};
AlertManager.prototype.showFullscreen = function (data) {
  if (!this.overlay) return;
  var color = data.color || (data.severity === "critical" ? "#dc2626" : "#ff9800");
  this.overlay.className = "alert-overlay fullscreen-mode severity-" + Utils.escapeHtml(data.severity || "warning");
  this.overlay.innerHTML = '<div class="alert-card alert-card-full" style="--alert-color:' + Utils.escapeHtml(color) + '"><div class="alert-title">' + Utils.escapeHtml(data.title || "") + '</div><div class="alert-message">' + Utils.escapeHtml(data.message || "") + '</div>' + this.actionsMarkup(data) + '</div>';
  this.overlay.hidden = false;
  this.bindActions(this.overlay, data);
  this.armClose(data);
};
AlertManager.prototype.showBanner = function (data) {
  if (!this.banner) return;
  var color = data.color || "#2196F3";
  this.banner.className = "notification-banner banner-mode";
  this.banner.innerHTML = '<div class="banner-card" style="background:' + Utils.escapeHtml(color) + '"><strong>' + Utils.escapeHtml(data.title || "Info") + '</strong><span>' + Utils.escapeHtml(data.message || "") + '</span>' + this.actionsMarkup(data) + '</div>';
  this.banner.hidden = false;
  this.bindActions(this.banner, data);
  this.armClose(data);
};
AlertManager.prototype.showToast = function (data) {
  if (!this.toastContainer) return;
  var color = data.color || "#111827";
  this.toastContainer.className = "toast-container pos-" + (data.position || "bottom");
  this.toastContainer.innerHTML = '<div class="toast-message" style="background:' + Utils.escapeHtml(color) + '"><div class="toast-title">' + Utils.escapeHtml(data.title || data.source || "Info") + '</div><div>' + Utils.escapeHtml(data.message || "") + '</div>' + this.actionsMarkup(data) + '</div>';
  this.toastContainer.hidden = false;
  this.bindActions(this.toastContainer, data);
  this.armClose(data);
};


function ModuleManager(app) {
  this.app = app;
  this.root = document.getElementById("module-overlay");
  this.timer = null;
  this.clockTimer = null;
  this.refreshTimer = null;
}
ModuleManager.prototype.defaultsFor = function (name) {
  var modules = this.app.config.modules || {};
  return modules[name] || {};
};
ModuleManager.prototype.merge = function (name, data) {
  var base = this.defaultsFor(name);
  var out = {};
  var k;
  for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
  data = data || {};
  for (k in data) if (Object.prototype.hasOwnProperty.call(data, k) && data[k] !== undefined && data[k] !== null && data[k] !== "") out[k] = data[k];
  return out;
};
ModuleManager.prototype.clear = function () {
  if (this.timer) clearTimeout(this.timer);
  if (this.clockTimer) clearInterval(this.clockTimer);
  if (this.refreshTimer) clearInterval(this.refreshTimer);
  this.timer = null;
  this.clockTimer = null;
  this.refreshTimer = null;
  if (this.root) { this.root.hidden = true; this.root.innerHTML = ""; }
};
ModuleManager.prototype.armClose = function (cfg) {
  var self = this;
  var duration = Utils.cleanInt(cfg.duration, 0, 0, 86400);
  if (this.timer) clearTimeout(this.timer);
  if (duration > 0) this.timer = setTimeout(function () { self.clear(); }, duration * 1000);
};
ModuleManager.prototype.positionClass = function (value) {
  value = String(value || "top-right").toLowerCase().replace(/_/g, "-");
  if (value === "full" || value === "fullscreen") return "pos-fullscreen";
  if (["top-left", "top-right", "bottom-left", "bottom-right", "center"].indexOf(value) === -1) value = "top-right";
  return "pos-" + value;
};
ModuleManager.prototype.card = function (kind, cfg, inner) {
  this.clear();
  if (!this.root) return null;
  this.root.hidden = false;
  var el = document.createElement("div");
  var pos = this.positionClass(cfg.position || (kind === "camera" ? "fullscreen" : "top-right"));
  el.className = "module-card " + kind + "-card " + pos + (cfg.size ? " module-" + Utils.escapeHtml(String(cfg.size)) : "");
  if (cfg.background && kind === "clock") el.style.background = String(cfg.background);
  if (cfg.color && kind === "clock") el.style.color = String(cfg.color);
  el.innerHTML = '<button class="module-close" type="button" aria-label="Schließen">×</button>' + inner;
  this.root.appendChild(el);
  var self = this;
  var btn = el.querySelector(".module-close");
  if (btn) btn.addEventListener("click", function () { self.clear(); });
  this.armClose(cfg);
  return el;
};
ModuleManager.prototype.show = function (name, data) {
  if (name === "clock") this.showClock(data);
  else if (name === "weather") this.showWeather(data);
  else if (name === "camera") this.showCamera(data);
};
ModuleManager.prototype.showClock = function (data) {
  var cfg = this.merge("clock", data);
  var inner = '<div class="clock-time" data-clock-time>--:--</div><div class="clock-date" data-clock-date></div>';
  var el = this.card("clock", cfg, inner);
  if (!el) return;
  var timeEl = el.querySelector("[data-clock-time]");
  var dateEl = el.querySelector("[data-clock-date]");
  var self = this;
  function update() {
    try {
      var now = new Date();
      var options = { hour: "2-digit", minute: "2-digit", hour12: String(cfg.format || "24h").toLowerCase() === "12h" };
      if (cfg.show_seconds === true || String(cfg.show_seconds).toLowerCase() === "true") options.second = "2-digit";
      if (cfg.time_zone) options.timeZone = String(cfg.time_zone);
      if (timeEl) timeEl.textContent = new Intl.DateTimeFormat("de-CH", options).format(now);
      if (dateEl) {
        var showDate = cfg.show_date !== false && String(cfg.show_date).toLowerCase() !== "false";
        if (showDate) {
          var dopt = { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" };
          if (cfg.time_zone) dopt.timeZone = String(cfg.time_zone);
          dateEl.textContent = new Intl.DateTimeFormat("de-CH", dopt).format(now);
        } else dateEl.textContent = "";
      }
    } catch (err) {
      if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
    }
  }
  update();
  this.clockTimer = setInterval(update, (cfg.show_seconds === true || String(cfg.show_seconds).toLowerCase() === "true") ? 1000 : 15000);
};
ModuleManager.prototype.weatherIcon = function (state) {
  state = String(state || "").toLowerCase();
  if (state.indexOf("rain") >= 0 || state.indexOf("pour") >= 0) return "🌧️";
  if (state.indexOf("snow") >= 0) return "❄️";
  if (state.indexOf("cloud") >= 0 || state.indexOf("overcast") >= 0) return "☁️";
  if (state.indexOf("sun") >= 0 || state.indexOf("clear") >= 0) return "☀️";
  if (state.indexOf("fog") >= 0) return "🌫️";
  if (state.indexOf("lightning") >= 0 || state.indexOf("thunder") >= 0) return "⛈️";
  return "🌡️";
};
ModuleManager.prototype.showWeather = function (data) {
  var cfg = this.merge("weather", data);
  var entity = cfg.entity_id || cfg.entity || "";
  var title = cfg.title || "Wetter";
  var inner = '<div class="module-loading">Wetter wird geladen...</div>';
  var el = this.card("weather", cfg, inner);
  var self = this;
  function renderError(msg) { if (el) el.innerHTML = '<button class="module-close" type="button" aria-label="Schließen">×</button><div class="module-error">' + Utils.escapeHtml(msg) + '</div>'; var b=el&&el.querySelector(".module-close"); if(b)b.addEventListener("click",function(){self.clear();}); }
  function render(payload) {
    if (!el) return;
    var a = payload || {};
    var temp = a.temperature !== null && a.temperature !== undefined ? Math.round(Number(a.temperature)) + "°" : Utils.escapeHtml(a.state || "-");
    var forecast = Utils.safeArray(a.forecast).slice(0, 4);
    var forecastHtml = "";
    var showForecast = cfg.show_forecast !== false && String(cfg.show_forecast).toLowerCase() !== "false";
    if (showForecast && forecast.length) {
      forecastHtml = '<div class="weather-forecast">' + forecast.map(function (f) {
        var day = f.datetime || f.date || "";
        day = day ? String(day).slice(5,10) : "";
        var hi = f.temperature !== undefined ? f.temperature : (f.templow !== undefined ? f.templow : "");
        return '<div class="weather-day"><span>' + Utils.escapeHtml(day) + '</span><strong>' + Utils.escapeHtml(hi) + '°</strong></div>';
      }).join("") + '</div>';
    }
    el.innerHTML = '<button class="module-close" type="button" aria-label="Schließen">×</button><div class="module-title">' + Utils.escapeHtml(title) + '</div><div class="weather-main"><div class="weather-icon">' + self.weatherIcon(a.state) + '</div><div><div class="weather-temp">' + Utils.escapeHtml(temp) + '</div><div class="weather-condition">' + Utils.escapeHtml(a.state || "") + '</div></div></div><div class="weather-meta"><div class="weather-pill">💧 ' + Utils.escapeHtml(a.humidity == null ? "-" : a.humidity + "%") + '</div><div class="weather-pill">💨 ' + Utils.escapeHtml(a.wind_speed == null ? "-" : a.wind_speed) + '</div></div>' + forecastHtml;
    var b=el.querySelector(".module-close"); if(b)b.addEventListener("click",function(){self.clear();});
  }
  function load() {
    if (!entity) { renderError("Keine Wetter-Entity eingestellt."); return; }
    fetch(self.app.apiBase + "/api/weather/" + encodeURIComponent(entity), { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.error) renderError(j.error); else render(j); })
      .catch(function (err) { renderError("Wetter konnte nicht geladen werden: " + (err && err.message ? err.message : err)); });
  }
  load();
  var refresh = Utils.cleanInt(cfg.refresh_seconds, 300, 30, 3600);
  this.refreshTimer = setInterval(load, refresh * 1000);
};
ModuleManager.prototype.showCamera = function (data) {
  var cfg = this.merge("camera", data);
  var entity = cfg.entity_id || cfg.entity || "";
  var mode = cfg.mode || "auto";
  if (mode === "stream") mode = "camera_proxy_stream";
  var title = cfg.title || "Kamera";
  var inner = entity ? '<div class="camera-title">' + Utils.escapeHtml(title) + '</div><img class="camera-image" alt="' + Utils.escapeHtml(title) + '">' : '<div class="module-error">Keine Kamera-Entity eingestellt.</div>';
  var el = this.card("camera", cfg, inner);
  var img = el && el.querySelector("img.camera-image");
  var self = this;
  function update() {
    if (!img || !entity) return;
    var sep = mode.indexOf("?") >= 0 ? "&" : "?";
    img.src = self.app.apiBase + "/api/image/camera/" + encodeURIComponent(entity) + "?mode=" + encodeURIComponent(mode) + "&_=" + Date.now();
  }
  update();
  if (mode !== "camera_proxy_stream") {
    var refresh = Utils.cleanInt(cfg.refresh_seconds, 10, 2, 3600);
    this.refreshTimer = setInterval(update, refresh * 1000);
  }
};

function ThemeManager() {}
ThemeManager.prototype.applyDynamic = function (data) {
  if (!data) return;
  var root = document.documentElement;
  if (data.accent_color) root.style.setProperty("--td-accent", data.accent_color);
  if (data.vars) {
    Object.keys(data.vars).forEach(function (key) { root.style.setProperty("--td-" + key, data.vars[key]); });
  }
};

function TickerDisplayApp() {
  this.config = window.TICKER_CONFIG || {};
  this.deviceId = window.TICKER_DEVICE_ID || "unknown";
  this.wsUrl = window.TICKER_WS_URL || "";
  this.apiBase = window.TICKER_API_BASE || "/ticker-display";
  this.globalSettings = window.TICKER_GLOBAL_SETTINGS || {};
  this.neededEntities = window.TICKER_ENTITIES || [];
  this.isPreview = location.pathname.indexOf("/preview/") !== -1;
  this.initTime = Date.now();
  this.frontendErrorCount = 0;
  var self = this;
  window.addEventListener("error", function (e) { self.reportFrontendError(e.message || "JavaScript error", e.filename || "window.error", e.lineno, e.colno); });
  window.addEventListener("unhandledrejection", function (e) { self.reportFrontendError((e.reason && e.reason.message) || String(e.reason || "Unhandled promise rejection"), "unhandledrejection"); });
}
TickerDisplayApp.prototype.reportFrontendError = function (message, source, line, column) {
  this.frontendErrorCount += 1;
  try {
    fetch(this.apiBase + "/api/device/" + encodeURIComponent(this.deviceId) + "/notify-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ message: String(message || "").slice(0, 500), source: source || "display", line: line || null, column: column || null })
    }).catch(function () {});
  } catch (err) {}
};
TickerDisplayApp.prototype.setLoadingStatus = function (text, hint) {
  var status = document.getElementById("loading-status");
  var hintEl = document.getElementById("loading-hint");
  if (status && text) status.textContent = text;
  if (hintEl && hint) hintEl.textContent = hint;
};
TickerDisplayApp.prototype.hideLoading = function () {
  var loading = document.getElementById("loading-screen");
  if (!loading) return;
  loading.style.opacity = "0";
  loading.style.transition = "opacity .3s ease";
  setTimeout(function () { loading.style.display = "none"; }, 350);
};
TickerDisplayApp.prototype.showLoadingError = function (err) {
  var loading = document.getElementById("loading-screen");
  if (!loading) return;
  loading.style.display = "flex";
  loading.style.opacity = "1";
  loading.innerHTML = '<div class="loading-card"><div style="font-size:48px">⚠️</div><div class="loading-brand">Ticker Display</div><p>Fehler beim Laden</p><small>' + Utils.escapeHtml((err && err.message) || err || "Unbekannter Fehler") + '</small><button class="loading-action" type="button" onclick="location.reload()">Neu laden</button></div>';
};
TickerDisplayApp.prototype.setOffline = function (title, detail, hidden) {
  var offline = document.getElementById("offline-screen");
  if (!offline) return;
  if (this.isPreview || hidden === true) { offline.hidden = true; return; }
  var titleEl = document.getElementById("offline-title");
  var detailEl = document.getElementById("offline-detail");
  if (titleEl && title) titleEl.textContent = title;
  if (detailEl && detail) detailEl.textContent = detail;
  offline.hidden = false;
};
TickerDisplayApp.prototype.init = function () {
  var self = this;
  try {
    this.setLoadingStatus("Kiosk-Seiten werden geladen...");
    this.bridge = new BridgeWrapper();
    this.themeManager = new ThemeManager();
    this.screenManager = new KioskPageManager(this);
    this.tickerManager = new TickerManager(this);
    this.alertManager = new AlertManager(this);
    this.moduleManager = new ModuleManager(this);
    this.wsClient = new WebSocketClient(this);
    this.screenManager.start();
    this.tickerManager.init();
    this.hideLoading();
    this.wsClient.connect().then(function () {
      self.setOffline(null, null, true);
      self.reportSensorsNow();
    }).catch(function () {
      self.setOffline("Live-Verbindung unterbrochen", "Das Display bleibt sichtbar. Befehle verbinden automatisch neu.");
    });
    this.startSensorReporting();
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && self.wsClient && !self.wsClient.isConnected()) self.wsClient.connect().catch(function () {});
    });
  } catch (err) {
    console.error("Ticker Display start failed", err);
    this.showLoadingError(err);
  }
};
TickerDisplayApp.prototype.onCommand = function (cmd, data) {
  data = data || {};
  if (cmd === "clear_alert") { this.alertManager.clearAll(); if (this.moduleManager) this.moduleManager.clear(); }
  else if (cmd === "clear_ticker") this.tickerManager.clear();
  else if (cmd === "update_ticker_config") { this.config.ticker = Object.assign({}, this.config.ticker || {}, data); this.tickerManager.rebuild(); }
  else if (cmd === "identify") this.showIdentify();
};
TickerDisplayApp.prototype.onAlert = function (data) { this.alertManager.show(data || {}); };
TickerDisplayApp.prototype.onModule = function (moduleName, data) { if (this.moduleManager) this.moduleManager.show(moduleName, data || {}); };
TickerDisplayApp.prototype.onTickerMessages = function (messages) { this.tickerManager.addMessages(messages || []); };
TickerDisplayApp.prototype.onDisplayControl = function (data) {
  if (data.brightness !== undefined) this.bridge.setScreenBrightness(data.brightness);
  if (data.screen_power !== undefined) this.bridge.setScreenPower(data.screen_power);
  if (data.orientation !== undefined) this.bridge.setScreenOrientation(data.orientation);
};
TickerDisplayApp.prototype.onAudio = function (data) {
  data = data || {};
  if (data.action === "play" || data.action === "announce") this.bridge.playSound(data.url || data.media_url, data.volume || 100, data.loop);
  else if (data.action === "stop") this.bridge.stopSound();
  else if (data.action === "pause") this.bridge.pauseSound();
  else if (data.action === "resume") this.bridge.resumeSound();
  else if (data.action === "next") this.bridge.nextSound();
  else if (data.action === "previous") this.bridge.previousSound();
  else if (data.action === "set_volume") this.bridge.setVolume(data.volume);
};
TickerDisplayApp.prototype.onNativeControl = function (data) {
  data = data || {};
  var setting = data.setting || data.key || data.command || "";
  var value = data.value !== undefined ? data.value : data.enabled;
  if (!setting) return;
  if (setting === "screen_power") this.bridge.setScreenPower(!!value);
  else if (setting === "screen_brightness" || setting === "brightness") this.bridge.setScreenBrightness(value);
  else if (setting === "volume" || setting === "media_volume" || setting === "volume_percent") this.bridge.setVolume(value);
  this.bridge.setNativeSetting(setting, value);
};
TickerDisplayApp.prototype.onNativeAction = function (data) {
  data = data || {};
  var action = data.action || data.command || "";
  if (action === "restart_app") this.bridge.restartApp();
  else if (action === "open_android_settings") this.bridge.openAndroidSettings();
  else if (action === "vibrate") this.bridge.vibrate(data.duration || 500);
  else if (action === "report_now") this.reportSensorsNow();
};
TickerDisplayApp.prototype.onNavigate = function (data) {
  data = data || {};
  if (data.action === "next") this.screenManager.next();
  else if (data.action === "previous") this.screenManager.previous();
  else if (data.action === "goto") this.screenManager.goto(data.screen_id || data.page_id || data.name);
  else if (data.action === "pause") {
    var seconds = Utils.cleanInt(data.duration || data.seconds, 86400, 0, 86400);
    if (seconds > 0 && seconds < 86400) this.screenManager.pauseRotationFor(seconds);
    else this.screenManager.pauseRotation();
  }
  else if (data.action === "resume") this.screenManager.resumeRotation();
};
TickerDisplayApp.prototype.onConfigChanged = function (cfg) {
  this.config = cfg || {};
  this.screenManager.rebuild();
  this.tickerManager.rebuild();
};
TickerDisplayApp.prototype.reportSensorsNow = function () {
  if (!this.bridge || !this.bridge.isAvailable()) return;
  var d = this.bridge.getAllSensorData();
  if (!d) return;
  d.device_id = this.deviceId;
  d.page_load_ms = Date.now() - this.initTime;
  d.webview_error_count = this.frontendErrorCount || 0;
  if (this.wsClient && this.wsClient.isConnected()) this.wsClient.send({ type: "sensor_update", data: d });
};
TickerDisplayApp.prototype.startSensorReporting = function () {
  var self = this;
  if (!this.bridge || !this.bridge.isAvailable()) return;
  setTimeout(function () { self.reportSensorsNow(); }, 2000);
  this.sensorTimer = setInterval(function () { self.reportSensorsNow(); }, 30000);
};
TickerDisplayApp.prototype.showIdentify = function () {
  var el = document.createElement("div");
  el.className = "identify-overlay";
  el.innerHTML = '<div><b>' + Utils.escapeHtml(this.config.name || this.deviceId) + '</b><small>' + Utils.escapeHtml(this.deviceId) + '</small></div>';
  document.body.appendChild(el);
  setTimeout(function () { try { el.remove(); } catch (e) {} }, 3000);
};

document.addEventListener("DOMContentLoaded", function () {
  window.tickerApp = new TickerDisplayApp();
  window.tickerApp.init();
});
