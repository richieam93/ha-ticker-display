"""Constants for Ticker Display integration."""

DOMAIN = "ticker_display"
INTEGRATION_VERSION = "3.0.9"
PLATFORMS = ["sensor", "binary_sensor", "switch", "number", "media_player", "camera"]

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

WIDGET_TYPES = []

SCREEN_TYPES = ["ha-page", "kiosk-page"]

ALERT_SEVERITIES = ["info", "warning", "critical"]
ALERT_MODES = ["fullscreen", "banner", "toast", "notification"]
TRANSITION_TYPES = ["fade", "slide", "flip", "zoom", "dissolve", "crossfade", "none"]
BUILTIN_THEMES = ["dark", "light", "high-contrast", "night"]
SOUND_CATEGORIES = ["alarm", "notification", "chime", "custom"]

SENSOR_KEYS = [
    "battery_level", "battery_charging", "battery_temperature",
    "battery_voltage_mv", "battery_health", "battery_status", "charging_source",
    "wifi_signal", "wifi_ssid", "wifi_link_speed_mbps", "network_type", "ip_address",
    "light_level", "motion_detected", "motion_last_detected_at",
    "motion_score", "motion_avg_delta", "motion_status", "motion_source",
    "motion_last_error", "proximity_near",
    "ambient_noise_db", "screen_on", "screen_brightness",
    "memory_free_mb", "memory_total_mb", "storage_free_mb", "storage_total_mb",
    "storage_used_percent", "cpu_usage", "volume_percent", "ringer_mode",
    "app_version", "webview_url", "orientation", "uptime_seconds",
    "native_media_player_enabled",
    "screen_power", "keep_screen_on", "kiosk_enabled", "auto_start",
    "burn_in_protection", "light_sensor_enabled", "motion_detection_enabled",
    "camera_silent_mode", "camera_manual_only", "microphone_enabled",
    "assist_satellite_enabled", "report_interval_seconds", "camera_interval_seconds",
    "motion_sensitivity", "motion_hold_seconds",
    "webview_user_agent", "last_error", "last_error_at",
    "network_quality",
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
