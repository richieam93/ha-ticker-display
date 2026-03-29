"""Assist satellite entities for Ticker Display devices."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from homeassistant.util import slugify

from homeassistant.components.assist_satellite import (
    AssistSatelliteEntity,
    AssistSatelliteEntityFeature,
)

try:
    from homeassistant.components.assist_satellite import (
        AssistSatelliteConfiguration,
        AssistSatelliteState,
        AssistSatelliteWakeWord,
    )
except ImportError:
    try:
        from homeassistant.components.assist_satellite import AssistSatelliteConfiguration, AssistSatelliteWakeWord
    except ImportError:
        @dataclass
        class AssistSatelliteWakeWord:
            id: str
            wake_word: str
            trained_languages: list[str]

        @dataclass
        class AssistSatelliteConfiguration:
            available_wake_words: list[AssistSatelliteWakeWord]
            active_wake_words: list[str]
            max_active_wake_words: int
            pipeline_entity_id: str | None = None
            vad_sensitivity_entity_id: str | None = None

    try:
        from homeassistant.components.assist_satellite import AssistSatelliteState
    except ImportError:
        class AssistSatelliteState:
            IDLE = "idle"
            LISTENING = "listening"
            PROCESSING = "processing"
            RESPONDING = "responding"
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    entry_data = hass.data[DOMAIN][entry.entry_id]
    coordinator = entry_data["coordinator"]
    store = entry_data["store"]
    entities: list[TickerDisplayAssistSatellite] = []

    for device_id, device_config in (store.get_devices() or {}).items():
        device_name = device_config.get("name", device_id)
        entities.append(
            TickerDisplayAssistSatellite(
                coordinator,
                entry_data["websocket"],
                device_id,
                device_name,
            )
        )

    _LOGGER.info("Setting up %s assist satellite entities", len(entities))
    async_add_entities(entities)


def _build_assist_configuration() -> AssistSatelliteConfiguration:
    """Build an AssistSatelliteConfiguration compatible with multiple HA versions."""
    candidate_kwargs: list[dict[str, Any]] = [
        {
            "available_wake_words": [],
            "active_wake_words": [],
            "max_active_wake_words": 0,
            "pipeline_entity_id": None,
            "vad_sensitivity_entity_id": None,
            "tts_options": None,
        },
        {
            "available_wake_words": [],
            "active_wake_words": [],
            "max_active_wake_words": 0,
            "pipeline_entity_id": None,
            "vad_sensitivity_entity_id": None,
        },
        {
            "available_wake_words": [],
            "active_wake_words": [],
            "max_active_wake_words": 0,
        },
        {
            "available_wake_words": [],
            "active_wake_words": [],
        },
        {
            "available_wake_words": [],
        },
        {},
    ]

    last_error: Exception | None = None
    for kwargs in candidate_kwargs:
        try:
            return AssistSatelliteConfiguration(**kwargs)
        except TypeError as err:
            last_error = err
            continue

    if last_error:
        raise last_error
    return AssistSatelliteConfiguration()


class TickerDisplayAssistSatellite(AssistSatelliteEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_entity_registry_enabled_default = True
    _attr_entity_registry_visible_default = True
    _attr_supported_features = (
        AssistSatelliteEntityFeature.ANNOUNCE
        | AssistSatelliteEntityFeature.START_CONVERSATION
    )

    def __init__(self, coordinator, websocket, device_id: str, device_name: str) -> None:
        self._coordinator = coordinator
        self._websocket = websocket
        self._device_id = device_id
        self._attr_unique_id = f"ticker_display_{device_id}_assist_satellite"
        self.entity_id = f"assist_satellite.{slugify(device_name)}_assist_satellit"
        self._attr_name = f"{device_name} Assist-Satellit"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, device_id)},
            "name": device_name,
            "manufacturer": "Ticker Display",
            "model": "Android Assist Satellite",
        }
        self._configuration = _build_assist_configuration()
        self._tts_options: dict[str, Any] | None = None

    @property
    def available(self) -> bool:
        return self._coordinator.is_device_online(self._device_id)

    @property
    def pipeline_entity_id(self) -> str | None:
        return getattr(self._configuration, "pipeline_entity_id", None)

    @property
    def vad_sensitivity_entity_id(self) -> str | None:
        return getattr(self._configuration, "vad_sensitivity_entity_id", None)

    @property
    def tts_options(self) -> dict[str, Any] | None:
        return self._tts_options

    @property
    def state(self) -> AssistSatelliteState:
        state = str(self._coordinator.get_device_data(self._device_id).get("assist_state") or "idle").lower()
        mapping = {
            "idle": AssistSatelliteState.IDLE,
            "listening": AssistSatelliteState.LISTENING,
            "processing": AssistSatelliteState.PROCESSING,
            "responding": AssistSatelliteState.RESPONDING,
            "error": AssistSatelliteState.IDLE,
        }
        return mapping.get(state, AssistSatelliteState.IDLE)

    async def async_get_configuration(self) -> AssistSatelliteConfiguration:
        return self._configuration

    async def async_set_configuration(self, config: AssistSatelliteConfiguration) -> None:
        self._configuration = config
        wake_word_ids = list(getattr(config, "active_wake_words", []) or [])
        self._tts_options = getattr(config, "tts_options", None)
        payload = {
            "action": "set_configuration",
            "wake_word_ids": wake_word_ids,
            "pipeline_entity_id": getattr(config, "pipeline_entity_id", None),
            "vad_entity_id": getattr(config, "vad_sensitivity_entity_id", None),
        }
        await self._websocket.send_command(
            self._device_id,
            {"type": "command", "command": "assist_command", "data": payload},
        )

    def on_pipeline_event(self, event: Any) -> None:
        event_type = getattr(event, "type", None)
        event_data = getattr(event, "data", None)
        if event_type is None and isinstance(event, dict):
            event_type = event.get("type")
            event_data = event.get("data")
        if str(event_type).lower() in {"tts-end", "tts_end", "run-end", "run_end"}:
            try:
                self.tts_response_finished()
            except Exception:
                pass

    async def async_announce(self, announcement, preannounce: bool = True) -> None:
        _LOGGER.debug("Assist announce for %s", self._device_id)
        payload = {
            "action": "announce",
            "media_url": getattr(announcement, "media_id", None),
            "preannounce_media_url": getattr(announcement, "preannounce_media_id", None) if preannounce else None,
            "volume": 90,
        }
        await self._websocket.send_command(
            self._device_id,
            {"type": "command", "command": "assist_command", "data": payload},
        )

    async def async_start_conversation(self, announcement=None, preannounce: bool = True, extra_system_prompt: str | None = None) -> None:
        _LOGGER.debug("Assist start_conversation for %s", self._device_id)
        payload = {
            "action": "start_conversation",
            "announcement_url": getattr(announcement, "media_id", None) if announcement else None,
            "preannounce_media_url": getattr(announcement, "preannounce_media_id", None) if announcement and preannounce else None,
            "extra_system_prompt": extra_system_prompt or "",
            "language": self._coordinator.get_device_data(self._device_id).get("assist_language", "de-DE"),
        }
        await self._websocket.send_command(
            self._device_id,
            {"type": "command", "command": "assist_command", "data": payload},
        )

    async def async_added_to_hass(self) -> None:
        _LOGGER.info("Assist satellite entity added for %s as %s", self._device_id, self.entity_id)
        remove_cb = remove_cb = self._coordinator.register_update_callback(self._device_id, self._handle_update)
        if remove_cb:
            self.async_on_remove(remove_cb)
        if remove_cb:
            self.async_on_remove(remove_cb)

    def _handle_update(self) -> None:
        if self.state == AssistSatelliteState.IDLE:
            try:
                self.tts_response_finished()
            except Exception:
                pass
        self.async_write_ha_state()
