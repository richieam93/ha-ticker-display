"""REST API for Ticker Display."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from homeassistant.components.recorder import history as recorder_history
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
        app.router.add_get(f"{API_BASE}/api/persons", self._persons)
        app.router.add_get(f"{API_BASE}/api/entities", self._entities_list)
        app.router.add_get(f"{API_BASE}/api/ha-media/items", self._ha_media_items)

        # Config API
        app.router.add_get(f"{API_BASE}/api/config/devices", self._config_devices)
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

    # ── Device API ──

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

    # ── Display Page ──

    async def _display_page(self, request):
        device_id = request.match_info["device_id"]
        from .renderer.page_renderer import render_display_page
        html = render_display_page(self.hass, self.store, self.media, device_id)
        return web.Response(text=html, content_type="text/html")

    # ── Media Files ──

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

    # ── Media Management ──

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

    # ── Data API ──

    async def _camera_proxy(self, request):
        entity_id = request.match_info["entity_id"]
        mode = request.query.get("mode", "auto")
        if mode == "stream":
            mode = "camera_proxy_stream"
        state = self.hass.states.get(entity_id)

        async def _snapshot():
            image = await self.hass.components.camera.async_get_image(self.hass, entity_id)
            return web.Response(body=image.content, content_type=image.content_type)

        try:
            if mode in ("auto", "snapshot"):
                try:
                    return await _snapshot()
                except Exception:
                    if mode == "snapshot":
                        raise

            if state:
                entity_picture = state.attributes.get("entity_picture")
                if entity_picture and mode in ("auto", "entity_picture"):
                    return web.json_response({"redirect": entity_picture, "mode": "entity_picture"})

                token = state.attributes.get("access_token")
                if token and mode in ("auto", "camera_proxy"):
                    proxy_url = f"/api/camera_proxy/{entity_id}?token={token}"
                    return web.json_response({"redirect": proxy_url, "mode": "camera_proxy"})

                if token and mode in ("auto", "camera_proxy_stream"):
                    stream_url = f"/api/camera_proxy_stream/{entity_id}?token={token}"
                    return web.json_response({"redirect": stream_url, "mode": "camera_proxy_stream"})

            return web.Response(status=500)
        except Exception as e:
            _LOGGER.error("Camera proxy error for %s: %s", entity_id, e)
            return web.Response(status=500)

    async def _history(self, request):
        entity_id = request.match_info["entity_id"]
        hours = max(1, min(int(request.query.get("hours", 24)), 24 * 30))
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=hours)

        def _load_history():
            try:
                return recorder_history.state_changes_during_period(
                    self.hass,
                    start_time,
                    end_time=end_time,
                    entity_id=entity_id,
                    include_start_time_state=True,
                    no_attributes=False,
                )
            except TypeError:
                # Older HA variants
                return recorder_history.state_changes_during_period(
                    start_time,
                    end_time,
                    entity_id,
                )

        try:
            history = await self.hass.async_add_executor_job(_load_history)
            states = history.get(entity_id, []) if isinstance(history, dict) else []
            data_points = []
            unit = ""
            for state in states:
                if not unit:
                    unit = getattr(state, 'attributes', {}).get('unit_of_measurement', '')
                try:
                    value = float(str(state.state).replace(',', '.'))
                except (ValueError, TypeError):
                    continue
                data_points.append(
                    {"x": state.last_changed.isoformat(), "y": value}
                )
            return web.json_response({"entity_id": entity_id, "unit": unit, "data": data_points})
        except Exception as err:
            _LOGGER.debug("History load failed for %s: %s", entity_id, err)
            return web.json_response({"entity_id": entity_id, "data": []})

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

    async def _states(self, request):
        entity_id = request.match_info["entity_id"]
        state = self.hass.states.get(entity_id)
        if not state:
            return web.json_response({"error": "not found"}, status=404)
        return web.json_response(
            {
                "entity_id": entity_id,
                "state": state.state,
                "attributes": dict(state.attributes),
                "last_changed": state.last_changed.isoformat(),
            }
        )

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
                return cls in {"music", "track", "audio", "podcast", "album", "artist", "playlist"}
            return cls in {"image", "photo"}

        async def _resolve_url(media_content_id: str | None):
            if not media_content_id:
                return None, None
            try:
                resolved = await media_source.async_resolve_media(self.hass, media_content_id, None)
                return getattr(resolved, "url", None), getattr(resolved, "mime_type", None)
            except Exception:
                return None, None

        async def _walk(node, path=""):
            if not node or len(items) >= limit:
                return

            title = getattr(node, "title", None) or getattr(node, "media_content_id", None) or ""
            node_path = f"{path}/{title}" if path and title else title or path
            media_content_id = getattr(node, "media_content_id", None)
            media_class = getattr(node, "media_class", None)
            media_type = getattr(node, "media_content_type", None)
            can_play = bool(getattr(node, "can_play", False))
            can_expand = bool(getattr(node, "can_expand", False))

            if can_play and media_content_id and media_content_id not in seen:
                url, mime_type = await _resolve_url(media_content_id)
                if url and (_mime_matches(mime_type) or _class_matches(media_class) or _class_matches(media_type)):
                    seen.add(media_content_id)
                    items.append(
                        {
                            "id": media_content_id,
                            "title": title or media_content_id,
                            "path": node_path,
                            "media_content_id": media_content_id,
                            "media_class": str(media_class or media_type or ""),
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

    # ── Config API ──

    async def _config_devices(self, request):
        devices = self.store.get_devices()
        result = []
        for did, config in devices.items():
            item = dict(config)
            item["online"] = self.coordinator.is_device_online(did)
            item["connected"] = self.ws.is_device_connected(did)
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
            {"type": "config_changed", "config": self.store.get_device(device_id)},
        )
        return web.json_response({"status": "ok"})

    async def _config_templates(self, request):
        return web.json_response(self.store.get_templates())

    async def _config_template_save(self, request):
        data = await request.json()
        tid = data.get("id", f"template_{int(datetime.now().timestamp())}")
        await self.store.async_save_template(tid, data)
        return web.json_response({"status": "ok", "id": tid})

    async def _config_template_delete(self, request):
        await self.store.async_delete_template(request.match_info["template_id"])
        return web.json_response({"status": "ok"})

    async def _config_alerts(self, request):
        return web.json_response(self.store.get_alert_templates())

    async def _config_alert_save(self, request):
        data = await request.json()
        aid = data.get("id", f"alert_{int(datetime.now().timestamp())}")
        await self.store.async_save_alert_template(aid, data)
        return web.json_response({"status": "ok", "id": aid})

    async def _config_alert_delete(self, request):
        await self.store.async_delete_alert_template(request.match_info["alert_id"])
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