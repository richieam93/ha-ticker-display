"""Sensor entities for Ticker Display devices."""

from __future__ import annotations

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    PERCENTAGE,
    SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
    UnitOfElectricPotential,
    UnitOfInformation,
    UnitOfTemperature,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

SENSOR_DEFINITIONS = {
    "battery": {
        "name": "Battery",
        "key": "battery_level",
        "icon": "mdi:battery",
        "unit": PERCENTAGE,
        "dc": SensorDeviceClass.BATTERY,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "battery_temperature": {
        "name": "Battery Temperature",
        "key": "battery_temperature",
        "icon": "mdi:thermometer",
        "unit": UnitOfTemperature.CELSIUS,
        "dc": SensorDeviceClass.TEMPERATURE,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "battery_voltage": {
        "name": "Battery Voltage",
        "key": "battery_voltage_mv",
        "icon": "mdi:lightning-bolt",
        "unit": UnitOfElectricPotential.MILLIVOLT,
        "dc": SensorDeviceClass.VOLTAGE,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "battery_health": {
        "name": "Battery Health",
        "key": "battery_health",
        "icon": "mdi:heart-pulse",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "battery_status": {
        "name": "Battery Status",
        "key": "battery_status",
        "icon": "mdi:battery-heart-variant",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "charging_source": {
        "name": "Charging Source",
        "key": "charging_source",
        "icon": "mdi:power-plug",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "wifi_signal": {
        "name": "WiFi Signal",
        "key": "wifi_signal",
        "icon": "mdi:wifi",
        "unit": SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
        "dc": SensorDeviceClass.SIGNAL_STRENGTH,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "wifi_ssid": {
        "name": "WiFi SSID",
        "key": "wifi_ssid",
        "icon": "mdi:wifi-settings",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "wifi_link_speed": {
        "name": "WiFi Link Speed",
        "key": "wifi_link_speed_mbps",
        "icon": "mdi:speedometer",
        "unit": "Mbit/s",
        "dc": None,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "network_type": {
        "name": "Network Type",
        "key": "network_type",
        "icon": "mdi:access-point-network",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "ip_address": {
        "name": "IP Address",
        "key": "ip_address",
        "icon": "mdi:ip-network",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "light_level": {
        "name": "Light Level",
        "key": "light_level",
        "icon": "mdi:brightness-5",
        "unit": "lx",
        "dc": SensorDeviceClass.ILLUMINANCE,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "ambient_noise": {
        "name": "Ambient Noise",
        "key": "ambient_noise_db",
        "icon": "mdi:waveform",
        "unit": "dB",
        "dc": None,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "cpu_usage": {
        "name": "CPU Usage",
        "key": "cpu_usage",
        "icon": "mdi:cpu-64-bit",
        "unit": PERCENTAGE,
        "dc": None,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "screen_brightness": {
        "name": "Screen Brightness",
        "key": "screen_brightness",
        "icon": "mdi:brightness-6",
        "unit": PERCENTAGE,
        "dc": None,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "current_screen": {
        "name": "Current Screen",
        "key": "webview_url",
        "icon": "mdi:monitor",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "orientation": {
        "name": "Orientation",
        "key": "orientation",
        "icon": "mdi:phone-rotate-landscape",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "memory_free": {
        "name": "Memory Free",
        "key": "memory_free_mb",
        "icon": "mdi:memory",
        "unit": UnitOfInformation.MEGABYTES,
        "dc": None,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "memory_total": {
        "name": "Memory Total",
        "key": "memory_total_mb",
        "icon": "mdi:memory",
        "unit": UnitOfInformation.MEGABYTES,
        "dc": None,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "storage_free": {
        "name": "Storage Free",
        "key": "storage_free_mb",
        "icon": "mdi:harddisk",
        "unit": UnitOfInformation.MEGABYTES,
        "dc": None,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "storage_total": {
        "name": "Storage Total",
        "key": "storage_total_mb",
        "icon": "mdi:harddisk",
        "unit": UnitOfInformation.MEGABYTES,
        "dc": None,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "storage_used": {
        "name": "Storage Used",
        "key": "storage_used_percent",
        "icon": "mdi:harddisk-plus",
        "unit": PERCENTAGE,
        "dc": None,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "volume": {
        "name": "Volume",
        "key": "volume_percent",
        "icon": "mdi:volume-high",
        "unit": PERCENTAGE,
        "dc": None,
        "sc": SensorStateClass.MEASUREMENT,
    },
    "ringer_mode": {
        "name": "Ringer Mode",
        "key": "ringer_mode",
        "icon": "mdi:bell-ring",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_state": {
        "name": "Assist State",
        "key": "assist_state",
        "icon": "mdi:microphone-message",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_server_audio_mode": {
        "name": "Assist Server Audio Mode",
        "key": "assist_server_audio_mode",
        "icon": "mdi:server-network",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_message": {
        "name": "Assist Message",
        "key": "assist_message",
        "icon": "mdi:message-text",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_last_stt": {
        "name": "Assist Last Text",
        "key": "assist_last_stt",
        "icon": "mdi:text-recognition",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_reply_text": {
        "name": "Assist Reply Text",
        "key": "assist_reply_text",
        "icon": "mdi:message-reply-text",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_tts_url": {
        "name": "Assist TTS URL",
        "key": "assist_tts_url",
        "icon": "mdi:link-variant",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_pipeline_used": {
        "name": "Assist Pipeline Used",
        "key": "assist_pipeline_used",
        "icon": "mdi:source-branch",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_trigger_source": {
        "name": "Assist Trigger Source",
        "key": "assist_trigger_source",
        "icon": "mdi:ray-start-arrow",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_wake_word": {
        "name": "Assist Wake Word",
        "key": "assist_wake_word",
        "icon": "mdi:account-voice",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_wake_word_2": {
        "name": "Assist Wake Word 2",
        "key": "assist_wake_word_2",
        "icon": "mdi:account-voice-outline",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_assistant": {
        "name": "Assist Assistant",
        "key": "assist_assistant",
        "icon": "mdi:assistant",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_assistant_2": {
        "name": "Assist Assistant 2",
        "key": "assist_assistant_2",
        "icon": "mdi:assistant",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "assist_vad_mode": {
        "name": "Assist Speech Pause Detection",
        "key": "assist_vad_mode",
        "icon": "mdi:waveform",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "app_version": {
        "name": "App Version",
        "key": "app_version",
        "icon": "mdi:information-outline",
        "unit": None,
        "dc": None,
        "sc": None,
    },
    "uptime": {
        "name": "Uptime",
        "key": "uptime_seconds",
        "icon": "mdi:clock-outline",
        "unit": "min",
        "dc": None,
        "sc": SensorStateClass.TOTAL_INCREASING,
    },
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Ticker Display sensor entities."""
    entry_data = hass.data[DOMAIN][entry.entry_id]
    coordinator = entry_data["coordinator"]
    store = entry_data["store"]

    entities: list[TickerDisplaySensor] = []

    for device_id, device_config in store.get_devices().items():
        for sensor_key, sensor_def in SENSOR_DEFINITIONS.items():
            entities.append(
                TickerDisplaySensor(
                    coordinator,
                    device_id,
                    device_config.get("name", device_id),
                    sensor_key,
                    sensor_def,
                )
            )

    async_add_entities(entities, True)


class TickerDisplaySensor(SensorEntity):
    """Representation of a Ticker Display sensor."""

    _attr_has_entity_name = True

    def __init__(self, coordinator, device_id, device_name, sensor_key, sensor_def):
        self._coordinator = coordinator
        self._device_id = device_id
        self._sensor_key = sensor_key
        self._data_key = sensor_def["key"]

        self._attr_unique_id = f"ticker_display_{device_id}_{sensor_key}"
        self._attr_name = f"{device_name} {sensor_def['name']}"
        self._attr_icon = sensor_def["icon"]
        self._attr_native_unit_of_measurement = sensor_def["unit"]
        self._attr_device_class = sensor_def.get("dc")
        self._attr_state_class = sensor_def.get("sc")
        self._attr_device_info = {
            "identifiers": {(DOMAIN, device_id)},
            "name": device_name,
            "manufacturer": "Ticker Display",
            "model": "Android Tablet",
            "sw_version": "1.11.0",
        }

    @property
    def native_value(self):
        """Return the native value."""
        data = self._coordinator.get_device_data(self._device_id)
        value = data.get(self._data_key)
        if self._sensor_key == "uptime" and value is not None:
            return round(value / 60, 1)
        return value

    @property
    def available(self) -> bool:
        """Return if entity is available."""
        return self._coordinator.is_device_available(self._device_id)

    async def async_added_to_hass(self) -> None:
        """Handle entity being added to Home Assistant."""
        self._coordinator.register_update_callback(
            self._device_id, self.async_write_ha_state
        )
