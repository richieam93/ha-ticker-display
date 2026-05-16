"""Page Renderer - generates the HTML page for tablets."""

from __future__ import annotations

import json
from html import escape

from homeassistant.core import HomeAssistant

from ..const import INTEGRATION_VERSION


def render_display_page(hass: HomeAssistant, store, media_manager, device_id: str) -> str:
    device_config = store.get_device(device_id) or {}
    theme = device_config.get("theme", "dark")
    font_id = device_config.get("font", "roboto")
    font_css = media_manager.get_font_css(font_id)
    config_json = json.dumps(device_config).replace("</", "<\\/")
    global_settings_json = json.dumps(store.get_global_settings() or {}).replace("</", "<\\/")
    theme_css = _get_theme_css(theme, store.get_custom_themes())
    entities = _collect_entities(device_config)
    entities_json = json.dumps(entities).replace("</", "<\\/")
    ticker_enabled = device_config.get("ticker", {}).get("enabled", True)

    return f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#121212">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Ticker Display - {escape(str(device_config.get('name', device_id)))}</title>

<style id="font-faces">{font_css}</style>
<style id="theme-vars">{theme_css}</style>

<script>
(function() {{
  function applyViewportVars() {{
    try {{
      var root = document.documentElement;
      var w = Math.max(1, window.innerWidth || root.clientWidth || screen.width || 1);
      var h = Math.max(1, window.innerHeight || root.clientHeight || screen.height || 1);
      root.style.setProperty("--td-app-width", w + "px");
      root.style.setProperty("--td-app-height", h + "px");
      root.style.setProperty("--td-viewport-min", Math.min(w, h) + "px");
      root.style.setProperty("--td-viewport-max", Math.max(w, h) + "px");
      root.classList.toggle("td-landscape", w >= h);
      root.classList.toggle("td-portrait", h > w);
    }} catch (e) {{}}
  }}
  applyViewportVars();
  window.addEventListener("resize", applyViewportVars);
  window.addEventListener("orientationchange", function() {{ setTimeout(applyViewportVars, 250); }});
  window.TickerDisplayApplyViewport = applyViewportVars;
}})();
</script>

<link rel="stylesheet" href="/ticker-display/assets/css/main.css?v={INTEGRATION_VERSION}">
<link rel="stylesheet" href="/ticker-display/assets/css/overlays.css?v={INTEGRATION_VERSION}">
</head>
<body>
<div id="screen-container" class="screen-container"></div>

<div id="ticker-bar" class="ticker-bar" {"" if ticker_enabled else "hidden"}>
  <div id="ticker-content" class="ticker-content"></div>
</div>

<div id="alert-overlay" class="alert-overlay" hidden></div>
<div id="notification-banner" class="notification-banner" hidden></div>
<div id="toast-container" class="toast-container" hidden></div>
<div id="pip-container" class="pip-container" hidden>
  <img id="pip-image" class="pip-image" alt="PIP">
</div>

<div id="loading-screen" class="loading-screen">
  <div class="loading-card">
    <div class="loading-brand">Ticker Display</div>
    <div class="loading-spinner"></div>
    <p id="loading-status">Verbinde mit Home Assistant...</p>
    <small id="loading-hint">Wenn dies länger dauert, prüft die Android-App automatisch Cache und Verbindung.</small>
    <button id="loading-reload" class="loading-action" type="button" onclick="location.reload()">Neu laden</button>
  </div>
</div>

<div id="offline-screen" class="offline-screen" hidden>
  <div class="offline-icon">📡</div>
  <div>
    <p id="offline-title">Verbindung unterbrochen</p>
    <small id="offline-detail">Automatischer Neuversuch läuft.</small>
  </div>
</div>

