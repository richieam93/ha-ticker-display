from __future__ import annotations

from homeassistant.components.camera import Camera
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
import base64

PLACEHOLDER_JPEG = base64.b64decode("/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8QDw8PEA8PDw8PDw8PDw8QFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGi0fHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAAAQMC/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAB6A//xAAVEAEBAAAAAAAAAAAAAAAAAAABAP/aAAgBAQABBQL/xAAVEQEBAAAAAAAAAAAAAAAAAAAAAf/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyB//9k=")

from .const import DOMAIN

CAMERA_KINDS = (("front", "Frontkamera"), ("back", "Rückkamera"))

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    entry_data = hass.data[DOMAIN][entry.entry_id]
    store = entry_data["store"]
    coordinator = entry_data["coordinator"]
    entities = []
    for device_id, device_config in (store.get_devices() or {}).items():
        for kind, label in CAMERA_KINDS:
            entities.append(TickerDisplayPhoneCamera(hass, coordinator, device_id, device_config.get("name", device_id), kind, label))
    async_add_entities(entities)

class TickerDisplayPhoneCamera(Camera):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, hass: HomeAssistant, coordinator, device_id: str, device_name: str, kind: str, label: str) -> None:
        super().__init__()
        self.hass = hass
        self._coordinator = coordinator
        self._device_id = device_id
        self._kind = kind
        self._attr_name = label
        self._attr_unique_id = f"ticker_display_{device_id}_{kind}_camera"
        self._attr_device_info = {"identifiers": {(DOMAIN, device_id)}, "name": device_name, "manufacturer": "Ticker Display", "model": "Android Display"}

    @property
    def _frame(self):
        return (((self.hass.data.get(DOMAIN) or {}).get("camera_frames") or {}).get(self._device_id) or {}).get(self._kind)

    @property
    def available(self) -> bool:
        data = self._coordinator.get_device_data(self._device_id)
        return (self._coordinator.is_device_available(self._device_id) and (bool(data.get(f"{self._kind}_camera_enabled")) or bool((self._frame or {}).get("bytes"))))

    @property
    def is_on(self) -> bool:
        data = self._coordinator.get_device_data(self._device_id)
        return bool(data.get(f"{self._kind}_camera_enabled"))

    @property
    def extra_state_attributes(self):
        frame = self._frame or {}
        return {
            "camera_position": self._kind,
            "last_frame_at": frame.get("ts"),
            "frame_available": bool(frame.get("bytes")),
        }

    async def async_camera_image(self, width=None, height=None):
        frame = self._frame or {}
        return frame.get("bytes") or PLACEHOLDER_JPEG

    async def async_added_to_hass(self):
        await super().async_added_to_hass()
        remove_cb = self._coordinator.register_update_callback(self._device_id, self.async_write_ha_state)
        if remove_cb:
            self.async_on_remove(remove_cb)
