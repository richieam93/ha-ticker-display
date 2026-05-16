package de.tickerdisplay

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

class SetupActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private var step = 0

    private lateinit var title: TextView
    private lateinit var desc: TextView
    private lateinit var container: LinearLayout
    private lateinit var btnNext: Button
    private lateinit var btnBack: Button
    private lateinit var btnScanQr: Button
    private lateinit var status: TextView

    private var inputUrl: EditText? = null
    private var inputToken: EditText? = null
    private var inputDeviceName: EditText? = null
    private var inputDeviceId: EditText? = null

    // QR-Code Scanner
    private val qrScanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            // Token aus QR-Code übernehmen
            inputToken?.setText(result.contents)
            status.text = "Token aus QR-Code übernommen."
            L.i("Setup", "QR-Code scanned: ${result.contents.take(20)}...")
        } else {
            status.text = "QR-Code-Scan abgebrochen."
        }
    }

    // Kamera-Permission
    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            startQrScanner()
        } else {
            status.text = "Kamera-Berechtigung wird für den QR-Scan benötigt."
            Toast.makeText(this, "Kamera-Berechtigung wird für QR-Scan benötigt", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        prefs = Prefs(this)
        L.init(this)

        title = findViewById(R.id.step_title)
        desc = findViewById(R.id.step_description)
        container = findViewById(R.id.input_container)
        btnNext = findViewById(R.id.btn_next)
        btnBack = findViewById(R.id.btn_back)
        btnScanQr = findViewById(R.id.btn_scan_qr)
        status = findViewById(R.id.status_text)

        btnNext.setOnClickListener { next() }
        btnBack.setOnClickListener { if (step > 0) show(step - 1) }
        btnScanQr.setOnClickListener { checkCameraPermissionAndScan() }

        show(0)
    }

    private fun show(s: Int) {
        step = s
        container.removeAllViews()
        status.text = ""
        btnBack.visibility = if (step > 0) View.VISIBLE else View.GONE
        btnScanQr.visibility = View.GONE

        when (step) {
            0 -> stepUrl()
            1 -> stepToken()
            2 -> stepTest()
            3 -> stepDevice()
            4 -> stepKiosk()
            5 -> stepFinish()
        }
    }

    private fun createEditText(hint: String, defaultValue: String, type: Int): EditText {
        return EditText(this).apply {
            this.hint = hint
            setText(defaultValue)
            inputType = type
            isSingleLine = true
            textSize = 16f
            setTextColor(ContextCompat.getColor(this@SetupActivity, R.color.td_text))
            setHintTextColor(ContextCompat.getColor(this@SetupActivity, R.color.td_text_muted))
            setPadding(36, 30, 36, 30)
            setBackgroundResource(R.drawable.bg_input)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 16, 0, 12)
            }
        }
    }

    private fun stepUrl() {
        title.text = "Home Assistant verbinden"
        desc.text = """
            Trage die Adresse deiner Home-Assistant-Instanz ein.

            Beispiele:
            • http://192.168.1.50:8123
            • https://dein-ha.example.com

            Tipp: Nutze die interne URL, wenn das Display dauerhaft im Heimnetz bleibt.
        """.trimIndent()

        inputUrl = createEditText(
            "http://192.168.1.50:8123",
            prefs.haUrl.ifEmpty { "http://" },
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        )

        container.addView(inputUrl)
        btnNext.text = "Weiter"

        inputUrl?.post {
            inputUrl?.requestFocus()
            showKeyboard(inputUrl)
        }
    }

    private fun stepToken() {
        title.text = "Zugriff erlauben"
        desc.text = """
            Erstelle in Home Assistant einen Long-Lived Access Token.

            Pfad: Profil → Sicherheit → Long-Lived Access Tokens

            Du kannst den Token scannen oder direkt einfügen. Er bleibt nur auf diesem Gerät gespeichert.
        """.trimIndent()

        inputToken = createEditText(
            "eyJ0eXAi... oder QR-Code scannen",
            prefs.token,
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
        )

        container.addView(inputToken)
        btnScanQr.visibility = View.VISIBLE
        btnNext.text = "Verbindung testen"

        inputToken?.post {
            inputToken?.requestFocus()
            showKeyboard(inputToken)
        }
    }

    private fun checkCameraPermissionAndScan() {
        when {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED -> {
                // Permission bereits erteilt
                startQrScanner()
            }
            shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) -> {
                // Erkläre warum Permission benötigt wird
                Toast.makeText(
                    this,
                    "Kamera-Berechtigung wird benötigt um QR-Code zu scannen",
                    Toast.LENGTH_LONG
                ).show()
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
            else -> {
                // Frage nach Permission
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }
    }

    private fun startQrScanner() {
        val options = ScanOptions().apply {
            setPrompt("Scanne den Token-QR-Code aus Home Assistant")
            setBeepEnabled(true)
            setOrientationLocked(false)
            setCaptureActivity(QrCaptureActivity::class.java)
        }
        qrScanLauncher.launch(options)
    }

    private fun stepTest() {
        title.text = "Verbindung prüfen"

        val debugInfo = """
        URL: ${prefs.haUrl}
        Token: ${prefs.token.take(30)}...
        Länge: ${prefs.token.length} Zeichen
    """.trimIndent()

        desc.text = """
            Die App prüft jetzt, ob Home Assistant erreichbar ist und dein Token funktioniert.

            $debugInfo
        """.trimIndent()

        btnNext.text = "Weiter"
        btnNext.isEnabled = false
        status.text = "Verbindung wird geprüft ..."

        hideKeyboard()

        Thread {
            try {
                L.i("Setup", "=== Connection Test Start ===")
                L.i("Setup", "URL: ${prefs.haUrl}")
                L.i("Setup", "Token Length: ${prefs.token.length}")

                // Kurze Pause
                Thread.sleep(500)

                val api = ApiClient(prefs)
                val ok = api.testConnection()

                L.i("Setup", "Connection test result: $ok")

                runOnUiThread {
                    if (ok) {
                        L.i("Setup", "✅ Connection successful!")
                        title.text = "✅ Verbindung erfolgreich"
                        status.text = "Verbindung zu Home Assistant erfolgreich."
                        desc.text = """
                        Home Assistant ist erreichbar!
                        
                        URL: ${prefs.haUrl}
                        API: Funktioniert ✓
                    """.trimIndent()
                        btnNext.isEnabled = true
                        btnNext.text = "Weiter"
                    } else {
                        L.w("Setup", "❌ Connection failed!")
                        title.text = "❌ Verbindung fehlgeschlagen"
                        status.text = "Verbindung fehlgeschlagen."
                        desc.text = """
                        Die Verbindung zu Home Assistant ist fehlgeschlagen.
                        
                        $debugInfo
                        
                        Häufige Ursachen:
                        • Token ist abgelaufen
                        • Token wurde falsch kopiert (Leerzeichen?)
                        • Firewall blockiert Zugriff
                        • Android-Gerät ist in einem anderen WLAN
                        
                        Du kannst trotzdem fortfahren.
                    """.trimIndent()
                        btnBack.visibility = View.VISIBLE
                        btnNext.isEnabled = true
                        btnNext.text = "Trotzdem weiter →"
                    }
                }
            } catch (e: Exception) {
                L.e("Setup", "Connection test exception", e)
                runOnUiThread {
                    title.text = "Fehler bei der Anmeldung"
                    status.text = "Fehler beim Verbindungstest."
                    desc.text = """
                    Ein Fehler ist aufgetreten:
                    
                    ${e.javaClass.simpleName}
                    ${e.message}
                    
                    $debugInfo
                """.trimIndent()
                    btnBack.visibility = View.VISIBLE
                    btnNext.isEnabled = true
                    btnNext.text = "Trotzdem weiter →"
                }
            }
        }.start()
    }

    private fun stepDevice() {
        title.text = "Display benennen"
        desc.text = "Lege fest, wie das Display in Home Assistant erscheinen soll.\n\nGerätename: sichtbar in der Oberfläche\nGeräte-ID: technische Kennung ohne Leerzeichen\n\nBei einer Neuanmeldung kannst du dieselbe ID behalten oder bewusst eine neue vergeben."

        val nameLabel = TextView(this).apply {
            text = "Gerätename"
            textSize = 13f
            setTextColor(ContextCompat.getColor(this@SetupActivity, R.color.td_primary))
        }
        container.addView(nameLabel)

        inputDeviceName = createEditText(
            "z.B. Tablet Wohnzimmer",
            prefs.deviceName.ifEmpty { "Tablet" },
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
        )
        container.addView(inputDeviceName)

        val idLabel = TextView(this).apply {
            text = "\nGeräte-ID (keine Leerzeichen):"
            textSize = 14f
            setTextColor(android.graphics.Color.WHITE)
            setPadding(0, 32, 0, 0)
        }
        container.addView(idLabel)

        prefs.ensureStableDeviceIdentity(this)
        inputDeviceId = createEditText(
            "z.B. tablet_wohnzimmer",
            prefs.deviceId.ifEmpty { U.generateDeviceId() },
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
        )
        container.addView(inputDeviceId)

        btnNext.text = "Weiter"

        inputDeviceName?.post {
            inputDeviceName?.requestFocus()
            showKeyboard(inputDeviceName)
        }
    }

    private fun stepKiosk() {
        title.text = "Kiosk-Einstellungen"
        desc.text = "Aktiviere hier die empfohlenen Wallpanel-Einstellungen.\n\nDu kannst alles später im Einstellungsmenü wieder ändern."

        hideKeyboard()

        val checkKiosk = CheckBox(this).apply {
            text = "Kiosk-Modus aktivieren"
            isChecked = true
            textSize = 16f
            setTextColor(ContextCompat.getColor(this@SetupActivity, R.color.td_text))
            setPadding(16, 24, 16, 24)
        }
        container.addView(checkKiosk)

        val checkAuto = CheckBox(this).apply {
            text = "Nach Neustart automatisch starten"
            isChecked = true
            textSize = 16f
            setTextColor(ContextCompat.getColor(this@SetupActivity, R.color.td_text))
            setPadding(16, 24, 16, 24)
        }
        container.addView(checkAuto)

        val checkScreen = CheckBox(this).apply {
            text = "Bildschirm wach halten"
            isChecked = true
            textSize = 16f
            setTextColor(ContextCompat.getColor(this@SetupActivity, R.color.td_text))
            setPadding(16, 24, 16, 24)
        }
        container.addView(checkScreen)

        btnNext.text = "Display anmelden"
        btnNext.setOnClickListener {
            prefs.kioskEnabled = checkKiosk.isChecked
            prefs.autoStart = checkAuto.isChecked
            prefs.screenOn = checkScreen.isChecked
            next()
        }
    }

    private fun stepFinish() {
        title.text = "Display anmelden"
        desc.text = """
            Gerät: ${prefs.deviceName}
            ID: ${prefs.deviceId}
            URL: ${prefs.displayUrl}
            
            Das Display wird jetzt bei Home Assistant angemeldet. Danach kannst du das gewünschte Layout im Baukasten zuweisen.
        """.trimIndent()

        btnNext.text = "⏳ Registriere..."
        btnNext.isEnabled = false
        btnBack.visibility = View.GONE

        Thread {
            try {
                L.i("Setup", "Registering device...")
                val api = ApiClient(prefs)
                val success = api.registerDevice()

                runOnUiThread {
                    if (success) {
                        L.i("Setup", "Registration successful")
                        title.text = "Fertig eingerichtet"
                        status.text = "Display erfolgreich registriert."
                        desc.text = """
                            Gerät: ${prefs.deviceName}
                            ID: ${prefs.deviceId}
                            
                            Das Display wurde registriert. Öffne jetzt in Home Assistant den Ticker-Display-Baukasten und ordne dem Gerät dein gewünschtes Layout zu.
                        """.trimIndent()
                        btnNext.text = "Display starten"
                        btnNext.isEnabled = true
                        btnNext.setOnClickListener {
                            prefs.setupDone = true
                            prefs.registeredAtEpochMs = System.currentTimeMillis()
                            startActivity(Intent(this, MainActivity::class.java))
                            finish()
                        }
                    } else {
                        L.w("Setup", "Registration failed")
                        title.text = "Anmeldung nicht bestätigt"
                        status.text = "Display konnte nicht bestätigt werden."
                        desc.text = """
                            Prüfe:
                            - Ist Home Assistant erreichbar?
                            - Ist der Token gültig?
                            - Ist die Integration installiert?
                            
                            Du kannst trotzdem starten.
                        """.trimIndent()
                        btnNext.text = "Trotzdem starten"
                        btnNext.isEnabled = true
                        btnNext.setOnClickListener {
                            prefs.setupDone = true
                            startActivity(Intent(this, MainActivity::class.java))
                            finish()
                        }
                    }
                }
            } catch (e: Exception) {
                L.e("Setup", "Registration error", e)
                runOnUiThread {
                    title.text = "Fehler bei der Anmeldung"
                    status.text = "Fehler: ${e.message}"
                    desc.text = "Du kannst trotzdem starten."
                    btnNext.text = "Trotzdem starten"
                    btnNext.isEnabled = true
                    btnNext.setOnClickListener {
                        prefs.setupDone = true
                        startActivity(Intent(this, MainActivity::class.java))
                        finish()
                    }
                }
            }
        }.start()
    }

    private fun next() {
        hideKeyboard()

        when (step) {
            0 -> {
                val url = U.normalizeHaUrl(inputUrl?.text.toString())
                if (url.isBlank() || !(url.startsWith("http://") || url.startsWith("https://"))) {
                    status.text = "Bitte eine gültige URL eingeben, z. B. http://192.168.1.50:8123"
                    return
                }
                prefs.haUrl = url
            }
            1 -> {
                val token = inputToken?.text.toString().trim()
                if (token.isBlank()) {
                    status.text = "Bitte einen Access Token eingeben oder QR-Code scannen"
                    return
                }
                prefs.token = token
            }
            3 -> {
                val name = inputDeviceName?.text.toString().trim()
                val id = inputDeviceId?.text.toString().trim().replace(" ", "_").lowercase()
                if (name.isBlank() || id.isBlank()) {
                    status.text = "Bitte Name und ID eingeben"
                    return
                }
                prefs.deviceName = name
                prefs.deviceId = id
            }
        }
        show(step + 1)
    }

    private fun showKeyboard(view: View?) {
        view?.postDelayed({
            view.requestFocus()
            val imm = getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
            imm.showSoftInput(view, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
        }, 100)
    }

    private fun hideKeyboard() {
        val imm = getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        currentFocus?.let {
            imm.hideSoftInputFromWindow(it.windowToken, 0)
        }
    }
}