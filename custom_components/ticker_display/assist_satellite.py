"""Assist satellite entities for Ticker Display devices."""

from __future__ import annotations

import json

from homeassistant.components.assist_satellite import (
    AssistSatelliteEntity,
    AssistSatelliteEntityFeature,
)

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


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    entry_data = hass.data[DOMAIN][entry.entry_id]
    coordinator = entry_data["coordinator"]
    store = entry_data["store"]
    entities: list[TickerDisplayAssistSatellite] = []

    for device_id, device_config in store.get_devices().items():
        entities.append(
            TickerDisplayAssistSatellite(
                coordinator,
                entry_data["websocket"],
                device_id,
                device_config.get("name", device_id),
            )
        )

    async_add_entities(entities)


class TickerDisplayAssistSatellite(AssistSatelliteEntity):
    _attr_has_entity_name = True
    _attr_supported_features = (
        AssistSatelliteEntityFeature.ANNOUNCE
        | AssistSatelliteEntityFeature.START_CONVERSATION
    )

    def __init__(self, coordinator, websocket, device_id: str, device_name: str) -> None:
        self._coordinator = coordinator
        self._websocket = websocket
        self._device_id = device_id
        self._attr_unique_id = f"ticker_display_{device_id}_assist"
        self._attr_name = f"{device_name} Assist"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, device_id)},
            "name": device_name,
            "manufacturer": "Ticker Display",
            "model": "Android Assist Satellite",
        }

    @property
    def available(self) -> bool:
        return self._coordinator.is_device_online(self._device_id)

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

    async def async_announce(self, announcement, preannounce: bool = True) -> None:
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
        self._coordinator.register_update_callback(self._device_id, self._handle_update)

    def _handle_update(self) -> None:
        if self.state == AssistSatelliteState.IDLE:
            try:
                self.tts_response_finished()
            except Exception:
                pass
        self.async_write_ha_state()
