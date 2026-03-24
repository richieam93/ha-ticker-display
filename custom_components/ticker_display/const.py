"""Constants for Ticker Display integration."""

DOMAIN = "ticker_display"
PLATFORMS = ["sensor", "binary_sensor"]

API_BASE = "/ticker-display"
WS_PATH = f"{API_BASE}/ws"
ASSETS_PATH = f"{API_BASE}/assets"
MEDIA_PATH = f"{API_BASE}/media"
PANEL_URL = f"{ASSETS_PATH}/panel/ticker-display-panel.js"

STORAGE_KEY = f"{DOMAIN}_config"
STORAGE_VERSION = 1

DEFAULT_HEARTBEAT_TIMEOUT = 120
DEFAULT_THEME = "dark"

WIDGET_TYPES = [
    "simple-value", "gauge", "radial-progress", "progress-bar",
    "status-dot", "icon-value", "trend-arrow", "mini-graph",
    "bar-chart", "sparkline", "donut", "clock", "weather",
    "camera", "color-block", "image", "countdown", "button",
    "area-chart", "multi-line-chart", "stacked-bar-chart",
    "horizontal-bar-chart", "donut-chart", "pie-chart", "radar-chart",
    "heatmap-mini", "timeline-chart", "scatter-chart", "forecast-chart",
    "energy-flow-mini", "comparison-chart", "radial-gauge-advanced",
    "bullet-chart", "line-chart", "radial-gauge"
]

SCREEN_TYPES = [
    "dashboard", "graph", "weather", "camera", "single-value",
    "energy", "persons", "calendar", "media-player", "status-board",
    "clock", "countdown", "table", "qr-code", "floorplan",
    "webview", "image",
]

ALERT_SEVERITIES = ["info", "warning", "critical"]
ALERT_MODES = ["fullscreen", "banner", "overlay", "toast", "pip", "split"]
TRANSITION_TYPES = ["fade", "slide", "flip", "zoom", "dissolve", "crossfade", "none"]
BUILTIN_THEMES = ["dark", "light", "high-contrast", "night"]
SOUND_CATEGORIES = ["alarm", "notification", "chime", "custom"]

SENSOR_KEYS = [
    "battery_level", "battery_charging", "battery_temperature",
    "wifi_signal", "wifi_ssid", "ip_address",
    "light_level", "motion_detected", "proximity_near",
    "ambient_noise_db", "screen_on", "screen_brightness",
    "memory_free_mb", "cpu_usage", "app_version",
    "webview_url", "uptime_seconds",
]

DEFAULT_SOUNDS = {
    "doorbell": {"name": "Türklingel", "file": "doorbell.mp3", "category": "notification"},
    "alarm": {"name": "Alarm", "file": "alarm.mp3", "category": "alarm"},
    "alarm_critical": {"name": "Kritischer Alarm", "file": "alarm_critical.mp3", "category": "alarm"},
    "notification": {"name": "Benachrichtigung", "file": "notification.mp3", "category": "notification"},
    "chime": {"name": "Chime", "file": "chime.mp3", "category": "chime"},
    "success": {"name": "Erfolg", "file": "success.mp3", "category": "notification"},
    "warning": {"name": "Warnung", "file": "warning.mp3", "category": "alarm"},
    "error": {"name": "Fehler", "file": "error.mp3", "category": "alarm"},
    "water_drop": {"name": "Wassertropfen", "file": "water_drop.mp3", "category": "chime"},
    "ding": {"name": "Ding", "file": "ding.mp3", "category": "chime"},
    "fanfare": {"name": "Fanfare", "file": "fanfare.mp3", "category": "notification"},
}

DEFAULT_FONTS = {
    "roboto": {
        "name": "Roboto",
        "variants": {
            "regular": "roboto-regular.woff2",
            "medium": "roboto-medium.woff2",
            "bold": "roboto-bold.woff2",
        },
    },
    "roboto-mono": {
        "name": "Roboto Mono",
        "variants": {
            "regular": "roboto-mono-regular.woff2",
            "bold": "roboto-mono-bold.woff2",
        },
    },
}