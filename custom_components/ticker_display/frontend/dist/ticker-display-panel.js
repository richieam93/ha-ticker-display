/**
 * Ticker Display Panel 3.0.0
 * Neuer Kiosk-Editor: keine eigenen Widget/Grid-Screens mehr.
 * Es werden nur noch Home-Assistant-Seiten/URLs mit Dauer und Reihenfolge verwaltet.
 */
(function () {
  const API = "/ticker-display";
  const VERSION = "3.0.0";

  const DEFAULT_PAGE_URL = "/dashboard-durchgang/4";
  const QUICK_PAGES = [
    ["Durchgang", "/dashboard-durchgang/4"],
    ["Übersicht", "/lovelace"],
    ["Energy", "/energy"],
    ["Karte", "/map"],
    ["Medien", "/media-browser"],
  ];

  function uid(prefix = "page") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function cleanInt(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function normalizeHaUrl(raw) {
    let value = String(raw || "").trim();
    if (!value) return "";
    try {
      const parsed = new URL(value, window.location.origin);
      if (parsed.origin === window.location.origin) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
      }
      return parsed.href;
    } catch (_err) {
      if (!value.startsWith("/")) value = `/${value.replace(/^\/+/, "")}`;
      return value;
    }
  }

  function screenToPage(screen, index = 0) {
    const cfg = screen && typeof screen === "object" ? screen : {};
    const legacyEmbed = (cfg.widgets || []).find((w) => w && w.type === "web-embed");
    const legacyCfg = legacyEmbed && legacyEmbed.config ? legacyEmbed.config : {};
    const legacyUrl = legacyCfg.embed_url || legacyCfg.page_url || "";
    return {
      id: cfg.id || uid("page"),
      name: cfg.name || cfg.title || `Seite ${index + 1}`,
      url: normalizeHaUrl(cfg.url || cfg.page_url || cfg.kiosk_url || legacyUrl || DEFAULT_PAGE_URL),
      duration: cleanInt(cfg.duration, 60, 5, 86400),
      enabled: cfg.enabled !== false,
      kiosk: cfg.kiosk !== false,
    };
  }

  function pageToScreen(page, index = 0) {
    const url = normalizeHaUrl(page.url || DEFAULT_PAGE_URL) || DEFAULT_PAGE_URL;
    return {
      id: page.id || uid("page"),
      type: "ha-page",
      name: String(page.name || `Seite ${index + 1}`).trim() || `Seite ${index + 1}`,
      url,
      page_url: url,
      duration: cleanInt(page.duration, 60, 5, 86400),
      enabled: page.enabled !== false,
      kiosk: page.kiosk !== false,
      pause_on_touch: true,
      background_color: "#000000",
      transition: "fade",
    };
  }

  class TickerDisplayPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._devices = [];
      this._selectedId = "";
      this._device = null;
      this._pages = [];
      this._images = [];
      this._tab = "pages";
      this._loading = true;
      this._saving = false;
      this._message = "";
      this._error = "";
      this._pauseSeconds = 300;
      this._tickerEnabled = false;
      this._boundClick = this._onClick.bind(this);
      this._boundInput = this._onInput.bind(this);
      this._boundChange = this._onChange.bind(this);
      this._boundDragOver = this._onDragOver.bind(this);
      this._boundDrop = this._onDrop.bind(this);
    }

    set hass(value) {
      this._hass = value;
    }

    connectedCallback() {
      this.shadowRoot.addEventListener("click", this._boundClick);
      this.shadowRoot.addEventListener("input", this._boundInput);
      this.shadowRoot.addEventListener("change", this._boundChange);
      this.shadowRoot.addEventListener("dragover", this._boundDragOver);
      this.shadowRoot.addEventListener("drop", this._boundDrop);
      this._load();
    }

    disconnectedCallback() {
      this.shadowRoot.removeEventListener("click", this._boundClick);
      this.shadowRoot.removeEventListener("input", this._boundInput);
      this.shadowRoot.removeEventListener("change", this._boundChange);
      this.shadowRoot.removeEventListener("dragover", this._boundDragOver);
      this.shadowRoot.removeEventListener("drop", this._boundDrop);
    }

    async _fetchJson(url, options = {}) {
      const resp = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
      const text = await resp.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_err) { data = text; }
      if (!resp.ok) throw new Error((data && data.error) || `HTTP ${resp.status}`);
      return data;
    }

    async _load() {
      this._loading = true;
      this._error = "";
      this._message = "";
      this._render();
      try {
        const devices = await this._fetchJson(`${API}/api/config/devices`);
        this._devices = Array.isArray(devices) ? devices : [];
        if (!this._selectedId && this._devices.length) this._selectedId = this._devices[0].id;
        await this._loadSelectedDevice();
        await this._loadImages(false);
      } catch (err) {
        this._error = `Laden fehlgeschlagen: ${err.message || err}`;
      } finally {
        this._loading = false;
        this._render();
      }
    }

    async _loadSelectedDevice() {
      if (!this._selectedId) {
        this._device = null;
        this._pages = [];
        return;
      }
      const device = await this._fetchJson(`${API}/api/config/device/${encodeURIComponent(this._selectedId)}`);
      this._device = device;
      this._pages = Array.isArray(device.screens) ? device.screens.map(screenToPage).filter((p) => p.url) : [];
      this._pauseSeconds = cleanInt((device.rotation && device.rotation.touch_pause_seconds), 300, 0, 86400);
      this._tickerEnabled = (device.ticker && device.ticker.enabled) === true;
    }

    async _loadImages(render = true) {
      try {
        const items = await this._fetchJson(`${API}/api/media/images`);
        this._images = Array.isArray(items) ? items : [];
      } catch (_err) {
        this._images = [];
      }
      if (render) this._render();
    }

    _setMessage(message, isError = false) {
      this._message = isError ? "" : message;
      this._error = isError ? message : "";
      this._render();
    }

    async _save() {
      if (!this._device) return;
      this._saving = true;
      this._setMessage("Speichere...");
      const pages = this._pages.map((p, i) => pageToScreen(p, i)).filter((p) => p.enabled !== false && p.url);
      const payload = {
        ...this._device,
        screens: pages,
        rotation: {
          ...(this._device.rotation || {}),
          enabled: pages.length > 1,
          transition: (this._device.rotation && this._device.rotation.transition) || "fade",
          touch_pause_seconds: cleanInt(this._pauseSeconds, 300, 0, 86400),
        },
        ticker: {
          ...(this._device.ticker || {}),
          enabled: !!this._tickerEnabled,
        },
        browser_mode: "ha_kiosk",
      };
      try {
        await this._fetchJson(`${API}/api/config/device/${encodeURIComponent(this._device.id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        this._device = payload;
        this._setMessage("Gespeichert. Das Display lädt die neue Kiosk-Konfiguration automatisch neu.");
        await this._load();
      } catch (err) {
        this._setMessage(`Speichern fehlgeschlagen: ${err.message || err}`, true);
      } finally {
        this._saving = false;
        this._render();
      }
    }

    _addPage(url = DEFAULT_PAGE_URL, name = "") {
      const page = {
        id: uid("page"),
        name: name || `Seite ${this._pages.length + 1}`,
        url: normalizeHaUrl(url),
        duration: 60,
        enabled: true,
        kiosk: true,
      };
      this._pages = [...this._pages, page];
      this._render();
    }

    _movePage(index, delta) {
      const target = index + delta;
      if (target < 0 || target >= this._pages.length) return;
      const pages = [...this._pages];
      const [item] = pages.splice(index, 1);
      pages.splice(target, 0, item);
      this._pages = pages;
      this._render();
    }

    _deletePage(index) {
      this._pages = this._pages.filter((_, i) => i !== index);
      this._render();
    }

    _updatePage(index, key, value) {
      const pages = [...this._pages];
      const current = { ...(pages[index] || {}) };
      if (key === "url") current[key] = normalizeHaUrl(value);
      else if (key === "duration") current[key] = cleanInt(value, 60, 5, 86400);
      else if (key === "enabled" || key === "kiosk") current[key] = !!value;
      else current[key] = value;
      pages[index] = current;
      this._pages = pages;
    }

    async _createVirtualDevice() {
      const name = prompt("Name für virtuelles Kiosk-Gerät:", "Kiosk Browser");
      if (!name) return;
      try {
        const data = await this._fetchJson(`${API}/api/config/device/virtual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        this._selectedId = data.device_id;
        this._setMessage("Virtuelles Gerät erstellt.");
        await this._load();
      } catch (err) {
        this._setMessage(`Gerät konnte nicht erstellt werden: ${err.message || err}`, true);
      }
    }

    async _uploadImages(files) {
      const list = Array.from(files || []).filter((f) => f && f.type && f.type.startsWith("image/"));
      if (!list.length) return;
      const form = new FormData();
      list.forEach((file) => form.append("files", file, file.name));
      this._setMessage(`${list.length} Bild(er) werden hochgeladen...`);
      try {
        const result = await this._fetchJson(`${API}/api/media/image/upload`, { method: "POST", body: form });
        const count = (result && result.count !== undefined ? result.count : (result && result.items ? result.items.length : 1));
        const skipped = (result && result.skipped ? result.skipped.length : 0);
        this._setMessage(`${count} Bild(er) hochgeladen${skipped ? `, ${skipped} übersprungen` : ""}.`);
        await this._loadImages(true);
      } catch (err) {
        this._setMessage(`Upload fehlgeschlagen: ${err.message || err}`, true);
      }
    }

    async _deleteImage(id) {
      if (!id) return;
      if (!confirm("Bild wirklich löschen?")) return;
      try {
        await this._fetchJson(`${API}/api/media/image/${encodeURIComponent(id)}`, { method: "DELETE" });
        this._setMessage("Bild gelöscht.");
        await this._loadImages(true);
      } catch (err) {
        this._setMessage(`Löschen fehlgeschlagen: ${err.message || err}`, true);
      }
    }

    _onDragOver(ev) {
      if (ev.target.closest(".upload")) {
        ev.preventDefault();
      }
    }

    _onDrop(ev) {
      if (ev.target.closest(".upload")) {
        ev.preventDefault();
        this._uploadImages((ev.dataTransfer && ev.dataTransfer.files));
      }
    }

    _onClick(ev) {
      const target = ev.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      const index = Number(target.dataset.index);
      if (action === "reload") this._load();
      if (action === "save") this._save();
      if (action === "create-virtual") this._createVirtualDevice();
      if (action === "tab") { this._tab = target.dataset.tab || "pages"; this._render(); }
      if (action === "select-device") { this._selectedId = target.dataset.id || ""; this._loadSelectedDevice().then(() => this._render()); }
      if (action === "add-page") this._addPage();
      if (action === "add-quick") this._addPage(target.dataset.url || DEFAULT_PAGE_URL, target.dataset.name || "");
      if (action === "move-up") this._movePage(index, -1);
      if (action === "move-down") this._movePage(index, 1);
      if (action === "delete-page") this._deletePage(index);
      if (action === "delete-image") this._deleteImage(target.dataset.id || "");
      if (action === "copy") {
        const text = target.dataset.copy || "";
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
        this._setMessage("Link kopiert.");
      }
    }

    _onInput(ev) {
      const el = ev.target;
      if (!el || !el.dataset) return;
      if (el.dataset.field === "pauseSeconds") {
        this._pauseSeconds = cleanInt(el.value, 300, 0, 86400);
      }
      const index = el.dataset.index;
      const key = el.dataset.key;
      if (index !== undefined && key) {
        this._updatePage(Number(index), key, el.value);
      }
    }

    _onChange(ev) {
      const el = ev.target;
      if (!el || !el.dataset) return;
      if (el.dataset.field === "tickerEnabled") this._tickerEnabled = !!el.checked;
      if (el.dataset.field === "imageUpload") this._uploadImages(el.files);
      const index = el.dataset.index;
      const key = el.dataset.key;
      if (index !== undefined && key) {
        this._updatePage(Number(index), key, el.type === "checkbox" ? el.checked : el.value);
        this._render();
      }
    }

    _renderDeviceList() {
      if (!this._devices.length) {
        return `<div class="empty-mini">Noch kein Android-Gerät registriert.<br><button class="small" data-action="create-virtual">Virtuelles Gerät erstellen</button></div>`;
      }
      return this._devices.map((d) => {
        const selected = d.id === this._selectedId ? "selected" : "";
        const online = d.online || d.websocket_connected ? "online" : "offline";
        return `<button class="device ${selected}" data-action="select-device" data-id="${esc(d.id)}">
          <span class="dot ${online}"></span>
          <span><b>${esc(d.name || d.id)}</b><small>${esc(d.model || "Gerät")} · ${esc(d.screen_resolution || "")}</small></span>
        </button>`;
      }).join("");
    }

    _renderPages() {
      const d = this._device;
      if (!d) return `<div class="card">Bitte zuerst ein Gerät auswählen.</div>`;
      const rows = this._pages.map((p, i) => `
        <div class="page-row">
          <div class="page-number">${i + 1}</div>
          <label>Name<input data-index="${i}" data-key="name" value="${esc(p.name)}" placeholder="z.B. Durchgang"></label>
          <label class="url">Home-Assistant-Seite / URL<input data-index="${i}" data-key="url" value="${esc(p.url)}" placeholder="/dashboard-durchgang/4"></label>
          <label>Dauer Sekunden<input type="number" min="5" max="86400" data-index="${i}" data-key="duration" value="${esc(p.duration)}"></label>
          <label class="check"><input type="checkbox" data-index="${i}" data-key="enabled" ${p.enabled !== false ? "checked" : ""}> Aktiv</label>
          <label class="check"><input type="checkbox" data-index="${i}" data-key="kiosk" ${p.kiosk !== false ? "checked" : ""}> Kiosk-Parameter</label>
          <div class="row-actions">
            <button class="icon" data-action="move-up" data-index="${i}" title="Nach oben">↑</button>
            <button class="icon" data-action="move-down" data-index="${i}" title="Nach unten">↓</button>
            <button class="icon danger" data-action="delete-page" data-index="${i}" title="Löschen">✕</button>
          </div>
        </div>`).join("");
      return `
        <div class="hero">
          <div><h1>Kiosk-Seiten</h1><p>Hier trägst du nur noch Home-Assistant-Seiten ein. Layout, Karten und Hintergründe baust du direkt in Lovelace/YAML.</p></div>
          <button class="primary" data-action="save" ${this._saving ? "disabled" : ""}>Speichern</button>
        </div>
        <div class="card">
          <h2>Schnell hinzufügen</h2>
          <div class="quick-list">${QUICK_PAGES.map(([name, url]) => `<button data-action="add-quick" data-name="${esc(name)}" data-url="${esc(url)}">${esc(name)}<small>${esc(url)}</small></button>`).join("")}</div>
          <button data-action="add-page">+ Eigene Seite hinzufügen</button>
        </div>
        <div class="card">
          <h2>Rotation</h2>
          <div class="settings-grid">
            <label>Touch-Pause in Sekunden<input type="number" min="0" max="86400" data-field="pauseSeconds" value="${esc(this._pauseSeconds)}"></label>
            <label class="check"><input type="checkbox" data-field="tickerEnabled" ${this._tickerEnabled ? "checked" : ""}> Ticker-Leiste anzeigen</label>
          </div>
          <p class="hint">Standard: 300 Sekunden = 5 Minuten. Jeder Tap/Klick im Display pausiert den Seitenwechsel für diese Zeit. Bei 0 wird nicht pausiert.</p>
        </div>
        <div class="card">
          <h2>Seiten-Reihenfolge</h2>
          ${rows || `<div class="empty-big">Noch keine Seite eingetragen.<br>Füge z.B. <code>/dashboard-durchgang/4</code> hinzu.</div>`}
        </div>
        <div class="card links">
          <h2>Display-Links</h2>
          <a href="${esc(d.display_url || `/ticker-display/${d.id}`)}" target="_blank" rel="noreferrer">Display öffnen</a>
          <a href="${esc(d.preview_url || `/ticker-display/preview/${d.id}`)}" target="_blank" rel="noreferrer">Vorschau öffnen</a>
          <button data-action="copy" data-copy="${esc(d.display_url || `/ticker-display/${d.id}`)}">Display-Link kopieren</button>
        </div>`;
    }

    _renderMedia() {
      const imgs = this._images.map((img) => `
        <div class="img-card">
          <img src="${esc(img.url)}" alt="${esc(img.name || img.id || "Bild")}">
          <div><b>${esc(img.name || img.id || "Bild")}</b><small>${esc(img.url || "")}</small></div>
          <button class="icon danger" data-action="delete-image" data-id="${esc(img.id || img.name || "")}">✕</button>
        </div>`).join("");
      return `
        <div class="hero"><div><h1>Medien</h1><p>Mehrere Bilder auswählen und hochladen. Für die neuen HA-Kiosk-Seiten verwendest du Bilder danach direkt in Lovelace/YAML.</p></div></div>
        <div class="card upload">
          <h2>Bilder hochladen</h2>
          <input type="file" accept="image/*" multiple data-field="imageUpload">
          <p class="hint">PNG, JPG, GIF, SVG, WebP. Mehrfachauswahl und Drag & Drop werden unterstützt.</p>
        </div>
        <div class="card"><h2>Bilder-Pool</h2><div class="image-grid">${imgs || `<div class="empty-big">Noch keine Bilder vorhanden.</div>`}</div></div>`;
    }

    _renderHelp() {
      return `
        <div class="hero"><div><h1>Neues Prinzip</h1><p>Die Integration ist jetzt ein Kiosk-Browser für Home Assistant.</p></div></div>
        <div class="card prose">
          <h2>Was sich geändert hat</h2>
          <p>Der alte Widget-/Grid-Editor ist aus der Oberfläche entfernt. Du baust deine Seiten in Home Assistant, z.B. als Lovelace-Dashboard unter <code>/dashboard-durchgang/4</code>, und trägst diese URL hier als Kiosk-Seite ein.</p>
          <h2>Hintergrund/Bildkarussell</h2>
          <p>Für Hintergrundbilder oder ein Bildkarussell ist der beste Ort jetzt deine Lovelace-Seite selbst. Du kannst dafür z.B. Picture-Elements, Mushroom/Stack-in-Card, Card-Mod oder ein YAML-Dashboard verwenden. Dadurch sieht die Seite im Browser, in Home Assistant und auf dem Android-Display gleich aus.</p>
          <h2>Automatisierung</h2>
          <p>Die Smartphone-Schalter und Stellregler aus Home Assistant bleiben erhalten. Nur der eigene Layout-Editor wird nicht mehr benötigt.</p>
        </div>`;
    }

    _renderContent() {
      if (this._loading) return `<div class="card">Lade Konfiguration...</div>`;
      if (this._tab === "media") return this._renderMedia();
      if (this._tab === "help") return this._renderHelp();
      return this._renderPages();
    }

    _render() {
      this.shadowRoot.innerHTML = `
        <style>${this._styles()}</style>
        <div class="app">
          <aside>
            <div class="brand"><span>📱</span><div><b>Ticker Display</b><small>Kiosk Editor ${VERSION}</small></div></div>
            <nav>
              <button class="${this._tab === "pages" ? "active" : ""}" data-action="tab" data-tab="pages">Kiosk-Seiten</button>
              <button class="${this._tab === "media" ? "active" : ""}" data-action="tab" data-tab="media">Medien</button>
              <button class="${this._tab === "help" ? "active" : ""}" data-action="tab" data-tab="help">Hinweise</button>
            </nav>
            <div class="side-title">Geräte</div>
            <div class="devices">${this._renderDeviceList()}</div>
            <button class="small wide" data-action="create-virtual">Virtuelles Gerät</button>
            <button class="small wide" data-action="reload">Neu laden</button>
          </aside>
          <main>
            ${this._message ? `<div class="toast ok">${esc(this._message)}</div>` : ""}
            ${this._error ? `<div class="toast error">${esc(this._error)}</div>` : ""}
            ${this._renderContent()}
          </main>
        </div>`;
    }

    _styles() {
      return `
        :host{display:block;min-height:100vh;background:#0b1020;color:#e5e7eb;font-family:Roboto,Arial,sans-serif;--card:#111827;--muted:#94a3b8;--line:rgba(255,255,255,.1);--accent:#38bdf8;}
        *{box-sizing:border-box} button,input{font:inherit} .app{display:grid;grid-template-columns:300px 1fr;min-height:100vh} aside{background:#08111f;border-right:1px solid var(--line);padding:18px;position:sticky;top:0;height:100vh;overflow:auto} main{padding:24px;max-width:1400px;width:100%;margin:0 auto}.brand{display:flex;align-items:center;gap:12px;margin-bottom:20px}.brand span{font-size:32px}.brand b{display:block;font-size:18px}.brand small,.device small,.hint{color:var(--muted)}nav{display:grid;gap:8px;margin-bottom:20px}button,a{border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.05);color:#e5e7eb;text-decoration:none;padding:10px 12px;cursor:pointer}button:hover,a:hover{background:rgba(56,189,248,.12);border-color:rgba(56,189,248,.5)}button.active,.primary{background:linear-gradient(135deg,#0891b2,#2563eb);border-color:transparent;color:white;font-weight:700}button:disabled{opacity:.6;cursor:wait}.side-title{text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-size:12px;margin:18px 0 8px}.devices{display:grid;gap:8px}.device{width:100%;text-align:left;display:grid;grid-template-columns:12px 1fr;gap:10px;align-items:center}.device.selected{border-color:var(--accent);background:rgba(56,189,248,.14)}.dot{width:10px;height:10px;border-radius:50%;background:#64748b}.dot.online{background:#22c55e}.dot.offline{background:#ef4444}.wide{width:100%;margin-top:8px}.small{font-size:13px;padding:8px 10px}.hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.hero h1{margin:0 0 6px;font-size:32px}.hero p{margin:0;color:var(--muted);max-width:820px;line-height:1.45}.card{background:rgba(17,24,39,.92);border:1px solid var(--line);border-radius:20px;padding:18px;margin-bottom:18px;box-shadow:0 18px 60px rgba(0,0,0,.18)}.card h2{margin:0 0 12px;font-size:18px}.quick-list{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px}.quick-list button{display:flex;flex-direction:column;align-items:flex-start;gap:3px}.quick-list small{color:#bae6fd}.settings-grid{display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:end}.page-row{display:grid;grid-template-columns:42px 180px minmax(260px,1fr) 130px 90px 130px 128px;gap:10px;align-items:end;border:1px solid var(--line);border-radius:16px;padding:12px;margin-bottom:10px;background:rgba(255,255,255,.035)}.page-number{width:32px;height:32px;border-radius:50%;background:rgba(56,189,248,.15);display:flex;align-items:center;justify-content:center;font-weight:700;color:#7dd3fc}label{display:grid;gap:6px;color:#cbd5e1;font-size:12px}input{width:100%;border:1px solid var(--line);border-radius:10px;background:#020617;color:#f8fafc;padding:10px 11px}.check{display:flex;gap:8px;align-items:center;min-height:40px}.check input{width:auto}.row-actions{display:flex;gap:6px}.icon{width:36px;height:36px;padding:0;display:inline-flex;align-items:center;justify-content:center}.danger{color:#fecaca;border-color:rgba(239,68,68,.35)}.links{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.links h2{width:100%}.toast{border-radius:14px;padding:12px 14px;margin-bottom:14px;border:1px solid}.toast.ok{background:rgba(22,163,74,.12);border-color:rgba(34,197,94,.4);color:#bbf7d0}.toast.error{background:rgba(220,38,38,.12);border-color:rgba(248,113,113,.45);color:#fecaca}.empty-big,.empty-mini{color:var(--muted);line-height:1.5}.upload{border-style:dashed}.image-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.img-card{border:1px solid var(--line);border-radius:14px;padding:10px;background:rgba(255,255,255,.035);display:grid;grid-template-columns:64px 1fr 36px;gap:10px;align-items:center}.img-card img{width:64px;height:48px;object-fit:cover;border-radius:10px;background:#020617}.img-card small{display:block;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.prose{line-height:1.55}.prose code,.empty-big code{background:#020617;border:1px solid var(--line);padding:2px 6px;border-radius:6px;color:#bfdbfe}@media(max-width:980px){.app{grid-template-columns:1fr}aside{position:relative;height:auto}.page-row{grid-template-columns:1fr}.settings-grid{grid-template-columns:1fr}.hero{display:block}.hero .primary{margin-top:12px;width:100%}}`;
    }
  }

  if (!customElements.get("ticker-display-panel")) {
    customElements.define("ticker-display-panel", TickerDisplayPanel);
  }
})();