<script>
window.TICKER_CONFIG = {config_json};
window.TICKER_GLOBAL_SETTINGS = {global_settings_json};
window.TICKER_DEVICE_ID = {json.dumps(str(device_id)).replace("</", "<\\/")};
window.TICKER_ENTITIES = {entities_json};
window.TICKER_WS_URL = ((location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/ticker-display/ws/" + encodeURIComponent(String(window.TICKER_DEVICE_ID)));
window.TICKER_API_BASE = "/ticker-display";
</script>

<script>
window.addEventListener("error", function(ev) {{
  try {{
    var el = document.getElementById("loading-status");
    if (el) el.textContent = "Fehler beim Start: " + ((ev && ev.message) ? ev.message : "Unbekannter Fehler");
    var hint = document.getElementById("loading-hint");
    if (hint) hint.textContent = "Details stehen im Android-Menü unter Geräteinformationen/Logcat.";
  }} catch (e) {{}}
}});
window.addEventListener("unhandledrejection", function(ev) {{
  try {{
    var reason = ev && ev.reason ? (ev.reason.message || String(ev.reason)) : "Unbekannter Fehler";
    var el = document.getElementById("loading-status");
    if (el) el.textContent = "Fehler beim Start: " + reason;
  }} catch (e) {{}}
}});
</script>

<script src="/ticker-display/assets/lib/chart.min.js?v={INTEGRATION_VERSION}"></script>
<script src="/ticker-display/assets/lib/qrcode.min.js?v={INTEGRATION_VERSION}"></script>
<script src="/ticker-display/assets/js/display.js?v={INTEGRATION_VERSION}"></script>
</body>
</html>"""


def _collect_entities(config: dict) -> list[str]:
    entities = set()

    for screen in config.get("screens", []):
        for widget in screen.get("widgets", []):
            eid = widget.get("entity_id")
            if eid:
                entities.add(eid)
            for extra in (widget.get("entities", []) or widget.get("config", {}).get("entities", []) or []):
                if isinstance(extra, dict):
                    ex_id = extra.get("entity_id") or extra.get("id")
                else:
                    ex_id = extra
                if ex_id:
                    entities.add(ex_id)

        for entity in screen.get("entities", []):
            if isinstance(entity, dict):
                eid = entity.get("entity_id", "")
                if eid:
                    entities.add(eid)
            elif isinstance(entity, str) and entity:
                entities.add(entity)

        eid = screen.get("entity_id")
        if eid:
            entities.add(eid)

    for te in config.get("ticker", {}).get("entities", []):
        if isinstance(te, dict):
            eid = te.get("entity_id", "")
            if eid:
                entities.add(eid)
        elif isinstance(te, str) and te:
            entities.add(te)

    return list(entities)


def _get_theme_css(theme_name: str, custom_themes: dict) -> str:
    themes = {
        "dark": {
            "bg": "#121212",
            "card-bg": "#1E1E1E",
            "text-primary": "#FFFFFF",
            "text-secondary": "rgba(255,255,255,0.6)",
            "accent": "#2196F3",
            "positive": "#4CAF50",
            "warning": "#FF9800",
            "negative": "#F44336",
            "info": "#2196F3",
            "ticker-bg": "rgba(255,255,255,0.03)",
            "widget-gap": "8px",
            "widget-padding": "12px",
            "widget-radius": "12px",
            "ticker-height": "36px",
        },
        "light": {
            "bg": "#FAFAFA",
            "card-bg": "#FFFFFF",
            "text-primary": "#212121",
            "text-secondary": "rgba(0,0,0,0.54)",
            "accent": "#1976D2",
            "positive": "#388E3C",
            "warning": "#F57C00",
            "negative": "#D32F2F",
            "info": "#1976D2",
            "ticker-bg": "rgba(0,0,0,0.03)",
            "widget-gap": "8px",
            "widget-padding": "12px",
            "widget-radius": "12px",
            "ticker-height": "36px",
        },
        "high-contrast": {
            "bg": "#000000",
            "card-bg": "#1A1A1A",
            "text-primary": "#FFFFFF",
            "text-secondary": "#CCCCCC",
            "accent": "#00BFFF",
            "positive": "#00FF00",
            "warning": "#FFFF00",
            "negative": "#FF0000",
            "info": "#00BFFF",
            "ticker-bg": "#111111",
            "widget-gap": "6px",
            "widget-padding": "16px",
            "widget-radius": "8px",
            "ticker-height": "40px",
        },
        "night": {
            "bg": "#0A0000",
            "card-bg": "#1A0505",
            "text-primary": "#FF6666",
            "text-secondary": "rgba(255,100,100,0.5)",
            "accent": "#CC3333",
            "positive": "#664444",
            "warning": "#996633",
            "negative": "#CC2222",
            "info": "#993333",
            "ticker-bg": "rgba(255,0,0,0.03)",
            "widget-gap": "8px",
            "widget-padding": "12px",
            "widget-radius": "12px",
            "ticker-height": "36px",
        },
    }

    if theme_name in custom_themes:
        theme_vars = custom_themes[theme_name].get("vars", themes.get("dark", {}))
    else:
        theme_vars = themes.get(theme_name, themes["dark"])

    css = ":root {\n"
    for key, value in theme_vars.items():
        css += f"  --td-{key}: {value};\n"
    css += "}\n"
    return css