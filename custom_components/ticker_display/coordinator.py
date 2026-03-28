"""Coordinator for managing Ticker Display devices."""

import logging
from datetime import datetime, timedelta
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval
from .const import DEFAULT_HEARTBEAT_TIMEOUT

_LOGGER = logging.getLogger(__name__)


class TickerDisplayCoordinator:
    def __init__(self, hass: HomeAssistant, store, heartbeat_timeout: int = DEFAULT_HEARTBEAT_TIMEOUT):
        self.hass = hass
        self.store = store
        self._device_data: dict[str, dict] = {}
        self._last_heartbeat: dict[str, datetime] = {}
        self._update_callbacks: dict[str, list] = {}
        self._heartbeat_timeout = heartbeat_timeout

        self._unsub_timer = async_track_time_interval(
            hass, self._check_device_timeouts, timedelta(seconds=30)
        )

    def process_heartbeat(self, device_id: str, data: dict):
        self._device_data[device_id] = data
        self._last_heartbeat[device_id] = datetime.now()
        self._notify_update(device_id)

    def process_event(self, device_id: str, event_type: str, event_data: dict):
        if device_id not in self._device_data:
            self._device_data[device_id] = {}

        d = self._device_data[device_id]
        if event_type == "motion_detected":
            d["motion_detected"] = True
        elif event_type == "motion_stopped":
            d["motion_detected"] = False
        elif event_type == "proximity_changed":
            d["proximity_near"] = event_data.get("near", False)
        elif event_type == "screen_changed":
            d["webview_url"] = event_data.get("screen", "")

        self._notify_update(device_id)

    def get_device_data(self, device_id: str) -> dict:
        return self._device_data.get(device_id, {})

    def is_device_online(self, device_id: str) -> bool:
        last = self._last_heartbeat.get(device_id)
        if not last:
            return False
        return (datetime.now() - last).total_seconds() < self._heartbeat_timeout

    def get_all_online_devices(self) -> list[str]:
        return [did for did in self._device_data if self.is_device_online(did)]

    @callback
    def register_update_callback(self, device_id: str, callback_fn):
        self._update_callbacks.setdefault(device_id, []).append(callback_fn)

    @callback
    def _notify_update(self, device_id: str):
        for cb in self._update_callbacks.get(device_id, []):
            cb()

    @callback
    def _check_device_timeouts(self, _now=None):
        for device_id in list(self._last_heartbeat.keys()):
            last = self._last_heartbeat[device_id]
            is_online = (datetime.now() - last).total_seconds() < self._heartbeat_timeout
            if not is_online:
                self._notify_update(device_id)