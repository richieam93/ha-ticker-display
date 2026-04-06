"""Constants for Ticker Display integration."""

DOMAIN = "ticker_display"
PLATFORMS = ["sensor", "binary_sensor", "switch", "media_player", "camera"]

API_BASE = "/ticker-display"
WS_PATH = f"{API_BASE}/ws"
ASSETS_PATH = f"{API_BASE}/assets"
MEDIA_PATH = f"{API_BASE}/media"
PANEL_URL = f"{ASSETS_PATH}/panel/ticker-display-panel.js"

STORAGE_KEY = f"{DOMAIN}_config"
STORAGE_VERSION = 1

DEFAULT_HEARTBEAT_TIMEOUT = 900
DEVICE_STALE_TIMEOUT = 86400
DEFAULT_THEME = "dark"

WIDGET_TYPES = [
    "simple-value", "gauge", "radial-progress", "progress-bar",
    "status-dot", "icon-value", "trend-arrow", "mini-graph",
    "bar-chart", "sparkline", "donut", "clock", "weather",
    "camera", "color-block", "image", "countdown", "button",
    "media-player-control", "switch-control", "light-control",
    "climate-control", "cover-control",
]

SCREEN_TYPES = [
    "dashboard", "graph", "weather", "camera", "single-value",
    "energy", "persons", "calendar", "media-player", "status-board",
    "clock", "countdown", "table", "qr-code", "floorplan",
    "webview", "image",
]

ALERT_SEVERITIES = ["info", "warning", "critical"]
ALERT_MODES = ["fullscreen", "banner", "overlay", "toast", "pip", "split", "notification"]
TRANSITION_TYPES = ["fade", "slide", "flip", "zoom", "dissolve", "crossfade", "none"]
BUILTIN_THEMES = ["dark", "light", "high-contrast", "night"]
SOUND_CATEGORIES = ["alarm", "notification", "chime", "custom"]

SENSOR_KEYS = [
    "battery_level", "battery_charging", "battery_temperature",
    "battery_voltage_mv", "battery_health", "battery_status", "charging_source",
    "wifi_signal", "wifi_ssid", "wifi_link_speed_mbps", "network_type", "ip_address",
    "light_level", "motion_detected", "proximity_near",
    "ambient_noise_db", "screen_on", "screen_brightness",
    "memory_free_mb", "memory_total_mb", "storage_free_mb", "storage_total_mb",
    "storage_used_percent", "cpu_usage", "volume_percent", "ringer_mode",
    "app_version", "webview_url", "orientation", "uptime_seconds",
    "native_media_player_enabled",
    "front_camera_present", "back_camera_present", "front_camera_enabled", "back_camera_enabled",
]

DEFAULT_SOUNDS = {
    "doorbell": {"name": "Türklingel", "file": "doorbell.wav", "category": "notification"},
    "alarm": {"name": "Alarm", "file": "alarm.wav", "category": "alarm"},
    "alarm_critical": {"name": "Kritischer Alarm", "file": "alarm_critical.wav", "category": "alarm"},
    "notification": {"name": "Benachrichtigung", "file": "notification.wav", "category": "notification"},
    "chime": {"name": "Chime", "file": "chime.wav", "category": "chime"},
    "success": {"name": "Erfolg", "file": "success.wav", "category": "notification"},
    "warning": {"name": "Warnung", "file": "warning.wav", "category": "alarm"},
    "error": {"name": "Fehler", "file": "error.wav", "category": "alarm"},
    "water_drop": {"name": "Wassertropfen", "file": "water_drop.wav", "category": "chime"},
    "ding": {"name": "Ding", "file": "ding.wav", "category": "chime"},
    "fanfare": {"name": "Fanfare", "file": "fanfare.wav", "category": "notification"},
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
CAMERA_FRAME_MAX_BYTES = 2500000
