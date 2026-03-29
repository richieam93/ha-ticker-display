"""Select entities for Ticker Display assist settings."""
from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

DEFAULT_WAKE_WORDS = ["okay_nabu", "kenobi", "hey_jarvis", "hey_mycroft", "disabled"]
DEFAULT_ASSISTANTS = ["default", "preferred", "secondary", "disabled"]
DEFAULT_VAD = ["short", "normal", "long"]

SELECTS = {
    "wake_word": ("Wake Word", "assist_wake_word", "assist_available_wake_words", DEFAULT_WAKE_WORDS),
    "wake_word_2": ("Wake Word 2", "assist_wake_word_2", "assist_available_wake_words", DEFAULT_WAKE_WORDS),
    "assistant": ("Assistant", "assist_assistant", "assist_available_assistants", DEFAULT_ASSISTANTS),
    "assistant_2": ("Assistant 2", "assist_assistant_2", "assist_available_assistants", DEFAULT_ASSISTANTS),
    "speech_pause_detection": ("Speech Pause Detection", "assist_vad_mode", None, DEFAULT_VAD),
}

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    entry_data = hass.data[DOMAIN][entry.entry_id]
    coordinator = entry_data["coordinator"]
    store = entry_data["store"]
    websocket = entry_data["websocket"]
    entities = []
    for device_id, device_config in store.get_devices().items():
        for key in SELECTS:
            entities.append(TickerDisplayAssistSelect(coordinator, websocket, device_id, device_config.get("name", device_id), key))
    async_add_entities(entities)

class TickerDisplayAssistSelect(SelectEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, coordinator, websocket, device_id: str, device_name: str, select_key: str) -> None:
        self._coordinator = coordinator
        self._websocket = websocket
        self._device_id = device_id
        self._select_key = select_key
        label, data_key, options_key, defaults = SELECTS[select_key]
        self._label = label
        self._data_key = data_key
        self._options_key = options_key
        self._defaults = defaults
        self._attr_unique_id = f"ticker_display_{device_id}_{select_key}"
        self._attr_name = label
        self._attr_device_info = {
            "identifiers": {(DOMAIN, device_id)},
            "name": device_name,
            "manufacturer": "Ticker Display",
            "model": "Android Assist Satellite",
        }

    @property
    def available(self):
        return True

    @property
    def current_option(self):
        return str(self._coordinator.get_device_data(self._device_id).get(self._data_key) or self.options[0])

    @property
    def options(self):
        data = self._coordinator.get_device_data(self._device_id)
        values = list(self._defaults)
        if self._options_key:
            values.extend([str(x) for x in data.get(self._options_key, []) or [] if str(x).strip()])
        current = str(data.get(self._data_key) or "").strip()
        if current:
            values.append(current)
        out = []
        for item in values:
            if item not in out:
                out.append(item)
        return out

    async def async_select_option(self, option: str) -> None:
        data_key = self._data_key
        self._coordinator.update_device_data(self._device_id, {data_key: option})
        await self._websocket.send_command(
            self._device_id,
            {"type": "command", "command": "assist_command", "data": {"action": "set_option", "key": self._select_key, "value": option}},
        )

    async def async_added_to_hass(self):
        await super().async_added_to_hass()
        remove_cb = self._coordinator.register_update_callback(self._device_id, self.async_write_ha_state)
        if remove_cb:
            self.async_on_remove(remove_cb)
