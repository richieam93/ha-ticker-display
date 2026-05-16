"""WebSocket API for Ticker Display."""

from __future__ import annotations

import asyncio
import json
import logging

from aiohttp import WSMsgType, web
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event

from .const import WS_PATH

_LOGGER = logging.getLogger(__name__)


class TickerDisplayWebSocket:
    """Handle websocket communication with display clients."""

    def __init__(self, hass: HomeAssistant, store, coordinator) -> None:
        self.hass = hass
        self.store = store
        self.coordinator = coordinator
        self._connections: dict[str, list[web.WebSocketResponse]] = {}
        self._entity_subscriptions: dict[str, set[str]] = {}
        self._state_listeners: dict[str, list] = {}
        self._registered = False

    def register(self) -> None:
        """Register websocket route once."""
        if self._registered:
            return

        self.hass.http.app.router.add_get(
            f"{WS_PATH}/{{device_id}}", self._handle_websocket
        )
        self._registered = True
        _LOGGER.info("WebSocket registered at %s/{device_id}", WS_PATH)

    async def _handle_websocket(self, request: web.Request) -> web.WebSocketResponse:
        """Handle websocket connection."""
        device_id = request.match_info["device_id"]
        ws = web.WebSocketResponse(heartbeat=30)
        await ws.prepare(request)

        _LOGGER.info("WebSocket connected: %s", device_id)
        self._connections.setdefault(device_id, []).append(ws)
        if hasattr(self.coordinator, "mark_connected"):
            self.coordinator.mark_connected(device_id)

        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    try:
                        payload = json.loads(msg.data)
                    except json.JSONDecodeError:
                        _LOGGER.warning(
                            "Invalid websocket JSON from %s: %s", device_id, msg.data
                        )
                        continue

                    await self._handle_message(device_id, ws, payload)

                elif msg.type == WSMsgType.ERROR:
                    _LOGGER.error(
                        "WebSocket error for %s: %s", device_id, ws.exception()
                    )

        except Exception as err:
            _LOGGER.exception("WebSocket exception for %s: %s", device_id, err)

        finally:
            connections = self._connections.get(device_id, [])
            if ws in connections:
                connections.remove(ws)

            if not connections and device_id in self._connections:
                del self._connections[device_id]
                self._cleanup_state_listeners(device_id)
                if hasattr(self.coordinator, "mark_disconnected"):
                    self.coordinator.mark_disconnected(device_id)

            _LOGGER.info("WebSocket disconnected: %s", device_id)

        return ws

    async def _handle_message(
        self, device_id: str, ws: web.WebSocketResponse, msg: dict
    ) -> None:
        """Handle incoming websocket message."""
        msg_type = msg.get("type")

        if msg_type == "subscribe":
            await self._subscribe_entities(device_id, msg.get("entities", []))

        elif msg_type == "sensor_update":
            data = dict(msg.get("data", {}))
            data["device_id"] = device_id
            self.coordinator.process_heartbeat(device_id, data)

        elif msg_type == "event":
            self.coordinator.process_event(
                device_id,
                msg.get("event", ""),
                msg.get("data", {}),
            )

        elif msg_type == "status":
            self.coordinator.process_event(
                device_id,
                "screen_changed",
                {"screen": msg.get("screen", "")},
            )

        else:
            _LOGGER.debug("Unknown websocket message from %s: %s", device_id, msg)

    async def _subscribe_entities(self, device_id: str, entities: list[str]) -> None:
        """Subscribe device to entity state changes."""
        self._cleanup_state_listeners(device_id)

        clean_entities = [e for e in entities if isinstance(e, str) and e.strip()]
        if not clean_entities:
            self._entity_subscriptions[device_id] = set()
            return

        self._entity_subscriptions[device_id] = set(clean_entities)

        @callback
        def _state_changed(event):
            entity_id = event.data.get("entity_id")
            new_state = event.data.get("new_state")
            if new_state is None:
                return

            asyncio.create_task(
                self.send_to_device(
                    device_id,
                    {
                        "type": "state_changed",
                        "entity_id": entity_id,
                        "new_state": {
                            "state": new_state.state,
                            "attributes": dict(new_state.attributes),
                            "last_changed": new_state.last_changed.isoformat(),
                        },
                    },
                )
            )

        unsub = async_track_state_change_event(self.hass, clean_entities, _state_changed)
        self._state_listeners.setdefault(device_id, []).append(unsub)

        for entity_id in clean_entities:
            state = self.hass.states.get(entity_id)
            if state:
                await self.send_to_device(
                    device_id,
                    {
                        "type": "state_changed",
                        "entity_id": entity_id,
                        "new_state": {
                            "state": state.state,
                            "attributes": dict(state.attributes),
                            "last_changed": state.last_changed.isoformat(),
                        },
                    },
                )

    def _cleanup_state_listeners(self, device_id: str) -> None:
        """Remove state listeners for a device."""
        for unsub in self._state_listeners.pop(device_id, []):
            try:
                unsub()
            except Exception:
                _LOGGER.exception("Failed to remove state listener for %s", device_id)

        self._entity_subscriptions.pop(device_id, None)

    async def send_to_device(self, device_id: str, message: dict) -> None:
        """Send message to one device."""
        connections = self._connections.get(device_id, [])
        if not connections:
            if hasattr(self.coordinator, "record_command_sent"):
                self.coordinator.record_command_sent(device_id, message, delivered=False)
            return

        data = json.dumps(message)
        dead: list[web.WebSocketResponse] = []

        for ws in list(connections):
            try:
                await ws.send_str(data)
            except Exception:
                dead.append(ws)

        for ws in dead:
            if ws in connections:
                connections.remove(ws)

        delivered = bool(connections)
        if not connections and device_id in self._connections:
            del self._connections[device_id]
            self._cleanup_state_listeners(device_id)
        if hasattr(self.coordinator, "record_command_sent"):
            self.coordinator.record_command_sent(device_id, message, delivered=delivered)

    async def send_to_all(self, message: dict) -> None:
        """Send message to all connected devices."""
        for device_id in list(self._connections.keys()):
            await self.send_to_device(device_id, message)

    async def send_to_devices(self, device_ids: list[str], message: dict) -> None:
        """Send message to multiple devices."""
        for device_id in device_ids:
            await self.send_to_device(device_id, message)

    def get_connected_devices(self) -> list[str]:
        """Return connected device IDs."""
        return list(self._connections.keys())

    def is_device_connected(self, device_id: str) -> bool:
        """Return whether device has an active websocket connection."""
        return bool(self._connections.get(device_id))

    async def send_command(self, device, message: dict) -> None:
        """Send a command to one, many, or all devices."""
        if device == "all":
            await self.send_to_all(message)
        elif isinstance(device, list):
            await self.send_to_devices(device, message)
        else:
            await self.send_to_device(device, message)