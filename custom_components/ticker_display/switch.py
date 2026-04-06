"""Switch entities for Ticker Display device controls."""
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

SWITCHES = {
    "front_camera": ("Front Camera", "front_camera_enabled"),
    "back_camera": ("Back Camera", "back_camera_enabled"),
}

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    entry_data = hass.data[DOMAIN][entry.entry_id]
    coordinator = entry_data["coordinator"]
    store = entry_data["store"]
    websocket = entry_data["websocket"]
    entities = []
    for device_id, device_config in store.get_devices().items():
        for key in SWITCHES:
            entities.append(TickerDisplayDeviceSwitch(coordinator, websocket, device_id, device_config.get("name", device_id), key))
    async_add_entities(entities)

class TickerDisplayDeviceSwitch(SwitchEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, coordinator, websocket, device_id: str, device_name: str, key: str) -> None:
        self._coordinator = coordinator
        self._websocket = websocket
        self._device_id = device_id
        self._switch_key = key
        label, data_key = SWITCHES[key]
        self._data_key = data_key
        self._attr_unique_id = f"ticker_display_{device_id}_{key}"
        self._attr_name = label
        self._attr_device_info = {"identifiers": {(DOMAIN, device_id)}, "name": device_name, "manufacturer": "Ticker Display", "model": "Android Display"}

    @property
    def is_on(self):
        return bool(self._coordinator.get_device_data(self._device_id).get(self._data_key, False))

    async def async_turn_on(self, **kwargs):
        self._coordinator.update_device_data(self._device_id, {self._data_key: True})
        await self._websocket.send_command(self._device_id, {"type": "command", "command": self._switch_key, "enabled": True})

    async def async_turn_off(self, **kwargs):
        self._coordinator.update_device_data(self._device_id, {self._data_key: False})
        await self._websocket.send_command(self._device_id, {"type": "command", "command": self._switch_key, "enabled": False})

    async def async_added_to_hass(self):
        await super().async_added_to_hass()
        remove_cb = self._coordinator.register_update_callback(self._device_id, self.async_write_ha_state)
        if remove_cb:
            self.async_on_remove(remove_cb)
