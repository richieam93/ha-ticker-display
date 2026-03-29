"""Button entities for Ticker Display actions."""
from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    entry_data = hass.data[DOMAIN][entry.entry_id]
    coordinator = entry_data["coordinator"]
    store = entry_data["store"]
    websocket = entry_data["websocket"]
    entities = [TickerDisplayRestartButton(coordinator, websocket, device_id, cfg.get("name", device_id)) for device_id, cfg in store.get_devices().items()]
    async_add_entities(entities)

class TickerDisplayRestartButton(ButtonEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, coordinator, websocket, device_id: str, device_name: str) -> None:
        self._coordinator = coordinator
        self._websocket = websocket
        self._device_id = device_id
        self._attr_unique_id = f"ticker_display_{device_id}_restart"
        self._attr_name = "Restart"
        self._attr_device_info = {"identifiers": {(DOMAIN, device_id)}, "name": device_name, "manufacturer": "Ticker Display", "model": "Android Assist Satellite"}

    async def async_press(self) -> None:
        await self._websocket.send_command(self._device_id, {"type": "command", "command": "assist_command", "data": {"action": "restart"}})
