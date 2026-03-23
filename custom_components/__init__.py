"""Ticker Display - Smart Display Integration for Home Assistant."""

import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PLATFORMS, PANEL_URL
from .store import TickerDisplayStore
from .coordinator import TickerDisplayCoordinator
from .api import TickerDisplayAPI
from .websocket_api import TickerDisplayWebSocket
from .services import async_setup_services
from .media_manager import MediaManager

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict):
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry):
    _LOGGER.info("Setting up Ticker Display integration")

    store = TickerDisplayStore(hass)
    await store.async_load()

    media_manager = MediaManager(hass)
    await media_manager.async_initialize()

    coordinator = TickerDisplayCoordinator(hass, store)
    websocket = TickerDisplayWebSocket(hass, store, coordinator)

    hass.data[DOMAIN] = {
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

    hass.components.frontend.async_register_built_in_panel(
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
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _LOGGER.info("Ticker Display integration setup complete")
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry):
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data.pop(DOMAIN, None)
        hass.components.frontend.async_remove_panel("ticker-display-admin")
    return unload_ok