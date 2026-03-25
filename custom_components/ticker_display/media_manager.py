"""Media Manager - handles sounds, fonts, images."""

import logging
import shutil
from pathlib import Path
from homeassistant.core import HomeAssistant
from .const import DOMAIN, DEFAULT_SOUNDS, DEFAULT_FONTS

SOUND_ALIASES = {
    "alarm_siren": "alarm_critical",
    "critical_alarm": "alarm_critical",
    "siren": "alarm_critical",
    "notify": "notification",
    "bell": "doorbell",
}

_LOGGER = logging.getLogger(__name__)


class MediaManager:
    def __init__(self, hass: HomeAssistant):
        self.hass = hass
        self._base_path = Path(hass.config.path(f"custom_components/{DOMAIN}"))
        self._media_path = Path(hass.config.path(f".storage/{DOMAIN}_media"))
        self._default_media_path = self._base_path / "default_media"
        self._sounds_path = self._media_path / "sounds"
        self._fonts_path = self._media_path / "fonts"
        self._images_path = self._media_path / "images"

    async def async_initialize(self):
        await self.hass.async_add_executor_job(self._initialize_sync)

    def _initialize_sync(self):
        for path in [self._sounds_path, self._fonts_path, self._images_path]:
            path.mkdir(parents=True, exist_ok=True)
        for subdir in ["sounds", "fonts"]:
            src = self._default_media_path / subdir
            dest = self._sounds_path if subdir == "sounds" else self._fonts_path
            if src.exists():
                for f in src.iterdir():
                    target = dest / f.name
                    if not target.exists():
                        shutil.copy2(f, target)

    def _resolve_sound_file(self, sound_id: str, declared_filename: str | None = None) -> Path | None:
        sound_id = (sound_id or "").strip()
        sound_id = SOUND_ALIASES.get(sound_id, sound_id)
        candidates = []
        if declared_filename:
            candidates.append(self._sounds_path / declared_filename)
        for ext in [".mp3", ".wav", ".ogg"]:
            candidates.append(self._sounds_path / f"{sound_id}{ext}")
        for cand in candidates:
            if cand.exists():
                return cand
        return None

    # ── SOUNDS ──
    def get_sounds(self) -> list[dict]:
        sounds = []
        builtin_stems = set(DEFAULT_SOUNDS.keys())
        for sound_id, info in DEFAULT_SOUNDS.items():
            fp = self._resolve_sound_file(sound_id, info["file"])
            filename = fp.name if fp else info["file"]
            sounds.append({
                "id": sound_id,
                "name": info["name"],
                "filename": filename,
                "url": f"/ticker-display/media/sounds/{filename}",
                "category": info["category"],
                "builtin": True,
                "exists": bool(fp),
                "size": fp.stat().st_size if fp and fp.exists() else 0,
            })

        if self._sounds_path.exists():
            for f in self._sounds_path.iterdir():
                if f.suffix.lower() in [".mp3", ".wav", ".ogg"] and f.stem not in builtin_stems:
                    sounds.append({"id": f.stem, "name": f.stem.replace("_", " ").title(),
                        "filename": f.name, "url": f"/ticker-display/media/sounds/{f.name}",
                        "category": "custom", "builtin": False, "exists": True, "size": f.stat().st_size})
        return sounds

    def get_sound_path(self, filename: str) -> Path | None:
        path = self._sounds_path / filename
        return path if path.exists() else None

    def get_sound_url(self, sound_id: str) -> str | None:
        sound_id = SOUND_ALIASES.get((sound_id or "").strip(), (sound_id or "").strip())
        if sound_id in DEFAULT_SOUNDS:
            fp = self._resolve_sound_file(sound_id, DEFAULT_SOUNDS[sound_id]["file"])
            if fp:
                return f"/ticker-display/media/sounds/{fp.name}"
        fp = self._resolve_sound_file(sound_id)
        if fp:
            return f"/ticker-display/media/sounds/{fp.name}"
        return None

    async def async_save_sound(self, filename: str, data: bytes) -> dict:
        path = self._sounds_path / filename
        await self.hass.async_add_executor_job(path.write_bytes, data)
        return {"id": Path(filename).stem, "filename": filename, "url": f"/ticker-display/media/sounds/{filename}", "size": len(data)}

    async def async_delete_sound(self, sound_id: str) -> bool:
        if sound_id in DEFAULT_SOUNDS:
            return False
        for ext in [".mp3", ".wav", ".ogg"]:
            path = self._sounds_path / f"{sound_id}{ext}"
            if path.exists():
                await self.hass.async_add_executor_job(path.unlink)
                return True
        return False

    # ── FONTS ──
    def get_fonts(self) -> list[dict]:
        fonts = []
        for font_id, info in DEFAULT_FONTS.items():
            files = {}
            for variant, filename in info["variants"].items():
                fp = self._fonts_path / filename
                if fp.exists():
                    files[variant] = f"/ticker-display/media/fonts/{filename}"
            fonts.append({"id": font_id, "name": info["name"], "variants": list(files.keys()), "files": files, "builtin": True})

        builtin_files = set()
        for info in DEFAULT_FONTS.values():
            builtin_files.update(info["variants"].values())

        if self._fonts_path.exists():
            custom = {}
            for f in self._fonts_path.iterdir():
                if f.suffix.lower() in [".woff2", ".ttf", ".otf"] and f.name not in builtin_files:
                    base = f.stem.rsplit("-", 1)[0] if "-" in f.stem else f.stem
                    variant = f.stem.rsplit("-", 1)[1] if "-" in f.stem else "regular"
                    if base not in custom:
                        custom[base] = {"id": base, "name": base.replace("-", " ").title(), "variants": [], "files": {}, "builtin": False}
                    custom[base]["variants"].append(variant)
                    custom[base]["files"][variant] = f"/ticker-display/media/fonts/{f.name}"
            fonts.extend(custom.values())
        return fonts

    def get_font_path(self, filename: str) -> Path | None:
        path = self._fonts_path / filename
        return path if path.exists() else None

    def get_font_css(self, font_id: str) -> str:
        css = ""
        for font in self.get_fonts():
            if font["id"] == font_id:
                for variant, url in font["files"].items():
                    weight = {"regular": 400, "medium": 500, "bold": 700}.get(variant, 400)
                    css += f'@font-face{{font-family:"{font["name"]}";font-weight:{weight};font-display:swap;src:url("{url}") format("woff2");}}\n'
        return css

    async def async_save_font(self, filename: str, data: bytes) -> dict:
        path = self._fonts_path / filename
        await self.hass.async_add_executor_job(path.write_bytes, data)
        return {"id": Path(filename).stem, "filename": filename, "url": f"/ticker-display/media/fonts/{filename}"}

    async def async_delete_font(self, font_id: str) -> bool:
        if font_id in DEFAULT_FONTS:
            return False
        deleted = False
        for f in self._fonts_path.iterdir():
            if f.stem.startswith(font_id):
                await self.hass.async_add_executor_job(f.unlink)
                deleted = True
        return deleted

    # ── IMAGES ──
    def get_images(self) -> list[dict]:
        images = []
        if self._images_path.exists():
            for f in self._images_path.iterdir():
                if f.suffix.lower() in [".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp"]:
                    images.append({"id": f.stem, "filename": f.name, "url": f"/ticker-display/media/images/{f.name}", "size": f.stat().st_size})
        return images

    def get_image_path(self, filename: str) -> Path | None:
        path = self._images_path / filename
        return path if path.exists() else None

    async def async_save_image(self, filename: str, data: bytes) -> dict:
        path = self._images_path / filename
        await self.hass.async_add_executor_job(path.write_bytes, data)
        return {"id": Path(filename).stem, "filename": filename, "url": f"/ticker-display/media/images/{filename}"}

    async def async_delete_image(self, image_id: str) -> bool:
        for f in self._images_path.iterdir():
            if f.stem == image_id:
                await self.hass.async_add_executor_job(f.unlink)
                return True
        return False