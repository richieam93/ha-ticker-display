"""Select entities for Ticker Display assist settings."""
from __future__ import annotations

import json
from pathlib import Path

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


def _collect_pipeline_ids_from_obj(obj, out: list[str], depth: int = 0) -> None:
    if depth > 4 or obj is None:
        return
    if isinstance(obj, dict):
        maybe_id = obj.get("id")
        if isinstance(maybe_id, str) and maybe_id.strip() and maybe_id not in out:
            keys = {str(k) for k in obj.keys()}
            if {"language", "conversation_engine", "conversation_engine_id", "stt_engine_id", "tts_engine_id"} & keys:
                out.append(maybe_id)
        for value in obj.values():
            _collect_pipeline_ids_from_obj(value, out, depth + 1)
        return
    if isinstance(obj, (list, tuple, set)):
        for value in obj:
            _collect_pipeline_ids_from_obj(value, out, depth + 1)
        return
    maybe_id = getattr(obj, "id", None)
    if isinstance(maybe_id, str) and maybe_id.strip() and maybe_id not in out:
        attrs = {name for name in dir(obj) if name.endswith("_id") or name in {"language", "name"}}
        if {"conversation_engine_id", "stt_engine_id", "tts_engine_id", "language"} & attrs:
            out.append(maybe_id)
    for name in ("items", "pipelines", "data", "store"):
        try:
            value = getattr(obj, name, None)
        except Exception:
            value = None
        if value is not None and value is not obj:
            _collect_pipeline_ids_from_obj(value, out, depth + 1)


def _discover_assistant_options(hass: HomeAssistant, data: dict) -> list[str]:
    options: list[str] = []
    for item in list(DEFAULT_ASSISTANTS) + [str(x) for x in data.get("assist_available_assistants", []) or []]:
        if item and item not in options:
            options.append(item)

    try:
        storage_path = Path(hass.config.path(".storage/assist_pipeline.pipelines"))
        if storage_path.exists():
            raw = json.loads(storage_path.read_text(encoding="utf-8"))
            for pipeline in ((raw or {}).get("data") or {}).get("items", []) or []:
                pid = str((pipeline or {}).get("id") or "").strip()
                if pid and pid not in options:
                    options.append(pid)
    except Exception:
        pass

    try:
        for key, value in (hass.data or {}).items():
            key_s = str(key).lower()
            if "assist" in key_s or "pipeline" in key_s or "conversation" in key_s:
                _collect_pipeline_ids_from_obj(value, options)
    except Exception:
        pass

    try:
        for state in hass.states.async_all():
            eid = state.entity_id
            attrs = state.attributes or {}
            eid_lower = eid.lower()
            if any(k in eid_lower for k in ["assist", "pipeline", "conversation", "voice"]):
                if eid not in options:
                    options.append(eid)
                for item in attrs.get("options", []) or []:
                    item_s = str(item).strip()
                    if item_s and item_s not in options:
                        options.append(item_s)
    except Exception:
        pass

    return options


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    entry_data = hass.data[DOMAIN][entry.entry_id]
    coordinator = entry_data["coordinator"]
    store = entry_data["store"]
    websocket = entry_data["websocket"]
    entities = []
    for device_id, device_config in store.get_devices().items():
        for key in SELECTS:
            entities.append(TickerDisplayAssistSelect(hass, coordinator, websocket, device_id, device_config.get("name", device_id), key))
    async_add_entities(entities)


class TickerDisplayAssistSelect(SelectEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, hass: HomeAssistant, coordinator, websocket, device_id: str, device_name: str, select_key: str) -> None:
        self.hass = hass
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
        return self._coordinator.is_device_available(self._device_id)

    @property
    def current_option(self):
        current = str(self._coordinator.get_device_data(self._device_id).get(self._data_key) or "").strip()
        return current or (self.options[0] if self.options else None)

    @property
    def options(self):
        data = self._coordinator.get_device_data(self._device_id)
        if self._select_key in {"assistant", "assistant_2"}:
            values = _discover_assistant_options(self.hass, data)
        else:
            values = list(self._defaults)
            if self._options_key:
                values.extend([str(x) for x in data.get(self._options_key, []) or [] if str(x).strip()])
        current = str(data.get(self._data_key) or "").strip()
        if current:
            values.append(current)
        out = []
        for item in values:
            item = str(item).strip()
            if item and item not in out:
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
