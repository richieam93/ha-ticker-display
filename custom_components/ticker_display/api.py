"""REST API for Ticker Display."""

from __future__ import annotations

import logging
import json
from datetime import datetime, timedelta
from pathlib import Path

from aiohttp import web
from homeassistant.core import HomeAssistant

from .const import API_BASE, ASSETS_PATH, DOMAIN, MEDIA_PATH

_LOGGER = logging.getLogger(__name__)


class TickerDisplayAPI:
    def __init__(self, hass, store, coordinator, media_manager, websocket):
        self.hass = hass
        self.store = store
        self.coordinator = coordinator
        self.media = media_manager
        self.ws = websocket
        self._integration_path = Path(hass.config.path(f"custom_components/{DOMAIN}"))
        self._registered = False

    def register_routes(self):
        if self._registered:
            return

        app = self.hass.http.app

        # Device API
        app.router.add_post(f"{API_BASE}/api/device/register", self._device_register)
        app.router.add_post(f"{API_BASE}/api/device/heartbeat", self._device_heartbeat)
        app.router.add_post(f"{API_BASE}/api/device/event", self._device_event)
        app.router.add_get(f"{API_BASE}/api/device/{{device_id}}/config", self._device_config)
        app.router.add_delete(f"{API_BASE}/api/device/{{device_id}}", self._device_delete)

        # Display Pages
        app.router.add_get(f"{API_BASE}/{{device_id}}", self._display_page)
        app.router.add_get(f"{API_BASE}/preview/{{device_id}}", self._display_page)

        # Static Assets
        display_path = self._integration_path / "display"
        if display_path.exists():
            app.router.add_static(f"{ASSETS_PATH}/", display_path)

        frontend_path = self._integration_path / "frontend" / "dist"
        if frontend_path.exists():
            app.router.add_static(f"{ASSETS_PATH}/panel/", frontend_path)

        # Media Files
        app.router.add_get(f"{MEDIA_PATH}/sounds/{{filename}}", self._media_file)
        app.router.add_get(f"{MEDIA_PATH}/fonts/{{filename}}", self._media_file)
        app.router.add_get(f"{MEDIA_PATH}/images/{{filename}}", self._media_file)

        # Media Management
        for res in ["sounds", "fonts", "images"]:
            app.router.add_get(f"{API_BASE}/api/media/{res}", self._list_media)

        app.router.add_post(f"{API_BASE}/api/media/sound/upload", self._upload_media)
        app.router.add_post(f"{API_BASE}/api/media/font/upload", self._upload_media)
        app.router.add_post(f"{API_BASE}/api/media/image/upload", self._upload_media)
        app.router.add_delete(f"{API_BASE}/api/media/sound/{{item_id}}", self._delete_media)
        app.router.add_delete(f"{API_BASE}/api/media/font/{{item_id}}", self._delete_media)
        app.router.add_delete(f"{API_BASE}/api/media/image/{{item_id}}", self._delete_media)

        # Data API
        app.router.add_get(f"{API_BASE}/api/image/camera/{{entity_id}}", self._camera_proxy)
        app.router.add_get(f"{API_BASE}/api/history/{{entity_id}}", self._history)
        app.router.add_get(f"{API_BASE}/api/weather/{{entity_id}}", self._weather)
        app.router.add_get(f"{API_BASE}/api/states/{{entity_id}}", self._states)
        app.router.add_get(f"{API_BASE}/api/entity/{{entity_id}}", self._states)
        app.router.add_post(f"{API_BASE}/api/entity/toggle", self._entity_toggle)
        app.router.add_post(f"{API_BASE}/api/entity/service", self._entity_service)
        app.router.add_get(f"{API_BASE}/api/media-player/{{entity_id}}", self._media_player_state)
        app.router.add_post(f"{API_BASE}/api/media-player/{{entity_id}}/command", self._media_player_command)
        app.router.add_get(f"{API_BASE}/api/persons", self._persons)
        app.router.add_get(f"{API_BASE}/api/entities", self._entities_list)
        app.router.add_get(f"{API_BASE}/api/ha-media/items", self._ha_media_items)

        # Config API
        app.router.add_get(f"{API_BASE}/api/config/devices", self._config_devices)
        app.router.add_post(f"{API_BASE}/api/config/device/virtual", self._config_device_virtual)
        app.router.add_get(f"{API_BASE}/api/config/device/{{device_id}}", self._config_device_get)
        app.router.add_post(f"{API_BASE}/api/config/device/{{device_id}}", self._config_device_save)
        app.router.add_get(f"{API_BASE}/api/config/templates", self._config_templates)
        app.router.add_post(f"{API_BASE}/api/config/template", self._config_template_save)
        app.router.add_delete(f"{API_BASE}/api/config/template/{{template_id}}", self._config_template_delete)
        app.router.add_get(f"{API_BASE}/api/config/alerts", self._config_alerts)
        app.router.add_post(f"{API_BASE}/api/config/alert", self._config_alert_save)
        app.router.add_delete(f"{API_BASE}/api/config/alert/{{alert_id}}", self._config_alert_delete)
        app.router.add_get(f"{API_BASE}/api/config/themes", self._config_themes)
        app.router.add_post(f"{API_BASE}/api/config/theme", self._config_theme_save)
        app.router.add_delete(f"{API_BASE}/api/config/theme/{{theme_id}}", self._config_theme_delete)
        app.router.add_get(f"{API_BASE}/api/config/global", self._config_global_get)
        app.router.add_post(f"{API_BASE}/api/config/global", self._config_global_save)
        app.router.add_post(f"{API_BASE}/api/config/backup", self._config_backup)
        app.router.add_post(f"{API_BASE}/api/config/restore", self._config_restore)

        self._registered = True
        _LOGGER.info("API routes registered")

    def _state_domain(self, state) -> str:
        entity_id = getattr(state, "entity_id", "") or ""
        return entity_id.split(".", 1)[0] if "." in entity_id else ""

    def _json_safe(self, value):
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, dict):
            return {str(k): self._json_safe(v) for k, v in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [self._json_safe(v) for v in value]
        if isinstance(value, Path):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()
        if hasattr(value, "isoformat"):
            try:
                return value.isoformat()
            except Exception:
                pass
        if hasattr(value, "as_dict"):
            try:
                return self._json_safe(value.as_dict())
            except Exception:
                pass
        try:
            json.dumps(value)
            return value
        except Exception:
            return str(value)

    def _serialize_state(self, state) -> dict:
        attrs = dict(getattr(state, "attributes", {}) or {})
        return {
            "entity_id": getattr(state, "entity_id", ""),
            "state": getattr(state, "state", None),
            "attributes": self._json_safe(attrs),
            "last_changed": getattr(state, "last_changed", None).isoformat() if getattr(state, "last_changed", None) else None,
            "last_updated": getattr(state, "last_updated", None).isoformat() if getattr(state, "last_updated", None) else None,
        }

    # ══════════════════════════════════════════════════════
    # Device API
    # ══════════════════════════════════════════════════════

    async def _device_register(self, request):
        data = await request.json()
        device_id = data.get("device_id")
        if not device_id:
            return web.json_response({"error": "device_id required"}, status=400)

        existing = self.store.get_device(device_id)
        await self.store.async_add_device(device_id, data)

        return web.json_response(
            {
                "status": "ok",
                "device_id": device_id,
                "existing": existing is not None,
                "display_url": f"{API_BASE}/{device_id}",
                "ws_url": f"/ticker-display/ws/{device_id}",
            }
        )

    async def _device_heartbeat(self, request):
        data = await request.json()
        device_id = data.get("device_id")
        if not device_id:
            return web.json_response({"error": "device_id required"}, status=400)
        self.coordinator.process_heartbeat(device_id, data)
        return web.json_response({"status": "ok"})

    async def _device_event(self, request):
        data = await request.json()
        did, evt = data.get("device_id"), data.get("event")
        if did and evt:
            self.coordinator.process_event(did, evt, data.get("data", {}))
        return web.json_response({"status": "ok"})

    async def _device_config(self, request):
        device_id = request.match_info["device_id"]
        config = self.store.get_device(device_id)
        if not config:
            return web.json_response({"error": "Device not found"}, status=404)
        return web.json_response(config)

    async def _device_delete(self, request):
        await self.store.async_remove_device(request.match_info["device_id"])
        return web.json_response({"status": "ok"})

    # ══════════════════════════════════════════════════════
    # Display Page
    # ══════════════════════════════════════════════════════

    async def _display_page(self, request):
        device_id = request.match_info["device_id"]
        from .renderer.page_renderer import render_display_page
        html = render_display_page(self.hass, self.store, self.media, device_id)
        return web.Response(text=html, content_type="text/html")

    # ══════════════════════════════════════════════════════
    # Media Files
    # ══════════════════════════════════════════════════════

    async def _media_file(self, request):
        filename = request.match_info.get("filename", "")
        path_str = request.path
        if "/sounds/" in path_str:
            path = self.media.get_sound_path(filename)
        elif "/fonts/" in path_str:
            path = self.media.get_font_path(filename)
        else:
            path = self.media.get_image_path(filename)

        if not path:
            return web.Response(status=404)

        return web.FileResponse(path)

    # ══════════════════════════════════════════════════════
    # Media Management
    # ══════════════════════════════════════════════════════

    async def _list_media(self, request):
        path = request.path
        if "sounds" in path:
            return web.json_response(self.media.get_sounds())
        elif "fonts" in path:
            return web.json_response(self.media.get_fonts())
        return web.json_response(self.media.get_images())

    async def _upload_media(self, request):
        reader = await request.multipart()
        field = await reader.next()
        filename, data = field.filename, await field.read()
        path = request.path
        if "sound" in path:
            result = await self.media.async_save_sound(filename, data)
        elif "font" in path:
            result = await self.media.async_save_font(filename, data)
        else:
            result = await self.media.async_save_image(filename, data)
        return web.json_response(result)

    async def _delete_media(self, request):
        item_id = request.match_info["item_id"]
        path = request.path
        if "sound" in path:
            ok = await self.media.async_delete_sound(item_id)
        elif "font" in path:
            ok = await self.media.async_delete_font(item_id)
        else:
            ok = await self.media.async_delete_image(item_id)
        return web.json_response({"status": "ok" if ok else "not_found"})

    # ══════════════════════════════════════════════════════
    # Data API
    # ══════════════════════════════════════════════════════

    async def _camera_proxy(self, request):
        entity_id = request.match_info["entity_id"]
        mode = request.query.get("mode", "auto")
        if mode == "stream":
            mode = "camera_proxy_stream"

        state = self.hass.states.get(entity_id)
        if not state:
            return web.json_response({"error": "not found"}, status=404)

        async def _snapshot():
            camera_component = getattr(self.hass.components, "camera", None)
            if not camera_component or not hasattr(camera_component, "async_get_image"):
                raise RuntimeError("camera async_get_image unavailable")
            image = await camera_component.async_get_image(self.hass, entity_id)
            return web.Response(body=image.content, content_type=image.content_type)

        def _proxy_url(stream: bool = False) -> str:
            base = "/api/camera_proxy_stream" if stream else "/api/camera_proxy"
            token = state.attributes.get("access_token")
            url = f"{base}/{entity_id}"
            if token:
                url = f"{url}?token={token}"
            return url

        def _entity_picture_url() -> str | None:
            picture = state.attributes.get("entity_picture")
            if not picture:
                return None
            if str(picture).startswith(("http://", "https://", "/")):
                return picture
            return f"/{picture.lstrip('/')}"

        try:
            if mode in ("auto", "snapshot"):
                try:
                    return await _snapshot()
                except Exception as err:
                    _LOGGER.debug("Camera snapshot failed for %s: %s", entity_id, err)
                    if mode == "snapshot":
                        # Für Browser-Displays lieber sauber auf Proxy zurückfallen
                        mode = "camera_proxy"

            if mode in ("auto", "entity_picture"):
                picture_url = _entity_picture_url()
                if picture_url:
                    raise web.HTTPFound(picture_url)

            if mode in ("auto", "camera_proxy"):
                raise web.HTTPFound(_proxy_url(False))

            if mode == "camera_proxy_stream":
                raise web.HTTPFound(_proxy_url(True))

            # letzter Fallback
            picture_url = _entity_picture_url()
            if picture_url:
                raise web.HTTPFound(picture_url)
            raise web.HTTPFound(_proxy_url(False))
        except web.HTTPException:
            raise
        except Exception as e:
            _LOGGER.error("Camera proxy error for %s: %s", entity_id, e, exc_info=True)
            return web.json_response({"error": str(e), "entity_id": entity_id}, status=500)

    # ══════════════════════════════════════════════════════════
    # ██  HISTORY – KOMPLETT NEU  ██
    # Unterstützt HA 2023.x, 2024.x und 2025.x
    # ══════════════════════════════════════════════════════════

    async def _history(self, request):
        """Fetch history data for an entity."""
        entity_id = request.match_info["entity_id"]
        hours = min(int(request.query.get("hours", 24)), 168)  # Max 7 Tage

        # ── UTC verwenden (HA arbeitet intern mit UTC) ──
        try:
            from homeassistant.util import dt as dt_util
            end_time = dt_util.utcnow()
        except ImportError:
            from datetime import timezone
            end_time = datetime.now(timezone.utc)

        start_time = end_time - timedelta(hours=hours)

        try:
            # History-Daten abrufen (mit Fallback für verschiedene HA-Versionen)
            states = await self._fetch_history_states(
                entity_id, start_time, end_time
            )

            # Numerische Datenpunkte extrahieren
            data_points = []
            for state in states:
                # Ungültige States filtern
                if state.state in (
                    "unavailable",
                    "unknown",
                    "",
                    None,
                    "None",
                ):
                    continue

                try:
                    val = float(state.state)
                except (ValueError, TypeError):
                    continue

                # NaN / Infinity filtern
                if not __import__("math").isfinite(val):
                    continue

                data_points.append(
                    {
                        "x": state.last_changed.isoformat(),
                        "y": round(val, 4),
                    }
                )

            _LOGGER.debug(
                "History for %s: %d numeric points from %d raw states (%dh)",
                entity_id,
                len(data_points),
                len(states),
                hours,
            )

            return web.json_response(
                {"entity_id": entity_id, "data": data_points}
            )

        except Exception as e:
            _LOGGER.error(
                "History fetch failed for %s: %s", entity_id, e, exc_info=True
            )
            return web.json_response(
                {"entity_id": entity_id, "data": [], "error": str(e)}
            )

    async def _fetch_history_states(self, entity_id, start_time, end_time):
        """Fetch history states with fallback for different HA versions."""

        # ════════════════════════════════════════════════════
        # Methode 1: Moderner Import (HA 2023.6+)
        # ════════════════════════════════════════════════════
        try:
            from homeassistant.components.recorder import (  # noqa: F401
                history as recorder_history,
            )

            # state_changes_during_period braucht hass als 1. Parameter!
            if hasattr(recorder_history, "state_changes_during_period"):
                _LOGGER.debug(
                    "Using recorder_history.state_changes_during_period"
                )
                history = await self.hass.async_add_executor_job(
                    recorder_history.state_changes_during_period,
                    self.hass,
                    start_time,
                    end_time,
                    entity_id,
                )
                result = history.get(entity_id, [])
                if result:
                    return result

        except (ImportError, TypeError, AttributeError) as e:
            _LOGGER.debug("Method 1 (state_changes) failed: %s", e)

        # ════════════════════════════════════════════════════
        # Methode 2: get_significant_states (HA 2024.x+)
        # ════════════════════════════════════════════════════
        try:
            from homeassistant.components.recorder import (  # noqa: F401
                history as recorder_history,
            )

            if hasattr(recorder_history, "get_significant_states"):
                _LOGGER.debug(
                    "Using recorder_history.get_significant_states"
                )
                history = await self.hass.async_add_executor_job(
                    recorder_history.get_significant_states,
                    self.hass,
                    start_time,
                    end_time,
                    [entity_id],
                )
                result = history.get(entity_id, [])
                if result:
                    return result

        except (ImportError, TypeError, AttributeError) as e:
            _LOGGER.debug("Method 2 (get_significant_states) failed: %s", e)

        # ════════════════════════════════════════════════════
        # Methode 3: Async-Variante (neuere HA 2024.4+)
        # ════════════════════════════════════════════════════
        try:
            from homeassistant.components.recorder import (  # noqa: F401
                history as recorder_history,
            )

            if hasattr(recorder_history, "async_get_significant_states"):
                _LOGGER.debug(
                    "Using recorder_history.async_get_significant_states"
                )
                history = (
                    await recorder_history.async_get_significant_states(
                        self.hass,
                        start_time,
                        end_time,
                        [entity_id],
                    )
                )
                result = history.get(entity_id, [])
                if result:
                    return result

        except (ImportError, TypeError, AttributeError) as e:
            _LOGGER.debug("Method 3 (async_get_significant) failed: %s", e)

        # ════════════════════════════════════════════════════
        # Methode 4: get_instance + Session (HA 2024.6+)
        # ════════════════════════════════════════════════════
        try:
            from homeassistant.components.recorder import get_instance
            from homeassistant.components.recorder.history import (
                get_significant_states,
            )

            instance = get_instance(self.hass)
            if instance:
                _LOGGER.debug("Using get_instance + get_significant_states")

                def _fetch():
                    with instance.get_session() as session:
                        return get_significant_states(
                            self.hass,
                            session,
                            start_time,
                            end_time,
                            [entity_id],
                        )

                history = await self.hass.async_add_executor_job(_fetch)
                result = history.get(entity_id, [])
                if result:
                    return result

        except (ImportError, TypeError, AttributeError) as e:
            _LOGGER.debug("Method 4 (get_instance) failed: %s", e)

        # ════════════════════════════════════════════════════
        # Methode 5: Alte Legacy-API (HA < 2023.6)
        # ════════════════════════════════════════════════════
        try:
            _LOGGER.debug("Using legacy self.hass.components.recorder")
            history = await self.hass.async_add_executor_job(
                self.hass.components.recorder.history.state_changes_during_period,
                start_time,
                end_time,
                entity_id,
            )
            result = history.get(entity_id, [])
            if result:
                return result

        except (ImportError, TypeError, AttributeError) as e:
            _LOGGER.debug("Method 5 (legacy) failed: %s", e)

        # ════════════════════════════════════════════════════
        # Methode 6: HA History-Komponente direkt
        # ════════════════════════════════════════════════════
        try:
            _LOGGER.debug("Using hass.components.history")
            history = await self.hass.async_add_executor_job(
                self.hass.components.history.state_changes_during_period,
                self.hass,
                start_time,
                end_time,
                entity_id,
            )
            result = history.get(entity_id, [])
            if result:
                return result

        except (ImportError, TypeError, AttributeError) as e:
            _LOGGER.debug("Method 6 (components.history) failed: %s", e)

        # ════════════════════════════════════════════════════
        # Methode 7: Direkte Recorder-DB-Abfrage (Notfall)
        # ════════════════════════════════════════════════════
        try:
            from homeassistant.components.recorder import get_instance

            instance = get_instance(self.hass)
            if instance and hasattr(instance, "async_add_executor_job"):
                _LOGGER.debug("Using direct recorder DB query")

                def _direct_query():
                    from homeassistant.components.recorder.db_schema import (
                        States,
                        StatesMeta,
                    )
                    from sqlalchemy import select

                    with instance.get_session() as session:
                        # Finde metadata_id für entity
                        meta = session.execute(
                            select(StatesMeta.metadata_id).where(
                                StatesMeta.entity_id == entity_id
                            )
                        ).scalar_one_or_none()

                        if meta is None:
                            return []

                        rows = session.execute(
                            select(States)
                            .where(
                                States.metadata_id == meta,
                                States.last_changed_ts >= start_time.timestamp(),
                                States.last_changed_ts <= end_time.timestamp(),
                            )
                            .order_by(States.last_changed_ts)
                            .limit(500)
                        ).scalars().all()

                        # Konvertiere zu State-ähnlichen Objekten
                        class FakeState:
                            def __init__(self, state_val, ts):
                                self.state = state_val
                                self.last_changed = datetime.utcfromtimestamp(ts)

                        return [
                            FakeState(r.state, r.last_changed_ts)
                            for r in rows
                            if r.state is not None and r.last_changed_ts
                        ]

                return await self.hass.async_add_executor_job(_direct_query)

        except Exception as e:
            _LOGGER.debug("Method 7 (direct DB) failed: %s", e)

        _LOGGER.warning(
            "All history methods failed for %s – "
            "check if recorder integration is loaded",
            entity_id,
        )
        return []

    # ══════════════════════════════════════════════════════
    # Weather
    # ══════════════════════════════════════════════════════

    async def _weather(self, request):
        entity_id = request.match_info["entity_id"]
        state = self.hass.states.get(entity_id)
        if not state:
            return web.json_response({"error": "not found"}, status=404)
        a = state.attributes
        return web.json_response(
            {
                "entity_id": entity_id,
                "state": state.state,
                "temperature": a.get("temperature"),
                "humidity": a.get("humidity"),
                "pressure": a.get("pressure"),
                "wind_speed": a.get("wind_speed"),
                "wind_bearing": a.get("wind_bearing"),
                "forecast": a.get("forecast", []),
            }
        )

    # ══════════════════════════════════════════════════════
    # States
    # ══════════════════════════════════════════════════════

    async def _states(self, request):
        entity_id = request.match_info["entity_id"]
        state = self.hass.states.get(entity_id)
        if not state:
            return web.json_response({"error": "not found"}, status=404)
        return web.json_response(self._serialize_state(state))


    async def _entity_toggle(self, request):
        data = await request.json()
        entity_id = data.get("entity_id", "")
        if not entity_id or "." not in entity_id:
            return web.json_response({"error": "entity_id required"}, status=400)

        domain = entity_id.split(".", 1)[0]
        state = self.hass.states.get(entity_id)
        state_text = str(state.state).lower() if state else ""

        if domain == "media_player":
            service_domain = "media_player"
            service = "media_play_pause"
        elif domain == "cover":
            service_domain = "cover"
            pos = 100 if state_text == "open" else 0
            try:
                pos = int(state.attributes.get("current_position", pos)) if state else pos
            except Exception:
                pass
            service = "close_cover" if pos > 10 else "open_cover"
        elif domain == "valve":
            service_domain = "valve"
            service = "close_valve" if state_text == "open" else "open_valve"
        else:
            service_domain = domain if domain in {"switch", "light", "input_boolean", "fan"} else "homeassistant"
            service = "toggle"

        await self.hass.services.async_call(
            service_domain,
            service,
            {"entity_id": entity_id},
            blocking=True,
        )
        return web.json_response({"status": "ok", "domain": service_domain, "service": service, "entity_id": entity_id})

    async def _entity_service(self, request):
        data = await request.json()
        domain = data.get("domain", "")
        service = data.get("service", "")
        service_data = data.get("data", {}) or {}
        if not domain or not service:
            return web.json_response({"error": "domain and service required"}, status=400)

        await self.hass.services.async_call(
            domain,
            service,
            service_data,
            blocking=True,
        )
        return web.json_response({"status": "ok", "domain": domain, "service": service, "data": service_data})

    async def _media_player_state(self, request):
        entity_id = request.match_info["entity_id"]
        state = self.hass.states.get(entity_id)
        if not state or self._state_domain(state) != "media_player":
            return web.json_response({"error": "not found"}, status=404)
        payload = self._serialize_state(state)
        attrs = payload.get("attributes", {})
        payload.update(
            {
                "title": attrs.get("media_title"),
                "artist": attrs.get("media_artist"),
                "album": attrs.get("media_album_name"),
                "source": attrs.get("source"),
                "volume_level": attrs.get("volume_level"),
                "entity_picture": attrs.get("entity_picture"),
            }
        )
        return web.json_response(payload)

    async def _media_player_command(self, request):
        entity_id = request.match_info["entity_id"]
        state = self.hass.states.get(entity_id)
        if not state or self._state_domain(state) != "media_player":
            return web.json_response({"error": "not found"}, status=404)

        data = await request.json()
        action = str(data.get("action", "")).strip().lower()
        if not action:
            return web.json_response({"error": "action required"}, status=400)

        mapping = {
            "toggle": ("media_player", "media_play_pause", {"entity_id": entity_id}),
            "play_pause": ("media_player", "media_play_pause", {"entity_id": entity_id}),
            "play": ("media_player", "media_play", {"entity_id": entity_id}),
            "pause": ("media_player", "media_pause", {"entity_id": entity_id}),
            "next": ("media_player", "media_next_track", {"entity_id": entity_id}),
            "previous": ("media_player", "media_previous_track", {"entity_id": entity_id}),
            "stop": ("media_player", "media_stop", {"entity_id": entity_id}),
        }

        if action == "volume_set":
            volume = data.get("volume_level")
            if volume is None:
                return web.json_response({"error": "volume_level required"}, status=400)
            payload = {"entity_id": entity_id, "volume_level": max(0, min(1, float(volume)))}
            domain, service = "media_player", "volume_set"
        elif action == "volume_up":
            current = float(state.attributes.get("volume_level") or 0)
            step = float(data.get("step", 0.1) or 0.1)
            payload = {"entity_id": entity_id, "volume_level": max(0, min(1, current + step))}
            domain, service = "media_player", "volume_set"
        elif action == "volume_down":
            current = float(state.attributes.get("volume_level") or 0)
            step = float(data.get("step", 0.1) or 0.1)
            payload = {"entity_id": entity_id, "volume_level": max(0, min(1, current - step))}
            domain, service = "media_player", "volume_set"
        else:
            mapped = mapping.get(action)
            if not mapped:
                return web.json_response({"error": f"unsupported action: {action}"}, status=400)
            domain, service, payload = mapped

        await self.hass.services.async_call(domain, service, payload, blocking=True)
        return web.json_response({"status": "ok", "entity_id": entity_id, "action": action, "domain": domain, "service": service, "data": payload})

    # ══════════════════════════════════════════════════════
    # Persons
    # ══════════════════════════════════════════════════════

    async def _persons(self, request):
        persons = []
        for s in self.hass.states.async_all("person"):
            a = s.attributes
            persons.append(
                {
                    "entity_id": s.entity_id,
                    "name": a.get("friendly_name", s.entity_id),
                    "state": s.state,
                    "latitude": a.get("latitude"),
                    "longitude": a.get("longitude"),
                    "entity_picture": a.get("entity_picture"),
                    "source": a.get("source"),
                }
            )
        return web.json_response(persons)

    # ══════════════════════════════════════════════════════
    # Entities List
    # ══════════════════════════════════════════════════════

    async def _entities_list(self, request):
        domain_filter = request.query.get("domain")
        entities = []
        for s in self.hass.states.async_all(domain_filter):
            a = s.attributes
            entities.append(
                {
                    "entity_id": s.entity_id,
                    "name": a.get("friendly_name", s.entity_id),
                    "state": s.state,
                    "domain": s.domain,
                    "icon": a.get("icon"),
                    "unit": a.get("unit_of_measurement"),
                }
            )
        return web.json_response(entities)

    # ══════════════════════════════════════════════════════
    # HA Media Items
    # ══════════════════════════════════════════════════════

    async def _ha_media_items(self, request):
        kind = request.query.get("kind", "image").lower()
        limit = max(1, min(int(request.query.get("limit", 300)), 1000))

        try:
            from homeassistant.components import media_source
        except Exception as err:
            _LOGGER.debug("media_source not available: %s", err)
            return web.json_response([])

        items = []
        seen = set()

        def _mime_matches(mime_type: str | None) -> bool:
            mime = (mime_type or "").lower()
            if kind == "audio":
                return mime.startswith("audio/")
            return mime.startswith("image/")

        def _class_matches(media_class: str | None) -> bool:
            cls = str(media_class or "").lower()
            if kind == "audio":
                return cls in {
                    "music", "track", "audio", "podcast",
                    "album", "artist", "playlist",
                }
            return cls in {"image", "photo"}

        async def _resolve_url(media_content_id: str | None):
            if not media_content_id:
                return None, None
            try:
                resolved = await media_source.async_resolve_media(
                    self.hass, media_content_id, None
                )
                return (
                    getattr(resolved, "url", None),
                    getattr(resolved, "mime_type", None),
                )
            except Exception:
                return None, None

        async def _walk(node, path=""):
            if not node or len(items) >= limit:
                return

            title = (
                getattr(node, "title", None)
                or getattr(node, "media_content_id", None)
                or ""
            )
            node_path = (
                f"{path}/{title}" if path and title else title or path
            )
            media_content_id = getattr(node, "media_content_id", None)
            media_class = getattr(node, "media_class", None)
            media_type = getattr(node, "media_content_type", None)
            can_play = bool(getattr(node, "can_play", False))
            can_expand = bool(getattr(node, "can_expand", False))

            if (
                can_play
                and media_content_id
                and media_content_id not in seen
            ):
                url, mime_type = await _resolve_url(media_content_id)
                if url and (
                    _mime_matches(mime_type)
                    or _class_matches(media_class)
                    or _class_matches(media_type)
                ):
                    seen.add(media_content_id)
                    items.append(
                        {
                            "id": media_content_id,
                            "title": title or media_content_id,
                            "path": node_path,
                            "media_content_id": media_content_id,
                            "media_class": str(
                                media_class or media_type or ""
                            ),
                            "mime_type": mime_type,
                            "url": url,
                            "thumbnail": getattr(node, "thumbnail", None),
                        }
                    )

            if can_expand:
                children = getattr(node, "children", None) or []
                for child in children:
                    if len(items) >= limit:
                        break
                    await _walk(child, node_path)

        try:
            root = await media_source.async_browse_media(self.hass, None)
            await _walk(root)
        except Exception as err:
            _LOGGER.warning("HA media browser listing failed: %s", err)
            return web.json_response([])

        return web.json_response(items)

    # ══════════════════════════════════════════════════════
    # Config API
    # ══════════════════════════════════════════════════════

    async def _config_devices(self, request):
        devices = self.store.get_devices()
        result = []
        for did, config in devices.items():
            item = dict(config)
            item["online"] = self.coordinator.is_device_online(did)
            item["connected"] = self.ws.is_device_connected(did)
            item["display_url"] = f"{API_BASE}/{did}"
            item["preview_url"] = f"{API_BASE}/preview/{did}"
            result.append(item)
        return web.json_response(result)

    async def _config_device_get(self, request):
        config = self.store.get_device(request.match_info["device_id"])
        if not config:
            return web.json_response({"error": "not found"}, status=404)
        return web.json_response(config)

    async def _config_device_save(self, request):
        device_id = request.match_info["device_id"]
        config = await request.json()
        await self.store.async_update_device(device_id, config)
        await self.ws.send_to_device(
            device_id,
            {
                "type": "config_changed",
                "config": self.store.get_device(device_id),
            },
        )
        return web.json_response({"status": "ok"})



    async def _config_device_virtual(self, request):
        data = await request.json()
        source_device_id = data.get("source_device_id") or None
        name = (data.get("name") or "").strip() or None
        device = await self.store.async_create_virtual_device(
            name=name,
            source_device_id=source_device_id,
        )
        return web.json_response(
            {
                "status": "ok",
                "device_id": device["id"],
                "device": device,
                "display_url": f"{API_BASE}/{device['id']}",
                "preview_url": f"{API_BASE}/preview/{device['id']}",
            }
        )
    async def _config_templates(self, request):
        return web.json_response(self.store.get_templates())

    async def _config_template_save(self, request):
        data = await request.json()
        tid = data.get("id", f"template_{int(datetime.now().timestamp())}")
        await self.store.async_save_template(tid, data)
        return web.json_response({"status": "ok", "id": tid})

    async def _config_template_delete(self, request):
        await self.store.async_delete_template(
            request.match_info["template_id"]
        )
        return web.json_response({"status": "ok"})

    async def _config_alerts(self, request):
        return web.json_response(self.store.get_alert_templates())

    async def _config_alert_save(self, request):
        data = await request.json()
        aid = data.get("id", f"alert_{int(datetime.now().timestamp())}")
        await self.store.async_save_alert_template(aid, data)
        return web.json_response({"status": "ok", "id": aid})

    async def _config_alert_delete(self, request):
        await self.store.async_delete_alert_template(
            request.match_info["alert_id"]
        )
        return web.json_response({"status": "ok"})

    async def _config_themes(self, request):
        return web.json_response(self.store.get_custom_themes())

    async def _config_theme_save(self, request):
        data = await request.json()
        tid = data.get("id", f"theme_{int(datetime.now().timestamp())}")
        await self.store.async_save_theme(tid, data)
        return web.json_response({"status": "ok", "id": tid})

    async def _config_theme_delete(self, request):
        await self.store.async_delete_theme(request.match_info["theme_id"])
        return web.json_response({"status": "ok"})

    async def _config_global_get(self, request):
        return web.json_response(self.store.get_global_settings())

    async def _config_global_save(self, request):
        await self.store.async_update_global_settings(await request.json())
        return web.json_response({"status": "ok"})

    async def _config_backup(self, request):
        return web.json_response(self.store.get_full_backup())

    async def _config_restore(self, request):
        await self.store.async_restore_backup(await request.json())
        return web.json_response({"status": "ok"})