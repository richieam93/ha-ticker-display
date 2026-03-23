"""Ticker Display - Smart Display Integration for Home Assistant."""

from __future__ import annotations

import logging

from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .api import TickerDisplayAPI
from .const import DOMAIN, PANEL_URL, PLATFORMS
from .coordinator import TickerDisplayCoordinator
from .media_manager import MediaManager
from .services import async_setup_services
from .store import TickerDisplayStore
from .websocket_api import TickerDisplayWebSocket

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Ticker Display integration."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Ticker Display from a config entry."""
    _LOGGER.info("Setting up Ticker Display integration")

    store = TickerDisplayStore(hass)
    await store.async_load()

    media_manager = MediaManager(hass)
    await media_manager.async_initialize()

    coordinator = TickerDisplayCoordinator(hass, store)
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
                "js_url": PANEL_URL,
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
            if coordinator and hasattr(coordinator, "_unsub_timer") and coordinator._unsub_timer:
                coordinator._unsub_timer()
                coordinator._unsub_timer = None

        async_remove_panel(hass, "ticker-display-admin")

        if not hass.data.get(DOMAIN):
            hass.data.pop(DOMAIN, None)

    return unload_ok