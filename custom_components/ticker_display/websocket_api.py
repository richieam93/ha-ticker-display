"""WebSocket API for Ticker Display."""

import logging
import json
import asyncio
from aiohttp import web, WSMsgType
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event
from .const import WS_PATH

_LOGGER = logging.getLogger(__name__)


class TickerDisplayWebSocket:
    def __init__(self, hass: HomeAssistant, store, coordinator):
        self.hass = hass
        self.store = store
        self.coordinator = coordinator
        self._connections: dict[str, list[web.WebSocketResponse]] = {}
        self._entity_subscriptions: dict[str, set] = {}
        self._state_listeners: dict[str, list] = {}

    def register(self):
        self.hass.http.app.router.add_get(f"{WS_PATH}/{{device_id}}", self._handle_websocket)
        _LOGGER.info("WebSocket registered at %s/{{device_id}}", WS_PATH)

    async def _handle_websocket(self, request: web.Request) -> web.WebSocketResponse:
        device_id = request.match_info["device_id"]
        ws = web.WebSocketResponse(heartbeat=30)
        await ws.prepare(request)
        _LOGGER.info("WebSocket connected: %s", device_id)
        self._connections.setdefault(device_id, []).append(ws)

        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    await self._handle_message(device_id, ws, json.loads(msg.data))
                elif msg.type == WSMsgType.ERROR:
                    _LOGGER.error("WebSocket error for %s: %s", device_id, ws.exception())
        except Exception as e:
            _LOGGER.error("WebSocket exception for %s: %s", device_id, e)
        finally:
            if device_id in self._connections:
                self._connections[device_id].remove(ws)
                if not self._connections[device_id]:
                    del self._connections[device_id]
            self._cleanup_state_listeners(device_id)
            _LOGGER.info("WebSocket disconnected: %s", device_id)
        return ws

    async def _handle_message(self, device_id: str, ws, msg: dict):
        msg_type = msg.get("type")
        if msg_type == "subscribe":
            await self._subscribe_entities(device_id, msg.get("entities", []))
        elif msg_type == "sensor_update":
            self.coordinator.process_heartbeat(device_id, msg.get("data", {}))
        elif msg_type == "event":
            self.coordinator.process_event(device_id, msg.get("event", ""), msg.get("data", {}))
        elif msg_type == "status":
            self.coordinator.process_event(device_id, "screen_changed", {"screen": msg.get("screen", "")})

    async def _subscribe_entities(self, device_id: str, entities: list[str]):
        self._cleanup_state_listeners(device_id)
        if not entities:
            return
        self._entity_subscriptions[device_id] = set(entities)

        @callback
        def _state_changed(event):
            entity_id = event.data.get("entity_id")
            new_state = event.data.get("new_state")
            if new_state is None:
                return
            asyncio.create_task(self.send_to_device(device_id, {
                "type": "state_changed", "entity_id": entity_id,
                "new_state": {"state": new_state.state, "attributes": dict(new_state.attributes),
                    "last_changed": new_state.last_changed.isoformat()},
            }))

        unsub = async_track_state_change_event(self.hass, entities, _state_changed)
        self._state_listeners.setdefault(device_id, []).append(unsub)

        for entity_id in entities:
            state = self.hass.states.get(entity_id)
            if state:
                await self.send_to_device(device_id, {
                    "type": "state_changed", "entity_id": entity_id,
                    "new_state": {"state": state.state, "attributes": dict(state.attributes),
                        "last_changed": state.last_changed.isoformat()},
                })

    def _cleanup_state_listeners(self, device_id: str):
        for unsub in self._state_listeners.pop(device_id, []):
            unsub()
        self._entity_subscriptions.pop(device_id, None)

    async def send_to_device(self, device_id: str, message: dict):
        connections = self._connections.get(device_id, [])
        if not connections:
            return
        data = json.dumps(message)
        dead = []
        for ws in connections:
            try:
                await ws.send_str(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            connections.remove(ws)

    async def send_to_all(self, message: dict):
        for device_id in list(self._connections.keys()):
            await self.send_to_device(device_id, message)

    async def send_to_devices(self, device_ids: list[str], message: dict):
        for device_id in device_ids:
            await self.send_to_device(device_id, message)

    def get_connected_devices(self) -> list[str]:
        return list(self._connections.keys())

    def is_device_connected(self, device_id: str) -> bool:
        return bool(self._connections.get(device_id))

    async def send_command(self, device, message: dict):
        if device == "all":
            await self.send_to_all(message)
        elif isinstance(device, list):
            await self.send_to_devices(device, message)
        else:
            await self.send_to_device(device, message)