"""REST API for Ticker Display."""

from __future__ import annotations

import logging
import json
import re
import inspect
from datetime import datetime, timedelta
from pathlib import Path

from aiohttp import web
from homeassistant.core import HomeAssistant

from .const import API_BASE, ASSETS_PATH, DOMAIN, MEDIA_PATH, SENSOR_KEYS, ALERT_MODES, ALERT_SEVERITIES
from .media_manager import _safe_filename

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
        app.router.add_get(f"{MEDIA_PATH}/tts/{{filename}}", self._tts_media_file)

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
        app.router.add_get(f"{API_BASE}/api/entity/{{entity_id}}/capabilities", self._entity_capabilities)
        app.router.add_post(f"{API_BASE}/api/entity/toggle", self._entity_toggle)
        app.router.add_post(f"{API_BASE}/api/entity/service", self._entity_service)
        app.router.add_post(f"{API_BASE}/api/entity/action", self._entity_action)
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


    def _error(self, message: str, status: int = 400, **extra):
        payload = {"error": message}
        payload.update(extra)
        return web.json_response(payload, status=status)

    async def _parse_json(self, request, *, require_object: bool = True) -> dict:
        try:
            data = await request.json()
        except Exception as err:
            raise web.HTTPBadRequest(text=json.dumps({"error": "invalid json", "details": str(err)}), content_type="application/json")
        if require_object and not isinstance(data, dict):
            raise web.HTTPBadRequest(text=json.dumps({"error": "json object required"}), content_type="application/json")
        return data

    def _clean_identifier(self, value: str | None, *, field: str = "id", max_len: int = 128) -> str:
        cleaned = str(value or "").strip()[:max_len]
        if not cleaned:
            raise web.HTTPBadRequest(text=json.dumps({"error": f"{field} required"}), content_type="application/json")
        if not re.fullmatch(r"[A-Za-z0-9_.:-]+", cleaned):
            raise web.HTTPBadRequest(text=json.dumps({"error": f"invalid {field}"}), content_type="application/json")
        return cleaned

    def _clean_entity_id(self, entity_id: str | None) -> str:
        entity_id = self._clean_identifier(entity_id, field="entity_id", max_len=255)
        if "." not in entity_id:
            raise web.HTTPBadRequest(text=json.dumps({"error": "invalid entity_id"}), content_type="application/json")
        return entity_id

    def _int_query(self, request, name: str, default: int, *, minimum: int | None = None, maximum: int | None = None) -> int:
        raw = request.query.get(name, default)
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise web.HTTPBadRequest(text=json.dumps({"error": f"invalid integer for {name}"}), content_type="application/json")
        if minimum is not None:
            value = max(minimum, value)
        if maximum is not None:
            value = min(maximum, value)
        return value

    def _sanitize_device_config(self, device_id: str, config: dict) -> dict:
        allowed = {
            "name", "model", "android_version", "screen_resolution", "screens",
            "rotation", "ticker", "theme", "font", "created_at", "virtual",
            "browser_mode", "source_device_id", "widget_feature_flags"
        }
        cleaned = {k: v for k, v in config.items() if k in allowed}
        cleaned["id"] = device_id
        if not isinstance(cleaned.get("screens", []), list):
            raise web.HTTPBadRequest(text=json.dumps({"error": "screens must be a list"}), content_type="application/json")
        if not isinstance(cleaned.get("rotation", {}), dict):
            raise web.HTTPBadRequest(text=json.dumps({"error": "rotation must be an object"}), content_type="application/json")
        if not isinstance(cleaned.get("ticker", {}), dict):
            raise web.HTTPBadRequest(text=json.dumps({"error": "ticker must be an object"}), content_type="application/json")
        return cleaned

    def _sanitize_global_settings(self, data: dict) -> dict:
        allowed = {
            "default_theme", "default_transition", "default_screen_duration",
            "default_camera_source", "default_chart_hours",
            "default_chart_widget_animations", "default_widget_opacity",
            "default_widget_blur", "default_widget_radius",
            "default_background_color", "default_ticker_height",
            "widget_feature_flags", "device_groups"
        }
        cleaned = {k: v for k, v in data.items() if k in allowed}
        if "widget_feature_flags" in cleaned and not isinstance(cleaned["widget_feature_flags"], dict):
            raise web.HTTPBadRequest(text=json.dumps({"error": "widget_feature_flags must be an object"}), content_type="application/json")
        if "device_groups" in cleaned and not isinstance(cleaned["device_groups"], dict):
            raise web.HTTPBadRequest(text=json.dumps({"error": "device_groups must be an object"}), content_type="application/json")
        return cleaned


    def _sanitize_alert_config(self, data: dict) -> dict:
        allowed = {
            "id", "name", "title", "message", "severity", "mode", "icon",
            "sound", "sound_url", "duration", "flash_screen", "vibrate",
            "persistent", "color", "volume", "entity_id", "pip_position",
            "pip_size", "tag", "source", "camera_entity_id", "progress_value",
            "progress_text", "require_ack", "ack_label", "secondary_label",
            "secondary_action", "actions", "wake_screen", "tts_message",
            "tts_language", "buttons_layout"
        }
        cleaned = {k: v for k, v in data.items() if k in allowed}
        cleaned["severity"] = str(cleaned.get("severity") or "info").strip().lower()
        if cleaned["severity"] not in ALERT_SEVERITIES:
            cleaned["severity"] = "info"
        cleaned["mode"] = str(cleaned.get("mode") or "fullscreen").strip().lower()
        if cleaned["mode"] not in ALERT_MODES:
            cleaned["mode"] = "fullscreen"
        cleaned["title"] = str(cleaned.get("title") or "").strip()[:160]
        cleaned["message"] = str(cleaned.get("message") or "").strip()[:1000]
        cleaned["name"] = str(cleaned.get("name") or "").strip()[:160]
        cleaned["icon"] = str(cleaned.get("icon") or "").strip()[:32]
        cleaned["sound"] = str(cleaned.get("sound") or "").strip()[:120]
        cleaned["sound_url"] = str(cleaned.get("sound_url") or "").strip()[:1000]
        cleaned["tag"] = str(cleaned.get("tag") or "").strip()[:120]
        cleaned["source"] = str(cleaned.get("source") or "").strip()[:160]
        cleaned["camera_entity_id"] = str(cleaned.get("camera_entity_id") or cleaned.get("entity_id") or "").strip()[:255]
        cleaned["ack_label"] = str(cleaned.get("ack_label") or "Bestätigen").strip()[:80]
        cleaned["secondary_label"] = str(cleaned.get("secondary_label") or "Schließen").strip()[:80]
        cleaned["secondary_action"] = str(cleaned.get("secondary_action") or "dismiss").strip()[:80]
        cleaned["progress_text"] = str(cleaned.get("progress_text") or "").strip()[:160]
        cleaned["tts_message"] = str(cleaned.get("tts_message") or "").strip()[:500]
        cleaned["tts_language"] = str(cleaned.get("tts_language") or "de").strip()[:16]
        try:
            cleaned["duration"] = max(0, min(3600, int(cleaned.get("duration") or 0)))
        except (TypeError, ValueError):
            cleaned["duration"] = 0
        try:
            cleaned["volume"] = max(0, min(100, int(cleaned.get("volume") or 100)))
        except (TypeError, ValueError):
            cleaned["volume"] = 100
        try:
            cleaned["progress_value"] = max(0, min(100, int(cleaned.get("progress_value") or 0)))
        except (TypeError, ValueError):
            cleaned["progress_value"] = 0
        for key in ["flash_screen", "vibrate", "persistent", "require_ack", "wake_screen"]:
            cleaned[key] = bool(cleaned.get(key, False))
        actions = []
        for idx, action in enumerate(data.get("actions") or []):
            if not isinstance(action, dict):
                continue
            label = str(action.get("label") or "").strip()[:80]
            if not label:
                continue
            actions.append({
                "id": str(action.get("id") or f"action_{idx+1}").strip()[:80],
                "label": label,
                "event": str(action.get("event") or action.get("id") or f"action_{idx+1}").strip()[:80],
                "style": str(action.get("style") or "default").strip()[:24],
                "close": bool(action.get("close", True)),
            })
        cleaned["actions"] = actions
        return cleaned

    def _absolute_url(self, request, path: str) -> str:
        if not path:
            return f"{request.scheme}://{request.host}"
        if str(path).startswith(("http://", "https://")):
            return str(path)
        normalized = str(path)
        if not normalized.startswith("/"):
            normalized = f"/{normalized}"
        return f"{request.scheme}://{request.host}{normalized}"

    # ══════════════════════════════════════════════════════
    # Device API
    # ══════════════════════════════════════════════════════


    def _sanitize_heartbeat_data(self, data: dict) -> dict:
        cleaned = {"device_id": self._clean_identifier(data.get("device_id"), field="device_id")}
        for key in SENSOR_KEYS:
            if key in data:
                cleaned[key] = data.get(key)
        if "timestamp" in data:
            cleaned["timestamp"] = data.get("timestamp")
        return cleaned

    async def _device_register(self, request):
        data = await self._parse_json(request)
        device_id = self._clean_identifier(data.get("device_id"), field="device_id")

        existing = self.store.get_device(device_id)
        await self.store.async_add_device(device_id, data)

        return web.json_response(
            {
                "status": "ok",
                "device_id": device_id,
                "existing": existing is not None,
                "display_url": self._absolute_url(request, f"{API_BASE}/{device_id}"),
                "ws_url": self._absolute_url(request, f"/ticker-display/ws/{device_id}"),
            }
        )

    async def _device_heartbeat(self, request):
        data = await self._parse_json(request)
        payload = self._sanitize_heartbeat_data(data)
        device_id = payload["device_id"]
        self.coordinator.process_heartbeat(device_id, payload)
        return web.json_response({"status": "ok", "accepted_keys": sorted(payload.keys())})

    async def _device_event(self, request):
        data = await self._parse_json(request)
        did = self._clean_identifier(data.get("device_id"), field="device_id") if data.get("device_id") else ""
        evt = str(data.get("event") or "").strip()
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

    async def _tts_media_file(self, request):
        filename = _safe_filename(request.match_info.get("filename", ""))
        tts_dir = Path(self.hass.config.path("tts"))
        path = tts_dir / filename
        try:
            path.resolve().relative_to(tts_dir.resolve())
        except Exception:
            return web.Response(status=400)
        if not path.exists() or not path.is_file():
            _LOGGER.warning("Requested TTS file not found: %s", filename)
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
        if request.content_length and request.content_length > 25 * 1024 * 1024:
            return self._error("file too large", status=413)

        reader = await request.multipart()
        field = await reader.next()
        if field is None or not getattr(field, "filename", None):
            return web.json_response({"error": "file required"}, status=400)
        filename = _safe_filename(field.filename)
        data = await field.read(decode=False)
        if len(data) > 25 * 1024 * 1024:
            return self._error("file too large", status=413)
        if not filename:
            return web.json_response({"error": "invalid filename"}, status=400)
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
        entity_id = self._clean_entity_id(request.match_info["entity_id"])
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
        entity_id = self._clean_entity_id(request.match_info["entity_id"])
        hours = self._int_query(request, "hours", 24, minimum=1, maximum=168)  # Max 7 Tage

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
        """Fetch history states using recorder-safe APIs without blocking the event loop."""
        try:
            from homeassistant.components.recorder import get_instance
            from homeassistant.components.recorder import history as recorder_history

            def _build_kwargs(func):
                supported = set(inspect.signature(func).parameters)
                kwargs = {}
                if "hass" in supported:
                    kwargs["hass"] = self.hass
                if "start_time" in supported:
                    kwargs["start_time"] = start_time
                if "end_time" in supported:
                    kwargs["end_time"] = end_time
                if "entity_ids" in supported:
                    kwargs["entity_ids"] = [entity_id]
                elif "entity_id" in supported:
                    kwargs["entity_id"] = entity_id
                if "include_start_time_state" in supported:
                    kwargs["include_start_time_state"] = True
                if "significant_changes_only" in supported:
                    kwargs["significant_changes_only"] = False
                if "minimal_response" in supported:
                    kwargs["minimal_response"] = False
                if "no_attributes" in supported:
                    kwargs["no_attributes"] = False
                return kwargs

            instance = get_instance(self.hass)
            if hasattr(recorder_history, "async_get_significant_states"):
                func = recorder_history.async_get_significant_states
                _LOGGER.debug("Using recorder_history.async_get_significant_states")
                history = await func(**_build_kwargs(func))
                return history.get(entity_id, []) if isinstance(history, dict) else history or []

            if hasattr(recorder_history, "get_significant_states") and instance:
                func = recorder_history.get_significant_states
                _LOGGER.debug("Using recorder instance executor + get_significant_states")
                history = await instance.async_add_executor_job(lambda: func(**_build_kwargs(func)))
                return history.get(entity_id, []) if isinstance(history, dict) else history or []
        except Exception as err:
            _LOGGER.debug("Recorder history fetch failed: %s", err)

        state = self.hass.states.get(entity_id)
        return [state] if state is not None else []

    async def _weather(self, request):
        entity_id = self._clean_entity_id(request.match_info["entity_id"])
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
        entity_id = self._clean_entity_id(request.match_info["entity_id"])
        state = self.hass.states.get(entity_id)
        if not state:
            return web.json_response({"error": "not found"}, status=404)
        return web.json_response(self._serialize_state(state))



    def _light_color_payload(self, data: dict, state_attrs: dict) -> dict:
        payload = {}
        if data.get("brightness_pct") is not None:
            payload["brightness_pct"] = max(0, min(100, int(float(data.get("brightness_pct", 0)))))
        if data.get("rgb_color") is not None:
            rgb = data.get("rgb_color")
            if isinstance(rgb, str):
                rgb = [int(float(x.strip())) for x in rgb.split(',')[:3]]
            if isinstance(rgb, (list, tuple)) and len(rgb) >= 3:
                payload["rgb_color"] = [max(0, min(255, int(float(rgb[0])))), max(0, min(255, int(float(rgb[1])))), max(0, min(255, int(float(rgb[2]))))]
        elif data.get("hs_color") is not None:
            hs = data.get("hs_color")
            if isinstance(hs, str):
                hs = [float(x.strip()) for x in hs.split(',')[:2]]
            if isinstance(hs, (list, tuple)) and len(hs) >= 2:
                payload["hs_color"] = [float(hs[0]), float(hs[1])]
        if data.get("color_temp_kelvin") is not None:
            payload["color_temp_kelvin"] = int(float(data.get("color_temp_kelvin", 0)))
        elif data.get("color_temp") is not None:
            payload["color_temp"] = int(float(data.get("color_temp", 0)))
        if data.get("effect"):
            payload["effect"] = str(data.get("effect"))
        if not payload and state_attrs.get("rgb_color"):
            payload["rgb_color"] = state_attrs.get("rgb_color")
        return payload

    async def _entity_capabilities(self, request):
        entity_id = self._clean_entity_id(request.match_info["entity_id"])
        state = self.hass.states.get(entity_id)
        if not state:
            return web.json_response({"error": "not found"}, status=404)

        domain = self._state_domain(state)
        attrs = dict(getattr(state, "attributes", {}) or {})
        actions = []
        features = []

        if domain in {"switch", "input_boolean", "valve"}:
            actions = ["toggle", "on", "off"]
        elif domain == "fan":
            actions = ["toggle", "on", "off"]
            if attrs.get("percentage_step") is not None or attrs.get("percentage") is not None:
                actions.append("set_percentage")
            if attrs.get("preset_modes"):
                actions.append("set_preset_mode")
            features = ["percentage", "percentage_step", "preset_mode", "preset_modes"]
        elif domain == "light":
            actions = ["toggle", "on", "off", "set_brightness_pct", "set_rgb_color", "set_color_temp"]
            if attrs.get("effect_list"):
                actions.append("set_effect")
            features = [
                "brightness", "supported_color_modes", "rgb_color",
                "hs_color", "color_temp_kelvin", "effect_list"
            ]
        elif domain == "cover":
            actions = ["open", "stop", "close", "set_position"]
            features = ["current_position"]
            if attrs.get("current_tilt_position") is not None or attrs.get("tilt_position") is not None:
                actions.extend(["open_tilt", "stop_tilt", "close_tilt", "set_tilt_position"])
                features.append("current_tilt_position")
        elif domain == "media_player":
            actions = ["toggle", "play", "pause", "next", "previous", "stop", "volume_up", "volume_down", "volume_set"]
            features = ["media_title", "media_artist", "entity_picture", "volume_level"]
        elif domain == "climate":
            actions = ["set_temperature", "set_hvac_mode"]
            if attrs.get("preset_modes"):
                actions.append("set_preset_mode")
            if attrs.get("fan_modes"):
                actions.append("set_fan_mode")
            features = [
                "current_temperature", "temperature", "target_temp_high", "target_temp_low",
                "hvac_action", "hvac_mode", "hvac_modes", "preset_mode", "preset_modes",
                "fan_mode", "fan_modes", "current_humidity", "humidity"
            ]
        elif domain == "alarm_control_panel":
            actions = ["arm_away", "arm_home", "disarm"]
            if attrs.get("supported_features"):
                actions.extend(["arm_night", "arm_vacation"])
            features = ["code_arm_required", "changed_by", "friendly_name"]
        elif domain == "vacuum":
            actions = ["start", "pause", "return_to_base", "stop"]
            features = ["battery_level", "fan_speed", "status"]
        elif domain == "person":
            features = ["friendly_name", "entity_picture", "latitude", "longitude", "source", "user_id"]
        elif domain in {"binary_sensor"}:
            features = ["friendly_name", "device_class"]

        return web.json_response({
            "entity_id": entity_id,
            "domain": domain,
            "state": self._serialize_state(state),
            "actions": actions,
            "features": features,
            "attributes": self._json_safe(attrs),
        })

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
            return self._error("domain and service required")

        await self.hass.services.async_call(
            domain,
            service,
            service_data,
            blocking=True,
        )
        return web.json_response({"status": "ok", "domain": domain, "service": service, "data": service_data})

    async def _entity_action(self, request):
        data = await request.json()
        entity_id = data.get("entity_id", "")
        action = str(data.get("action", "")).strip().lower()
        extra = data.get("data", {}) or {}
        if not entity_id or "." not in entity_id:
            return web.json_response({"error": "entity_id required"}, status=400)
        if not action:
            return self._error("action required")

        domain = entity_id.split(".", 1)[0]
        state = self.hass.states.get(entity_id)
        attrs = dict(getattr(state, "attributes", {}) or {})
        state_text = str(getattr(state, "state", "") or "").lower()
        payload = {"entity_id": entity_id, **extra}

        service_domain = domain
        service = None

        if action in {"toggle", "play_pause"}:
            if domain == "media_player":
                service_domain, service = "media_player", "media_play_pause"
            elif domain == "cover":
                pos = attrs.get("current_position", 0)
                try:
                    pos = int(pos)
                except Exception:
                    pos = 0
                service_domain, service = "cover", ("close_cover" if pos > 10 else "open_cover")
            elif domain == "valve":
                service_domain, service = "valve", ("close_valve" if state_text == "open" else "open_valve")
            else:
                service_domain, service = (domain if domain in {"switch", "light", "input_boolean", "fan"} else "homeassistant"), "toggle"
        elif action in {"on", "turn_on", "open"}:
            if domain == "cover":
                service_domain, service = "cover", "open_cover"
            elif domain == "valve":
                service_domain, service = "valve", "open_valve"
            else:
                service_domain, service = domain, "turn_on"
        elif action in {"off", "turn_off", "close"}:
            if domain == "cover":
                service_domain, service = "cover", "close_cover"
            elif domain == "valve":
                service_domain, service = "valve", "close_valve"
            else:
                service_domain, service = domain, "turn_off"
        elif action == "stop":
            if domain == "cover":
                service_domain, service = "cover", "stop_cover"
            else:
                service_domain, service = domain, "stop"
        elif action == "set_position":
            if domain != "cover":
                return web.json_response({"error": "set_position only supported for cover"}, status=400)
            service_domain, service = "cover", "set_cover_position"
            payload["position"] = int(extra.get("position", data.get("position", 0)))
        elif action == "set_tilt_position":
            if domain != "cover":
                return web.json_response({"error": "set_tilt_position only supported for cover"}, status=400)
            service_domain, service = "cover", "set_cover_tilt_position"
            payload["tilt_position"] = int(extra.get("tilt_position", data.get("tilt_position", 0)))
        elif action in {"open_tilt", "close_tilt", "stop_tilt"}:
            if domain != "cover":
                return web.json_response({"error": f"{action} only supported for cover"}, status=400)
            service_domain = "cover"
            service = {
                "open_tilt": "open_cover_tilt",
                "close_tilt": "close_cover_tilt",
                "stop_tilt": "stop_cover_tilt",
            }[action]
        elif action in {"set_brightness", "set_brightness_pct"}:
            if domain != "light":
                return web.json_response({"error": "set_brightness_pct only supported for light"}, status=400)
            service_domain, service = "light", "turn_on"
            payload.update(self._light_color_payload({"brightness_pct": extra.get("brightness_pct", data.get("brightness_pct"))}, attrs))
        elif action == "set_rgb_color":
            if domain != "light":
                return web.json_response({"error": "set_rgb_color only supported for light"}, status=400)
            service_domain, service = "light", "turn_on"
            payload.update(self._light_color_payload({"rgb_color": extra.get("rgb_color", data.get("rgb_color")), "hs_color": extra.get("hs_color", data.get("hs_color"))}, attrs))
        elif action == "set_color_temp":
            if domain != "light":
                return web.json_response({"error": "set_color_temp only supported for light"}, status=400)
            service_domain, service = "light", "turn_on"
            payload.update(self._light_color_payload({"color_temp_kelvin": extra.get("color_temp_kelvin", data.get("color_temp_kelvin")), "color_temp": extra.get("color_temp", data.get("color_temp"))}, attrs))
        elif action == "set_effect":
            if domain != "light":
                return web.json_response({"error": "set_effect only supported for light"}, status=400)
            service_domain, service = "light", "turn_on"
            payload.update(self._light_color_payload({"effect": extra.get("effect", data.get("effect"))}, attrs))
        elif action == "set_hvac_mode":
            if domain != "climate":
                return web.json_response({"error": "set_hvac_mode only supported for climate"}, status=400)
            service_domain, service = "climate", "set_hvac_mode"
            payload["hvac_mode"] = str(extra.get("hvac_mode", data.get("hvac_mode", attrs.get("hvac_mode", "heat"))))
        elif action == "set_preset_mode":
            if domain == "climate":
                service_domain, service = "climate", "set_preset_mode"
                payload["preset_mode"] = str(extra.get("preset_mode", data.get("preset_mode", attrs.get("preset_mode", "none"))))
            elif domain == "fan":
                service_domain, service = "fan", "set_preset_mode"
                payload["preset_mode"] = str(extra.get("preset_mode", data.get("preset_mode", attrs.get("preset_mode", "auto"))))
            else:
                return web.json_response({"error": "set_preset_mode only supported for climate/fan"}, status=400)
        elif action == "set_fan_mode":
            if domain != "climate":
                return web.json_response({"error": "set_fan_mode only supported for climate"}, status=400)
            service_domain, service = "climate", "set_fan_mode"
            payload["fan_mode"] = str(extra.get("fan_mode", data.get("fan_mode", attrs.get("fan_mode", "auto"))))
        elif action == "set_percentage":
            if domain != "fan":
                return web.json_response({"error": "set_percentage only supported for fan"}, status=400)
            service_domain, service = "fan", "set_percentage"
            payload["percentage"] = int(extra.get("percentage", data.get("percentage", attrs.get("percentage", 0))))
        elif action in {"arm_home", "arm_away", "disarm", "arm_night", "arm_vacation"}:
            if domain != "alarm_control_panel":
                return web.json_response({"error": f"{action} only supported for alarm_control_panel"}, status=400)
            service_domain = "alarm_control_panel"
            service = {
                "arm_home": "alarm_arm_home",
                "arm_away": "alarm_arm_away",
                "arm_night": "alarm_arm_night",
                "arm_vacation": "alarm_arm_vacation",
                "disarm": "alarm_disarm",
            }[action]
            code = extra.get("code", data.get("code"))
            if code is not None:
                payload["code"] = code
        elif action in {"start", "pause", "return_to_base"}:
            if domain != "vacuum":
                return web.json_response({"error": f"{action} only supported for vacuum"}, status=400)
            service_domain = "vacuum"
            service = {"start": "start", "pause": "pause", "return_to_base": "return_to_base"}[action]
        else:
            return web.json_response({"error": f"unsupported action: {action}"}, status=400)

        await self.hass.services.async_call(service_domain, service, payload, blocking=True)
        return web.json_response({"status": "ok", "entity_id": entity_id, "domain": service_domain, "service": service, "action": action, "data": payload})

    async def _media_player_state(self, request):
        entity_id = self._clean_entity_id(request.match_info["entity_id"])
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
        entity_id = self._clean_entity_id(request.match_info["entity_id"])
        state = self.hass.states.get(entity_id)
        if not state or self._state_domain(state) != "media_player":
            return web.json_response({"error": "not found"}, status=404)

        data = await request.json()
        action = str(data.get("action", "")).strip().lower()
        if not action:
            return self._error("action required")

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
                    "user_id": a.get("user_id"),
                    "latitude": a.get("latitude"),
                    "longitude": a.get("longitude"),
                    "editable": a.get("editable"),
                }
            )
        return web.json_response(persons)

    # ══════════════════════════════════════════════════════
    # Entities List
    # ══════════════════════════════════════════════════════

    async def _entities_list(self, request):
        domain_filter = (request.query.get("domain") or "").strip() or None
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
        kind = (request.query.get("kind", "image") or "image").lower()
        if kind not in {"image", "audio"}:
            return self._error("kind must be image or audio")
        limit = self._int_query(request, "limit", 300, minimum=1, maximum=1000)

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
            item["display_url"] = self._absolute_url(request, f"{API_BASE}/{did}")
            item["preview_url"] = self._absolute_url(request, f"{API_BASE}/preview/{did}")
            result.append(item)
        return web.json_response(result)

    async def _config_device_get(self, request):
        config = self.store.get_device(request.match_info["device_id"])
        if not config:
            return web.json_response({"error": "not found"}, status=404)
        return web.json_response(config)

    async def _config_device_save(self, request):
        device_id = self._clean_identifier(request.match_info["device_id"], field="device_id")
        config = self._sanitize_device_config(device_id, await self._parse_json(request))
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
        data = await self._parse_json(request)
        source_device_id = self._clean_identifier(data.get("source_device_id"), field="source_device_id") if data.get("source_device_id") else None
        name = (str(data.get("name") or "").strip()[:120]) or None
        device = await self.store.async_create_virtual_device(
            name=name,
            source_device_id=source_device_id,
        )
        return web.json_response(
            {
                "status": "ok",
                "device_id": device["id"],
                "device": device,
                "display_url": self._absolute_url(request, f"{API_BASE}/{device['id']}"),
                "preview_url": self._absolute_url(request, f"{API_BASE}/preview/{device['id']}"),
            }
        )
    async def _config_templates(self, request):
        return web.json_response(self.store.get_templates())

    async def _config_template_save(self, request):
        data = await self._parse_json(request)
        tid = self._clean_identifier(data.get("id", f"template_{int(datetime.now().timestamp())}"), field="id")
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
        data = self._sanitize_alert_config(await self._parse_json(request))
        aid = self._clean_identifier(data.get("id", f"alert_{int(datetime.now().timestamp())}"), field="id")
        data["id"] = aid
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
        data = await self._parse_json(request)
        tid = self._clean_identifier(data.get("id", f"theme_{int(datetime.now().timestamp())}"), field="id")
        await self.store.async_save_theme(tid, data)
        return web.json_response({"status": "ok", "id": tid})

    async def _config_theme_delete(self, request):
        await self.store.async_delete_theme(request.match_info["theme_id"])
        return web.json_response({"status": "ok"})

    async def _config_global_get(self, request):
        return web.json_response(self.store.get_global_settings())

    async def _config_global_save(self, request):
        data = self._sanitize_global_settings(await self._parse_json(request))
        await self.store.async_update_global_settings(data)
        return web.json_response({"status": "ok"})

    async def _config_backup(self, request):
        return web.json_response(self.store.get_full_backup())

    async def _config_restore(self, request):
        data = await self._parse_json(request)
        required = {"devices", "templates", "alert_templates", "themes", "global_settings"}
        if not required.issubset(set(data.keys())):
            return self._error("invalid backup payload")
        await self.store.async_restore_backup(data)
        return web.json_response({"status": "ok"})