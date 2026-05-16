"""Ticker Display - Smart Display Integration for Home Assistant."""

from __future__ import annotations

import logging

from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er

from .api import TickerDisplayAPI
from .const import DEFAULT_HEARTBEAT_TIMEOUT, DOMAIN, PANEL_URL, PLATFORMS
from .coordinator import TickerDisplayCoordinator
from .media_manager import MediaManager
from .services import async_setup_services, async_unload_services
from .store import TickerDisplayStore
from .websocket_api import TickerDisplayWebSocket

_LOGGER = logging.getLogger(__name__)

VOICE_ENTITY_UNIQUE_IDS = {
    "assist_satellite",
    "assist_state",
    "assist_server_audio_mode",
    "assist_message",
    "assist_last_stt",
    "assist_reply_text",
    "assist_tts_url",
    "assist_pipeline_used",
    "assist_trigger_source",
    "assist_wake_word",
    "assist_wake_word_2",
    "assist_assistant",
    "assist_assistant_2",
    "assist_vad_mode",
}

REMOVED_ENTITY_SUFFIXES_BY_DOMAIN = {
    "sensor": {
        "heartbeat_age",
        "last_seen_age",
        "last_heartbeat",
        "last_seen",
        "last_event",
        "last_command",
        "webview_errors",
        "page_load",
        "webview_version",
    },
    "binary_sensor": {"connected"},
    "button": {
        "reload_page",
        "identify",
        "restart_app",
        "screen_on",
        "screen_off",
        "clear_alerts",
    },
    "select": {
        "wake_word",
        "wake_word_2",
        "assistant",
        "assistant_2",
        "speech_pause_detection",
    },
}


async def _async_cleanup_legacy_voice_entities(hass: HomeAssistant, entry: ConfigEntry, store: TickerDisplayStore) -> None:
    """Remove old voice-related entities from the entity registry."""
    ent_reg = er.async_get(hass)
    devices = store.get_devices() or {}
    prefixes = [f"ticker_display_{device_id}_" for device_id in devices]
    to_remove: list[str] = []
    for entity_entry in list(ent_reg.entities.values()):
        if entity_entry.config_entry_id != entry.entry_id or entity_entry.platform != DOMAIN:
            continue
        unique_id = str(entity_entry.unique_id or "")
        if entity_entry.domain == "assist_satellite":
            to_remove.append(entity_entry.entity_id)
            continue
        for prefix in prefixes:
            if unique_id.startswith(prefix):
                suffix = unique_id[len(prefix):]
                if suffix in VOICE_ENTITY_UNIQUE_IDS:
                    to_remove.append(entity_entry.entity_id)
                break
    for entity_id in to_remove:
        _LOGGER.info("Removing legacy voice entity from registry: %s", entity_id)
        ent_reg.async_remove(entity_id)



async def _async_cleanup_removed_entities(hass: HomeAssistant, entry: ConfigEntry, store: TickerDisplayStore) -> None:
    """Remove entities that were added by the 2.3.0 diagnostics/buttons/select expansion."""
    ent_reg = er.async_get(hass)
    devices = store.get_devices() or {}
    prefixes = [f"ticker_display_{device_id}_" for device_id in devices]
    to_remove: list[str] = []
    for entity_entry in list(ent_reg.entities.values()):
        if entity_entry.config_entry_id != entry.entry_id or entity_entry.platform != DOMAIN:
            continue
        suffixes = REMOVED_ENTITY_SUFFIXES_BY_DOMAIN.get(entity_entry.domain)
        if not suffixes:
            continue
        unique_id = str(entity_entry.unique_id or "")
        for prefix in prefixes:
            if unique_id.startswith(prefix) and unique_id[len(prefix):] in suffixes:
                to_remove.append(entity_entry.entity_id)
                break
    for entity_id in to_remove:
        _LOGGER.info("Removing no-longer-created Ticker Display entity from registry: %s", entity_id)
        ent_reg.async_remove(entity_id)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Ticker Display integration."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Ticker Display from a config entry."""
    _LOGGER.info("Setting up Ticker Display integration")

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN].setdefault("camera_frames", {})

    store = TickerDisplayStore(hass)
    await store.async_load()

    media_manager = MediaManager(hass)
    await media_manager.async_initialize()

    await _async_cleanup_legacy_voice_entities(hass, entry, store)
    await _async_cleanup_removed_entities(hass, entry, store)

    heartbeat_timeout = int(entry.options.get("heartbeat_timeout", DEFAULT_HEARTBEAT_TIMEOUT))
    coordinator = TickerDisplayCoordinator(hass, store, heartbeat_timeout=heartbeat_timeout)
    websocket = TickerDisplayWebSocket(hass, store, coordinator)

    hass.data[DOMAIN][entry.entry_id] = {
        "store": store,
        "coordinator": coordinator,
        "media_manager": media_manager,
        "websocket": websocket,
        "entry": entry,
    }

    api = TickerDisplayAPI(hass, store, coordinator, media_manager, websocket)
    api.register_routes()
    websocket.register()
    await async_setup_services(hass, store, coordinator, websocket, media_manager)

    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title="Ticker Display",
        sidebar_icon="mdi:monitor-dashboard",
        frontend_url_path="ticker-display-admin",
        config={
            "_panel_custom": {
                "name": "ticker-display-panel",
                "embed_iframe": False,
                "trust_external": False,
                "module_url": PANEL_URL,
            }
        },
        require_admin=True,
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    _LOGGER.info("Ticker Display integration setup complete")
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        entry_data = hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)

        if entry_data is not None:
            coordinator = entry_data.get("coordinator")
            if (
                coordinator
                and hasattr(coordinator, "_unsub_timer")
                and coordinator._unsub_timer
            ):
                coordinator._unsub_timer()
                coordinator._unsub_timer = None

        await async_unload_services(hass)
        async_remove_panel(hass, "ticker-display-admin")

        if not hass.data.get(DOMAIN):
            hass.data.pop(DOMAIN, None)

    return unload_ok

async def async_remove_config_entry_device(hass: HomeAssistant, entry: ConfigEntry, device_entry) -> bool:
    """Allow removing stale devices from the config entry device page."""
    identifiers = set(device_entry.identifiers or set())
    target_id = None
    for domain, ident in identifiers:
        if domain == DOMAIN:
            target_id = ident
            break
    if not target_id:
        return False

    entry_data = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if not entry_data:
        return False

    store = entry_data.get("store")
    coordinator = entry_data.get("coordinator")
    await store.async_remove_device(target_id)
    if coordinator is not None:
        if hasattr(coordinator, "forget_device"):
            coordinator.forget_device(target_id)
        else:
            coordinator._device_data.pop(target_id, None)
            coordinator._last_heartbeat.pop(target_id, None)
            coordinator._last_seen.pop(target_id, None)
            coordinator._update_callbacks.pop(target_id, None)

    ent_reg = er.async_get(hass)
    for entity_entry in list(er.async_entries_for_device(ent_reg, device_entry.id)):
        ent_reg.async_remove(entity_entry.entity_id)

    dev_reg = dr.async_get(hass)
    dev_reg.async_remove_device(device_entry.id)
    return True
