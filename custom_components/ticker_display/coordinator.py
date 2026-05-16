"""Coordinator for managing Ticker Display devices."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval

from .const import DEFAULT_HEARTBEAT_TIMEOUT, DEVICE_STALE_TIMEOUT

_LOGGER = logging.getLogger(__name__)


def _as_utc(value: datetime | None) -> datetime | None:
    """Return an aware UTC datetime."""
    if value is None:
        return None
    if getattr(value, "tzinfo", None) is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _iso(value: datetime | None) -> str | None:
    """Return ISO text for a datetime."""
    value = _as_utc(value)
    return value.isoformat() if value else None


class TickerDisplayCoordinator:
    """Small runtime coordinator for all registered display devices."""

    def __init__(self, hass: HomeAssistant, store, heartbeat_timeout: int = DEFAULT_HEARTBEAT_TIMEOUT):
        self.hass = hass
        self.store = store
        self._device_data: dict[str, dict[str, Any]] = {}
        self._last_heartbeat: dict[str, datetime] = {}
        self._last_seen: dict[str, datetime] = {}
        self._last_connected: dict[str, datetime] = {}
        self._last_disconnected: dict[str, datetime] = {}
        self._last_event: dict[str, str] = {}
        self._last_event_at: dict[str, datetime] = {}
        self._last_command: dict[str, str] = {}
        self._last_command_at: dict[str, datetime] = {}
        self._event_count: dict[str, int] = {}
        self._command_count: dict[str, int] = {}
        self._connection_count: dict[str, int] = {}
        self._missed_command_count: dict[str, int] = {}
        self._update_callbacks: dict[str, list] = {}
        self._heartbeat_timeout = max(30, int(heartbeat_timeout or DEFAULT_HEARTBEAT_TIMEOUT))

        self._unsub_timer = async_track_time_interval(
            hass, self._check_device_timeouts, timedelta(seconds=30)
        )

    def _touch(self, device_id: str) -> datetime:
        now = datetime.now(UTC)
        self._last_seen[device_id] = now
        return now

    def process_heartbeat(self, device_id: str, data: dict):
        """Process sensor/runtime data from a display."""
        if not device_id:
            return
        current = self._device_data.get(device_id, {})
        if current:
            current.update(data or {})
            self._device_data[device_id] = current
        else:
            self._device_data[device_id] = dict(data or {})
        now = datetime.now(UTC)
        self._last_heartbeat[device_id] = now
        self._last_seen[device_id] = now
        self._device_data[device_id]["last_heartbeat_at"] = now.isoformat()
        self._device_data[device_id]["last_seen_at"] = now.isoformat()
        self._notify_update(device_id)

    def process_event(self, device_id: str, event_type: str, event_data: dict):
        """Process one device event and mirror the most useful fields into runtime data."""
        if not device_id:
            return
        if device_id not in self._device_data:
            self._device_data[device_id] = {}
        now = self._touch(device_id)
        event_type = str(event_type or "unknown")
        event_data = event_data or {}
        self._last_event[device_id] = event_type
        self._last_event_at[device_id] = now
        self._event_count[device_id] = self._event_count.get(device_id, 0) + 1

        d = self._device_data[device_id]
        d["last_seen_at"] = now.isoformat()
        d["last_event"] = event_type
        d["last_event_at"] = now.isoformat()
        d["event_count"] = self._event_count[device_id]

        if event_type == "motion_detected":
            d["motion_detected"] = True
            d["motion_last_detected_at"] = now.isoformat()
            for key in (
                "motion_score", "motion_avg_delta", "motion_status",
                "motion_source", "motion_last_error"
            ):
                if key in event_data:
                    d[key] = event_data.get(key)
        elif event_type == "motion_stopped":
            d["motion_detected"] = False
            d["motion_last_cleared_at"] = now.isoformat()
            for key in (
                "motion_score", "motion_avg_delta", "motion_status",
                "motion_source", "motion_last_error"
            ):
                if key in event_data:
                    d[key] = event_data.get(key)
        elif event_type == "motion_detector_status":
            d["motion_status"] = event_data.get("motion_status", "unknown")
            d["motion_source"] = event_data.get("motion_source", "camera")
            d["motion_last_error"] = event_data.get("motion_last_error", "")
        elif event_type == "proximity_changed":
            d["proximity_near"] = event_data.get("near", False)
        elif event_type == "screen_changed":
            d["webview_url"] = event_data.get("screen", "")
        elif event_type == "alert_action":
            d["last_alert_action"] = event_data.get("action", "")
            d["last_alert_tag"] = event_data.get("tag", "")
        elif event_type == "alert_shown":
            d["active_alert_tag"] = event_data.get("tag", "")
            d["active_alert_title"] = event_data.get("title", "")
        elif event_type == "alert_closed":
            d["active_alert_tag"] = ""
            d["active_alert_title"] = ""
        elif event_type == "frontend_error":
            d["last_error"] = event_data.get("message") or event_data.get("error") or "frontend_error"
            d["last_error_at"] = now.isoformat()
            d["webview_error_count"] = int(d.get("webview_error_count") or 0) + 1
        elif event_type == "media_state":
            d["media_state"] = event_data.get("state", "idle")
            d["media_title"] = event_data.get("title", "")
            d["media_url"] = event_data.get("url", "")
            d["media_announcement_active"] = bool(event_data.get("announcement_active", False))
            d["media_can_next"] = bool(event_data.get("can_next", False))
            d["media_can_previous"] = bool(event_data.get("can_previous", False))
            if "volume" in event_data:
                d["volume_percent"] = event_data.get("volume")

        self.hass.bus.async_fire(
            f"ticker_display_{event_type}",
            {
                "device_id": device_id,
                "event_type": event_type,
                **event_data,
            },
        )
        self._notify_update(device_id)

    def mark_connected(self, device_id: str) -> None:
        """Record a websocket connection."""
        if not device_id:
            return
        now = self._touch(device_id)
        self._last_connected[device_id] = now
        self._connection_count[device_id] = self._connection_count.get(device_id, 0) + 1
        self._device_data.setdefault(device_id, {})
        self._device_data[device_id].update(
            {
                "websocket_connected": True,
                "last_connected_at": now.isoformat(),
                "connection_count": self._connection_count[device_id],
                "last_seen_at": now.isoformat(),
            }
        )
        self._notify_update(device_id)

    def mark_disconnected(self, device_id: str) -> None:
        """Record that the last websocket connection closed."""
        if not device_id:
            return
        now = self._touch(device_id)
        self._last_disconnected[device_id] = now
        self._device_data.setdefault(device_id, {})
        self._device_data[device_id].update(
            {
                "websocket_connected": False,
                "last_disconnected_at": now.isoformat(),
                "last_seen_at": now.isoformat(),
            }
        )
        self._notify_update(device_id)

    def record_command_sent(self, device_id: str, message: dict, *, delivered: bool = True) -> None:
        """Record one command attempt."""
        if not device_id:
            return
        now = datetime.now(UTC)
        command = str(message.get("command") or message.get("type") or message.get("action") or "command")[:80]
        self._last_command[device_id] = command
        self._last_command_at[device_id] = now
        self._command_count[device_id] = self._command_count.get(device_id, 0) + 1
        if not delivered:
            self._missed_command_count[device_id] = self._missed_command_count.get(device_id, 0) + 1
        self._device_data.setdefault(device_id, {})
        self._device_data[device_id].update(
            {
                "last_command": command,
                "last_command_at": now.isoformat(),
                "command_count": self._command_count[device_id],
                "missed_command_count": self._missed_command_count.get(device_id, 0),
            }
        )
        self._notify_update(device_id)

    def update_device_data(self, device_id: str, data: dict):
        """Merge runtime data for one device."""
        if not device_id:
            return
        if device_id not in self._device_data:
            self._device_data[device_id] = {}
        self._device_data[device_id].update(data or {})
        now = self._touch(device_id)
        self._device_data[device_id]["last_seen_at"] = now.isoformat()
        self._notify_update(device_id)

    def get_device_data(self, device_id: str) -> dict:
        """Return raw runtime data for a device."""
        return self._device_data.get(device_id, {})

    def heartbeat_age_seconds(self, device_id: str) -> int | None:
        """Return seconds since last heartbeat."""
        last = _as_utc(self._last_heartbeat.get(device_id))
        if last is None:
            return None
        return max(0, int((datetime.now(UTC) - last).total_seconds()))

    def last_seen_age_seconds(self, device_id: str) -> int | None:
        """Return seconds since last seen event/heartbeat/connection."""
        last = _as_utc(self._last_seen.get(device_id) or self._last_heartbeat.get(device_id))
        if last is None:
            return None
        return max(0, int((datetime.now(UTC) - last).total_seconds()))

    def is_device_online(self, device_id: str) -> bool:
        last = _as_utc(self._last_heartbeat.get(device_id))
        if not last:
            return False
        return (datetime.now(UTC) - last).total_seconds() < self._heartbeat_timeout

    def is_device_available(self, device_id: str) -> bool:
        if self.is_device_online(device_id):
            return True
        if device_id in self._device_data:
            age = self.last_seen_age_seconds(device_id)
            if age is None:
                return True
            return age < DEVICE_STALE_TIMEOUT
        return False

    def get_all_online_devices(self) -> list[str]:
        return [did for did in self._device_data if self.is_device_online(did)]

    def get_device_status(self, device_id: str, *, websocket_connected: bool | None = None) -> dict[str, Any]:
        """Return a compact diagnostics/status payload for one device."""
        data = self.get_device_data(device_id)
        heartbeat_age = self.heartbeat_age_seconds(device_id)
        seen_age = self.last_seen_age_seconds(device_id)
        connected = bool(data.get("websocket_connected")) if websocket_connected is None else websocket_connected
        return {
            "device_id": device_id,
            "online": self.is_device_online(device_id),
            "available": self.is_device_available(device_id),
            "connected": connected,
            "heartbeat_timeout": self._heartbeat_timeout,
            "heartbeat_age_seconds": heartbeat_age,
            "last_seen_age_seconds": seen_age,
            "last_heartbeat_at": _iso(self._last_heartbeat.get(device_id)),
            "last_seen_at": _iso(self._last_seen.get(device_id)),
            "last_connected_at": _iso(self._last_connected.get(device_id)),
            "last_disconnected_at": _iso(self._last_disconnected.get(device_id)),
            "last_event": self._last_event.get(device_id) or data.get("last_event"),
            "last_event_at": _iso(self._last_event_at.get(device_id)) or data.get("last_event_at"),
            "event_count": self._event_count.get(device_id, int(data.get("event_count") or 0)),
            "last_command": self._last_command.get(device_id) or data.get("last_command"),
            "last_command_at": _iso(self._last_command_at.get(device_id)) or data.get("last_command_at"),
            "command_count": self._command_count.get(device_id, int(data.get("command_count") or 0)),
            "missed_command_count": self._missed_command_count.get(device_id, int(data.get("missed_command_count") or 0)),
            "connection_count": self._connection_count.get(device_id, int(data.get("connection_count") or 0)),
            "last_error": data.get("last_error"),
            "last_error_at": data.get("last_error_at"),
            "webview_error_count": data.get("webview_error_count"),
        }

    def forget_device(self, device_id: str) -> None:
        """Forget volatile runtime data for a removed device."""
        for mapping in (
            self._device_data,
            self._last_heartbeat,
            self._last_seen,
            self._last_connected,
            self._last_disconnected,
            self._last_event,
            self._last_event_at,
            self._last_command,
            self._last_command_at,
            self._event_count,
            self._command_count,
            self._connection_count,
            self._missed_command_count,
            self._update_callbacks,
        ):
            mapping.pop(device_id, None)

    @callback
    def register_update_callback(self, device_id: str, callback_fn):
        self._update_callbacks.setdefault(device_id, []).append(callback_fn)

        def _remove():
            callbacks = self._update_callbacks.get(device_id, [])
            if callback_fn in callbacks:
                callbacks.remove(callback_fn)
        return _remove

    @callback
    def _notify_update(self, device_id: str):
        for cb in list(self._update_callbacks.get(device_id, [])):
            try:
                cb()
            except Exception:
                _LOGGER.exception("Error in update callback for %s", device_id)

    @callback
    def _check_device_timeouts(self, _now=None):
        for device_id in set(self._last_seen) | set(self._last_heartbeat) | set(self._device_data):
            self._notify_update(device_id)
