"""Services for Ticker Display."""

import logging
from urllib.parse import urlparse
from homeassistant.components import tts as ha_tts
from homeassistant.exceptions import HomeAssistantError
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import entity_registry as er
from .const import DOMAIN

REGISTERED_SERVICES = [
    "show_dashboard", "show_graph", "show_camera", "show_weather",
    "show_single_value", "show_clock", "show_status_board", "show_image",
    "show_template", "show_alert", "show_notification", "show_toast",
    "clear_alert", "send_ticker_message", "set_ticker_entities", "clear_ticker",
    "set_screen_power", "set_brightness", "set_theme", "set_volume",
    "play_sound", "play_announcement", "tts_speak", "stop_audio", "next_screen", "previous_screen",
    "goto_screen", "pause_rotation", "resume_rotation", "reload_page", "identify_device", "show_alert_template", "show_alert_sequence",
]

_LOGGER = logging.getLogger(__name__)


async def async_setup_services(hass, store, coordinator, websocket, media_manager):
    if hass.data.get(f"{DOMAIN}_services_registered"):
        return

    def _dev(call):
        raw = call.data.get("device", "all")
        devices = store.get_devices() or {}

        def _resolve_one(value):
            if not isinstance(value, str):
                return value
            v = value.strip()
            if not v or v == "all" or v in devices:
                return v or "all"
            vl = v.lower()
            for did, cfg in devices.items():
                if str(cfg.get("name", "")).strip().lower() == vl:
                    return did
            return v

        if isinstance(raw, list):
            return [_resolve_one(v) for v in raw]
        if isinstance(raw, str) and "," in raw:
            return [_resolve_one(v) for v in raw.split(",") if str(v).strip()]
        return _resolve_one(raw)

    def _data(call):
        d = dict(call.data)
        d.pop("device", None)
        return d
    def _assist_entity_ids_for_device(device):
        registry = er.async_get(hass)
        devices = store.get_devices() or {}
        if device == "all":
            device_ids = list(devices.keys())
        elif isinstance(device, list):
            device_ids = [str(d) for d in device]
        else:
            device_ids = [str(device)]

        entity_ids = []
        for device_id in device_ids:
            entity_id = (
                registry.async_get_entity_id("assist_satellite", DOMAIN, f"ticker_display_{device_id}_assist_satellite")
                or registry.async_get_entity_id("assist_satellite", DOMAIN, f"ticker_display_{device_id}_assist")
            )
            if not entity_id:
                cfg = devices.get(device_id) or {}
                wanted_slug = cfg.get("name", device_id)
                wanted_slug = wanted_slug.strip().lower().replace(" ", "_")
                for entry in list(registry.entities.values()):
                    if entry.platform != DOMAIN or entry.domain != "assist_satellite":
                        continue
                    if entry.unique_id and str(device_id) in entry.unique_id:
                        entity_id = entry.entity_id
                        break
                    if entry.entity_id.endswith(f"{wanted_slug}_assist_satellit"):
                        entity_id = entry.entity_id
                        break
            if entity_id:
                entity_ids.append(entity_id)
        return entity_ids


    def _speaker_entity_ids_for_device(device):
        registry = er.async_get(hass)
        devices = store.get_devices() or {}
        if device == "all":
            device_ids = list(devices.keys())
        elif isinstance(device, list):
            device_ids = [str(d) for d in device]
        else:
            device_ids = [str(device)]

        entity_ids = []
        for device_id in device_ids:
            entity_id = registry.async_get_entity_id("media_player", DOMAIN, f"ticker_display_{device_id}_speaker")
            if entity_id:
                entity_ids.append(entity_id)
        return entity_ids

    def _default_tts_entity_id():
        ids = sorted(hass.states.async_entity_ids("tts"))
        return ids[0] if ids else None

    async def _assist_announce(device, *, message=None, media_id=None, preannounce=False):
        entity_ids = _assist_entity_ids_for_device(device)
        if not entity_ids:
            return False
        payload = {"preannounce": preannounce, "entity_id": entity_ids}
        if message:
            payload["message"] = message
        if media_id:
            payload["media_id"] = media_id
        await hass.services.async_call("assist_satellite", "announce", payload, blocking=True)
        return True

    # ── Screen commands ──
    async def _screen_cmd(call, cmd):
        await websocket.send_command(_dev(call), {"type": "command", "command": cmd, "data": _data(call)})

    async def handle_show_dashboard(call): await _screen_cmd(call, "show_dashboard")
    async def handle_show_graph(call): await _screen_cmd(call, "show_graph")
    async def handle_show_camera(call): await _screen_cmd(call, "show_camera")
    async def handle_show_weather(call): await _screen_cmd(call, "show_weather")
    async def handle_show_single_value(call): await _screen_cmd(call, "show_single_value")
    async def handle_show_clock(call): await _screen_cmd(call, "show_clock")
    async def handle_show_status_board(call): await _screen_cmd(call, "show_status_board")
    async def handle_show_image(call): await _screen_cmd(call, "show_image")

    async def handle_show_template(call):
        d = _data(call)
        template = store.get_template(d.get("template_id", ""))
        if not template:
            _LOGGER.error("Template not found: %s", d.get("template_id"))
            return
        d["template_config"] = template
        await websocket.send_command(_dev(call), {"type": "command", "command": "show_template", "data": d})

    # ── Alert commands ──
    def _apply_ha_tts(data):
        if not isinstance(data, dict):
            return data
        out = dict(data)
        engine_id = out.get("tts_engine_id") or out.get("engine_id") or out.get("tts_engine") or out.get("engine")
        if engine_id:
            out["tts_engine_id"] = str(engine_id)
        language = out.get("tts_language") or out.get("language")
        if language:
            out["tts_language"] = str(language)
        message = out.get("tts_message") or (out.get("message") if out.get("use_tts_for_message") else None)
        if message:
            out["tts_message"] = str(message)
        return out

    async def _resolve_ha_tts_url(data):
        if not isinstance(data, dict):
            return data
        out = _apply_ha_tts(data)
        if out.get("tts_url"):
            return out
        message = str(out.get("tts_message") or "").strip()
        if not message:
            return out
        engine_id = str(out.get("tts_engine_id") or "").strip()
        if not engine_id:
            engine_id = ha_tts.async_default_engine(hass) or ""
            if engine_id:
                out["tts_engine_id"] = engine_id
        if not engine_id:
            _LOGGER.warning("No TTS engine available for alert TTS")
            return out
        language = str(out.get("tts_language") or "").strip() or None
        try:
            stream = ha_tts.async_create_stream(
                hass,
                engine=engine_id,
                language=language,
                options={"preferred_format": "mp3"},
            )
            stream.async_set_message(message)
            stream_url = str(stream.url or "").strip()
            if stream_url:
                parsed = urlparse(stream_url)
                filename = parsed.path.rsplit("/", 1)[-1]
                if filename:
                    out["tts_url"] = f"/ticker-display/media/tts/{filename}"
                else:
                    out["tts_url"] = stream_url
            else:
                _LOGGER.warning("HA TTS stream did not return a URL")
        except HomeAssistantError as err:
            _LOGGER.warning("Failed to prepare HA TTS audio: %s", err)
        except Exception as err:  # noqa: BLE001
            _LOGGER.exception("Unexpected HA TTS error: %s", err)
        return out

    async def _send_alert_tts(device, payload):
        if not isinstance(payload, dict):
            return
        message = str(payload.get("tts_message") or "").strip()
        if message and await _assist_announce(device, message=message, preannounce=False):
            return
        url = str(payload.get("tts_url") or "").strip()
        if not url:
            return
        if await _assist_announce(device, media_id=url, preannounce=False):
            return
        await websocket.send_command(device, {
            "type": "audio",
            "action": "announce",
            "url": url,
            "volume": int(payload.get("volume", 90)),
            "loop": False,
        })

    async def handle_show_alert(call):
        d = _apply_ha_tts(_data(call))
        template_id = d.get("template_id")
        if template_id:
            tmpl = store.get_alert_templates().get(template_id)
            if tmpl:
                d = _apply_ha_tts({**tmpl, **d})
        d = await _resolve_ha_tts_url(d)

        sound_id = d.get("sound")
        if not d.get("sound_url") and sound_id:
            url = media_manager.get_sound_url(sound_id)
            if url:
                d["sound_url"] = url
            else:
                _LOGGER.warning("Alert sound not found: %s", sound_id)

        device = _dev(call)
        await websocket.send_command(device, {"type": "alert", "data": d})
        await _send_alert_tts(device, d)

    async def handle_show_notification(call):
        await websocket.send_command(_dev(call), {"type": "alert", "data": {**_data(call), "mode": "notification"}})

    async def handle_show_toast(call):
        d = _data(call)
        await websocket.send_command(_dev(call), {"type": "alert", "data": {**d, "mode": "toast"}})
        await _send_alert_tts(_dev(call), _apply_ha_tts(d))

    async def handle_clear_alert(call):
        await websocket.send_command(_dev(call), {"type": "command", "command": "clear_alert", "data": _data(call)})

    async def handle_show_alert_template(call):
        d = _data(call)
        template_id = d.get("template_id")
        tmpl = store.get_alert_templates().get(template_id or "")
        if not tmpl:
            _LOGGER.error("Alert template not found: %s", template_id)
            return
        payload = await _resolve_ha_tts_url({**tmpl, **d})
        device = _dev(call)
        await websocket.send_command(device, {"type": "alert", "data": payload})
        await _send_alert_tts(device, payload)

    async def handle_show_alert_sequence(call):
        d = _data(call)
        alerts = d.get("alerts") or []
        if not isinstance(alerts, list):
            _LOGGER.error("alerts must be a list")
            return
        resolved_alerts = []
        for alert in alerts:
            resolved_alerts.append(await _resolve_ha_tts_url(alert if isinstance(alert, dict) else {}))
        device = _dev(call)
        await websocket.send_command(device, {"type": "command", "command": "show_alert_sequence", "data": {"alerts": resolved_alerts}})
        for alert in resolved_alerts:
            await _send_alert_tts(device, alert)

    # ── Ticker commands ──
    async def handle_send_ticker(call):
        d = _data(call)
        messages = d.get("messages", [])
        if not messages and d.get("message"):
            messages = [{"text": d["message"], "color": d.get("color"), "icon": d.get("icon")}]
        await websocket.send_command(_dev(call), {"type": "ticker", "messages": messages})

    async def handle_set_ticker_entities(call):
        await websocket.send_command(_dev(call), {"type": "command", "command": "set_ticker_entities", "data": _data(call)})

    async def handle_clear_ticker(call):
        await websocket.send_command(_dev(call), {"type": "command", "command": "clear_ticker"})

    # ── Display control ──
    async def handle_set_screen_power(call):
        await websocket.send_command(_dev(call), {"type": "display_control", "screen_power": call.data.get("power", True)})

    async def handle_set_brightness(call):
        await websocket.send_command(_dev(call), {"type": "display_control", "brightness": call.data.get("brightness", 100)})

    async def handle_set_theme(call):
        await websocket.send_command(_dev(call), {"type": "theme_changed", "theme": _data(call)})

    async def handle_set_volume(call):
        await websocket.send_command(_dev(call), {"type": "audio", "action": "set_volume", "volume": call.data.get("volume", 50)})

    # ── Audio ──
    async def handle_play_sound(call):
        url = call.data.get("sound_url")
        sound_id = call.data.get("sound", "")
        if not url:
            url = media_manager.get_sound_url(sound_id)
        if not url:
            _LOGGER.error("Sound not found: %s", sound_id)
            return
        await websocket.send_command(_dev(call), {"type": "audio", "action": "play", "url": url,
            "volume": call.data.get("volume", 100), "loop": call.data.get("loop", False)})

    async def handle_tts_speak(call):
        device = _dev(call)
        message = str(call.data.get("message", "")).strip()
        if not message:
            _LOGGER.error("message required for tts_speak")
            return

        media_player_entity_ids = call.data.get("media_player_entity_id") or _speaker_entity_ids_for_device(device)
        tts_entity_id = call.data.get("tts_entity_id") or _default_tts_entity_id()
        if media_player_entity_ids and tts_entity_id:
            svc_data = {
                "media_player_entity_id": media_player_entity_ids if isinstance(media_player_entity_ids, list) else [media_player_entity_ids],
                "message": message,
            }
            language = call.data.get("language")
            if language:
                svc_data["language"] = language
            options = call.data.get("options")
            if isinstance(options, dict) and options:
                svc_data["options"] = options
            await hass.services.async_call("tts", "speak", svc_data, target={"entity_id": tts_entity_id}, blocking=True)
            return

        if await _assist_announce(device, message=message, preannounce=False):
            return
        data = await _resolve_ha_tts_url({
            "tts_message": message,
            "tts_language": call.data.get("language", "de"),
            "tts_engine_id": call.data.get("tts_engine_id") or call.data.get("engine_id") or call.data.get("engine"),
        })
        url = data.get("tts_url")
        if not url:
            _LOGGER.error("Failed to prepare HA TTS URL")
            return
        await websocket.send_command(device, {"type": "audio", "action": "announce",
            "url": url, "volume": call.data.get("volume", 70), "loop": False})

    async def handle_play_announcement(call):
        device = _dev(call)
        url = call.data.get("sound_url") or call.data.get("url")
        if not url:
            sound_id = call.data.get("sound", "")
            url = media_manager.get_sound_url(sound_id)
        if not url:
            _LOGGER.error("Announcement audio not found")
            return
        if await _assist_announce(device, media_id=url, preannounce=False):
            return
        await websocket.send_command(device, {"type": "audio", "action": "announce", "url": url,
            "volume": call.data.get("volume", 90), "loop": False, "title": call.data.get("title", "Announcement")})

    async def handle_stop_audio(call):
        await websocket.send_command(_dev(call), {"type": "audio", "action": "stop"})

    # ── Navigation ──
    async def handle_next_screen(call):
        await websocket.send_command(_dev(call), {"type": "navigate", "action": "next"})

    async def handle_previous_screen(call):
        await websocket.send_command(_dev(call), {"type": "navigate", "action": "previous"})

    async def handle_goto_screen(call):
        await websocket.send_command(_dev(call), {"type": "navigate", "action": "goto", "screen_id": call.data.get("screen_id", "")})

    async def handle_pause_rotation(call):
        await websocket.send_command(_dev(call), {"type": "navigate", "action": "pause"})

    async def handle_resume_rotation(call):
        await websocket.send_command(_dev(call), {"type": "navigate", "action": "resume"})

    # ── Management ──
    async def handle_reload_page(call):
        await websocket.send_command(_dev(call), {"type": "reload"})

    async def handle_identify_device(call):
        await websocket.send_command(_dev(call), {"type": "command", "command": "identify"})

    # ══════════════════════════════════════════════════════════
    # NEUE ERWEITERTE HANDLER
    # ══════════════════════════════════════════════════════════
    
    async def handle_entity_toggle(call):
        """Toggle an entity"""
        d = _data(call)
        entity_id = d.get("entity_id")
        if not entity_id:
            _LOGGER.warning("entity_toggle: no entity_id provided")
            return
        device = _dev(call)
        # Use API to toggle
        await websocket.send_command(device, {
            "type": "command", 
            "command": "entity_action", 
            "data": {"entity_id": entity_id, "action": "toggle"}
        })

    async def handle_entity_action(call):
        """Execute entity action"""
        d = _data(call)
        entity_id = d.get("entity_id")
        action = d.get("action", "toggle")
        if not entity_id:
            _LOGGER.warning("entity_action: no entity_id provided")
            return
        device = _dev(call)
        await websocket.send_command(device, {
            "type": "command", 
            "command": "entity_action", 
            "data": {
                "entity_id": entity_id, 
                "action": action,
                "data": d.get("data", {})
            }
        })

    async def handle_show_popup(call):
        """Show popup"""
        d = _data(call)
        await websocket.send_command(_dev(call), {
            "type": "command", 
            "command": "show_popup", 
            "data": d
        })

    async def handle_dismiss_popup(call):
        """Dismiss popup"""
        await websocket.send_command(_dev(call), {
            "type": "command", 
            "command": "dismiss_popup", 
            "data": {}
        })

    async def handle_show_silent_alert(call):
        """Silent alert without sound"""
        d = _data(call)
        d["silent"] = True
        await websocket.send_command(_dev(call), {"type": "alert", "data": d})

    async def handle_update_ticker_config(call):
        """Update ticker configuration"""
        d = _data(call)
        await websocket.send_command(_dev(call), {
            "type": "command", 
            "command": "update_ticker_config", 
            "data": d
        })

    async def handle_set_screen_orientation(call):
        """Set screen orientation"""
        d = _data(call)
        orientation = d.get("orientation", 0)
        await websocket.send_command(_dev(call), {
            "type": "display_control", 
            "orientation": orientation
        })

    # ═════════════════════════════════════════════════════════��
    # MEDIA HANDLER - ERWEITERT
    # ══════════════════════════════════════════════════════════

    async def handle_play_media(call):
        """Play media"""
        d = _data(call)
        url = d.get("media_url") or d.get("url")
        if not url:
            _LOGGER.warning("play_media: no media_url provided")
            return
        await websocket.send_command(_dev(call), {
            "type": "audio",
            "action": "play",
            "url": url,
            "volume": d.get("volume", 70),
            "loop": d.get("loop", False)
        })

    async def handle_stop_media(call):
        """Stop media"""
        await websocket.send_command(_dev(call), {"type": "audio", "action": "stop"})

    async def handle_media_next(call):
        """Media next track"""
        await websocket.send_command(_dev(call), {"type": "audio", "action": "next"})

    async def handle_media_previous(call):
        """Media previous track"""
        await websocket.send_command(_dev(call), {"type": "audio", "action": "previous"})

    async def handle_media_pause(call):
        """Media pause"""
        await websocket.send_command(_dev(call), {"type": "audio", "action": "pause"})

    async def handle_media_resume(call):
        """Media resume"""
        await websocket.send_command(_dev(call), {"type": "audio", "action": "resume"})

    # ── Register all ──
    services = {
        # Screen services
        "show_dashboard": handle_show_dashboard, "show_graph": handle_show_graph,
        "show_camera": handle_show_camera, "show_weather": handle_show_weather,
        "show_single_value": handle_show_single_value, "show_clock": handle_show_clock,
        "show_status_board": handle_show_status_board, "show_image": handle_show_image,
        "show_template": handle_show_template,
        # Alert services
        "show_alert": handle_show_alert, "show_alert_template": handle_show_alert_template,
        "show_alert_sequence": handle_show_alert_sequence,
        "show_notification": handle_show_notification,
        "show_toast": handle_show_toast, "clear_alert": handle_clear_alert,
        "show_silent_alert": handle_show_silent_alert,
        # Ticker services
        "send_ticker_message": handle_send_ticker, "set_ticker_entities": handle_set_ticker_entities,
        "clear_ticker": handle_clear_ticker, "update_ticker_config": handle_update_ticker_config,
        # Display control
        "set_screen_power": handle_set_screen_power, "set_brightness": handle_set_brightness,
        "set_theme": handle_set_theme, "set_volume": handle_set_volume,
        "set_screen_orientation": handle_set_screen_orientation,
        # Audio
        "play_sound": handle_play_sound, "play_announcement": handle_play_announcement, 
        "tts_speak": handle_tts_speak, "stop_audio": handle_stop_audio,
        "play_media": handle_play_media, "stop_media": handle_stop_media,
        "media_next": handle_media_next, "media_previous": handle_media_previous,
        "media_pause": handle_media_pause, "media_resume": handle_media_resume,
        # Navigation
        "next_screen": handle_next_screen, "previous_screen": handle_previous_screen,
        "goto_screen": handle_goto_screen, "pause_rotation": handle_pause_rotation,
        "resume_rotation": handle_resume_rotation,
        # Management
        "reload_page": handle_reload_page, "identify_device": handle_identify_device,
        # Entity control (NEW)
        "entity_toggle": handle_entity_toggle, "entity_action": handle_entity_action,
        # Popup (NEW)
        "show_popup": handle_show_popup, "dismiss_popup": handle_dismiss_popup,
    }

    for name, handler in services.items():
        if not hass.services.has_service(DOMAIN, name):
            hass.services.async_register(DOMAIN, name, handler)

    hass.data[f"{DOMAIN}_services_registered"] = True
    _LOGGER.info("Registered %d services", len(services))


async def async_unload_services(hass: HomeAssistant) -> None:
    """Unload registered services for Ticker Display."""
    removed = 0
    for name in REGISTERED_SERVICES:
        if hass.services.has_service(DOMAIN, name):
            hass.services.async_remove(DOMAIN, name)
            removed += 1

    hass.data.pop(f"{DOMAIN}_services_registered", None)
    _LOGGER.info("Unregistered %d services", removed)
