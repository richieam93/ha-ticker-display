"""Switch entities for controlling Ticker Display Android devices."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN


@dataclass(frozen=True)
class TickerSwitchDescription:
    """Description for a writable Android switch."""

    key: str
    name: str
    data_key: str
    icon: str
    setting: str | None = None
    command_type: str = "native_control"


SWITCHES: tuple[TickerSwitchDescription, ...] = (
    TickerSwitchDescription("screen_power", "Display Power", "screen_power", "mdi:monitor", command_type="display_control"),
    TickerSwitchDescription("keep_screen_on", "Display wach halten", "keep_screen_on", "mdi:monitor-lock", "keep_screen_on"),
    TickerSwitchDescription("kiosk_mode", "Kiosk-Modus", "kiosk_enabled", "mdi:cellphone-lock", "kiosk_enabled"),
    TickerSwitchDescription("motion_detection", "Bewegungs-Erkennung", "motion_detection_enabled", "mdi:motion-sensor", "motion_detection"),
    TickerSwitchDescription("light_sensor", "Lichtsensor", "light_sensor_enabled", "mdi:brightness-auto", "light_sensor"),
    TickerSwitchDescription("front_camera", "Frontkamera", "front_camera_enabled", "mdi:camera-front", "front_camera"),
    TickerSwitchDescription("back_camera", "Rückkamera", "back_camera_enabled", "mdi:camera-rear", "back_camera"),
    TickerSwitchDescription("camera_silent_mode", "Stille Kamera", "camera_silent_mode", "mdi:camera-off", "camera_silent_mode"),
    TickerSwitchDescription("camera_manual_only", "Kamera nur manuell", "camera_manual_only", "mdi:camera-clock", "camera_manual_only"),
    TickerSwitchDescription("burn_in_protection", "Burn-in-Schutz", "burn_in_protection", "mdi:television-shimmer", "burn_in_protection"),
    TickerSwitchDescription("auto_start", "Autostart", "auto_start", "mdi:restart-alert", "auto_start"),
    TickerSwitchDescription("microphone", "Mikrofon", "microphone_enabled", "mdi:microphone", "microphone"),
    TickerSwitchDescription("assist_satellite", "Assist Satellite", "assist_satellite_enabled", "mdi:assistant", "assist_satellite"),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up switch entities."""
    entry_data = hass.data[DOMAIN][entry.entry_id]
    coordinator = entry_data["coordinator"]
    store = entry_data["store"]
    websocket = entry_data["websocket"]

    entities: list[TickerDisplayDeviceSwitch] = []
    for device_id, device_config in store.get_devices().items():
        device_name = device_config.get("name", device_id)
        for description in SWITCHES:
            entities.append(
                TickerDisplayDeviceSwitch(
                    coordinator,
                    websocket,
                    device_id,
                    device_name,
                    description,
                )
            )
    async_add_entities(entities)


class TickerDisplayDeviceSwitch(SwitchEntity):
    """Writable switch for an Android display setting."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, coordinator, websocket, device_id: str, device_name: str, description: TickerSwitchDescription) -> None:
        self._coordinator = coordinator
        self._websocket = websocket
        self._device_id = device_id
        self._description = description
        self._attr_unique_id = f"ticker_display_{device_id}_{description.key}"
        self._attr_name = description.name
        self._attr_icon = description.icon
        self._attr_device_info = {
            "identifiers": {(DOMAIN, device_id)},
            "name": device_name,
            "manufacturer": "Ticker Display",
            "model": "Android Display",
        }

    @property
    def is_on(self) -> bool | None:
        """Return current switch state from latest Android heartbeat."""
        data = self._coordinator.get_device_data(self._device_id)
        value = data.get(self._description.data_key)
        if value is None and self._description.key == "screen_power":
            value = data.get("screen_on")
        if value is None:
            return None
        return bool(value)

    @property
    def available(self) -> bool:
        """Return whether the device is available."""
        return self._coordinator.is_device_available(self._device_id)

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Turn a setting on."""
        await self._set_state(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn a setting off."""
        await self._set_state(False)

    async def _set_state(self, enabled: bool) -> None:
        self._coordinator.update_device_data(self._device_id, {self._description.data_key: enabled})
        if self._description.command_type == "display_control":
            await self._websocket.send_command(
                self._device_id,
                {"type": "display_control", "screen_power": enabled},
            )
            return

        await self._websocket.send_command(
            self._device_id,
            {
                "type": "native_control",
                "setting": self._description.setting or self._description.key,
                "value": enabled,
            },
        )

    async def async_added_to_hass(self) -> None:
        """Subscribe to coordinator updates."""
        await super().async_added_to_hass()
        remove_cb = self._coordinator.register_update_callback(
            self._device_id, self.async_write_ha_state
        )
        if remove_cb:
            self.async_on_remove(remove_cb)
