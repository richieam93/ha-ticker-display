"""Services for Ticker Display."""

import logging
from homeassistant.core import HomeAssistant, ServiceCall
from .const import DOMAIN

REGISTERED_SERVICES = [
    "show_dashboard", "show_graph", "show_camera", "show_weather",
    "show_single_value", "show_clock", "show_status_board", "show_image",
    "show_template", "show_alert", "show_notification", "show_toast",
    "clear_alert", "send_ticker_message", "set_ticker_entities", "clear_ticker",
    "set_screen_power", "set_brightness", "set_theme", "set_volume",
    "play_sound", "tts_speak", "stop_audio", "next_screen", "previous_screen",
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
    async def handle_show_alert(call):
        d = _data(call)
        template_id = d.get("template_id")
        if template_id:
            tmpl = store.get_alert_templates().get(template_id)
            if tmpl:
                d = {**tmpl, **d}

        sound_id = d.get("sound")
        if not d.get("sound_url") and sound_id:
            url = media_manager.get_sound_url(sound_id)
            if url:
                d["sound_url"] = url
            else:
                _LOGGER.warning("Alert sound not found: %s", sound_id)

        await websocket.send_command(_dev(call), {"type": "alert", "data": d})

    async def handle_show_notification(call):
        await websocket.send_command(_dev(call), {"type": "alert", "data": {**_data(call), "mode": "notification"}})

    async def handle_show_toast(call):
        await websocket.send_command(_dev(call), {"type": "alert", "data": {**_data(call), "mode": "toast"}})

    async def handle_clear_alert(call):
        await websocket.send_command(_dev(call), {"type": "command", "command": "clear_alert", "data": _data(call)})

    async def handle_show_alert_template(call):
        d = _data(call)
        template_id = d.get("template_id")
        tmpl = store.get_alert_templates().get(template_id or "")
        if not tmpl:
            _LOGGER.error("Alert template not found: %s", template_id)
            return
        payload = {**tmpl, **d}
        await websocket.send_command(_dev(call), {"type": "alert", "data": payload})

    async def handle_show_alert_sequence(call):
        d = _data(call)
        alerts = d.get("alerts") or []
        if not isinstance(alerts, list):
            _LOGGER.error("alerts must be a list")
            return
        await websocket.send_command(_dev(call), {"type": "command", "command": "show_alert_sequence", "data": {"alerts": alerts}})

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
        await websocket.send_command(_dev(call), {"type": "audio", "action": "tts",
            "text": call.data.get("message", ""), "language": call.data.get("language", "de"),
            "volume": call.data.get("volume", 70)})

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

    # ── Register all ──
    services = {
        "show_dashboard": handle_show_dashboard, "show_graph": handle_show_graph,
        "show_camera": handle_show_camera, "show_weather": handle_show_weather,
        "show_single_value": handle_show_single_value, "show_clock": handle_show_clock,
        "show_status_board": handle_show_status_board, "show_image": handle_show_image,
        "show_template": handle_show_template,
        "show_alert": handle_show_alert, "show_alert_template": handle_show_alert_template,
        "show_alert_sequence": handle_show_alert_sequence,
        "show_notification": handle_show_notification,
        "show_toast": handle_show_toast, "clear_alert": handle_clear_alert,
        "send_ticker_message": handle_send_ticker, "set_ticker_entities": handle_set_ticker_entities,
        "clear_ticker": handle_clear_ticker,
        "set_screen_power": handle_set_screen_power, "set_brightness": handle_set_brightness,
        "set_theme": handle_set_theme, "set_volume": handle_set_volume,
        "play_sound": handle_play_sound, "tts_speak": handle_tts_speak, "stop_audio": handle_stop_audio,
        "next_screen": handle_next_screen, "previous_screen": handle_previous_screen,
        "goto_screen": handle_goto_screen, "pause_rotation": handle_pause_rotation,
        "resume_rotation": handle_resume_rotation,
        "reload_page": handle_reload_page, "identify_device": handle_identify_device,
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
