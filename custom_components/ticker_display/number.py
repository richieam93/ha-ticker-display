"""Number entities for controlling Ticker Display Android devices."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.number import NumberEntity
try:
    from homeassistant.components.number import NumberMode
except ImportError:  # Home Assistant compatibility
    NumberMode = None  # type: ignore[assignment]
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import PERCENTAGE, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN


@dataclass(frozen=True)
class TickerNumberDescription:
    """Description for a writable Android number setting."""

    key: str
    name: str
    data_key: str
    icon: str
    native_min_value: float
    native_max_value: float
    native_step: float
    native_unit_of_measurement: str | None = None
    setting: str | None = None
    command_type: str = "native_control"


NUMBERS: tuple[TickerNumberDescription, ...] = (
    TickerNumberDescription("screen_brightness", "Display-Helligkeit", "screen_brightness", "mdi:brightness-6", 1, 100, 1, PERCENTAGE, command_type="display_control"),
    TickerNumberDescription("media_volume", "Lautstärke", "volume_percent", "mdi:volume-high", 0, 100, 1, PERCENTAGE, command_type="audio"),
    TickerNumberDescription("report_interval", "Status-Sendeintervall", "report_interval_seconds", "mdi:timer-sync-outline", 15, 3600, 15, UnitOfTime.SECONDS, "report_interval_seconds"),
    TickerNumberDescription("camera_interval", "Kamera-Intervall", "camera_interval_seconds", "mdi:camera-timer", 5, 300, 5, UnitOfTime.SECONDS, "camera_interval_seconds"),
    TickerNumberDescription("motion_sensitivity", "Motion-Empfindlichkeit", "motion_sensitivity", "mdi:motion-sensor", 1, 20, 0.5, "%", "motion_sensitivity"),
    TickerNumberDescription("motion_hold_time", "Motion-Haltezeit", "motion_hold_seconds", "mdi:timer-sand", 2, 60, 1, UnitOfTime.SECONDS, "motion_hold_seconds"),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up number entities."""
    entry_data = hass.data[DOMAIN][entry.entry_id]
    coordinator = entry_data["coordinator"]
    store = entry_data["store"]
    websocket = entry_data["websocket"]

    entities: list[TickerDisplayDeviceNumber] = []
    for device_id, device_config in store.get_devices().items():
        device_name = device_config.get("name", device_id)
        for description in NUMBERS:
            entities.append(
                TickerDisplayDeviceNumber(
                    coordinator,
                    websocket,
                    device_id,
                    device_name,
                    description,
                )
            )
    async_add_entities(entities)


class TickerDisplayDeviceNumber(NumberEntity):
    """Writable number/slider for an Android display setting."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, coordinator, websocket, device_id: str, device_name: str, description: TickerNumberDescription) -> None:
        self._coordinator = coordinator
        self._websocket = websocket
        self._device_id = device_id
        self._description = description
        self._attr_unique_id = f"ticker_display_{device_id}_{description.key}"
        self._attr_name = description.name
        self._attr_icon = description.icon
        self._attr_native_min_value = description.native_min_value
        self._attr_native_max_value = description.native_max_value
        self._attr_native_step = description.native_step
        self._attr_native_unit_of_measurement = description.native_unit_of_measurement
        if NumberMode is not None:
            self._attr_mode = NumberMode.SLIDER
        self._attr_device_info = {
            "identifiers": {(DOMAIN, device_id)},
            "name": device_name,
            "manufacturer": "Ticker Display",
            "model": "Android Display",
        }

    @property
    def native_value(self) -> float | None:
        """Return the latest value reported by Android."""
        data = self._coordinator.get_device_data(self._device_id)
        value = data.get(self._description.data_key)
        if value is None and self._description.key == "screen_brightness":
            value = data.get("brightness")
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @property
    def available(self) -> bool:
        """Return whether the device is available."""
        return self._coordinator.is_device_available(self._device_id)

    async def async_set_native_value(self, value: float) -> None:
        """Set a native Android value."""
        minimum = self._description.native_min_value
        maximum = self._description.native_max_value
        clamped = max(minimum, min(maximum, float(value)))
        if self._description.native_step >= 1:
            payload_value: int | float = int(round(clamped))
        else:
            payload_value = round(clamped, 1)

        self._coordinator.update_device_data(self._device_id, {self._description.data_key: payload_value})

        if self._description.command_type == "display_control":
            await self._websocket.send_command(
                self._device_id,
                {"type": "display_control", "brightness": payload_value},
            )
            return

        if self._description.command_type == "audio":
            await self._websocket.send_command(
                self._device_id,
                {"type": "audio", "action": "set_volume", "volume": payload_value},
            )
            return

        await self._websocket.send_command(
            self._device_id,
            {
                "type": "native_control",
                "setting": self._description.setting or self._description.key,
                "value": payload_value,
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
