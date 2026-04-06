# Ticker Display for Home Assistant

**Deutsch / English README**

Ticker Display ist eine Kombination aus einer **Home-Assistant-Custom-Integration** und einer **Android-Kiosk-App**. Das Projekt verwandelt Android-Geräte wie Tablets oder alte Smartphones in flexible Smart-Home-Displays mit Dashboards, Tickern, Alarmen, Mediensteuerung, Kameras, Wetter, Status-Boards und mehr.

Ticker Display is a combination of a **Home Assistant custom integration** and an **Android kiosk app**. It turns Android devices such as tablets or old phones into flexible smart home displays with dashboards, tickers, alerts, media controls, cameras, weather screens, status boards, and more.

---

## Inhaltsverzeichnis / Table of Contents

- [Deutsch](#deutsch)
  - [Überblick](#überblick)
  - [Funktionen](#funktionen)
  - [Architektur](#architektur)
  - [Installation](#installation)
  - [Erste Einrichtung](#erste-einrichtung)
  - [Wie alles funktioniert](#wie-alles-funktioniert)
  - [Das virtuelle Gerät](#das-virtuelle-gerät)
  - [Der visuelle Editor](#der-visuelle-editor)
  - [Home Assistant Services](#home-assistant-services)
  - [HTTP API](#http-api)
  - [WebSocket API](#websocket-api)
  - [Automations-Beispiele](#automations-beispiele)
  - [Android-App bauen](#android-app-bauen)
  - [Projektstruktur](#projektstruktur)
  - [Hinweise](#hinweise)
- [English](#english)
  - [Overview](#overview)
  - [Features](#features)
  - [Architecture](#architecture-1)
  - [Installation](#installation-1)
  - [First-time setup](#first-time-setup)
  - [How it works](#how-it-works)
  - [The virtual device](#the-virtual-device)
  - [The visual editor](#the-visual-editor)
  - [Home Assistant services](#home-assistant-services-1)
  - [HTTP API](#http-api-1)
  - [WebSocket API](#websocket-api-1)
  - [Automation examples](#automation-examples)
  - [Building the Android app](#building-the-android-app)
  - [Project structure](#project-structure)
  - [Notes](#notes)

---

# Deutsch

## Überblick

Ticker Display erweitert Home Assistant um eine zentrale Oberfläche für fest montierte oder frei platzierte Android-Displays.

Das Projekt besteht aus zwei Hauptteilen:

1. **Custom Component für Home Assistant**
   - Domain: `ticker_display`
   - Registriert Geräte
   - Speichert Gerätekonfigurationen, Templates, Alerts und Themes
   - Stellt REST-ähnliche HTTP-Endpunkte bereit
   - Stellt einen WebSocket-Kanal für Live-Kommunikation bereit
   - Registriert viele Home-Assistant-Services für Automationen

2. **Android-App**
   - Läuft im Kiosk-Modus auf Android
   - Verbindet sich mit Home Assistant
   - Rendert die Display-Oberfläche im WebView
   - Sendet Heartbeats, Gerätestatus und Sensordaten
   - Empfängt Befehle in Echtzeit via WebSocket
   - Kann Audio, TTS, Kamera-Snapshots und Gerätefunktionen nutzen

---

## Funktionen

### Anzeige / Display
- Dashboard-Ansichten aus Home Assistant anzeigen
- Mehrere Screen-Typen rotieren
- Einzelwerte, Uhren, Bilder, Wetter, Kameras und Status-Boards darstellen
- Themes, Schriften und Medien zentral verwalten
- Ticker-Leiste mit Live-Meldungen oder Entity-basierten Inhalten

### Alerts / Benachrichtigungen
- Fullscreen-, Banner-, Overlay-, Toast-, PiP- und Notification-Modi
- Kritische und informative Warnungen
- Sound, Lautstärke, Wake-Screen, Bestätigung und Fortschrittsanzeige
- Alert-Templates und Alert-Sequenzen

### Steuerung / Interaktion
- Medien steuern
- Helligkeit und Display-Power ändern
- Screen-Rotation pausieren oder fortsetzen
- Gerät identifizieren
- Popups und stille Alerts anzeigen
- Entity-Aktionen auslösen

### Android / Kiosk
- Kiosk-Modus
- Start nach Boot
- Watchdog-Service
- Geräteverwaltung mit PIN
- Mehrere Wege, um das Einstellungsmenü aufzurufen
- Optional Kamera- und Sprachfunktionen
- Tablet-Kameras können je nach Setup aktiviert und deaktiviert werden

### Assist / Medien / Sensorik
- TTS und Audio-Ausgabe
- Mikrofon-/Sprach-Integration
- Kamera-Unterstützung
- Tablet-Kameras können für Live-Funktionen je nach Setup ein- und ausgeschaltet werden
- Gerätesensoren wie Akku, WLAN, Speicher, CPU, Helligkeit usw.

---

## Architektur

```text
Home Assistant
 ├─ ticker_display Integration
 │   ├─ Config Flow + Options
 │   ├─ Store / Templates / Themes / Alerts / Devices
 │   ├─ HTTP API (/ticker-display/api/...)
 │   ├─ WebSocket (/ticker-display/ws/{device_id})
 │   ├─ Services (show_alert, show_dashboard, tts_speak, ...)
 │   └─ Admin Panel (Ticker Display)
 │
 └─ Android App
     ├─ SetupActivity (URL + Token + Gerät)
     ├─ MainActivity (Display / WebView / Kiosk)
     ├─ Sensor- und Heartbeat-Übertragung
     ├─ WebSocket-Empfang für Live-Befehle
     ├─ Audio / TTS / Kamera
     └─ Watchdog / Boot Receiver
```

### Kommunikationsmodell

1. Die Android-App verbindet sich mit Home Assistant.
2. Die App registriert das Gerät über die HTTP API.
3. Die App sendet regelmäßig Heartbeats und Gerätedaten.
4. Home Assistant speichert Konfigurationen und Gerätezustände.
5. Automationen oder Services senden Befehle an das Gerät.
6. Diese Befehle werden per WebSocket in Echtzeit an das richtige Display zugestellt.
7. Die Android-App rendert die Anzeige oder führt Aktionen aus.

---

## Installation

### Voraussetzung
- Home Assistant mit aktivem `http` und `websocket_api`
- Ein Android-Gerät mit Android 6.0+ (`minSdk 23`)
- Netzwerkzugriff zwischen Gerät und Home Assistant
- Long-Lived Access Token für die Android-App

### Option A: Installation über HACS

1. Repository zu HACS hinzufügen.
2. Nach **Ticker Display** suchen.
3. Integration installieren.
4. Home Assistant neu starten.
5. Unter **Einstellungen → Geräte & Dienste** die Integration hinzufügen.

### Option B: Manuelle Installation

1. Diesen Repository-Ordner herunterladen.
2. Den Ordner `custom_components/ticker_display` nach:

```text
/config/custom_components/ticker_display
```

kopieren.

3. Home Assistant neu starten.
4. Integration unter **Einstellungen → Geräte & Dienste** hinzufügen.

### Android-App installieren

**Wichtig:** Zuerst immer die **HACS-/Home-Assistant-Integration installieren und Home Assistant neu starten**.  
**Erst danach** die Android-APK auf dem Tablet oder Smartphone installieren und in der App mit Home Assistant verbinden.

Es gibt zwei Wege:

#### Fertige APK verwenden
Die APK liegt in diesem Repository unter:

```text
apk/Tickerdisplay.apk
```

Diese APK auf dem Android-Gerät installieren.

#### App selbst bauen
Siehe Abschnitt [Android-App bauen](#android-app-bauen).

---

## Erste Einrichtung

### 1. Integration in Home Assistant hinzufügen
Nach der Installation erscheint die Integration `Ticker Display` in Home Assistant. Der Config Flow ist bewusst schlank und erstellt die Integration ohne Pflichtfelder. Optional kann danach der `heartbeat_timeout` gesetzt werden.

**Empfohlene Reihenfolge:**
1. Integration über **HACS** oder manuell installieren
2. **Home Assistant vollständig neu starten**
3. Prüfen, ob **Ticker Display** unter **Einstellungen → Geräte & Dienste** verfügbar ist
4. Erst jetzt die **APK auf dem Android-Gerät installieren**
5. App starten und mit Home Assistant verbinden

### 2. Android-App starten
Beim ersten Start führt die App durch mehrere Schritte:

1. Home-Assistant-URL eingeben
2. Long-Lived Access Token einfügen oder per QR scannen
3. Verbindung testen
4. Gerätename und Geräte-ID festlegen
5. Kiosk-Optionen konfigurieren
6. Einrichtung abschließen

### 3. Gerät registrieren
Die App registriert sich bei Home Assistant und bekommt ihre Konfiguration über:

```text
POST /ticker-display/api/device/register
GET  /ticker-display/api/device/{device_id}/config
```

### 4. Admin Panel öffnen
Nach erfolgreicher Installation registriert die Integration ein eingebautes Admin-Panel in Home Assistant:

- Sidebar-Titel: **Ticker Display**
- URL-Pfad: `ticker-display-admin`

Dort können Geräte, Templates, Alerts, Themes und globale Einstellungen verwaltet werden.

---

## Wie alles funktioniert

### 1. Geräteverwaltung
Die Integration führt für jedes Display ein Gerät mit Konfiguration, Heartbeat-Zeitstempel und optionalen Sensor-/Statusdaten.

### 2. Screen Rendering
Die Display-Seite wird über den Ticker-Display-Pfad ausgeliefert. Die Android-App lädt diese Seite im WebView.

Beispiele:

```text
/ticker-display/{device_id}
/ticker-display/preview/{device_id}
```

### 3. Realtime-Kommunikation
Für Live-Befehle nutzt das Projekt WebSockets:

```text
/ticker-display/ws/{device_id}
```

Darüber kommen z. B.:
- `show_alert`
- `show_dashboard`
- `show_camera`
- `set_brightness`
- `set_volume`
- `reload_page`
- `set_ticker_entities`

### 4. Home Assistant Services als Automations-Schicht
Die meisten Benutzer interagieren nicht direkt mit der API, sondern mit Home-Assistant-Services. Diese Services verpacken Befehle und leiten sie intern an den WebSocket oder an die API weiter.

### 5. Medien und Assets
Sounds, Fonts, Bilder und TTS-Dateien werden über Media-Endpunkte bereitgestellt und können zentral verwendet werden.

### 6. Android als aktiver Client
Die Android-App ist nicht nur ein passiver Browser, sondern liefert aktiv Daten zurück, z. B.:
- Akkustand
- WLAN-Infos
- Speicher
- CPU
- Bildschirmstatus
- Kamera-Verfügbarkeit
- Kamera-Status (je nach Gerätezustand/Funktion)
- App-Version
- Orientierung
- Uptime

---


## Das virtuelle Gerät

Neben echten Android-Geräten unterstützt Ticker Display auch ein **virtuelles Gerät**. Das ist besonders nützlich zum Testen, für Vorschauen im Browser und zum Erstellen von Screens, ohne dass sofort ein physisches Tablet verbunden sein muss.

### Wofür das virtuelle Gerät gedacht ist

- Screens, Widgets und Themes im Browser testen
- Templates und Layouts vorbereiten, bevor ein echtes Gerät eingerichtet wird
- Vorschauen im Admin-Panel verwenden
- Inhalte entwickeln, auch wenn gerade kein Tablet online ist
- Neue Setups schneller bauen und kontrollieren

### Wie es funktioniert

Das virtuelle Gerät wird in Home Assistant über die Konfiguration erzeugt und verhält sich wie ein Display-Ziel für Rendering, Vorschau und viele Konfigurationsfunktionen.

Relevanter Endpunkt:

```http
POST /ticker-display/api/config/device/virtual
```

Danach kann das virtuelle Gerät wie ein normales Ziel im Admin-Panel oder in Screen-/Template-Workflows verwendet werden. Es ist besonders praktisch in Kombination mit:

- Preview-Seiten
- dem visuellen Editor
- Templates
- Theme-Tests
- Screen-Rotation- und Layout-Tests

### Unterschied zu einem echten Tablet

Ein virtuelles Gerät ist ideal für Vorschau und Aufbau, ersetzt aber nicht alle Hardware-Funktionen eines echten Android-Geräts. Dinge wie:

- reale Audio-Ausgabe
- TTS auf dem Gerät
- Bildschirm ein/aus
- Helligkeitssteuerung
- Sensorwerte
- Kamera-Hardware
- Mikrofon- oder Kiosk-Funktionen

sind in der Regel an ein echtes Android-Gerät gebunden.

### Typischer Workflow

1. Integration in Home Assistant installieren
2. Virtuelles Gerät im Admin-Bereich anlegen
3. Screens, Widgets und Themes im Editor erstellen
4. Vorschau testen
5. Danach ein echtes Tablet per APK verbinden
6. Die vorbereiteten Screens direkt auf dem echten Gerät verwenden

## Der visuelle Editor

Ein besonders starker Teil des Projekts ist der **eingebaute Screen-Editor im Admin-Panel**. Er ist nicht nur eine kleine Konfigurationshilfe, sondern ein echter visueller Builder für komplette Display-Seiten. Damit lassen sich Screens nicht nur konfigurieren, sondern wirklich bauen, testen, als Vorlage speichern und im Draft-/Preview-Modus prüfen.

### Was der Editor kann

- **Drag & Drop Layout-Editor** für Dashboard-Screens
- **Widget-Palette** mit Sensor-, Chart-, Smart-Home-, Medien-, Text- und Layout-Widgets
- **Live-Vorschau** direkt im Editor und zusätzlicher Draft-/Preview-Modus in neuem Tab
- **Mehrfachauswahl**, **Ausrichten**, **Verteilen**, **Größen angleichen**, **Verschieben** und **Resize** auf Grid-Basis
- **Undo / Redo** für Bearbeitungsschritte
- **Duplizieren** von Widgets und ganzen Screens
- **Screen-Vorlagen speichern** und später wieder anwenden
- **Presets / Templates** für typische Ansichten wie Home, Energie, Security, Familie oder Medien

### Screen-Einstellungen im Editor

Wenn kein Widget ausgewählt ist, bearbeitet der Editor die Eigenschaften des gesamten Screens. Dazu gehören unter anderem:

- **Screen-Typ** wie Dashboard, Uhr, Wetter, Kamera oder Bild
- **Übergänge / Transition-Effekte** beim Screen-Wechsel
- **Hintergrundfarbe** und **Hintergrundbild**
- **Bildgröße**, Overlay-Deckkraft und Entfernen des Hintergrundbilds
- **Wettereffekte über den ganzen Screen**
- **Lebendige Bewegung / Motion-Effekte** für Widgets
- **Ticker-Override pro Screen**, also abweichende Ticker-Konfiguration nur für diesen Screen

### Widget-Bearbeitung

Sobald ein Widget ausgewählt ist, öffnet der Editor eine rechte Eigenschaften-Seite mit mehreren Tabs.

#### Allgemein
- Widget-Typ wechseln
- Haupt-Entity auswählen
- Zusätzliche Entities zuweisen (für Multi-Sensor- oder Chart-Widgets)
- Zahlenformatierung, Dezimalstellen und Trimmen von Nullen
- Anzeigename, Icon und Namenslogik
- Position, Größe, Spalten-/Zeilenbelegung
- Touch-Aktionen wie:
  - Widget vergrößern
  - Vollbild-Popup öffnen
  - Toggle ausführen
  - zu einem anderen Screen wechseln
  - URL öffnen

#### Style
- Schriftart und Schriftgröße
- Textfarbe und Hintergrundfarbe
- Transparenz, Blur und Border-Radius
- Aktivieren/Deaktivieren von Animationen
- Auswahl eines Animationsstils wie `auto`, `soft`, `lively` oder `pulse`

#### Erweitert
- **Custom CSS** pro Widget
- **Direktes JSON-Editing** eines Widgets
- Widget-JSON kopieren
- Widget duplizieren oder löschen

### Unterstützte Widget-Kategorien

Der Editor ist nicht auf einfache Kacheln beschränkt. Im Code sind viele Widget-Gruppen vorgesehen, unter anderem:

- **Value / Status** Widgets
- **Charts / Graphen**
- **Smart-Home-Control** Widgets
- **Text-, Listen- und Layout-Widgets**
- **Kamera**, **Wetter**, **Uhr**, **Bild**
- **Countdown**, **Button**, **QR-Code**, **Web-Embed**, **Color Block**

Dadurch ist der Editor nicht nur ein Theme-Tool, sondern ein echter **Screen-Builder** für komplette Dashboard-Seiten.

### Erweiterte Editor-Funktionen

Je nach Widget-Typ gibt es weitere Spezialfunktionen:

- **Entity-Meta-Editor** für Aliase, Namensanzeige und Serienfarben
- **Chart-History / Verlaufsdaten** für Metrik- und Chart-Vorschauen
- **Control-Layouts** wie kompakte oder kartenartige Steuer-Widgets
- **Background Image Picker** für Screen-Hintergründe
- **Template-System** für wiederverwendbare Screen-Konfigurationen
- **Preview im Browser**, bevor die Änderungen produktiv auf dem Gerät laufen

### Warum das wichtig ist

Viele ähnliche Projekte verlangen YAML oder harte JSON-Bearbeitung. Hier gibt es zusätzlich einen **visuellen Editor**, der sowohl für schnelle Anpassungen als auch für komplexe Displays geeignet ist. Wer will, kann trotzdem bis auf JSON- und CSS-Ebene eingreifen.


## Home Assistant Services

Die Integration registriert viele Services unter `ticker_display.*`.

### Wichtige Screen-Services
- `ticker_display.show_dashboard`
- `ticker_display.show_graph`
- `ticker_display.show_camera`
- `ticker_display.show_weather`
- `ticker_display.show_single_value`
- `ticker_display.show_clock`
- `ticker_display.show_status_board`
- `ticker_display.show_image`
- `ticker_display.show_template`

### Alerts und Hinweise
- `ticker_display.show_alert`
- `ticker_display.show_alert_template`
- `ticker_display.show_alert_sequence`
- `ticker_display.show_notification`
- `ticker_display.show_toast`
- `ticker_display.show_silent_alert`
- `ticker_display.clear_alert`

### Ticker
- `ticker_display.send_ticker_message`
- `ticker_display.set_ticker_entities`
- `ticker_display.clear_ticker`
- `ticker_display.update_ticker_config`

### Gerätesteuerung
- `ticker_display.set_screen_power`
- `ticker_display.set_brightness`
- `ticker_display.set_theme`
- `ticker_display.set_volume`
- `ticker_display.set_screen_orientation`
- `ticker_display.next_screen`
- `ticker_display.previous_screen`
- `ticker_display.goto_screen`
- `ticker_display.pause_rotation`
- `ticker_display.resume_rotation`
- `ticker_display.reload_page`
- `ticker_display.identify_device`

### Audio / Medien
- `ticker_display.play_sound`
- `ticker_display.play_announcement`
- `ticker_display.tts_speak`
- `ticker_display.stop_audio`
- `ticker_display.play_media`
- `ticker_display.stop_media`

### Popup / Entity-Aktionen
- `ticker_display.show_popup`
- `ticker_display.dismiss_popup`
- `ticker_display.entity_toggle`
- `ticker_display.entity_action`

### Beispiel: Dashboard anzeigen

```yaml
service: ticker_display.show_dashboard
data:
  device: wohnzimmer_tablet
  dashboard: /lovelace/default_view
```

### Beispiel: Kritischen Alert anzeigen

```yaml
service: ticker_display.show_alert
data:
  device: wohnzimmer_tablet
  title: Rauchmelder
  message: Rauch im Keller erkannt
  severity: critical
  mode: fullscreen
  sound: alarm_critical
  volume: 100
  wake_screen: true
  require_ack: true
  ack_label: Bestätigen
```

### Beispiel: Ticker-Nachricht senden

```yaml
service: ticker_display.send_ticker_message
data:
  device: wohnzimmer_tablet
  message: Willkommen zuhause 👋
  icon: "📢"
  color: "#f3f4f6"
  duration: 15
```

### Beispiel: TTS ausgeben

```yaml
service: ticker_display.tts_speak
data:
  device: wohnzimmer_tablet
  message: Die Waschmaschine ist fertig.
  language: de-DE
  volume: 70
```

---

## HTTP API

Die Integration registriert eine Reihe eigener HTTP-Endpunkte unter:

```text
/ticker-display/api/
```

> Hinweis: Die API ist hauptsächlich für die App, das Admin-Panel und interne Komponenten gedacht. Viele Nutzer werden stattdessen ausschließlich Home-Assistant-Services verwenden.

### Geräte / Devices

#### Gerät registrieren
```http
POST /ticker-display/api/device/register
```

Typischer Zweck:
- neues Gerät registrieren
- Metadaten senden
- erste Zuordnung in Home Assistant erzeugen

#### Heartbeat senden
```http
POST /ticker-display/api/device/heartbeat
```

Typischer Zweck:
- Gerät als online markieren
- Sensordaten und Status aktualisieren

#### Gerät-Event senden
```http
POST /ticker-display/api/device/event
```

Typischer Zweck:
- Ereignisse vom Gerät an Home Assistant zurückmelden

#### Gerätekonfiguration abrufen
```http
GET /ticker-display/api/device/{device_id}/config
```

#### Gerät löschen
```http
DELETE /ticker-display/api/device/{device_id}
```

### Anzeige / Rendering

#### Display-Seite laden
```http
GET /ticker-display/{device_id}
GET /ticker-display/preview/{device_id}
```

### Medien / Assets

#### Medienlisten abrufen
```http
GET /ticker-display/api/media/sounds
GET /ticker-display/api/media/fonts
GET /ticker-display/api/media/images
```

#### Medien hochladen
```http
POST /ticker-display/api/media/sound/upload
POST /ticker-display/api/media/font/upload
POST /ticker-display/api/media/image/upload
```

#### Medien löschen
```http
DELETE /ticker-display/api/media/sound/{item_id}
DELETE /ticker-display/api/media/font/{item_id}
DELETE /ticker-display/api/media/image/{item_id}
```

#### Ausgelieferte Mediendateien
```http
GET /ticker-display/media/sounds/{filename}
GET /ticker-display/media/fonts/{filename}
GET /ticker-display/media/images/{filename}
GET /ticker-display/media/tts/{filename}
```

### Home-Assistant-Daten

```http
GET  /ticker-display/api/image/camera/{entity_id}
POST /ticker-display/api/camera/upload
GET  /ticker-display/api/history/{entity_id}
GET  /ticker-display/api/weather/{entity_id}
GET  /ticker-display/api/states/{entity_id}
GET  /ticker-display/api/entity/{entity_id}
GET  /ticker-display/api/entity/{entity_id}/capabilities
POST /ticker-display/api/entity/toggle
POST /ticker-display/api/entity/service
POST /ticker-display/api/entity/action
GET  /ticker-display/api/media-player/{entity_id}
POST /ticker-display/api/media-player/{entity_id}/command
GET  /ticker-display/api/persons
GET  /ticker-display/api/entities
GET  /ticker-display/api/ha-media/items
```

### Konfiguration / Admin

```http
GET    /ticker-display/api/config/devices
POST   /ticker-display/api/config/device/virtual
GET    /ticker-display/api/config/device/{device_id}
POST   /ticker-display/api/config/device/{device_id}
GET    /ticker-display/api/config/templates
POST   /ticker-display/api/config/template
DELETE /ticker-display/api/config/template/{template_id}
GET    /ticker-display/api/config/alerts
POST   /ticker-display/api/config/alert
DELETE /ticker-display/api/config/alert/{alert_id}
GET    /ticker-display/api/config/themes
POST   /ticker-display/api/config/theme
DELETE /ticker-display/api/config/theme/{theme_id}
GET    /ticker-display/api/config/global
POST   /ticker-display/api/config/global
POST   /ticker-display/api/config/backup
POST   /ticker-display/api/config/restore
```

### Beispiel-API-Flow

#### Gerät registrieren
```bash
curl -X POST "http://HOMEASSISTANT:8123/ticker-display/api/device/register" \
  -H "Authorization: Bearer YOUR_LONG_LIVED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "wohnzimmer_tablet",
    "name": "Wohnzimmer Tablet",
    "model": "Samsung Tab A",
    "android_version": "14",
    "screen_resolution": "1920x1200"
  }'
```

#### Gerätekonfiguration holen
```bash
curl -X GET "http://HOMEASSISTANT:8123/ticker-display/api/device/wohnzimmer_tablet/config" \
  -H "Authorization: Bearer YOUR_LONG_LIVED_TOKEN"
```

#### Aktions-Entity triggern
```bash
curl -X POST "http://HOMEASSISTANT:8123/ticker-display/api/entity/action" \
  -H "Authorization: Bearer YOUR_LONG_LIVED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "light.wohnzimmer",
    "action": "turn_on",
    "data": {"brightness": 180}
  }'
```

---

## WebSocket API

WebSocket-Endpunkt:

```text
/ticker-display/ws/{device_id}
```

Die Android-App verbindet sich mit diesem Endpunkt und empfängt Live-Befehle.

### Typische Nachrichten

#### Screen anzeigen
```json
{
  "type": "command",
  "command": "show_dashboard",
  "data": {
    "dashboard": "/lovelace/default_view"
  }
}
```

#### Display-Helligkeit setzen
```json
{
  "type": "display_control",
  "brightness": 80
}
```

#### Lautstärke setzen
```json
{
  "type": "audio",
  "action": "set_volume",
  "volume": 50
}
```

#### Alert senden
```json
{
  "type": "command",
  "command": "show_alert",
  "data": {
    "title": "Türklingel",
    "message": "Jemand steht vor der Haustür",
    "severity": "warning",
    "mode": "fullscreen",
    "sound": "doorbell"
  }
}
```

### Warum WebSocket?
- Sofortige Reaktion ohne Polling
- Gezielte Zustellung pro Gerät
- Bidirektionale Kommunikation
- Ideal für Live-Alerts, Ticker und Gerätesteuerung

---

## Automations-Beispiele

Die folgenden Beispiele sind bewusst im Stil der beigefügten Testdatei aufgebaut, damit sie sich direkt in Home Assistant unter **Entwicklerwerkzeuge → Aktionen** oder als Vorlage für Automationen verwenden lassen.

**Testgerät in den Beispielen:** `tablet01`

**Hinweis:** Viele Aktionen lassen sich 1:1 in Automationen übernehmen. In den Beispielen unten wird deshalb zunächst das reine Service-Format gezeigt und danach ein paar vollständige Automation-Beispiele.

### 1) Dashboard / Screen-Inhalte

#### Show dashboard
```yaml
action: ticker_display.show_dashboard
data:
  device: tablet01
  dashboard: /lovelace/default_view
```

#### Show graph
```yaml
action: ticker_display.show_graph
data:
  device: tablet01
  entity_id: sensor.stromverbrauch_heute
```

#### Show graph by saved graph_id
```yaml
action: ticker_display.show_graph
data:
  device: tablet01
  graph_id: energy_today
```

#### Show camera
```yaml
action: ticker_display.show_camera
data:
  device: tablet01
  entity_id: camera.front_door
  title: Haustür
```

#### Show weather
```yaml
action: ticker_display.show_weather
data:
  device: tablet01
  entity_id: weather.home
```

#### Show single value
```yaml
action: ticker_display.show_single_value
data:
  device: tablet01
  entity_id: sensor.wohnzimmer_temperatur
  label: Wohnzimmer
```

#### Show clock
```yaml
action: ticker_display.show_clock
data:
  device: tablet01
```

#### Show status board
```yaml
action: ticker_display.show_status_board
data:
  device: tablet01
  board_id: daily_status
```

#### Show image
```yaml
action: ticker_display.show_image
data:
  device: tablet01
  image_url: /media/local/family.jpg
  title: Familienfoto
```

#### Show template
```yaml
action: ticker_display.show_template
data:
  device: tablet01
  template_id: template_wohnzimmer
```

### 2) Alerts / Benachrichtigungen / Popups

#### Show alert (Fullscreen)
```yaml
action: ticker_display.show_alert
data:
  device: tablet01
  title: "Türklingel"
  message: "Jemand steht vor der Haustür"
  severity: warning
  mode: fullscreen
  color: "#ff9800"
  duration: 10
  wake_screen: true
```

#### Show alert with sound
```yaml
action: ticker_display.show_alert
data:
  device: tablet01
  title: Alarm
  message: Bewegungsmelder ausgelöst
  severity: critical
  mode: fullscreen
  color: "#f44336"
  sound: alarm
  volume: 90
  duration: 12
  wake_screen: true
```

#### Show alert with progress
```yaml
action: ticker_display.show_alert
data:
  device: tablet01
  title: Backup läuft
  message: Datensicherung wird durchgeführt
  severity: info
  mode: banner
  color: "#2196f3"
  progress_value: 65
  progress_text: "2 von 3 erledigt"
  duration: 0
```

#### Show alert with buttons
```yaml
action: ticker_display.show_alert
data:
  device: tablet01
  title: Kamera Bewegung
  message: Bewegung vor der Haustür erkannt
  severity: warning
  mode: overlay
  require_ack: true
  ack_label: Bestätigen
  secondary_label: Schließen
  actions:
    - id: open_cam
      label: Kamera
    - id: dismiss
      label: Ignorieren
```

#### Show alert template
```yaml
action: ticker_display.show_alert_template
data:
  device: tablet01
  template_id: doorbell
  title: Haustür
  message: Paketbote erkannt
  severity: warning
  mode: overlay
```

#### Show alert sequence
```yaml
action: ticker_display.show_alert_sequence
data:
  device: tablet01
  alerts:
    - title: Tür
      message: Jemand da
      duration: 5
    - title: Garage
      message: Tor offen
      mode: banner
      duration: 5
```

#### Show notification
```yaml
action: ticker_display.show_notification
data:
  device: tablet01
  title: Info
  message: Waschmaschine fertig
  color: "#2196f3"
```

#### Show toast
```yaml
action: ticker_display.show_toast
data:
  device: tablet01
  title: Info
  message: Willkommen zuhause
  duration: 6
  color: "#111827"
  text_color: "#f9fafb"
  accent_color: "#60a5fa"
  border_radius: 16
  font_size: 16
  position: bottom
  wake_screen: true
```

#### Clear alert
```yaml
action: ticker_display.clear_alert
data:
  device: tablet01
```

#### Clear alert by tag
```yaml
action: ticker_display.clear_alert
data:
  device: tablet01
  tag: frontdoor
```

#### Show popup
```yaml
action: ticker_display.show_popup
data:
  device: tablet01
  popup_type: widget
  entity_id: light.wohnzimmer
  title: Steuerung
```

#### Dismiss popup
```yaml
action: ticker_display.dismiss_popup
data:
  device: tablet01
```

#### Show silent alert
```yaml
action: ticker_display.show_silent_alert
data:
  device: tablet01
  title: Hinweis
  message: Stille Warnung
  severity: info
  mode: banner
  duration: 5
```

### 3) Ticker-Leiste

#### Send single ticker message
```yaml
action: ticker_display.send_ticker_message
data:
  device: tablet01
  message: "Willkommen zuhause 👋"
```

#### Send ticker message with replace and duration
```yaml
action: ticker_display.send_ticker_message
data:
  device: tablet01
  message: "🌡️ Wohnzimmer 22°C"
  color: "#f3f4f6"
  icon: "📢"
  replace: true
  duration: 15
```

#### Send multiple ticker messages
```yaml
action: ticker_display.send_ticker_message
data:
  device: tablet01
  messages:
    - text: "🌡️ Wohnzimmer 22°C"
    - text: "⚡ Strompreis 26 ct/kWh"
    - text: "🚪 Haustür geschlossen"
```

#### Set ticker entities
```yaml
action: ticker_display.set_ticker_entities
data:
  device: tablet01
  entities:
    - entity_id: sensor.wohnzimmer_temperatur
      template: "🌡️ Wohnzimmer: {state} {unit}"
    - entity_id: sensor.strompreis
      template: "⚡ Strompreis: {state} ct/kWh"
```

#### Clear ticker
```yaml
action: ticker_display.clear_ticker
data:
  device: tablet01
```

#### Update ticker config
```yaml
action: ticker_display.update_ticker_config
data:
  device: tablet01
  enabled: true
  direction: ltr
  speed: normal
  style_template: minimal
  height: 36
  font_size: 14
  auto_hide_seconds: 15
```

### 4) Display / Theming / Power

#### Screen on
```yaml
action: ticker_display.set_screen_power
data:
  device: tablet01
  power: true
```

#### Screen off
```yaml
action: ticker_display.set_screen_power
data:
  device: tablet01
  power: false
```

#### Set brightness
```yaml
action: ticker_display.set_brightness
data:
  device: tablet01
  brightness: 80
```

#### Set theme dark
```yaml
action: ticker_display.set_theme
data:
  device: tablet01
  mode: dark
  accent: "#4f46e5"
```

#### Set theme light
```yaml
action: ticker_display.set_theme
data:
  device: tablet01
  mode: light
  accent: "#0ea5e9"
```

#### Set screen orientation portrait
```yaml
action: ticker_display.set_screen_orientation
data:
  device: tablet01
  orientation: 0
```

#### Set screen orientation landscape
```yaml
action: ticker_display.set_screen_orientation
data:
  device: tablet01
  orientation: 90
```

### 5) Audio / Sound / Media / TTS

#### Set volume
```yaml
action: ticker_display.set_volume
data:
  device: tablet01
  volume: 50
```

#### Play internal sound
```yaml
action: ticker_display.play_sound
data:
  device: tablet01
  sound: doorbell
  volume: 100
```

#### Play sound URL
```yaml
action: ticker_display.play_sound
data:
  device: tablet01
  sound_url: /media/local/chime.mp3
  volume: 80
  loop: false
```

#### Play announcement URL
```yaml
action: ticker_display.play_announcement
data:
  device: tablet01
  url: /media/local/doorbell.mp3
  volume: 90
  title: Türgong
```

#### Play announcement internal sound
```yaml
action: ticker_display.play_announcement
data:
  device: tablet01
  sound: ding
  volume: 80
  title: Hinweis
```

#### TTS speak via ticker_display
```yaml
action: ticker_display.tts_speak
data:
  device: tablet01
  message: "Der Geschirrspüler ist fertig."
  language: de-DE
  volume: 75
```

#### TTS speak via HA TTS entity + media player
```yaml
action: ticker_display.tts_speak
data:
  device: tablet01
  media_player_entity_id: media_player.tablet01_speaker
  tts_entity_id: tts.piper_2
  message: "Der Geschirrspüler ist fertig."
  language: de-DE
  volume: 75
```

#### Stop audio
```yaml
action: ticker_display.stop_audio
data:
  device: tablet01
```

#### Play media
```yaml
action: ticker_display.play_media
data:
  device: tablet01
  media_url: /media/local/song.mp3
  volume: 70
  loop: false
```

#### Stop media
```yaml
action: ticker_display.stop_media
data:
  device: tablet01
```

#### Media next
```yaml
action: ticker_display.media_next
data:
  device: tablet01
```

#### Media previous
```yaml
action: ticker_display.media_previous
data:
  device: tablet01
```

#### Media pause
```yaml
action: ticker_display.media_pause
data:
  device: tablet01
```

#### Media resume
```yaml
action: ticker_display.media_resume
data:
  device: tablet01
```

### 6) Screen-Navigation / Rotation / Page

#### Next screen
```yaml
action: ticker_display.next_screen
data:
  device: tablet01
```

#### Previous screen
```yaml
action: ticker_display.previous_screen
data:
  device: tablet01
```

#### Go to screen by ID
```yaml
action: ticker_display.goto_screen
data:
  device: tablet01
  screen_id: screen_3
```

#### Go to screen by name
```yaml
action: ticker_display.goto_screen
data:
  device: tablet01
  screen_id: Screen 3
```

#### Pause rotation
```yaml
action: ticker_display.pause_rotation
data:
  device: tablet01
```

#### Resume rotation
```yaml
action: ticker_display.resume_rotation
data:
  device: tablet01
```

#### Reload page
```yaml
action: ticker_display.reload_page
data:
  device: tablet01
```

#### Identify device
```yaml
action: ticker_display.identify_device
data:
  device: tablet01
```

### 7) Entity-Aktionen

#### Entity toggle
```yaml
action: ticker_display.entity_toggle
data:
  device: tablet01
  entity_id: light.wohnzimmer
```

#### Entity turn_on
```yaml
action: ticker_display.entity_action
data:
  device: tablet01
  entity_id: light.wohnzimmer
  action: turn_on
  data:
    brightness: 128
```

#### Entity turn_off
```yaml
action: ticker_display.entity_action
data:
  device: tablet01
  entity_id: light.wohnzimmer
  action: turn_off
```

### 8) Tests für alle Geräte

#### Ticker to all devices
```yaml
action: ticker_display.send_ticker_message
data:
  device: all
  message: "Test an alle Geräte"
```

#### Alert to all devices
```yaml
action: ticker_display.show_alert
data:
  device: all
  title: Sammeltest
  message: Diese Meldung geht an alle verbundenen Displays
  severity: info
  mode: banner
  duration: 8
```

### 9) Vollständige Automationen

#### Türklingel mit Alert + Kamera
```yaml
automation:
  - alias: Türklingel auf Tablet
    trigger:
      - platform: state
        entity_id: binary_sensor.doorbell
        to: "on"
    action:
      - action: ticker_display.show_alert
        data:
          device: tablet01
          title: "Türklingel"
          message: "Jemand steht vor der Haustür"
          severity: warning
          mode: fullscreen
          color: "#ff9800"
          duration: 10
          wake_screen: true
      - action: ticker_display.show_camera
        data:
          device: tablet01
          entity_id: camera.front_door
          title: Haustür
```

#### Waschmaschine fertig als Toast
```yaml
automation:
  - alias: Waschmaschine fertig am Display
    trigger:
      - platform: state
        entity_id: binary_sensor.waschmaschine_fertig
        to: "on"
    action:
      - action: ticker_display.show_toast
        data:
          device: tablet01
          title: Info
          message: Waschmaschine fertig
          duration: 6
          color: "#111827"
          text_color: "#f9fafb"
          accent_color: "#60a5fa"
          border_radius: 16
          font_size: 16
          position: bottom
          wake_screen: true
```

#### Guten-Morgen-Ticker
```yaml
automation:
  - alias: Guten Morgen Ticker
    trigger:
      - platform: time
        at: "06:30:00"
    action:
      - action: ticker_display.send_ticker_message
        data:
          device: tablet01
          messages:
            - text: "☀️ Guten Morgen"
            - text: "🌡️ Wohnzimmer 22°C"
            - text: "🚪 Haustür geschlossen"
```

#### Alarm auf allen Displays
```yaml
automation:
  - alias: Alarm auf allen Displays
    trigger:
      - platform: state
        entity_id: alarm_control_panel.home_alarm
        to: triggered
    action:
      - action: ticker_display.show_alert
        data:
          device: all
          title: Alarm
          message: Bewegungsmelder ausgelöst
          severity: critical
          mode: fullscreen
          color: "#f44336"
          sound: alarm
          volume: 90
          duration: 12
          wake_screen: true
```

### 10) Hinweise

- `device` kann Geräte-ID, Gerätename, YAML-Liste oder `all` sein.
- Für TTS ist in vielen Setups der direkte Weg mit `tts_entity_id` + `media_player_entity_id` am zuverlässigsten.
- Bei `goto_screen` funktionieren je nach Setup IDs wie `screen_1` oder Namen wie `Screen 1`.
- Einige Aktionen benötigen passende vorhandene Entities, z. B. `camera.front_door`, `weather.home` oder `sensor.*`.
- Wenn eine Aktion nicht sichtbar reagiert, zuerst prüfen, ob das Gerät online und per WebSocket verbunden ist.

---

## Android-App bauen

Die Android-App liegt im Ordner:

```text
tickerdisplay_app/
```

### Technische Eckdaten
- Namespace: `de.tickerdisplay`
- `compileSdk`: 35
- `targetSdk`: 35
- `minSdk`: 23
- Kotlin + Android Views / ViewBinding
- Java 17 / Kotlin JVM Target 17

### Build in Android Studio

1. Ordner `tickerdisplay_app` in Android Studio öffnen.
2. Gradle synchronisieren.
3. Gerät oder Emulator wählen.
4. App bauen oder starten.

### Build per CLI

Linux/macOS:

```bash
cd tickerdisplay_app
./gradlew assembleDebug
```

Windows:

```bat
cd tickerdisplay_app
gradlew.bat assembleDebug
```

Die erzeugte APK liegt anschließend typischerweise unter:

```text
tickerdisplay_app/app/build/outputs/apk/debug/
```

### Android-Berechtigungen
Die App verwendet unter anderem:
- Internet / Netzwerkstatus
- WLAN-Status
- Wake Lock
- Boot Completed
- Kamera
- Foreground Service
- Vibration
- Overlay / System Alert Window
- Notifications

Diese Berechtigungen werden für Kiosk, Kamera, Live-Kommunikation, Benachrichtigungen und Watchdog-Funktionen benötigt.

---

## Projektstruktur

```text
custom_components/ticker_display/
├─ __init__.py                # Setup, Panel, Plattformen, Service-Registrierung
├─ manifest.json              # HA-Metadaten
├─ config_flow.py             # Config Flow + Options
├─ api.py                     # HTTP API
├─ websocket_api.py           # Live WebSocket-Kommunikation
├─ services.py                # Home Assistant Services
├─ coordinator.py             # Gerätezustand / Heartbeat / Updates
├─ media_manager.py           # Sounds, Fonts, Images, TTS-Dateien
├─ store.py                   # Persistente Konfigurationen
├─ renderer/                  # Screen Rendering
├─ display/                   # Frontend-Dateien für Display-Ausgabe
├─ frontend/dist/             # Admin Panel Assets
├─ translations/             # Übersetzungen
└─ services.yaml              # Dokumentation der Services

apk/
└─ Tickerdisplay.apk          # Vorgebaute Android-App

tickerdisplay_app/
├─ app/src/main/java/de/tickerdisplay/
│  ├─ MainActivity.kt         # Hauptanzeige / Kiosk / WebView
│  ├─ SetupActivity.kt        # Erstkonfiguration
│  ├─ SettingsActivity.kt     # Geräteeinstellungen
│  ├─ Core.kt                 # Prefs, API-Client, Hilfsklassen
│  ├─ CameraLive.kt           # Kamera-Funktionen
│  ├─ Sensors.kt              # Sensor-Berichte
│  ├─ Kiosk.kt                # Kiosk-Mechanik
│  ├─ VoiceAssistantService.kt# Sprach-/Assist-Funktionen
│  └─ ...
└─ gradle / build files
```

---

## Hinweise


### Sicherheit
- Die Android-App nutzt einen Long-Lived Access Token.
- Der Token sollte nur auf vertrauenswürdigen Geräten verwendet werden.


### Typischer Einsatz
- Wandtablet im Flur
- Küchen-Display
- Türstation / Kamera-Monitor
- Statusdisplay im Wohnzimmer
- Alarm- oder Info-Panel im Smart Home

### Kamera-Hinweis
Je nach Gerät und Berechtigungen können die Kamerafunktionen des Tablets verwendet sowie ein- und ausgeschaltet werden. Das ist nützlich für Kamera-Views, Live-Funktionen oder um die Kamera bewusst nur bei Bedarf aktiv zu halten.

---

# English

## Overview

Ticker Display extends Home Assistant with a central system for fixed or portable Android displays.

The project consists of two main parts:

1. **Custom component for Home Assistant**
   - Domain: `ticker_display`
   - Registers devices
   - Stores device configs, templates, alerts, and themes
   - Exposes REST-like HTTP endpoints
   - Exposes a WebSocket channel for real-time communication
   - Registers many Home Assistant services for automations

2. **Android app**
   - Runs in kiosk mode on Android
   - Connects to Home Assistant
   - Renders the display UI inside a WebView
   - Sends heartbeats, device status, and sensor data
   - Receives real-time commands via WebSocket
   - Can use audio, TTS, camera snapshots, and device controls

---

## Features

### Display
- Show Home Assistant dashboards
- Rotate through multiple screen types
- Render single values, clocks, images, weather, cameras, and status boards
- Manage themes, fonts, and media centrally
- Display a ticker bar with live messages or entity-based items

### Alerts / notifications
- Fullscreen, banner, overlay, toast, PiP, and notification modes
- Critical and informational alerts
- Sound, wake screen, acknowledgement, and progress support
- Alert templates and alert sequences

### Control / interaction
- Media control
- Brightness and screen power control
- Pause or resume screen rotation
- Identify a device visually
- Show popups and silent alerts
- Trigger entity actions

### Android / kiosk
- Kiosk mode
- Auto start on boot
- Watchdog service
- PIN-protected settings access
- Multiple gestures and shortcuts to access settings
- Optional camera and voice functions
- Tablet cameras can be enabled and disabled depending on setup

### Assist / media / sensors
- TTS and audio playback
- Microphone / voice integration
- Camera support
- Tablet cameras can be turned on and off for live features depending on setup
- Device sensors such as battery, Wi-Fi, storage, CPU, brightness, and more

---

## Architecture

```text
Home Assistant
 ├─ ticker_display integration
 │   ├─ Config Flow + Options
 │   ├─ Store / Templates / Themes / Alerts / Devices
 │   ├─ HTTP API (/ticker-display/api/...)
 │   ├─ WebSocket (/ticker-display/ws/{device_id})
 │   ├─ Services (show_alert, show_dashboard, tts_speak, ...)
 │   └─ Admin Panel (Ticker Display)
 │
 └─ Android app
     ├─ SetupActivity (URL + token + device)
     ├─ MainActivity (display / WebView / kiosk)
     ├─ Sensor and heartbeat reporting
     ├─ WebSocket client for live commands
     ├─ Audio / TTS / camera
     └─ Watchdog / boot receiver
```

### Communication model

1. The Android app connects to Home Assistant.
2. The app registers itself through the HTTP API.
3. The app sends regular heartbeats and device data.
4. Home Assistant stores configs and device state.
5. Automations or services send commands to the device.
6. Those commands are delivered in real time via WebSocket.
7. The Android app renders the screen or executes the action.

---

## Installation

### Requirements
- Home Assistant with `http` and `websocket_api`
- An Android device running Android 6.0+ (`minSdk 23`)
- Network connectivity between device and Home Assistant
- A Long-Lived Access Token for the Android app

### Option A: Install with HACS

1. Add this repository to HACS.
2. Search for **Ticker Display**.
3. Install the integration.
4. Restart Home Assistant.
5. Add the integration under **Settings → Devices & Services**.

### Option B: Manual installation

1. Download this repository.
2. Copy the folder `custom_components/ticker_display` to:

```text
/config/custom_components/ticker_display
```

3. Restart Home Assistant.
4. Add the integration under **Settings → Devices & Services**.

### Install the Android app

**Important:** Always install the **HACS/Home Assistant integration first and restart Home Assistant**.  
Only **after that** install the Android APK on the tablet or phone and sign in/connect it to Home Assistant.

You can either:

#### Use the prebuilt APK
The APK is included in this repository:

```text
apk/Tickerdisplay.apk
```

Install it on your Android device.

#### Build the app yourself
See [Building the Android app](#building-the-android-app).

---

## First-time setup

### 1. Add the integration to Home Assistant
After installation, the `Ticker Display` integration appears in Home Assistant. The config flow is intentionally lightweight and creates the integration without mandatory fields. You can optionally configure `heartbeat_timeout` afterwards.

**Recommended order:**
1. Install the integration via **HACS** or manually
2. **Fully restart Home Assistant**
3. Make sure **Ticker Display** is available under **Settings → Devices & Services**
4. Only then install the **APK on the Android device**
5. Launch the app and connect/sign in to Home Assistant

### 2. Launch the Android app
On first launch, the app walks through these steps:

1. Enter your Home Assistant URL
2. Paste or scan a Long-Lived Access Token
3. Test the connection
4. Define device name and device ID
5. Configure kiosk options
6. Finish setup

### 3. Register the device
The app registers with Home Assistant and fetches its config through:

```text
POST /ticker-display/api/device/register
GET  /ticker-display/api/device/{device_id}/config
```

### 4. Open the admin panel
After setup, the integration registers a built-in Home Assistant admin panel:

- Sidebar title: **Ticker Display**
- Frontend path: `ticker-display-admin`

This panel is used to manage devices, templates, alerts, themes, and global settings.

---

## How it works

### 1. Device management
The integration keeps track of each display, including configuration, heartbeat timestamps, and optional sensor/status data.

### 2. Screen rendering
The display page is served by the integration itself. The Android app loads that page inside a WebView.

Examples:

```text
/ticker-display/{device_id}
/ticker-display/preview/{device_id}
```

### 3. Real-time communication
Live commands are delivered via WebSocket:

```text
/ticker-display/ws/{device_id}
```

This includes commands such as:
- `show_alert`
- `show_dashboard`
- `show_camera`
- `set_brightness`
- `set_volume`
- `reload_page`
- `set_ticker_entities`

### 4. Home Assistant services as the automation layer
Most users will not call the API directly. Instead, they use Home Assistant services, which package commands and forward them internally to the right device.

### 5. Media and assets
Sounds, fonts, images, and TTS files are exposed through media endpoints and can be managed centrally.

### 6. Android as an active client
The Android app is not just a passive browser. It actively reports data such as:
- battery level
- Wi-Fi information
- storage
- CPU usage
- screen status
- camera availability
- camera status depending on device state/features
- app version
- orientation
- uptime

---


## The virtual device

Besides real Android devices, Ticker Display also supports a **virtual device**. This is especially useful for testing, browser previews, and building screens before a physical tablet is connected.

### What the virtual device is for

- testing screens, widgets, and themes in the browser
- preparing templates and layouts before a real device is set up
- using previews inside the admin panel
- developing content even when no tablet is online
- building and validating new setups faster

### How it works

The virtual device is created through the Home Assistant configuration/admin side and behaves like a display target for rendering, preview, and many configuration workflows.

Relevant endpoint:

```http
POST /ticker-display/api/config/device/virtual
```

After that, the virtual device can be used like a normal target in the admin panel or in screen/template workflows. It is especially useful together with:

- preview pages
- the visual editor
- templates
- theme testing
- screen rotation and layout testing

### Difference compared to a real tablet

A virtual device is great for preview and design work, but it does not replace all hardware functions of a real Android device. Things like:

- real audio playback
- on-device TTS
- screen on/off
- brightness control
- sensor values
- camera hardware
- microphone or kiosk functions

are generally tied to a real Android device.

### Typical workflow

1. Install the integration in Home Assistant
2. Create a virtual device in the admin area
3. Build screens, widgets, and themes in the editor
4. Test the preview
5. Then connect a real tablet through the APK
6. Use the prepared screens directly on the real device

## The visual editor

A particularly strong part of the project is the **built-in screen editor inside the admin panel**. It is not just a settings form — it is a real visual builder for designing and testing screens.

### What the editor can do

- **Drag-and-drop layout editor** for dashboard screens
- **Widget palette** with sensor, chart, smart-home, media, text, and layout widgets
- **Live preview** inside the editor plus a dedicated draft/preview mode in a new tab
- **Multi-select**, **align**, **distribute**, **match size**, **move**, and **resize** on a grid
- **Undo / redo** for editing steps
- **Duplicate** widgets and full screens
- **Save screens as templates** and re-apply them later
- **Presets / templates** for common setups like home, energy, security, family, or media

### Screen-level settings

When no widget is selected, the editor switches to full-screen settings. These include:

- **Screen type** such as dashboard, clock, weather, camera, or image
- **Transition effects** for screen changes
- **Background color** and **background image**
- **Image sizing**, overlay opacity, and background image removal
- **Full-screen weather effects**
- **Motion effects** for a more dynamic screen
- **Per-screen ticker override**, so one screen can have a different ticker configuration

### Widget editing

Once a widget is selected, the editor opens a property panel with multiple tabs.

#### General
- Change widget type
- Pick the main entity
- Add extra entities for multi-sensor or chart widgets
- Configure numeric formatting, decimal places, and trimming of trailing zeros
- Set display name, icon, and naming behavior
- Control position, size, column span, and row span
- Configure tap actions such as:
  - expand widget
  - open fullscreen popup
  - toggle a control
  - switch to another screen
  - open a URL

#### Style
- Font and font size
- Text and background colors
- Opacity, blur, and border radius
- Enable/disable animations
- Choose animation styles like `auto`, `soft`, `lively`, or `pulse`

#### Advanced
- **Custom CSS** per widget
- **Direct widget JSON editing**
- Copy widget JSON
- Duplicate or delete widgets

### Supported widget categories

The editor is not limited to a few simple tiles. The code includes many widget groups, including:

- **Value / status** widgets
- **Charts / graphs**
- **Smart home control** widgets
- **Text, list, and layout** widgets
- **Camera**, **weather**, **clock**, **image**
- **Countdown**, **button**, **QR code**, **web embed**, **color block**

That means the editor is not just a theme helper, but a full **screen builder** for complete dashboard pages.

### Advanced editor capabilities

Depending on the selected widget type, the editor also supports specialized features such as:

- **Entity meta editor** for aliases, name visibility, and chart series colors
- **Chart history / metric preview history**
- **Control layouts** such as compact or card-style controls
- **Background image picker** for screen backgrounds
- **Template system** for reusable screen configurations
- **Browser preview**, so you can validate a draft before using it on the device

### Why this matters

Many similar projects require handwritten YAML or direct JSON editing. This project adds a proper **visual editor** on top, while still allowing advanced users to go down to raw JSON and custom CSS when needed.


## Home Assistant services

The integration registers many services under `ticker_display.*`.

### Main screen services
- `ticker_display.show_dashboard`
- `ticker_display.show_graph`
- `ticker_display.show_camera`
- `ticker_display.show_weather`
- `ticker_display.show_single_value`
- `ticker_display.show_clock`
- `ticker_display.show_status_board`
- `ticker_display.show_image`
- `ticker_display.show_template`

### Alerts and notifications
- `ticker_display.show_alert`
- `ticker_display.show_alert_template`
- `ticker_display.show_alert_sequence`
- `ticker_display.show_notification`
- `ticker_display.show_toast`
- `ticker_display.show_silent_alert`
- `ticker_display.clear_alert`

### Ticker
- `ticker_display.send_ticker_message`
- `ticker_display.set_ticker_entities`
- `ticker_display.clear_ticker`
- `ticker_display.update_ticker_config`

### Device control
- `ticker_display.set_screen_power`
- `ticker_display.set_brightness`
- `ticker_display.set_theme`
- `ticker_display.set_volume`
- `ticker_display.set_screen_orientation`
- `ticker_display.next_screen`
- `ticker_display.previous_screen`
- `ticker_display.goto_screen`
- `ticker_display.pause_rotation`
- `ticker_display.resume_rotation`
- `ticker_display.reload_page`
- `ticker_display.identify_device`

### Audio / media
- `ticker_display.play_sound`
- `ticker_display.play_announcement`
- `ticker_display.tts_speak`
- `ticker_display.stop_audio`
- `ticker_display.play_media`
- `ticker_display.stop_media`

### Popup / entity actions
- `ticker_display.show_popup`
- `ticker_display.dismiss_popup`
- `ticker_display.entity_toggle`
- `ticker_display.entity_action`

### Example: show a dashboard

```yaml
service: ticker_display.show_dashboard
data:
  device: livingroom_tablet
  dashboard: /lovelace/default_view
```

### Example: show a critical alert

```yaml
service: ticker_display.show_alert
data:
  device: livingroom_tablet
  title: Smoke detector
  message: Smoke detected in the basement
  severity: critical
  mode: fullscreen
  sound: alarm_critical
  volume: 100
  wake_screen: true
  require_ack: true
  ack_label: Acknowledge
```

### Example: send a ticker message

```yaml
service: ticker_display.send_ticker_message
data:
  device: livingroom_tablet
  message: Welcome home 👋
  icon: "📢"
  color: "#f3f4f6"
  duration: 15
```

### Example: speak via TTS

```yaml
service: ticker_display.tts_speak
data:
  device: livingroom_tablet
  message: The washing machine is finished.
  language: en-US
  volume: 70
```

---

## HTTP API

The integration exposes a set of custom HTTP endpoints under:

```text
/ticker-display/api/
```

> Note: The API is primarily intended for the Android app, the admin panel, and internal frontend components. Most users will only need Home Assistant services.

### Devices

#### Register device
```http
POST /ticker-display/api/device/register
```

Typical purpose:
- register a new device
- send metadata
- create the initial mapping inside Home Assistant

#### Send heartbeat
```http
POST /ticker-display/api/device/heartbeat
```

Typical purpose:
- mark device as online
- update sensor and state information

#### Send device event
```http
POST /ticker-display/api/device/event
```

#### Fetch device config
```http
GET /ticker-display/api/device/{device_id}/config
```

#### Delete device
```http
DELETE /ticker-display/api/device/{device_id}
```

### Rendering

#### Load display page
```http
GET /ticker-display/{device_id}
GET /ticker-display/preview/{device_id}
```

### Media / assets

#### List media
```http
GET /ticker-display/api/media/sounds
GET /ticker-display/api/media/fonts
GET /ticker-display/api/media/images
```

#### Upload media
```http
POST /ticker-display/api/media/sound/upload
POST /ticker-display/api/media/font/upload
POST /ticker-display/api/media/image/upload
```

#### Delete media
```http
DELETE /ticker-display/api/media/sound/{item_id}
DELETE /ticker-display/api/media/font/{item_id}
DELETE /ticker-display/api/media/image/{item_id}
```

#### Served media files
```http
GET /ticker-display/media/sounds/{filename}
GET /ticker-display/media/fonts/{filename}
GET /ticker-display/media/images/{filename}
GET /ticker-display/media/tts/{filename}
```

### Home Assistant data access

```http
GET  /ticker-display/api/image/camera/{entity_id}
POST /ticker-display/api/camera/upload
GET  /ticker-display/api/history/{entity_id}
GET  /ticker-display/api/weather/{entity_id}
GET  /ticker-display/api/states/{entity_id}
GET  /ticker-display/api/entity/{entity_id}
GET  /ticker-display/api/entity/{entity_id}/capabilities
POST /ticker-display/api/entity/toggle
POST /ticker-display/api/entity/service
POST /ticker-display/api/entity/action
GET  /ticker-display/api/media-player/{entity_id}
POST /ticker-display/api/media-player/{entity_id}/command
GET  /ticker-display/api/persons
GET  /ticker-display/api/entities
GET  /ticker-display/api/ha-media/items
```

### Configuration / admin

```http
GET    /ticker-display/api/config/devices
POST   /ticker-display/api/config/device/virtual
GET    /ticker-display/api/config/device/{device_id}
POST   /ticker-display/api/config/device/{device_id}
GET    /ticker-display/api/config/templates
POST   /ticker-display/api/config/template
DELETE /ticker-display/api/config/template/{template_id}
GET    /ticker-display/api/config/alerts
POST   /ticker-display/api/config/alert
DELETE /ticker-display/api/config/alert/{alert_id}
GET    /ticker-display/api/config/themes
POST   /ticker-display/api/config/theme
DELETE /ticker-display/api/config/theme/{theme_id}
GET    /ticker-display/api/config/global
POST   /ticker-display/api/config/global
POST   /ticker-display/api/config/backup
POST   /ticker-display/api/config/restore
```

### Example API flow

#### Register a device
```bash
curl -X POST "http://HOMEASSISTANT:8123/ticker-display/api/device/register" \
  -H "Authorization: Bearer YOUR_LONG_LIVED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "livingroom_tablet",
    "name": "Living Room Tablet",
    "model": "Samsung Tab A",
    "android_version": "14",
    "screen_resolution": "1920x1200"
  }'
```

#### Fetch device config
```bash
curl -X GET "http://HOMEASSISTANT:8123/ticker-display/api/device/livingroom_tablet/config" \
  -H "Authorization: Bearer YOUR_LONG_LIVED_TOKEN"
```

#### Trigger an entity action
```bash
curl -X POST "http://HOMEASSISTANT:8123/ticker-display/api/entity/action" \
  -H "Authorization: Bearer YOUR_LONG_LIVED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "light.living_room",
    "action": "turn_on",
    "data": {"brightness": 180}
  }'
```

---

## WebSocket API

WebSocket endpoint:

```text
/ticker-display/ws/{device_id}
```

The Android app connects to this endpoint and receives live commands.

### Typical messages

#### Show a screen
```json
{
  "type": "command",
  "command": "show_dashboard",
  "data": {
    "dashboard": "/lovelace/default_view"
  }
}
```

#### Set display brightness
```json
{
  "type": "display_control",
  "brightness": 80
}
```

#### Set audio volume
```json
{
  "type": "audio",
  "action": "set_volume",
  "volume": 50
}
```

#### Send an alert
```json
{
  "type": "command",
  "command": "show_alert",
  "data": {
    "title": "Doorbell",
    "message": "Someone is at the front door",
    "severity": "warning",
    "mode": "fullscreen",
    "sound": "doorbell"
  }
}
```

### Why WebSocket?
- Instant reactions without polling
- Per-device targeted delivery
- Bidirectional communication
- Ideal for live alerts, ticker updates, and device control

---

## Automation examples

The following examples intentionally mirror the structure of the provided test actions file so they can be copied directly into Home Assistant under **Developer Tools → Actions** or used as a base for automations.

**Test device used in the examples:** `tablet01`

**Note:** Most examples below are shown first as direct service/action calls and then as complete automation examples.

### 1) Dashboard / Screen content

#### Show dashboard
```yaml
action: ticker_display.show_dashboard
data:
  device: tablet01
  dashboard: /lovelace/default_view
```

#### Show graph
```yaml
action: ticker_display.show_graph
data:
  device: tablet01
  entity_id: sensor.stromverbrauch_heute
```

#### Show graph by saved graph_id
```yaml
action: ticker_display.show_graph
data:
  device: tablet01
  graph_id: energy_today
```

#### Show camera
```yaml
action: ticker_display.show_camera
data:
  device: tablet01
  entity_id: camera.front_door
  title: Front door
```

#### Show weather
```yaml
action: ticker_display.show_weather
data:
  device: tablet01
  entity_id: weather.home
```

#### Show single value
```yaml
action: ticker_display.show_single_value
data:
  device: tablet01
  entity_id: sensor.wohnzimmer_temperatur
  label: Living room
```

#### Show clock
```yaml
action: ticker_display.show_clock
data:
  device: tablet01
```

#### Show status board
```yaml
action: ticker_display.show_status_board
data:
  device: tablet01
  board_id: daily_status
```

#### Show image
```yaml
action: ticker_display.show_image
data:
  device: tablet01
  image_url: /media/local/family.jpg
  title: Family photo
```

#### Show template
```yaml
action: ticker_display.show_template
data:
  device: tablet01
  template_id: template_livingroom
```

### 2) Alerts / Notifications / Popups

#### Show alert (fullscreen)
```yaml
action: ticker_display.show_alert
data:
  device: tablet01
  title: "Doorbell"
  message: "Someone is standing at the front door"
  severity: warning
  mode: fullscreen
  color: "#ff9800"
  duration: 10
  wake_screen: true
```

#### Show alert with sound
```yaml
action: ticker_display.show_alert
data:
  device: tablet01
  title: Alarm
  message: Motion sensor triggered
  severity: critical
  mode: fullscreen
  color: "#f44336"
  sound: alarm
  volume: 90
  duration: 12
  wake_screen: true
```

#### Show alert with progress
```yaml
action: ticker_display.show_alert
data:
  device: tablet01
  title: Backup running
  message: Backup is currently being processed
  severity: info
  mode: banner
  color: "#2196f3"
  progress_value: 65
  progress_text: "2 of 3 completed"
  duration: 0
```

#### Show alert with buttons
```yaml
action: ticker_display.show_alert
data:
  device: tablet01
  title: Camera motion
  message: Motion detected at the front door
  severity: warning
  mode: overlay
  require_ack: true
  ack_label: Confirm
  secondary_label: Close
  actions:
    - id: open_cam
      label: Camera
    - id: dismiss
      label: Ignore
```

#### Show alert template
```yaml
action: ticker_display.show_alert_template
data:
  device: tablet01
  template_id: doorbell
  title: Front door
  message: Delivery person detected
  severity: warning
  mode: overlay
```

#### Show alert sequence
```yaml
action: ticker_display.show_alert_sequence
data:
  device: tablet01
  alerts:
    - title: Door
      message: Someone is there
      duration: 5
    - title: Garage
      message: Door open
      mode: banner
      duration: 5
```

#### Show notification
```yaml
action: ticker_display.show_notification
data:
  device: tablet01
  title: Info
  message: Washing machine finished
  color: "#2196f3"
```

#### Show toast
```yaml
action: ticker_display.show_toast
data:
  device: tablet01
  title: Info
  message: Welcome home
  duration: 6
  color: "#111827"
  text_color: "#f9fafb"
  accent_color: "#60a5fa"
  border_radius: 16
  font_size: 16
  position: bottom
  wake_screen: true
```

#### Clear alert
```yaml
action: ticker_display.clear_alert
data:
  device: tablet01
```

#### Clear alert by tag
```yaml
action: ticker_display.clear_alert
data:
  device: tablet01
  tag: frontdoor
```

#### Show popup
```yaml
action: ticker_display.show_popup
data:
  device: tablet01
  popup_type: widget
  entity_id: light.wohnzimmer
  title: Control
```

#### Dismiss popup
```yaml
action: ticker_display.dismiss_popup
data:
  device: tablet01
```

#### Show silent alert
```yaml
action: ticker_display.show_silent_alert
data:
  device: tablet01
  title: Hint
  message: Silent warning
  severity: info
  mode: banner
  duration: 5
```

### 3) Ticker bar

#### Send single ticker message
```yaml
action: ticker_display.send_ticker_message
data:
  device: tablet01
  message: "Welcome home 👋"
```

#### Send ticker message with replace and duration
```yaml
action: ticker_display.send_ticker_message
data:
  device: tablet01
  message: "🌡️ Living room 22°C"
  color: "#f3f4f6"
  icon: "📢"
  replace: true
  duration: 15
```

#### Send multiple ticker messages
```yaml
action: ticker_display.send_ticker_message
data:
  device: tablet01
  messages:
    - text: "🌡️ Living room 22°C"
    - text: "⚡ Power price 26 ct/kWh"
    - text: "🚪 Front door closed"
```

#### Set ticker entities
```yaml
action: ticker_display.set_ticker_entities
data:
  device: tablet01
  entities:
    - entity_id: sensor.wohnzimmer_temperatur
      template: "🌡️ Living room: {state} {unit}"
    - entity_id: sensor.strompreis
      template: "⚡ Power price: {state} ct/kWh"
```

#### Clear ticker
```yaml
action: ticker_display.clear_ticker
data:
  device: tablet01
```

#### Update ticker config
```yaml
action: ticker_display.update_ticker_config
data:
  device: tablet01
  enabled: true
  direction: ltr
  speed: normal
  style_template: minimal
  height: 36
  font_size: 14
  auto_hide_seconds: 15
```

### 4) Display / Theming / Power

#### Screen on
```yaml
action: ticker_display.set_screen_power
data:
  device: tablet01
  power: true
```

#### Screen off
```yaml
action: ticker_display.set_screen_power
data:
  device: tablet01
  power: false
```

#### Set brightness
```yaml
action: ticker_display.set_brightness
data:
  device: tablet01
  brightness: 80
```

#### Set dark theme
```yaml
action: ticker_display.set_theme
data:
  device: tablet01
  mode: dark
  accent: "#4f46e5"
```

#### Set light theme
```yaml
action: ticker_display.set_theme
data:
  device: tablet01
  mode: light
  accent: "#0ea5e9"
```

#### Set screen orientation portrait
```yaml
action: ticker_display.set_screen_orientation
data:
  device: tablet01
  orientation: 0
```

#### Set screen orientation landscape
```yaml
action: ticker_display.set_screen_orientation
data:
  device: tablet01
  orientation: 90
```

### 5) Audio / Sound / Media / TTS

#### Set volume
```yaml
action: ticker_display.set_volume
data:
  device: tablet01
  volume: 50
```

#### Play internal sound
```yaml
action: ticker_display.play_sound
data:
  device: tablet01
  sound: doorbell
  volume: 100
```

#### Play sound URL
```yaml
action: ticker_display.play_sound
data:
  device: tablet01
  sound_url: /media/local/chime.mp3
  volume: 80
  loop: false
```

#### Play announcement URL
```yaml
action: ticker_display.play_announcement
data:
  device: tablet01
  url: /media/local/doorbell.mp3
  volume: 90
  title: Door chime
```

#### Play announcement internal sound
```yaml
action: ticker_display.play_announcement
data:
  device: tablet01
  sound: ding
  volume: 80
  title: Notice
```

#### TTS speak via ticker_display
```yaml
action: ticker_display.tts_speak
data:
  device: tablet01
  message: "The dishwasher is finished."
  language: en-US
  volume: 75
```

#### TTS speak via HA TTS entity + media player
```yaml
action: ticker_display.tts_speak
data:
  device: tablet01
  media_player_entity_id: media_player.tablet01_speaker
  tts_entity_id: tts.piper_2
  message: "The dishwasher is finished."
  language: en-US
  volume: 75
```

#### Stop audio
```yaml
action: ticker_display.stop_audio
data:
  device: tablet01
```

#### Play media
```yaml
action: ticker_display.play_media
data:
  device: tablet01
  media_url: /media/local/song.mp3
  volume: 70
  loop: false
```

#### Stop media
```yaml
action: ticker_display.stop_media
data:
  device: tablet01
```

#### Media next
```yaml
action: ticker_display.media_next
data:
  device: tablet01
```

#### Media previous
```yaml
action: ticker_display.media_previous
data:
  device: tablet01
```

#### Media pause
```yaml
action: ticker_display.media_pause
data:
  device: tablet01
```

#### Media resume
```yaml
action: ticker_display.media_resume
data:
  device: tablet01
```

### 6) Screen navigation / Rotation / Page

#### Next screen
```yaml
action: ticker_display.next_screen
data:
  device: tablet01
```

#### Previous screen
```yaml
action: ticker_display.previous_screen
data:
  device: tablet01
```

#### Go to screen by ID
```yaml
action: ticker_display.goto_screen
data:
  device: tablet01
  screen_id: screen_3
```

#### Go to screen by name
```yaml
action: ticker_display.goto_screen
data:
  device: tablet01
  screen_id: Screen 3
```

#### Pause rotation
```yaml
action: ticker_display.pause_rotation
data:
  device: tablet01
```

#### Resume rotation
```yaml
action: ticker_display.resume_rotation
data:
  device: tablet01
```

#### Reload page
```yaml
action: ticker_display.reload_page
data:
  device: tablet01
```

#### Identify device
```yaml
action: ticker_display.identify_device
data:
  device: tablet01
```

### 7) Entity actions

#### Entity toggle
```yaml
action: ticker_display.entity_toggle
data:
  device: tablet01
  entity_id: light.wohnzimmer
```

#### Entity turn_on
```yaml
action: ticker_display.entity_action
data:
  device: tablet01
  entity_id: light.wohnzimmer
  action: turn_on
  data:
    brightness: 128
```

#### Entity turn_off
```yaml
action: ticker_display.entity_action
data:
  device: tablet01
  entity_id: light.wohnzimmer
  action: turn_off
```

### 8) Tests for all devices

#### Ticker to all devices
```yaml
action: ticker_display.send_ticker_message
data:
  device: all
  message: "Test to all devices"
```

#### Alert to all devices
```yaml
action: ticker_display.show_alert
data:
  device: all
  title: Broadcast test
  message: This message is sent to all connected displays
  severity: info
  mode: banner
  duration: 8
```

### 9) Complete automations

#### Doorbell with alert + camera
```yaml
automation:
  - alias: Doorbell on tablet
    trigger:
      - platform: state
        entity_id: binary_sensor.doorbell
        to: "on"
    action:
      - action: ticker_display.show_alert
        data:
          device: tablet01
          title: "Doorbell"
          message: "Someone is standing at the front door"
          severity: warning
          mode: fullscreen
          color: "#ff9800"
          duration: 10
          wake_screen: true
      - action: ticker_display.show_camera
        data:
          device: tablet01
          entity_id: camera.front_door
          title: Front door
```

#### Washing machine finished as toast
```yaml
automation:
  - alias: Washing machine finished on display
    trigger:
      - platform: state
        entity_id: binary_sensor.waschmaschine_fertig
        to: "on"
    action:
      - action: ticker_display.show_toast
        data:
          device: tablet01
          title: Info
          message: Washing machine finished
          duration: 6
          color: "#111827"
          text_color: "#f9fafb"
          accent_color: "#60a5fa"
          border_radius: 16
          font_size: 16
          position: bottom
          wake_screen: true
```

#### Good morning ticker
```yaml
automation:
  - alias: Good morning ticker
    trigger:
      - platform: time
        at: "06:30:00"
    action:
      - action: ticker_display.send_ticker_message
        data:
          device: tablet01
          messages:
            - text: "☀️ Good morning"
            - text: "🌡️ Living room 22°C"
            - text: "🚪 Front door closed"
```

#### Alarm on all displays
```yaml
automation:
  - alias: Alarm on all displays
    trigger:
      - platform: state
        entity_id: alarm_control_panel.home_alarm
        to: triggered
    action:
      - action: ticker_display.show_alert
        data:
          device: all
          title: Alarm
          message: Motion sensor triggered
          severity: critical
          mode: fullscreen
          color: "#f44336"
          sound: alarm
          volume: 90
          duration: 12
          wake_screen: true
```

### 10) Notes

- `device` can be a device ID, device name, YAML list, or `all`.
- For TTS, using `tts_entity_id` together with `media_player_entity_id` is often the most reliable setup.
- For `goto_screen`, depending on setup, IDs like `screen_1` or names like `Screen 1` may work.
- Some actions require valid existing entities, for example `camera.front_door`, `weather.home`, or matching `sensor.*` entities.
- If an action does not visibly react, first check whether the device is online and connected via WebSocket.

---

## Building the Android app

The Android application is located in:

```text
tickerdisplay_app/
```

### Technical details
- Namespace: `de.tickerdisplay`
- `compileSdk`: 35
- `targetSdk`: 35
- `minSdk`: 23
- Kotlin + Android Views / ViewBinding
- Java 17 / Kotlin JVM target 17

### Build in Android Studio

1. Open the `tickerdisplay_app` folder in Android Studio.
2. Sync Gradle.
3. Select a device or emulator.
4. Build or run the app.

### Build from CLI

Linux/macOS:

```bash
cd tickerdisplay_app
./gradlew assembleDebug
```

Windows:

```bat
cd tickerdisplay_app
gradlew.bat assembleDebug
```

The generated APK is typically located at:

```text
tickerdisplay_app/app/build/outputs/apk/debug/
```

### Android permissions
The app uses, among others:
- Internet / network state
- Wi-Fi state
- Wake lock
- Boot completed
- Camera
- Foreground service
- Vibration
- Overlay / system alert window
- Notifications

These permissions are required for kiosk mode, camera, live communication, notifications, and watchdog functionality.

---

## Project structure

```text
custom_components/ticker_display/
├─ __init__.py                # Setup, panel, platforms, service registration
├─ manifest.json              # HA metadata
├─ config_flow.py             # Config flow + options
├─ api.py                     # HTTP API
├─ websocket_api.py           # Real-time WebSocket communication
├─ services.py                # Home Assistant services
├─ coordinator.py             # Device state / heartbeat / updates
├─ media_manager.py           # Sounds, fonts, images, TTS files
├─ store.py                   # Persistent configuration
├─ renderer/                  # Screen rendering
├─ display/                   # Frontend files for display output
├─ frontend/dist/             # Admin panel assets
├─ translations/              # Translations
└─ services.yaml              # Service docs

apk/
└─ Tickerdisplay.apk          # Prebuilt Android app

tickerdisplay_app/
├─ app/src/main/java/de/tickerdisplay/
│  ├─ MainActivity.kt         # Main display / kiosk / WebView
│  ├─ SetupActivity.kt        # First-time configuration
│  ├─ SettingsActivity.kt     # Device settings
│  ├─ Core.kt                 # Prefs, API client, helper classes
│  ├─ CameraLive.kt           # Camera functions
│  ├─ Sensors.kt              # Sensor reporting
│  ├─ Kiosk.kt                # Kiosk logic
│  ├─ VoiceAssistantService.kt# Voice / assist functions
│  └─ ...
└─ gradle / build files
```

---

## Notes



### Typical use cases
- hallway wall tablet
- kitchen dashboard
- door station / camera monitor
- living room status display
- alarm or information panel in a smart home

### Camera note
Depending on device permissions and setup, the tablet cameras can be used and can also be enabled or disabled. This is useful for camera views, live features, or keeping the camera active only when needed.
