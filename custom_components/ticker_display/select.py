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


def _collect_pipeline_entries_from_obj(obj, out: list[dict[str, str]], depth: int = 0) -> None:
    if depth > 4 or obj is None:
        return
    if isinstance(obj, dict):
        maybe_id = obj.get("id")
        maybe_name = obj.get("name")
        if isinstance(maybe_id, str) and maybe_id.strip():
            keys = {str(k) for k in obj.keys()}
            if {"language", "conversation_engine", "conversation_engine_id", "stt_engine_id", "tts_engine_id"} & keys:
                entry = {"id": maybe_id.strip(), "name": str(maybe_name or maybe_id).strip() or maybe_id.strip()}
                if entry not in out:
                    out.append(entry)
        for value in obj.values():
            _collect_pipeline_entries_from_obj(value, out, depth + 1)
        return
    if isinstance(obj, (list, tuple, set)):
        for value in obj:
            _collect_pipeline_entries_from_obj(value, out, depth + 1)


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




def _read_assist_storage_entries(hass: HomeAssistant) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    try:
        storage_path = Path(hass.config.path('.storage/assist_pipeline.pipelines'))
        if not storage_path.exists():
            return entries
        raw = json.loads(storage_path.read_text(encoding='utf-8'))
        _collect_pipeline_entries_from_obj(raw, entries)
    except Exception:
        return entries
    return entries


def _read_assist_storage_options(hass: HomeAssistant) -> list[str]:
    entries = _read_assist_storage_entries(hass)
    options: list[str] = []
    for entry in entries:
        for candidate in (entry.get("name"), entry.get("id")):
            item = str(candidate or "").strip()
            if item and item not in options:
                options.append(item)
    return options


def _resolve_assistant_option_to_pipeline_id(hass: HomeAssistant, option: str) -> str:
    normalized = str(option or "").strip()
    if not normalized:
        return "default"
    if normalized.lower() in {"default", "preferred", "secondary", "disabled"}:
        return normalized
    entries = (hass.data.get(DOMAIN, {}) or {}).get("assist_pipeline_storage_entries", []) or []
    for entry in entries:
        if normalized == str(entry.get("name") or "").strip() or normalized == str(entry.get("id") or "").strip():
            return str(entry.get("id") or normalized).strip() or normalized
    return normalized

def _discover_assistant_options(hass: HomeAssistant, data: dict) -> list[str]:
    options: list[str] = []
    for item in list(DEFAULT_ASSISTANTS) + [str(x) for x in data.get("assist_available_assistants", []) or []]:
        if item and item not in options:
            options.append(item)

    for pid in (hass.data.get(DOMAIN, {}) or {}).get("assist_pipeline_storage_options", []) or []:
        if pid and pid not in options:
            options.append(pid)
    for entry in (hass.data.get(DOMAIN, {}) or {}).get("assist_pipeline_storage_entries", []) or []:
        for candidate in (entry.get("name"), entry.get("id")):
            value = str(candidate or "").strip()
            if value and value not in options:
                options.append(value)

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
    domain_data = hass.data.setdefault(DOMAIN, {})
    domain_data["assist_pipeline_storage_entries"] = await hass.async_add_executor_job(_read_assist_storage_entries, hass)
    domain_data["assist_pipeline_storage_options"] = await hass.async_add_executor_job(_read_assist_storage_options, hass)
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
        resolved_option = option
        if self._select_key in {"assistant", "assistant_2"}:
            resolved_option = _resolve_assistant_option_to_pipeline_id(self.hass, option)
        data_key = self._data_key
        self._coordinator.update_device_data(self._device_id, {data_key: resolved_option})
        await self._websocket.send_command(
            self._device_id,
            {"type": "command", "command": "assist_command", "data": {"action": "set_option", "key": self._select_key, "value": resolved_option}},
        )

    async def async_added_to_hass(self):
        await super().async_added_to_hass()
        remove_cb = self._coordinator.register_update_callback(self._device_id, self.async_write_ha_state)
        if remove_cb:
            self.async_on_remove(remove_cb)
