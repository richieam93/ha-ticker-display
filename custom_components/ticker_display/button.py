"""Button entities for Ticker Display device actions."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

BUTTONS: dict[str, tuple[str, str, dict]] = {
    "reload_page": ("Reload Page", "mdi:reload", {"type": "reload"}),
    "identify": ("Identify", "mdi:target-account", {"type": "command", "command": "identify"}),
    "restart_app": (
        "Restart App",
        "mdi:restart",
        {"type": "command", "command": "assist_command", "data": {"action": "restart"}},
    ),
    "screen_on": ("Screen On", "mdi:monitor", {"type": "display_control", "screen_power": True}),
    "screen_off": ("Screen Off", "mdi:monitor-off", {"type": "display_control", "screen_power": False}),
    "clear_alerts": ("Clear Alerts", "mdi:bell-off", {"type": "command", "command": "clear_alert", "data": {}}),
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Ticker Display buttons."""
    entry_data = hass.data[DOMAIN][entry.entry_id]
    coordinator = entry_data["coordinator"]
    store = entry_data["store"]
    websocket = entry_data["websocket"]
    entities = []
    for device_id, cfg in store.get_devices().items():
        for key, spec in BUTTONS.items():
            entities.append(
                TickerDisplayActionButton(
                    coordinator,
                    websocket,
                    device_id,
                    cfg.get("name", device_id),
                    key,
                    spec,
                )
            )
    async_add_entities(entities)


class TickerDisplayActionButton(ButtonEntity):
    """A button that sends an immediate command to the display."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, coordinator, websocket, device_id: str, device_name: str, key: str, spec: tuple[str, str, dict]) -> None:
        self._coordinator = coordinator
        self._websocket = websocket
        self._device_id = device_id
        self._key = key
        label, icon, payload = spec
        self._payload = payload
        self._attr_unique_id = f"ticker_display_{device_id}_{key}"
        self._attr_name = label
        self._attr_icon = icon
        self._attr_device_info = {
            "identifiers": {(DOMAIN, device_id)},
            "name": device_name,
            "manufacturer": "Ticker Display",
            "model": "Android Display",
        }

    @property
    def available(self) -> bool:
        return self._coordinator.is_device_available(self._device_id)

    async def async_press(self) -> None:
        await self._websocket.send_command(self._device_id, dict(self._payload))

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        remove_cb = self._coordinator.register_update_callback(
            self._device_id, self.async_write_ha_state
        )
        if remove_cb:
            self.async_on_remove(remove_cb)
