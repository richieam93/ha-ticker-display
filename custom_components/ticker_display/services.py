"""Home Assistant services for Ticker Display.

Kiosk-only generation: keep only services that are still executable by the
current display frontend and Android bridge. Legacy screen-editor/widget
services are removed on setup so stale Developer Tools entries disappear.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from homeassistant.components import tts as ha_tts
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

ACTIVE_SERVICES = [
    # Meldungen / Overlays
    "send_ticker_message",
    "clear_ticker",
    "update_ticker_config",
    "show_alert",
    "show_banner",
    "show_toast",
    "show_clock",
    "show_weather",
    "show_camera",
    "clear_alert",
    # Kiosk-Seiten / Navigation
    "next_screen",
    "previous_screen",
    "goto_screen",
    "pause_rotation",
    "resume_rotation",
    "reload_page",
    "identify_device",
    # Display- und Android-Steuerung
    "set_screen_power",
    "set_brightness",
    "set_volume",
    "set_screen_orientation",
    "set_device_setting",
    "restart_app",
    "open_android_settings",
    "vibrate_device",
    "report_device_state",
    # Audio / Sprache
    "play_sound",
    "play_announcement",
    "tts_speak",
    "stop_audio",
    "play_media",
    "stop_media",
    "media_pause",
    "media_resume",
    "media_next",
    "media_previous",
]

# Services that belonged to the old screen/widget editor or duplicated a new
# service name. They are explicitly removed during setup/reload.
LEGACY_REMOVED_SERVICES = [
    "show_dashboard",
    "show_graph",
    "show_single_value",
    "show_status_board",
    "show_image",
    "show_template",
    "show_alert_template",
    "show_alert_sequence",
    "show_notification",
    "show_silent_alert",
    "set_ticker_entities",
    "set_theme",
    "entity_toggle",
    "entity_action",
    "show_popup",
    "dismiss_popup",
]

# Keep the old export name for unload compatibility with previous versions.
REGISTERED_SERVICES = ACTIVE_SERVICES + LEGACY_REMOVED_SERVICES


async def async_setup_services(hass, store, coordinator, websocket, media_manager):
    """Register only the Kiosk-era services."""
    if hass.data.get(f"{DOMAIN}_services_registered"):
        # Be idempotent: reloads from older code may leave a partial service set.
        for name in REGISTERED_SERVICES:
            if hass.services.has_service(DOMAIN, name):
                hass.services.async_remove(DOMAIN, name)
        hass.data.pop(f"{DOMAIN}_services_registered", None)

    # Remove stale services from versions before the Kiosk cleanup. This is
    # important when the integration is reloaded without a full HA restart.
    for name in LEGACY_REMOVED_SERVICES:
        if hass.services.has_service(DOMAIN, name):
            hass.services.async_remove(DOMAIN, name)
            _LOGGER.info("Removed legacy Ticker Display service: %s", name)

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

    def _int(value, default=0, low=None, high=None):
        try:
            out = int(value)
        except (TypeError, ValueError):
            out = default
        if low is not None:
            out = max(low, out)
        if high is not None:
            out = min(high, out)
        return out

    def _bool(value, default=False):
        if isinstance(value, bool):
            return value
        if value is None:
            return default
        return str(value).strip().lower() in ("1", "true", "yes", "on", "an", "ja")

    def _normalize_alert_payload(data: dict, forced_mode: str | None = None) -> dict:
        d = dict(data or {})
        if forced_mode:
            d["mode"] = forced_mode
        mode = str(d.get("mode") or d.get("display_mode") or "fullscreen").strip().lower()
        if mode.startswith("full"):
            mode = "fullscreen"
        elif mode in ("banner", "notification"):
            mode = "banner"
        elif mode == "toast":
            mode = "toast"
        else:
            # Old modes from the removed editor are shown safely as fullscreen.
            mode = "fullscreen"
        d["mode"] = mode
        d["severity"] = str(d.get("severity") or "warning").strip().lower()
        if d["severity"] not in ("info", "success", "warning", "critical"):
            d["severity"] = "warning"
        if "duration" in d:
            d["duration"] = _int(d.get("duration"), 0, 0, 86400)
        else:
            d["duration"] = 0 if mode == "fullscreen" else 8
        if not d.get("title") and mode == "toast":
            d["title"] = d.get("source") or "Info"
        if not d.get("message") and d.get("text"):
            d["message"] = d.get("text")
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
                wanted_slug = str(cfg.get("name", device_id)).strip().lower().replace(" ", "_")
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
                out["tts_url"] = f"/ticker-display/media/tts/{filename}" if filename else stream_url
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
            "volume": _int(payload.get("volume"), 90, 0, 100),
            "loop": False,
        })

    async def _send_alert(call, forced_mode: str | None = None):
        d = _normalize_alert_payload(_apply_ha_tts(_data(call)), forced_mode=forced_mode)
        d = await _resolve_ha_tts_url(d)
        sound_id = d.get("sound")
        if not d.get("sound_url") and sound_id:
            url = media_manager.get_sound_url(sound_id)
            if url:
                d["sound_url"] = url
            else:
                _LOGGER.warning("Alert sound not found: %s", sound_id)
        device = _dev(call)
        if _bool(d.get("wake_screen"), False):
            await websocket.send_command(device, {"type": "display_control", "screen_power": True})
        await websocket.send_command(device, {"type": "alert", "data": d})
        await _send_alert_tts(device, d)

    # Meldungen / Overlays
    async def handle_send_ticker(call):
        d = _data(call)
        messages = d.get("messages", [])
        if isinstance(messages, str):
            messages = [{"text": messages}]
        if not messages and d.get("message"):
            messages = [{
                "text": d.get("message"),
                "message": d.get("message"),
                "color": d.get("color"),
                "icon": d.get("icon"),
                "duration": d.get("duration"),
                "replace": d.get("replace", True),
            }]
        await websocket.send_command(_dev(call), {"type": "ticker", "messages": messages})

    async def handle_clear_ticker(call):
        await websocket.send_command(_dev(call), {"type": "command", "command": "clear_ticker"})

    async def handle_update_ticker_config(call):
        await websocket.send_command(_dev(call), {"type": "command", "command": "update_ticker_config", "data": _data(call)})

    async def handle_show_alert(call):
        await _send_alert(call)

    async def handle_show_banner(call):
        await _send_alert(call, forced_mode="banner")

    async def handle_show_toast(call):
        await _send_alert(call, forced_mode="toast")

    async def handle_clear_alert(call):
        await websocket.send_command(_dev(call), {"type": "command", "command": "clear_alert", "data": _data(call)})

    async def _send_module(call, module_name: str):
        d = _data(call)
        if "duration" in d:
            d["duration"] = _int(d.get("duration"), 0, 0, 86400)
        if "refresh_seconds" in d:
            d["refresh_seconds"] = _int(d.get("refresh_seconds"), 0, 0, 3600)
        device = _dev(call)
        if _bool(d.get("wake_screen"), False):
            await websocket.send_command(device, {"type": "display_control", "screen_power": True})
        await websocket.send_command(device, {"type": "module", "module": module_name, "data": d})

    async def handle_show_clock(call):
        await _send_module(call, "clock")

    async def handle_show_weather(call):
        await _send_module(call, "weather")

    async def handle_show_camera(call):
        await _send_module(call, "camera")

    # Kiosk-Seiten / Navigation
    async def handle_next_screen(call):
        await websocket.send_command(_dev(call), {"type": "navigate", "action": "next"})

    async def handle_previous_screen(call):
        await websocket.send_command(_dev(call), {"type": "navigate", "action": "previous"})

    async def handle_goto_screen(call):
        d = _data(call)
        await websocket.send_command(_dev(call), {"type": "navigate", "action": "goto", "screen_id": d.get("screen_id") or d.get("page_id") or d.get("name") or ""})

    async def handle_pause_rotation(call):
        d = _data(call)
        await websocket.send_command(_dev(call), {"type": "navigate", "action": "pause", "duration": d.get("duration") or d.get("seconds")})

    async def handle_resume_rotation(call):
        await websocket.send_command(_dev(call), {"type": "navigate", "action": "resume"})

    async def handle_reload_page(call):
        await websocket.send_command(_dev(call), {"type": "reload"})

    async def handle_identify_device(call):
        await websocket.send_command(_dev(call), {"type": "command", "command": "identify"})

    # Display- und Android-Steuerung
    async def handle_set_screen_power(call):
        await websocket.send_command(_dev(call), {"type": "display_control", "screen_power": _bool(call.data.get("power"), True)})

    async def handle_set_brightness(call):
        await websocket.send_command(_dev(call), {"type": "display_control", "brightness": _int(call.data.get("brightness"), 100, 0, 100)})

    async def handle_set_volume(call):
        await websocket.send_command(_dev(call), {"type": "audio", "action": "set_volume", "volume": _int(call.data.get("volume"), 50, 0, 100)})

    async def handle_set_screen_orientation(call):
        await websocket.send_command(_dev(call), {"type": "display_control", "orientation": _int(call.data.get("orientation"), 0)})

    async def handle_set_device_setting(call):
        d = _data(call)
        setting = d.get("setting") or d.get("key")
        if not setting:
            _LOGGER.warning("set_device_setting: setting is required")
            return
        await websocket.send_command(_dev(call), {"type": "native_control", "setting": str(setting), "value": d.get("value")})

    async def handle_restart_app(call):
        await websocket.send_command(_dev(call), {"type": "native_action", "action": "restart_app"})

    async def handle_open_android_settings(call):
        await websocket.send_command(_dev(call), {"type": "native_action", "action": "open_android_settings"})

    async def handle_vibrate_device(call):
        await websocket.send_command(_dev(call), {"type": "native_action", "action": "vibrate", "duration": _int(call.data.get("duration"), 500, 1, 60000)})

    async def handle_report_device_state(call):
        await websocket.send_command(_dev(call), {"type": "native_action", "action": "report_now"})

    # Audio / Sprache
    async def handle_play_sound(call):
        d = _data(call)
        url = d.get("sound_url") or d.get("url")
        sound_id = d.get("sound", "")
        if not url and sound_id:
            url = media_manager.get_sound_url(sound_id)
        if not url:
            _LOGGER.error("Sound not found or URL missing: %s", sound_id)
            return
        await websocket.send_command(_dev(call), {
            "type": "audio",
            "action": "play",
            "url": url,
            "volume": _int(d.get("volume"), 100, 0, 100),
            "loop": _bool(d.get("loop"), False),
        })

    async def handle_play_announcement(call):
        device = _dev(call)
        d = _data(call)
        url = d.get("sound_url") or d.get("url")
        if not url:
            sound_id = d.get("sound", "")
            url = media_manager.get_sound_url(sound_id)
        if not url:
            _LOGGER.error("Announcement audio not found")
            return
        if await _assist_announce(device, media_id=url, preannounce=False):
            return
        await websocket.send_command(device, {
            "type": "audio",
            "action": "announce",
            "url": url,
            "volume": _int(d.get("volume"), 90, 0, 100),
            "loop": False,
            "title": d.get("title", "Announcement"),
        })

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
        await websocket.send_command(device, {"type": "audio", "action": "announce", "url": url, "volume": _int(call.data.get("volume"), 70, 0, 100), "loop": False})

    async def handle_stop_audio(call):
        await websocket.send_command(_dev(call), {"type": "audio", "action": "stop"})

    async def handle_play_media(call):
        d = _data(call)
        url = d.get("media_url") or d.get("url")
        if not url:
            _LOGGER.warning("play_media: media_url/url is required")
            return
        await websocket.send_command(_dev(call), {"type": "audio", "action": "play", "url": url, "volume": _int(d.get("volume"), 70, 0, 100), "loop": _bool(d.get("loop"), False)})

    async def handle_stop_media(call):
        await websocket.send_command(_dev(call), {"type": "audio", "action": "stop"})

    async def handle_media_pause(call):
        await websocket.send_command(_dev(call), {"type": "audio", "action": "pause"})

    async def handle_media_resume(call):
        await websocket.send_command(_dev(call), {"type": "audio", "action": "resume"})

    async def handle_media_next(call):
        await websocket.send_command(_dev(call), {"type": "audio", "action": "next"})

    async def handle_media_previous(call):
        await websocket.send_command(_dev(call), {"type": "audio", "action": "previous"})

    services = {
        "send_ticker_message": handle_send_ticker,
        "clear_ticker": handle_clear_ticker,
        "update_ticker_config": handle_update_ticker_config,
        "show_alert": handle_show_alert,
        "show_banner": handle_show_banner,
        "show_toast": handle_show_toast,
        "show_clock": handle_show_clock,
        "show_weather": handle_show_weather,
        "show_camera": handle_show_camera,
        "clear_alert": handle_clear_alert,
        "next_screen": handle_next_screen,
        "previous_screen": handle_previous_screen,
        "goto_screen": handle_goto_screen,
        "pause_rotation": handle_pause_rotation,
        "resume_rotation": handle_resume_rotation,
        "reload_page": handle_reload_page,
        "identify_device": handle_identify_device,
        "set_screen_power": handle_set_screen_power,
        "set_brightness": handle_set_brightness,
        "set_volume": handle_set_volume,
        "set_screen_orientation": handle_set_screen_orientation,
        "set_device_setting": handle_set_device_setting,
        "restart_app": handle_restart_app,
        "open_android_settings": handle_open_android_settings,
        "vibrate_device": handle_vibrate_device,
        "report_device_state": handle_report_device_state,
        "play_sound": handle_play_sound,
        "play_announcement": handle_play_announcement,
        "tts_speak": handle_tts_speak,
        "stop_audio": handle_stop_audio,
        "play_media": handle_play_media,
        "stop_media": handle_stop_media,
        "media_pause": handle_media_pause,
        "media_resume": handle_media_resume,
        "media_next": handle_media_next,
        "media_previous": handle_media_previous,
    }

    for name, handler in services.items():
        if hass.services.has_service(DOMAIN, name):
            hass.services.async_remove(DOMAIN, name)
        hass.services.async_register(DOMAIN, name, handler)

    hass.data[f"{DOMAIN}_services_registered"] = True
    _LOGGER.info("Registered %d Ticker Display services", len(services))


async def async_unload_services(hass: HomeAssistant) -> None:
    """Unload active and legacy Ticker Display services."""
    removed = 0
    for name in REGISTERED_SERVICES:
        if hass.services.has_service(DOMAIN, name):
            hass.services.async_remove(DOMAIN, name)
            removed += 1

    hass.data.pop(f"{DOMAIN}_services_registered", None)
    _LOGGER.info("Unregistered %d Ticker Display services", removed)
