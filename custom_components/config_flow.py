"""Config flow for Ticker Display."""

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from .const import DOMAIN


class TickerDisplayConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title="Ticker Display", data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({}),
            description_placeholders={
                "info": "Ticker Display wird eingerichtet. "
                        "Nach der Installation findest du den Baukasten in der Seitenleiste."
            },
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return TickerDisplayOptionsFlow(config_entry)


class TickerDisplayOptionsFlow(config_entries.OptionsFlow):
    def __init__(self, config_entry):
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Optional("heartbeat_timeout",
                    default=self.config_entry.options.get("heartbeat_timeout", 120),
                ): vol.All(vol.Coerce(int), vol.Range(min=30, max=600)),
            }),
        )