"""Binary sensor entities for Ticker Display devices."""

import logging
from homeassistant.components.binary_sensor import BinarySensorEntity, BinarySensorDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

BINARY_SENSOR_DEFINITIONS = {
    "online": {"name": "Online", "icon_on": "mdi:check-network", "icon_off": "mdi:close-network", "dc": BinarySensorDeviceClass.CONNECTIVITY},
    "charging": {"name": "Charging", "key": "battery_charging", "icon_on": "mdi:battery-charging", "icon_off": "mdi:battery", "dc": BinarySensorDeviceClass.PLUG},
    "motion": {"name": "Motion", "key": "motion_detected", "icon_on": "mdi:motion-sensor", "icon_off": "mdi:motion-sensor-off", "dc": BinarySensorDeviceClass.MOTION},
    "proximity": {"name": "Proximity", "key": "proximity_near", "icon_on": "mdi:account-eye", "icon_off": "mdi:account-eye-outline", "dc": BinarySensorDeviceClass.OCCUPANCY},
    "screen_on": {"name": "Screen", "key": "screen_on", "icon_on": "mdi:monitor", "icon_off": "mdi:monitor-off", "dc": None},
}


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback):
    coordinator = hass.data[DOMAIN]["coordinator"]
    store = hass.data[DOMAIN]["store"]
    entities = []
    for device_id, device_config in store.get_devices().items():
        for sensor_key, sensor_def in BINARY_SENSOR_DEFINITIONS.items():
            entities.append(TickerDisplayBinarySensor(coordinator, device_id, device_config.get("name", device_id), sensor_key, sensor_def))
    async_add_entities(entities, True)


class TickerDisplayBinarySensor(BinarySensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, device_id, device_name, sensor_key, sensor_def):
        self._coordinator = coordinator
        self._device_id = device_id
        self._sensor_key = sensor_key
        self._sensor_def = sensor_def
        self._attr_unique_id = f"ticker_display_{device_id}_{sensor_key}"
        self._attr_name = f"{device_name} {sensor_def['name']}"
        self._attr_device_class = sensor_def.get("dc")
        self._attr_device_info = {
            "identifiers": {(DOMAIN, device_id)},
            "name": device_name,
            "manufacturer": "Ticker Display",
            "model": "Android Tablet",
        }

    @property
    def is_on(self) -> bool | None:
        if self._sensor_key == "online":
            return self._coordinator.is_device_online(self._device_id)
        data = self._coordinator.get_device_data(self._device_id)
        key = self._sensor_def.get("key")
        return data.get(key, False) if key else None

    @property
    def icon(self):
        return self._sensor_def["icon_on"] if self.is_on else self._sensor_def["icon_off"]

    @property
    def available(self) -> bool:
        if self._sensor_key == "online":
            return True
        return self._coordinator.is_device_online(self._device_id)

    async def async_added_to_hass(self):
        self._coordinator.register_update_callback(self._device_id, self.async_write_ha_state)