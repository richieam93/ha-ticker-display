/**
 * Ticker Display Panel 3.0.1
 * Neuer Kiosk-Editor: keine eigenen Widget/Grid-Screens mehr.
 * Es werden nur noch Home-Assistant-Seiten/URLs mit Dauer und Reihenfolge verwaltet.
 */
(function () {
  const API = "/ticker-display";
  const VERSION = "3.0.1";

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
      this._tab = "pages";
      this._loading = true;
      this._saving = false;
      this._message = "";
      this._error = "";
      this._pauseSeconds = 300;
      this._tickerEnabled = false;
      this._fixedText = "";
      this._target = "all";
      this._tickerMessage = "Willkommen zuhause 👋";
      this._tickerDuration = 15;
      this._tickerColor = "#9ca3af";
      this._toastMessage = "Geschirrspüler ist fertig";
      this._toastDuration = 6;
      this._toastColor = "#111827";
      this._bannerTitle = "Info";
      this._bannerMessage = "Fenster im Büro ist noch offen";
      this._bannerColor = "#2196F3";
      this._alertTitle = "Türklingel";
      this._alertMessage = "Jemand steht vor der Haustür";
      this._alertColor = "#ff9800";
      this._boundClick = this._onClick.bind(this);
      this._boundInput = this._onInput.bind(this);
      this._boundChange = this._onChange.bind(this);
    }

    set hass(value) {
      this._hass = value;
    }

    connectedCallback() {
      this.shadowRoot.addEventListener("click", this._boundClick);
      this.shadowRoot.addEventListener("input", this._boundInput);
      this.shadowRoot.addEventListener("change", this._boundChange);
      this._load();
    }

    disconnectedCallback() {
      this.shadowRoot.removeEventListener("click", this._boundClick);
      this.shadowRoot.removeEventListener("input", this._boundInput);
      this.shadowRoot.removeEventListener("change", this._boundChange);
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
        this._devices = (Array.isArray(devices) ? devices : []).filter((d) => !(d && (d.virtual || String(d.id || "").startsWith("virtual_"))));
        if (this._selectedId && !this._devices.some((d) => d.id === this._selectedId)) this._selectedId = "";
        if (!this._selectedId && this._devices.length) this._selectedId = this._devices[0].id;
        await this._loadSelectedDevice();
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
      const fixed = device.ticker && Array.isArray(device.ticker.fixed_messages) ? device.ticker.fixed_messages : [];
      this._fixedText = fixed.map((item) => typeof item === "string" ? item : (item && item.text) || "").filter(Boolean).join("\n");
    }

    _deviceOptions() {
      return [
        { id: "all", name: "Alle Geräte" },
        ...this._devices.map((d) => ({ id: d.id || d.device_id || d.name, name: `${d.name || d.id} (${d.id || d.device_id || d.name})` })),
      ];
    }

    _yamlEscape(value) {
      return String(value == null ? "" : value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    _tickerYaml() {
      return `action: ticker_display.send_ticker_message\ndata:\n  device: ${this._target}\n  message: "${this._yamlEscape(this._tickerMessage)}"\n  duration: ${cleanInt(this._tickerDuration, 15, 1, 3600)}\n  replace: true\n  color: "${this._yamlEscape(this._tickerColor)}"`;
    }

    _toastYaml() {
      return `action: ticker_display.show_toast\ndata:\n  device: ${this._target}\n  message: "${this._yamlEscape(this._toastMessage)}"\n  duration: ${cleanInt(this._toastDuration, 6, 1, 3600)}\n  color: "${this._yamlEscape(this._toastColor)}"`;
    }

    _bannerYaml() {
      return `action: ticker_display.show_banner\ndata:\n  device: ${this._target}\n  title: "${this._yamlEscape(this._bannerTitle)}"\n  message: "${this._yamlEscape(this._bannerMessage)}"\n  color: "${this._yamlEscape(this._bannerColor)}"`;
    }

    _alertYaml() {
      return `action: ticker_display.show_alert\ndata:\n  device: ${this._target}\n  title: "${this._yamlEscape(this._alertTitle)}"\n  message: "${this._yamlEscape(this._alertMessage)}"\n  severity: warning\n  mode: fullscreen\n  color: "${this._yamlEscape(this._alertColor)}"\n  duration: 10`;
    }

    _fixedPreviewText() {
      const list = String(this._fixedText || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
      return list.length ? list.join(" │ ") : "Erste Meldung │ Zweite Meldung │ Dritte Meldung";
    }

    async _saveTickerList() {
      if (!this._device) return;
      this._saving = true;
      this._setMessage("Speichere feste Tickerliste...");
      const fixedMessages = String(this._fixedText || "")
        .split(/\n+/)
        .map((x) => x.trim())
        .filter(Boolean);
      const payload = {
        ...this._device,
        ticker: {
          ...(this._device.ticker || {}),
          enabled: !!this._tickerEnabled,
          show_list: true,
          fixed_messages: fixedMessages,
        },
      };
      try {
        await this._fetchJson(`${API}/api/config/device/${encodeURIComponent(this._device.id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        this._device = payload;
        this._setMessage("Feste Tickerliste gespeichert.");
        await this._loadSelectedDevice();
      } catch (err) {
        this._setMessage(`Tickerliste konnte nicht gespeichert werden: ${err.message || err}`, true);
      } finally {
        this._saving = false;
        this._render();
      }
    }

    _onClick(ev) {
      const target = ev.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      const index = Number(target.dataset.index);
      if (action === "reload") this._load();
      if (action === "save") this._save();
      if (action === "save-ticker-list") this._saveTickerList();
      if (action === "tab") { this._tab = target.dataset.tab || "pages"; this._render(); }
      if (action === "select-device") { this._selectedId = target.dataset.id || ""; this._loadSelectedDevice().then(() => this._render()); }
      if (action === "add-page") this._addPage();
      if (action === "add-quick") this._addPage(target.dataset.url || DEFAULT_PAGE_URL, target.dataset.name || "");
      if (action === "move-up") this._movePage(index, -1);
      if (action === "move-down") this._movePage(index, 1);
      if (action === "delete-page") this._deletePage(index);
      if (action === "copy") {
        const text = target.dataset.copy || "";
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
        this._setMessage("Kopiert.");
      }
    }

    _onInput(ev) {
      const el = ev.target;
      if (!el || !el.dataset) return;
      let liveRefresh = false;
      const liveFields = new Set(["target", "fixedText", "tickerMessage", "tickerDuration", "tickerColor", "toastMessage", "toastDuration", "toastColor", "bannerTitle", "bannerMessage", "bannerColor", "alertTitle", "alertMessage", "alertColor"]);
      if (el.dataset.field === "pauseSeconds") {
        this._pauseSeconds = cleanInt(el.value, 300, 0, 86400);
      }
      if (el.dataset.field === "target") this._target = el.value || "all";
      if (el.dataset.field === "fixedText") this._fixedText = el.value;
      if (el.dataset.field === "tickerMessage") this._tickerMessage = el.value;
      if (el.dataset.field === "tickerDuration") this._tickerDuration = cleanInt(el.value, 15, 1, 3600);
      if (el.dataset.field === "tickerColor") this._tickerColor = el.value;
      if (el.dataset.field === "toastMessage") this._toastMessage = el.value;
      if (el.dataset.field === "toastDuration") this._toastDuration = cleanInt(el.value, 6, 1, 3600);
      if (el.dataset.field === "toastColor") this._toastColor = el.value;
      if (el.dataset.field === "bannerTitle") this._bannerTitle = el.value;
      if (el.dataset.field === "bannerMessage") this._bannerMessage = el.value;
      if (el.dataset.field === "bannerColor") this._bannerColor = el.value;
      if (el.dataset.field === "alertTitle") this._alertTitle = el.value;
      if (el.dataset.field === "alertMessage") this._alertMessage = el.value;
      if (el.dataset.field === "alertColor") this._alertColor = el.value;
      if (liveFields.has(el.dataset.field)) liveRefresh = true;
      const index = el.dataset.index;
      const key = el.dataset.key;
      if (index !== undefined && key) {
        this._updatePage(Number(index), key, el.value);
      } else if (liveRefresh) {
        this._render();
      }
    }

    _onChange(ev) {
      const el = ev.target;
      if (!el || !el.dataset) return;
      if (el.dataset.field === "tickerEnabled") this._tickerEnabled = !!el.checked;
      if (el.dataset.field === "target") { this._target = el.value || "all"; this._render(); return; }
      const index = el.dataset.index;
      const key = el.dataset.key;
      if (index !== undefined && key) {
        this._updatePage(Number(index), key, el.type === "checkbox" ? el.checked : el.value);
        this._render();
      }
    }

    _renderDeviceList() {
      if (!this._devices.length) {
        return `<div class="empty-mini">Noch kein Android-Gerät registriert.<br>Starte die Android-App einmal, damit das echte Gerät hier erscheint.</div>`;
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

    _renderMessages() {
      const devs = this._deviceOptions();
      const fixedPreview = this._fixedPreviewText();
      return `
        <div class="hero"><div><h1>Ticker & Meldungen</h1><p>Hier findest du getrennte Bereiche für Live-Ticker, feste Liste, Toast, Banner und Alert – jeweils mit Vorschau und kopierbarer Beispiel-Aktion für das Entwicklerwerkzeug.</p></div></div>
        <div class="card">
          <h2>Zielgerät für Beispiele</h2>
          <label>Zielgerät
            <select data-field="target">${devs.map((d) => `<option value="${esc(d.id)}" ${d.id === this._target ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select>
          </label>
          <p class="hint">Die kopierten Aktionen kannst du direkt unter Entwicklerwerkzeuge → Aktionen oder in Automationen verwenden.</p>
        </div>
        <div class="message-grid">
          <div class="card msg-card">
            <h2>▶️ Live-Ticker</h2>
            <div class="subgrid">
              <label>Nachricht<input data-field="tickerMessage" value="${esc(this._tickerMessage)}"></label>
              <label>Dauer (s)<input type="number" min="1" max="3600" data-field="tickerDuration" value="${esc(this._tickerDuration)}"></label>
            </div>
            <label>Akzent/Farbe<input data-field="tickerColor" value="${esc(this._tickerColor)}"></label>
            <div class="preview-wrap"><div class="ticker-preview" style="background:linear-gradient(90deg, ${esc(this._tickerColor)}, rgba(0,0,0,.65));">${esc(this._tickerMessage)}</div></div>
            <pre class="code">${esc(this._tickerYaml())}</pre>
            <button class="primary" data-action="copy" data-copy="${esc(this._tickerYaml())}">Aktion kopieren</button>
          </div>

          <div class="card msg-card">
            <h2>🗂️ Feste Tickerliste</h2>
            <p class="hint">Die feste Liste gehört jetzt zum ausgewählten echten Android-Gerät. Eine Meldung pro Zeile. Sie wird angezeigt, wenn die Ticker-Leiste aktiv ist.</p>
            <textarea rows="6" data-field="fixedText" placeholder="Erste Meldung\nZweite Meldung\nDritte Meldung">${esc(this._fixedText)}</textarea>
            <div class="preview-wrap"><div class="ticker-preview dark">${esc(fixedPreview)}</div></div>
            <button class="primary" data-action="save-ticker-list" ${!this._device || this._saving ? "disabled" : ""}>Feste Tickerliste speichern</button>
          </div>

          <div class="card msg-card">
            <h2>💬 Toast</h2>
            <div class="subgrid">
              <label>Nachricht<input data-field="toastMessage" value="${esc(this._toastMessage)}"></label>
              <label>Dauer (s)<input type="number" min="1" max="3600" data-field="toastDuration" value="${esc(this._toastDuration)}"></label>
            </div>
            <label>Farbe<input data-field="toastColor" value="${esc(this._toastColor)}"></label>
            <div class="preview-wrap"><div class="toast-preview" style="background:${esc(this._toastColor)};">${esc(this._toastMessage)}</div></div>
            <pre class="code">${esc(this._toastYaml())}</pre>
            <button class="primary" data-action="copy" data-copy="${esc(this._toastYaml())}">Aktion kopieren</button>
          </div>

          <div class="card msg-card">
            <h2>📣 Banner</h2>
            <label>Titel<input data-field="bannerTitle" value="${esc(this._bannerTitle)}"></label>
            <label>Nachricht<textarea rows="3" data-field="bannerMessage">${esc(this._bannerMessage)}</textarea></label>
            <label>Farbe<input data-field="bannerColor" value="${esc(this._bannerColor)}"></label>
            <div class="preview-wrap"><div class="banner-preview" style="background:${esc(this._bannerColor)};"><strong>${esc(this._bannerTitle)}</strong><span>${esc(this._bannerMessage)}</span></div></div>
            <pre class="code">${esc(this._bannerYaml())}</pre>
            <button class="primary" data-action="copy" data-copy="${esc(this._bannerYaml())}">Aktion kopieren</button>
          </div>

          <div class="card msg-card">
            <h2>🚨 Alert</h2>
            <label>Titel<input data-field="alertTitle" value="${esc(this._alertTitle)}"></label>
            <label>Nachricht<textarea rows="3" data-field="alertMessage">${esc(this._alertMessage)}</textarea></label>
            <label>Farbe<input data-field="alertColor" value="${esc(this._alertColor)}"></label>
            <div class="preview-wrap"><div class="alert-preview" style="background:${esc(this._alertColor)};"><div><div class="alert-title-preview">${esc(this._alertTitle)}</div><div>${esc(this._alertMessage)}</div></div></div></div>
            <pre class="code">${esc(this._alertYaml())}</pre>
            <button class="primary" data-action="copy" data-copy="${esc(this._alertYaml())}">Aktion kopieren</button>
          </div>
        </div>`;
    }

    _renderHelp() {
      return `
        <div class="hero"><div><h1>Neues Prinzip</h1><p>Die Integration ist jetzt ein Kiosk-Browser für Home Assistant.</p></div></div>
        <div class="card prose">
          <h2>Was sich geändert hat</h2>
          <p>Der alte Widget-/Grid-Editor ist aus der Oberfläche entfernt. Du baust deine Seiten in Home Assistant, z.B. als Lovelace-Dashboard unter <code>/dashboard-durchgang/4</code>, und trägst diese URL hier als Kiosk-Seite ein.</p>
          <h2>Hintergrund/Bildkarussell</h2>
          <p>Für Hintergrundbilder oder ein Bildkarussell ist der beste Ort jetzt deine Lovelace-Seite selbst, z.B. per YAML, Picture-Elements, Card-Mod oder einer passenden Lovelace-Karte. Der frühere Medienbereich wurde aus diesem Admin entfernt.</p>
          <h2>Automatisierung</h2>
          <p>Die Smartphone-Schalter und Stellregler aus Home Assistant bleiben erhalten. Live-Ticker, Toast, Banner und Alert findest du im Bereich <b>Ticker & Meldungen</b>.</p>
        </div>`;
    }

    _renderContent() {
      if (this._loading) return `<div class="card">Lade Konfiguration...</div>`;
      if (this._tab === "messages") return this._renderMessages();
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
              <button class="${this._tab === "messages" ? "active" : ""}" data-action="tab" data-tab="messages">Ticker & Meldungen</button>
              <button class="${this._tab === "help" ? "active" : ""}" data-action="tab" data-tab="help">Hinweise</button>
            </nav>
            <div class="side-title">Geräte</div>
            <div class="devices">${this._renderDeviceList()}</div>
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
        *{box-sizing:border-box} button,input,select,textarea{font:inherit} .app{display:grid;grid-template-columns:300px 1fr;min-height:100vh} aside{background:#08111f;border-right:1px solid var(--line);padding:18px;position:sticky;top:0;height:100vh;overflow:auto} main{padding:24px;max-width:1400px;width:100%;margin:0 auto}.brand{display:flex;align-items:center;gap:12px;margin-bottom:20px}.brand span{font-size:32px}.brand b{display:block;font-size:18px}.brand small,.device small,.hint{color:var(--muted)}nav{display:grid;gap:8px;margin-bottom:20px}button,a{border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.05);color:#e5e7eb;text-decoration:none;padding:10px 12px;cursor:pointer}button:hover,a:hover{background:rgba(56,189,248,.12);border-color:rgba(56,189,248,.5)}button.active,.primary{background:linear-gradient(135deg,#0891b2,#2563eb);border-color:transparent;color:white;font-weight:700}button:disabled{opacity:.6;cursor:wait}.side-title{text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-size:12px;margin:18px 0 8px}.devices{display:grid;gap:8px}.device{width:100%;text-align:left;display:grid;grid-template-columns:12px 1fr;gap:10px;align-items:center}.device.selected{border-color:var(--accent);background:rgba(56,189,248,.14)}.dot{width:10px;height:10px;border-radius:50%;background:#64748b}.dot.online{background:#22c55e}.dot.offline{background:#ef4444}.wide{width:100%;margin-top:8px}.small{font-size:13px;padding:8px 10px}.hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.hero h1{margin:0 0 6px;font-size:32px}.hero p{margin:0;color:var(--muted);max-width:820px;line-height:1.45}.card{background:rgba(17,24,39,.92);border:1px solid var(--line);border-radius:20px;padding:18px;margin-bottom:18px;box-shadow:0 18px 60px rgba(0,0,0,.18)}.card h2{margin:0 0 12px;font-size:18px}.quick-list{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px}.quick-list button{display:flex;flex-direction:column;align-items:flex-start;gap:3px}.quick-list small{color:#bae6fd}.settings-grid{display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:end}.page-row{display:grid;grid-template-columns:42px 180px minmax(260px,1fr) 130px 90px 130px 128px;gap:10px;align-items:end;border:1px solid var(--line);border-radius:16px;padding:12px;margin-bottom:10px;background:rgba(255,255,255,.035)}.page-number{width:32px;height:32px;border-radius:50%;background:rgba(56,189,248,.15);display:flex;align-items:center;justify-content:center;font-weight:700;color:#7dd3fc}label{display:grid;gap:6px;color:#cbd5e1;font-size:12px}input,select,textarea{width:100%;border:1px solid var(--line);border-radius:10px;background:#020617;color:#f8fafc;padding:10px 11px}textarea{resize:vertical;min-height:78px}.check{display:flex;gap:8px;align-items:center;min-height:40px}.check input{width:auto}.row-actions{display:flex;gap:6px}.icon{width:36px;height:36px;padding:0;display:inline-flex;align-items:center;justify-content:center}.danger{color:#fecaca;border-color:rgba(239,68,68,.35)}.links{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.links h2{width:100%}.toast{border-radius:14px;padding:12px 14px;margin-bottom:14px;border:1px solid}.toast.ok{background:rgba(22,163,74,.12);border-color:rgba(34,197,94,.4);color:#bbf7d0}.toast.error{background:rgba(220,38,38,.12);border-color:rgba(248,113,113,.45);color:#fecaca}.empty-big,.empty-mini{color:var(--muted);line-height:1.5}.upload{border-style:dashed}.image-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.img-card{border:1px solid var(--line);border-radius:14px;padding:10px;background:rgba(255,255,255,.035);display:grid;grid-template-columns:64px 1fr 36px;gap:10px;align-items:center}.img-card img{width:64px;height:48px;object-fit:cover;border-radius:10px;background:#020617}.img-card small{display:block;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.message-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}.msg-card{display:grid;gap:12px}.subgrid{display:grid;grid-template-columns:1fr 150px;gap:10px}.preview-wrap{border:1px dashed var(--line);border-radius:14px;padding:12px;background:rgba(255,255,255,.025)}.ticker-preview{display:flex;align-items:center;width:100%;min-height:38px;padding:0 14px;border-radius:10px;color:#fff;overflow:hidden;white-space:nowrap}.ticker-preview.dark{background:rgba(12,18,28,.78)}.toast-preview{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:16px;color:#fff}.banner-preview{display:grid;gap:4px;min-height:60px;padding:12px 14px;border-radius:12px;color:#fff}.alert-preview{display:grid;place-items:center;min-height:140px;border-radius:18px;color:#fff;text-align:center;padding:20px}.alert-title-preview{font-size:24px;font-weight:700;margin-bottom:8px}.code{background:#020617;color:#dbeafe;padding:12px;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;border:1px solid var(--line);margin:0}.prose{line-height:1.55}.prose code,.empty-big code{background:#020617;border:1px solid var(--line);padding:2px 6px;border-radius:6px;color:#bfdbfe}@media(max-width:980px){.app{grid-template-columns:1fr}aside{position:relative;height:auto}.page-row{grid-template-columns:1fr}.settings-grid{grid-template-columns:1fr}.subgrid{grid-template-columns:1fr}.hero{display:block}.hero .primary{margin-top:12px;width:100%}}`;
    }
  }

  if (!customElements.get("ticker-display-panel")) {
    customElements.define("ticker-display-panel", TickerDisplayPanel);
  }
})();
