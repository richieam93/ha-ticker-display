"""Storage manager for Ticker Display."""

from __future__ import annotations

import logging
from copy import deepcopy
from datetime import datetime

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DEFAULT_THEME, STORAGE_KEY, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)


class TickerDisplayStore:
    def __init__(self, hass: HomeAssistant):
        self.hass = hass
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data = {
            "devices": {},
            "templates": {},
            "alert_templates": {},
            "themes": {},
            "global_settings": {
                "default_theme": DEFAULT_THEME,
                "default_transition": "fade",
                "default_screen_duration": 15,
                "default_camera_source": "auto",
                "default_chart_hours": 24,
                "default_chart_widget_animations": True,
                "default_widget_opacity": 0.75,
                "default_widget_blur": 0,
                "default_widget_radius": 12,
                "default_background_color": "#121212",
                "default_ticker_height": 36,
                "widget_feature_flags": {},
                "device_groups": {},
            },
        }

    async def async_load(self):
        data = await self._store.async_load()
        if data:
            merged = deepcopy(self._data)
            merged.update(data)
            merged["devices"] = data.get("devices", {})
            merged["templates"] = data.get("templates", {})
            merged["alert_templates"] = data.get("alert_templates", {})
            merged["themes"] = data.get("themes", {})
            merged["global_settings"] = {
                **deepcopy(self._data.get("global_settings", {})),
                **(data.get("global_settings", {}) or {}),
            }
            self._data = merged
        _LOGGER.debug(
            "Loaded store with %d devices",
            len(self._data.get("devices", {})),
        )

    async def async_save(self):
        await self._store.async_save(deepcopy(self._data))

    # ── DEVICES ──
    def get_devices(self) -> dict:
        return self._data.get("devices", {})

    def get_device(self, device_id: str) -> dict | None:
        return self._data.get("devices", {}).get(device_id)

    async def async_add_device(self, device_id: str, device_info: dict):
        devices = self._data.setdefault("devices", {})

        if device_id in devices:
            existing = devices[device_id]

            # Nur Geräte-Metadaten aktualisieren, KEINE Screens/Config überschreiben
            existing.update(
                {
                    "id": device_id,
                    "name": device_info.get("name", existing.get("name", device_id)),
                    "model": device_info.get("model", existing.get("model", "Unknown")),
                    "android_version": device_info.get(
                        "android_version",
                        existing.get("android_version", ""),
                    ),
                    "screen_resolution": device_info.get(
                        "screen_resolution",
                        existing.get("screen_resolution", ""),
                    ),
                }
            )

            await self.async_save()
            _LOGGER.info("Device metadata updated: %s", device_id)
            return

        devices[device_id] = {
            "id": device_id,
            "name": device_info.get("name", device_id),
            "model": device_info.get("model", "Unknown"),
            "android_version": device_info.get("android_version", ""),
            "screen_resolution": device_info.get("screen_resolution", ""),
            "screens": [],
            "rotation": {"enabled": True, "transition": "fade"},
            "ticker": {
                "enabled": True,
                "position": "bottom",
                "speed": "normal",
                "entities": [],
                "messages": [],
            },
            "theme": DEFAULT_THEME,
            "font": "roboto",
            "created_at": None,
        }
        await self.async_save()
        _LOGGER.info("Device registered: %s", device_id)

    async def async_update_device(self, device_id: str, config: dict):
        if not isinstance(config, dict):
            return
        if device_id in self._data.get("devices", {}):
            current = self._data["devices"][device_id]
            merged = deepcopy(current)
            merged.update(config)
            merged["id"] = device_id
            self._data["devices"][device_id] = merged
            await self.async_save()

    async def async_remove_device(self, device_id: str):
        self._data.get("devices", {}).pop(device_id, None)
        await self.async_save()

    async def async_create_virtual_device(
        self,
        name: str | None = None,
        source_device_id: str | None = None,
    ) -> dict:
        devices = self._data.setdefault("devices", {})
        source = deepcopy(devices.get(source_device_id, {})) if source_device_id else {}

        stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
        device_id = f"virtual_{stamp}"
        virtual_count = sum(1 for d in devices.values() if d.get("virtual")) + 1

        device = {
            "id": device_id,
            "name": name or f"Virtuelles Gerät {virtual_count}",
            "model": source.get("model") or "Browser / Web",
            "android_version": source.get("android_version") or "Web",
            "screen_resolution": source.get("screen_resolution") or "",
            "screens": deepcopy(source.get("screens", [])),
            "rotation": deepcopy(source.get("rotation", {"enabled": True, "transition": "fade"})),
            "ticker": deepcopy(
                source.get(
                    "ticker",
                    {
                        "enabled": True,
                        "position": "bottom",
                        "speed": "normal",
                        "entities": [],
                        "messages": [],
                    },
                )
            ),
            "theme": source.get("theme", DEFAULT_THEME),
            "font": source.get("font", "roboto"),
            "created_at": datetime.utcnow().isoformat(),
            "virtual": True,
            "browser_mode": True,
            "source_device_id": source_device_id,
        }

        devices[device_id] = device
        await self.async_save()
        _LOGGER.info("Virtual device created: %s", device_id)
        return deepcopy(device)

    # ── TEMPLATES ──
    def get_templates(self) -> dict:
        return self._data.get("templates", {})

    def get_template(self, template_id: str) -> dict | None:
        return self._data.get("templates", {}).get(template_id)

    async def async_save_template(self, template_id: str, template: dict):
        self._data.setdefault("templates", {})[template_id] = template
        await self.async_save()

    async def async_delete_template(self, template_id: str):
        self._data.get("templates", {}).pop(template_id, None)
        await self.async_save()

    # ── ALERT TEMPLATES ──
    def get_alert_templates(self) -> dict:
        return self._data.get("alert_templates", {})

    async def async_save_alert_template(self, alert_id: str, alert: dict):
        self._data.setdefault("alert_templates", {})[alert_id] = alert
        await self.async_save()

    async def async_delete_alert_template(self, alert_id: str):
        self._data.get("alert_templates", {}).pop(alert_id, None)
        await self.async_save()

    # ── CUSTOM THEMES ──
    def get_custom_themes(self) -> dict:
        return self._data.get("themes", {})

    async def async_save_theme(self, theme_id: str, theme: dict):
        self._data.setdefault("themes", {})[theme_id] = theme
        await self.async_save()

    async def async_delete_theme(self, theme_id: str):
        self._data.get("themes", {}).pop(theme_id, None)
        await self.async_save()

    # ── GLOBAL SETTINGS ──
    def get_global_settings(self) -> dict:
        return self._data.get("global_settings", {})

    async def async_update_global_settings(self, settings: dict):
        if not isinstance(settings, dict):
            return
        self._data.setdefault("global_settings", {}).update(settings)
        await self.async_save()

    # ── BACKUP ──
    def get_full_backup(self) -> dict:
        return deepcopy(self._data)

    async def async_restore_backup(self, data: dict):
        self._data = data
        await self.async_save()