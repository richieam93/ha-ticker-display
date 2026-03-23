"""Sensor entities for Ticker Display devices."""

from __future__ import annotations

import logging

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    PERCENTAGE,
    SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
    UnitOfInformation,
    UnitOfTemperature,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

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
    "wifi_signal": {
        "name": "WiFi Signal",
        "key": "wifi_signal",
        "icon": "mdi:wifi",
        "unit": SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
        "dc": SensorDeviceClass.SIGNAL_STRENGTH,
        "sc": SensorStateClass.MEASUREMENT,
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
        "icon": "mdi:microphone",
        "unit": "dB",
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
    "memory_free": {
        "name": "Memory Free",
        "key": "memory_free_mb",
        "icon": "mdi:memory",
        "unit": UnitOfInformation.MEGABYTES,
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
            "sw_version": "1.0.0",
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
        return self._coordinator.is_device_online(self._device_id)

    async def async_added_to_hass(self) -> None:
        """Handle entity being added to Home Assistant."""
        self._coordinator.register_update_callback(
            self._device_id, self.async_write_ha_state
        )