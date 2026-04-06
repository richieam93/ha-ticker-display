"""Media player entities for Ticker Display devices."""

from __future__ import annotations

from typing import Any

from homeassistant.components import media_source
from homeassistant.components.media_player import BrowseMedia, MediaPlayerEntity, MediaPlayerEntityFeature, MediaType
from homeassistant.components.media_player.browse_media import async_process_play_media_url
from homeassistant.components.media_player.const import MediaPlayerState
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
    entities: list[TickerDisplayMediaPlayer] = []

    for device_id, device_config in store.get_devices().items():
        entities.append(
            TickerDisplayMediaPlayer(
                hass,
                coordinator,
                entry_data["websocket"],
                entry_data["media_manager"],
                device_id,
                device_config.get("name", device_id),
            )
        )

    async_add_entities(entities)


class TickerDisplayMediaPlayer(MediaPlayerEntity):
    _attr_has_entity_name = True
    _attr_supported_features = (
        MediaPlayerEntityFeature.PLAY_MEDIA
        | MediaPlayerEntityFeature.PLAY
        | MediaPlayerEntityFeature.PAUSE
        | MediaPlayerEntityFeature.STOP
        | MediaPlayerEntityFeature.VOLUME_SET
        | MediaPlayerEntityFeature.NEXT_TRACK
        | MediaPlayerEntityFeature.PREVIOUS_TRACK
        | MediaPlayerEntityFeature.SELECT_SOURCE
        | MediaPlayerEntityFeature.BROWSE_MEDIA
    )

    def __init__(self, hass: HomeAssistant, coordinator, websocket, media_manager, device_id: str, device_name: str) -> None:
        self.hass = hass
        self._coordinator = coordinator
        self._websocket = websocket
        self._media_manager = media_manager
        self._device_id = device_id
        self._attr_unique_id = f"ticker_display_{device_id}_speaker"
        self._attr_name = f"{device_name} Speaker"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, device_id)},
            "name": device_name,
            "manufacturer": "Ticker Display",
            "model": "Android Speaker",
        }

    @property
    def available(self) -> bool:
        return self._coordinator.is_device_available(self._device_id)

    @property
    def state(self) -> MediaPlayerState | None:
        state = str(self._coordinator.get_device_data(self._device_id).get("media_state") or "idle").lower()
        if state == "playing":
            return MediaPlayerState.PLAYING
        if state == "paused":
            return MediaPlayerState.PAUSED
        if state == "buffering":
            return MediaPlayerState.BUFFERING
        if state == "error":
            return MediaPlayerState.IDLE
        return MediaPlayerState.IDLE

    @property
    def volume_level(self) -> float | None:
        raw = self._coordinator.get_device_data(self._device_id).get("volume_percent")
        try:
            return max(0.0, min(1.0, float(raw) / 100.0))
        except (TypeError, ValueError):
            return None

    @property
    def media_title(self) -> str | None:
        return self._coordinator.get_device_data(self._device_id).get("media_title") or None

    @property
    def media_content_type(self) -> str | None:
        return MediaType.MUSIC

    @property
    def source_list(self) -> list[str] | None:
        sounds = self._media_manager.get_sounds()
        sources = [item.get("name") or item.get("id") for item in sounds if item.get("url")]
        if "Home Assistant Medienbrowser" not in sources:
            sources.insert(0, "Home Assistant Medienbrowser")
        return sources

    @property
    def source(self) -> str | None:
        data = self._coordinator.get_device_data(self._device_id)
        return data.get("media_selected_source") or None

    @property
    def extra_state_attributes(self) -> dict:
        data = self._coordinator.get_device_data(self._device_id)
        return {
            "media_url": data.get("media_url") or "",
            "announcement_active": bool(data.get("media_announcement_active", False)),
            "can_next": bool(data.get("media_can_next", False)),
            "can_previous": bool(data.get("media_can_previous", False)),
            "selected_source": data.get("media_selected_source") or "",
        }

    async def _normalize_media_url(self, media_type: str, media_id: str) -> str:
        if not media_id:
            return media_id

        if media_id.startswith("media-source://"):
            resolved = await media_source.async_resolve_media(self.hass, media_id, self.entity_id)
            return async_process_play_media_url(self.hass, resolved.url)

        if media_id.startswith("/"):
            return async_process_play_media_url(self.hass, media_id)

        if media_id.startswith(("http://", "https://")):
            return media_id

        return media_id

    async def async_play_media(self, media_type: str, media_id: str, **kwargs: Any) -> None:
        extra = kwargs.get("extra", {}) or {}
        url = await self._normalize_media_url(media_type, media_id)
        action = "announce" if media_type in {"announcement", "assist", "tts"} or bool(extra.get("announce")) else "play"
        await self._websocket.send_command(
            self._device_id,
            {
                "type": "audio",
                "action": action,
                "url": url,
                "volume": int(extra.get("volume", 90)),
                "loop": bool(extra.get("loop", False)),
                "title": kwargs.get("title") or kwargs.get("media_title") or "",
                "selected_source": kwargs.get("title") or kwargs.get("media_title") or "",
            },
        )

    async def async_media_pause(self) -> None:
        await self._websocket.send_command(self._device_id, {"type": "audio", "action": "pause"})

    async def async_media_play(self) -> None:
        await self._websocket.send_command(self._device_id, {"type": "audio", "action": "resume"})

    async def async_set_volume_level(self, volume: float) -> None:
        await self._websocket.send_command(
            self._device_id,
            {"type": "audio", "action": "set_volume", "volume": int(max(0.0, min(1.0, volume)) * 100)},
        )

    async def async_media_stop(self) -> None:
        await self._websocket.send_command(self._device_id, {"type": "audio", "action": "stop"})

    async def async_media_next_track(self) -> None:
        await self._websocket.send_command(self._device_id, {"type": "audio", "action": "next"})

    async def async_media_previous_track(self) -> None:
        await self._websocket.send_command(self._device_id, {"type": "audio", "action": "previous"})

    async def async_select_source(self, source: str) -> None:
        if source == "Home Assistant Medienbrowser":
            await self.async_write_ha_state()
            return
        for item in self._media_manager.get_sounds():
            name = item.get("name") or item.get("id")
            if name == source and item.get("url"):
                await self._websocket.send_command(
                    self._device_id,
                    {
                        "type": "audio",
                        "action": "play",
                        "url": item["url"],
                        "volume": 90,
                        "loop": False,
                        "title": name,
                        "selected_source": name,
                    },
                )
                return

    async def async_browse_media(
        self,
        media_content_type: str | None = None,
        media_content_id: str | None = None,
    ) -> BrowseMedia:
        if not media_content_id:
            return BrowseMedia(
                title=self.name or "Speaker",
                media_class="directory",
                media_content_id="root",
                media_content_type="library",
                can_play=False,
                can_expand=True,
                children=[
                    BrowseMedia(
                        title="Home Assistant Medienbrowser",
                        media_class="directory",
                        media_content_id="media-source://",
                        media_content_type="library",
                        can_play=False,
                        can_expand=True,
                    ),
                    BrowseMedia(
                        title="Ticker Display Sounds",
                        media_class="directory",
                        media_content_id="ticker-display-sounds",
                        media_content_type="library",
                        can_play=False,
                        can_expand=True,
                        children=[
                            BrowseMedia(
                                title=item.get("name") or item.get("id") or "Sound",
                                media_class="music",
                                media_content_id=item.get("url") or "",
                                media_content_type=MediaType.MUSIC,
                                can_play=True,
                                can_expand=False,
                                thumbnail=None,
                            )
                            for item in self._media_manager.get_sounds()
                            if item.get("url")
                        ],
                    ),
                ],
            )

        if media_content_id == "ticker-display-sounds":
            return BrowseMedia(
                title="Ticker Display Sounds",
                media_class="directory",
                media_content_id="ticker-display-sounds",
                media_content_type="library",
                can_play=False,
                can_expand=True,
                children=[
                    BrowseMedia(
                        title=item.get("name") or item.get("id") or "Sound",
                        media_class="music",
                        media_content_id=item.get("url") or "",
                        media_content_type=MediaType.MUSIC,
                        can_play=True,
                        can_expand=False,
                        thumbnail=None,
                    )
                    for item in self._media_manager.get_sounds()
                    if item.get("url")
                ],
            )

        if media_content_id.startswith("media-source://"):
            return await media_source.async_browse_media(self.hass, media_content_id, content_filter=lambda item: True)

        return BrowseMedia(
            title=self.name or "Speaker",
            media_class="music",
            media_content_id=media_content_id,
            media_content_type=media_content_type or MediaType.MUSIC,
            can_play=True,
            can_expand=False,
        )

    async def async_added_to_hass(self) -> None:
        self._coordinator.register_update_callback(self._device_id, self.async_write_ha_state)
