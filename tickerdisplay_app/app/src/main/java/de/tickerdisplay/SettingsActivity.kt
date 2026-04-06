package de.tickerdisplay

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class SettingsActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        prefs = Prefs(this)

        setupField(R.id.setting_ha_url, "HA URL", prefs.haUrl, "Adresse deiner Home-Assistant-Instanz, z. B. https://ha.local:8123") {
            prefs.haUrl = it.trim()
        }
        setupField(R.id.setting_device_id, "Geräte-ID", prefs.deviceId, "Eindeutige Kennung dieses Displays in Home Assistant") {
            prefs.deviceId = it.trim()
        }
        setupField(R.id.setting_device_name, "Gerätename", prefs.deviceName, "Anzeigename des Smartphones oder Tablets in Home Assistant") {
            prefs.deviceName = it.trim()
        }
        setupField(R.id.setting_interval, "Sendeintervall", "${prefs.reportInterval} Sekunden", "Wie oft Sensoren und Status an Home Assistant gesendet werden") {
            val parsed = it.filter { ch -> ch.isDigit() }.toIntOrNull()?.coerceIn(15, 3600) ?: prefs.reportInterval
            prefs.reportInterval = parsed
            recreate()
        }
        setupSwitch(R.id.setting_kiosk, "Kiosk-Modus", prefs.kioskEnabled, "Sperrt die App im Wallpanel-Modus.") { prefs.kioskEnabled = it }
        setupSwitch(R.id.setting_autostart, "Autostart", prefs.autoStart, "Startet die App nach dem Gerätestart erneut.") { prefs.autoStart = it }
        setupSwitch(R.id.setting_screen_on, "Display wach halten", prefs.screenOn, "Hält den Bildschirm aktiv, solange die App läuft.") { prefs.screenOn = it }
        setupSwitch(R.id.setting_burnin, "Burn-in-Schutz", prefs.burnIn, "Aktiviert kleine Schutzbewegungen gegen Einbrennen.") { prefs.burnIn = it }
        setupSwitch(R.id.setting_light, "Lichtsensor", prefs.lightSensor, "Sendet Helligkeitswerte des Geräts.") { prefs.lightSensor = it }
        setupSwitch(R.id.setting_motion, "Bewegungs-Erkennung", prefs.motionDetect, "Reserviert für spätere Bewegungs-/Anwesenheitserkennung.") { prefs.motionDetect = it }
        setupSwitch(R.id.setting_sensor_battery_details, "Erweiterte Batteriesensoren", prefs.sensorBatteryDetails, "Zusätzliche Batterie- und Ladeinformationen an Home Assistant senden.") { prefs.sensorBatteryDetails = it }
        setupSwitch(R.id.setting_sensor_network_details, "Erweiterte Netzwerksensoren", prefs.sensorNetworkDetails, "WLAN-, SSID-, Link-Speed- und Netzwerktyp-Sensoren senden.") { prefs.sensorNetworkDetails = it }
        setupSwitch(R.id.setting_sensor_storage_details, "Speicher- und RAM-Sensoren", prefs.sensorStorageDetails, "Freien Speicher, RAM und belegten Speicher senden.") { prefs.sensorStorageDetails = it }
        setupSwitch(R.id.setting_sensor_audio_details, "Audio-Sensoren", prefs.sensorAudioDetails, "Lautstärke und Klingelmodus an Home Assistant senden.") { prefs.sensorAudioDetails = it }
        setupSwitch(R.id.setting_front_camera, "Frontkamera melden", prefs.frontCameraEnabled, "Meldet die Frontkamera als aktivierte Gerätefunktion an Home Assistant.") { enabled -> if (enabled) ensureCameraPermission(); prefs.frontCameraEnabled = enabled }
        setupSwitch(R.id.setting_back_camera, "Rückkamera melden", prefs.backCameraEnabled, "Meldet die Rückkamera als aktivierte Gerätefunktion an Home Assistant.") { enabled -> if (enabled) ensureCameraPermission(); prefs.backCameraEnabled = enabled }
        setupSwitch(R.id.setting_camera_silent, "Stille Kamera", prefs.cameraSilentMode, "Verwendet stille Vorschau-Frames statt hörbarer Foto-Auslösung.") { prefs.cameraSilentMode = it }
        setupSwitch(R.id.setting_camera_manual_only, "Nur manuell aktualisieren", prefs.cameraManualOnly, "Sendet Kamerabilder nur auf Knopfdruck statt automatisch im Intervall.") { prefs.cameraManualOnly = it }
        setupField(R.id.setting_camera_interval, "Kamera-Intervall", "${prefs.cameraIntervalSeconds} Sekunden", "Intervall für die stille Vorschau-Übertragung") {
            val parsed = it.filter { ch -> ch.isDigit() }.toIntOrNull()?.coerceIn(5, 300) ?: prefs.cameraIntervalSeconds
            prefs.cameraIntervalSeconds = parsed
            recreate()
        }
        findViewById<Button>(R.id.btn_change_pin).setOnClickListener { changePin() }
        findViewById<Button>(R.id.btn_camera_snapshot_now).setOnClickListener {
            ensureCameraPermission()
            val api = ApiClient(prefs)
            if (prefs.frontCameraEnabled) CameraSnapshotUploader(this, api, prefs, CameraFacing.FRONT).triggerManualUpload()
            if (prefs.backCameraEnabled) CameraSnapshotUploader(this, api, prefs, CameraFacing.BACK).triggerManualUpload()
            Toast.makeText(this, "Kamera-Aktualisierung gestartet", Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.btn_clear_cache).setOnClickListener {
            android.webkit.WebView(this).clearCache(true)
            Toast.makeText(this, "Cache gelöscht", Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.btn_reload).setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            })
            finish()
        }
        findViewById<Button>(R.id.btn_restart_app).setOnClickListener {
            packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                startActivity(intent)
                finishAffinity()
            }
        }
        findViewById<Button>(R.id.btn_android_settings).setOnClickListener { openAndroidSettings() }
        findViewById<Button>(R.id.btn_reregister).setOnClickListener { confirmReregister() }
        findViewById<Button>(R.id.btn_reset).setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("App komplett zurücksetzen?")
                .setMessage("Alle App-Einstellungen löschen. Home Assistant Konfiguration in der Integration bleibt erhalten.")
                .setPositiveButton("Ja") { _, _ ->
                    prefs.clear()
                    startActivity(Intent(this, SetupActivity::class.java))
                    finishAffinity()
                }
                .setNegativeButton("Nein", null)
                .show()
        }
        findViewById<Button>(R.id.btn_back).setOnClickListener { finish() }

        findViewById<TextView>(R.id.setting_info).text = buildInfoText()
    }

    override fun onDestroy() {
        super.onDestroy()
    }

    private fun ensureMicrophonePermission() {
        val permission = android.Manifest.permission.RECORD_AUDIO
        if (ContextCompat.checkSelfPermission(this, permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(permission), 2202)
        }
    }

    private fun ensureCameraPermission() {
        val permission = android.Manifest.permission.CAMERA
        if (ContextCompat.checkSelfPermission(this, permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(permission), 2201)
        }
    }

    private fun buildInfoText(): String {
        return """
            Ticker Display v2.1.2
            ID: ${prefs.deviceId}
            URL: ${prefs.displayUrl}
            Android: ${U.getAndroidVersion()}
            Gerät: ${U.getDeviceModel()}
            Auflösung: ${U.getScreenRes(this)}
            Netzwerk: ${U.getNetworkType(this)} / ${U.getWifiSsid(this)}
            Audio/TTS: Home Assistant Audio an den Lautsprecher
            Frontkamera: ${if (prefs.frontCameraEnabled) "aktiv" else "aus"}
            Rückkamera: ${if (prefs.backCameraEnabled) "aktiv" else "aus"}
            Kameramodus: ${if (prefs.cameraManualOnly) "manuell" else "auto ${prefs.cameraIntervalSeconds}s"}
            Stille Kamera: ${if (prefs.cameraSilentMode) "ja" else "nein"}
        """.trimIndent()
    }

    private fun setupField(id: Int, label: String, value: String, description: String, onSave: (String) -> Unit) {
        val view = findViewById<LinearLayout>(id)
        val labelView = view.getChildAt(0) as? TextView
        val valueView = view.getChildAt(1) as? TextView
        labelView?.text = label
        valueView?.text = if (value.isBlank()) description else value
        view.setOnClickListener {
            val et = EditText(this).apply {
                setText(value)
                setTextColor(getColor(R.color.td_text))
                setHintTextColor(getColor(R.color.td_text_muted))
                setBackgroundResource(R.drawable.bg_input)
                setPadding(32, 24, 32, 24)
                hint = description
                if (label.contains("Intervall") || label.contains("Geschwindigkeit") || label.contains("Stimme")) {
                    inputType = InputType.TYPE_CLASS_NUMBER
                }
            }
            AlertDialog.Builder(this)
                .setTitle(label)
                .setMessage(description)
                .setView(et)
                .setPositiveButton("Speichern") { _, _ ->
                    onSave(et.text.toString())
                    recreate()
                }
                .setNegativeButton("Abbrechen", null)
                .show()
        }
    }

    private fun setupSwitch(id: Int, label: String, checked: Boolean, description: String, onChange: (Boolean) -> Unit) {
        val sw = findViewById<Switch>(id)
        sw.text = "$label\n$description"
        sw.isChecked = checked
        sw.setOnCheckedChangeListener { _, isChecked -> onChange(isChecked) }
    }

    private fun changePin() {
        val et = EditText(this).apply {
            hint = "Neuer PIN"
            inputType = InputType.TYPE_CLASS_NUMBER
            setBackgroundResource(R.drawable.bg_input)
            setPadding(32, 24, 32, 24)
        }
        AlertDialog.Builder(this)
            .setTitle("PIN ändern")
            .setMessage("Der PIN schützt den Zugang zu den Einstellungen im Kiosk-Modus.")
            .setView(et)
            .setPositiveButton("Speichern") { _, _ ->
                val pin = et.text.toString()
                if (pin.length >= 4) {
                    prefs.kioskPin = pin
                    Toast.makeText(this, "PIN geändert", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "PIN muss mindestens 4 Ziffern haben", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun confirmReregister() {
        AlertDialog.Builder(this)
            .setTitle("Display neu anmelden?")
            .setMessage("Die App startet wieder in die Inbetriebnahme. Gerätename, ID und URL bleiben als Vorschlag erhalten und können dort angepasst werden.")
            .setPositiveButton("Weiter") { _, _ ->
                prefs.setupDone = false
                startActivity(Intent(this, SetupActivity::class.java))
                finishAffinity()
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    private fun openAndroidSettings() {
        val intents = mutableListOf(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            },
            Intent(Settings.ACTION_SETTINGS)
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            intents.add(Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            })
        }
        for (intent in intents) {
            try {
                startActivity(intent)
                return
            } catch (_: Exception) {
            }
        }
        Toast.makeText(this, "Systemeinstellungen konnten nicht geöffnet werden", Toast.LENGTH_SHORT).show()
    }
}
