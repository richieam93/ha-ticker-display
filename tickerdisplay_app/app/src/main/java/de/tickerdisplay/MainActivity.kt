package de.tickerdisplay

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import kotlin.math.sqrt

class MainActivity : AppCompatActivity(), SensorEventListener {

    private lateinit var prefs: Prefs
    private var webView: WebView? = null
    private lateinit var webViewContainer: FrameLayout
    private lateinit var offlineView: View
    private var webViewMgr: WebViewManager? = null
    private lateinit var kioskMgr: KioskManager
    private lateinit var screenMgr: ScreenManager
    private lateinit var sound: SoundPlayer
    private lateinit var sensors: SensorReporter
    private lateinit var connection: ConnectionMonitor
    private var frontCameraUploader: CameraSnapshotUploader? = null
    private var backCameraUploader: CameraSnapshotUploader? = null
    private val handler = Handler(Looper.getMainLooper())
    private var pageLoaded = false
    private var retryCount = 0
    private val runtimePermissionRequestCode = 4242

    // Shake Detection
    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var lastShakeTime = 0L
    private var shakeCount = 0

    // Volume Button Detection
    private var volumeDownCount = 0
    private var lastVolumeDownTime = 0L

    // Multi-finger tap
    private var fingerCount = 0
    private var lastMultiTapTime = 0L
    private var edgeSwipeStartX = 0f
    private var edgeSwipeStartY = 0f
    private var edgeSwipeStartTime = 0L

    @SuppressLint("ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            prefs = Prefs(this)
            prefs.ensureStableDeviceIdentity(this)
            L.init(this)
            Log.i("TickerDisplay", "=== MainActivity Starting ===")

            if (!prefs.setupDone || !prefs.isConfigured()) {
                startActivity(Intent(this, SetupActivity::class.java))
                finish()
                return
            }

            setContentView(R.layout.activity_main)
            webViewContainer = findViewById(R.id.webview_container)
            offlineView = findViewById(R.id.offline_view)
            offlineView.visibility = View.GONE
            val webViewReady = initWebViewSafely()

            // Shake Detection einrichten
            setupShakeDetection()

            screenMgr = ScreenManager(this)
            sound = SoundPlayer(this)
            val api = ApiClient(prefs)
            Thread {
                try { api.ensureRegistered() } catch (_: Exception) {}
            }.start()
            sensors = SensorReporter(this, api, prefs)
            frontCameraUploader = CameraSnapshotUploader(this, api, prefs, CameraFacing.FRONT)
            backCameraUploader = CameraSnapshotUploader(this, api, prefs, CameraFacing.BACK)
            if (webViewReady) {
                val bridge = Bridge(this, prefs, screenMgr, sound, sensors)
                val activeWebView = webView ?: throw IllegalStateException("WebView fehlt trotz webViewReady")
                webViewMgr = WebViewManager(activeWebView, prefs, bridge)
                webViewMgr?.configure()
                setupWebViewCallbacks()
            } else {
                showOfflineMessage("WebView auf diesem Gerät nicht verfügbar. Sprache und Assist laufen weiter.")
            }

            kioskMgr = KioskManager(this, prefs)
            kioskMgr.onPinRequired = { showPinDialog() }

            connection = ConnectionMonitor(this) { connected ->
                runOnUiThread {
                    if (connected && !pageLoaded) {
                        loadDisplayWithRetry()
                    } else if (!connected) {
                        offlineView.visibility = View.VISIBLE
                    }
                }
            }

            // Multi-Touch / edge swipe detection
            webView?.setOnTouchListener { _, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                        fingerCount = event.pointerCount
                        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                            edgeSwipeStartX = event.x
                            edgeSwipeStartY = event.y
                            edgeSwipeStartTime = System.currentTimeMillis()
                        }
                        if (fingerCount >= 3) {
                            val now = System.currentTimeMillis()
                            if (now - lastMultiTapTime < 1000) {
                                Log.i("TickerDisplay", "3-Finger Tap detected!")
                                showSettingsAccess()
                                return@setOnTouchListener true
                            }
                            lastMultiTapTime = now
                        }
                    }
                    MotionEvent.ACTION_UP -> {
                        fingerCount = 0
                        if (isSettingsEdgeSwipe(event)) {
                            showSettingsAccess()
                            return@setOnTouchListener true
                        }
                    }
                }

                if (event.action == MotionEvent.ACTION_DOWN && prefs.kioskEnabled) {
                    val touchWidth = webView?.width ?: webViewContainer.width
                    val touchHeight = webView?.height ?: webViewContainer.height
                    kioskMgr.handleCornerTap(event.x, event.y, touchWidth, touchHeight)
                }
                false
            }

            kioskMgr.enable()
            screenMgr.keepScreenOn(this)
            connection.start()
            sensors.start()
            loadDisplayWithRetry()

            if (prefs.kioskEnabled) {
                try {
                    startService(Intent(this, WatchdogService::class.java))
                } catch (e: Exception) {
                    Log.e("TickerDisplay", "Watchdog start failed", e)
                }
            }

            Log.i("TickerDisplay", "=== MainActivity Started ===")

            // Info-Toast zeigen
            handler.postDelayed({
                Toast.makeText(
                    this,
                    "Menü: Rand-Wischgeste, 3-Finger-Tap, Ecke, Schütteln oder 5x Lautstärke-",
                    Toast.LENGTH_LONG
                ).show()
            }, 2000)

        } catch (e: Exception) {
            Log.e("TickerDisplay", "onCreate failed", e)
            Toast.makeText(this, "Fehler: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    // ═══════════════════════════════════════════════════════════
    // SHAKE DETECTION
    // ═══════════════════════════════════════════════════════════
    private fun setupShakeDetection() {
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_ACCELEROMETER) {
            val x = event.values[0]
            val y = event.values[1]
            val z = event.values[2]

            val acceleration = sqrt((x * x + y * y + z * z).toDouble())
            val now = System.currentTimeMillis()

            // Shake erkannt (Beschleunigung > 15)
            if (acceleration > 15) {
                if (now - lastShakeTime > 500) {
                    shakeCount++
                    lastShakeTime = now
                    Log.i("TickerDisplay", "Shake #$shakeCount detected!")

                    if (shakeCount >= 3) {
                        shakeCount = 0
                        Log.i("TickerDisplay", "Triple shake - opening settings!")
                        handler.post { showSettingsAccess() }
                    }
                }
            }

            // Reset shake counter nach 2 Sekunden
            if (now - lastShakeTime > 2000) {
                shakeCount = 0
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ═══════════════════════════════════════════════════════════
    // VOLUME BUTTON DETECTION
    // ═══════════════════════════════════════════════════════════
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            val now = System.currentTimeMillis()
            if (now - lastVolumeDownTime < 2000) {
                volumeDownCount++
                Log.i("TickerDisplay", "Volume down #$volumeDownCount")
                if (volumeDownCount >= 5) {
                    volumeDownCount = 0
                    showSettingsAccess()
                    return true
                }
            } else {
                volumeDownCount = 1
            }
            lastVolumeDownTime = now
            // Lautstärketaste nicht mehr generell abfangen, sonst kollidiert MIUI mit
            // TTS/Media-Wiedergabe und erzeugt Ton-Ein/Aus-Flattern.
            return super.onKeyDown(keyCode, event)
        }
        return super.onKeyDown(keyCode, event)
    }

    // ═══════════════════════════════════════════════════════════
    // SETTINGS ACCESS DIALOG
    // ═══════════════════════════════════════════════════════════
    private fun showSettingsAccess() {
        val options = arrayOf(
            "Einstellungen öffnen",
            "Display neu laden",
            "Geräteinformationen",
            "Kiosk-Modus beenden",
            "Abbrechen"
        )

        AlertDialog.Builder(this)
            .setTitle("Ticker Display Menü")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> showPinDialog()
                    1 -> {
                        pageLoaded = false
                        loadDisplayWithRetry()
                        Toast.makeText(this, "Display wird neu geladen...", Toast.LENGTH_SHORT).show()
                    }
                    2 -> showDeviceInfo()
                    3 -> {
                        if (prefs.kioskEnabled) {
                            showPinDialog {
                                prefs.kioskEnabled = false
                                Toast.makeText(this, "Kiosk-Modus beendet", Toast.LENGTH_SHORT).show()
                                recreate()
                            }
                        }
                    }
                    4 -> { /* Abbrechen */ }
                }
            }
            .show()
    }

    private fun showDeviceInfo() {
        val info = """
            📱 Gerät: ${prefs.deviceName}
            🆔 ID: ${prefs.deviceId}
            🔗 URL: ${prefs.displayUrl}
            
            📊 Modell: ${U.getDeviceModel()}
            🤖 Android: ${U.getAndroidVersion()}
            📐 Auflösung: ${U.getScreenRes(this)}
            
            📶 WiFi: ${U.getWifiSsid(this)}
            📡 Signal: ${U.getWifiSignal(this)} dBm
            🌐 IP: ${U.getIp()}
            
            🔋 Batterie: ${sensors.collectData()["battery_level"]}%
            💾 RAM frei: ${U.getMemoryMB(this)} MB
            
            PIN: ${prefs.kioskPin}
        """.trimIndent()

        AlertDialog.Builder(this)
            .setTitle("Geräteinformationen")
            .setMessage(info)
            .setPositiveButton("OK", null)
            .setNeutralButton("Kopieren") { _, _ ->
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                val clip = android.content.ClipData.newPlainText("Device Info", info)
                clipboard.setPrimaryClip(clip)
                Toast.makeText(this, "Kopiert!", Toast.LENGTH_SHORT).show()
            }
            .show()
    }

    // ═══════════════════════════════════════════════════════════
    // PIN DIALOG
    // ═══════════════════════════════════════════════════════════
    private fun showPinDialog(onSuccess: (() -> Unit)? = null) {
        val et = EditText(this).apply {
            hint = "PIN (Standard: 1234)"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or
                    android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        AlertDialog.Builder(this)
            .setTitle("🔒 PIN eingeben")
            .setMessage("Aktueller PIN: ${prefs.kioskPin}")
            .setView(et)
            .setPositiveButton("OK") { _, _ ->
                val pin = et.text.toString()
                if (pin == prefs.kioskPin) {
                    if (onSuccess != null) {
                        onSuccess()
                    } else {
                        startActivity(Intent(this, SettingsActivity::class.java))
                    }
                } else {
                    Toast.makeText(this, "❌ Falscher PIN", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Abbrechen", null)
            .setNeutralButton("PIN vergessen?") { _, _ ->
                AlertDialog.Builder(this)
                    .setTitle("PIN zurücksetzen")
                    .setMessage("PIN auf Standard (1234) zurücksetzen?\n\nDadurch werden KEINE anderen Einstellungen gelöscht.")
                    .setPositiveButton("Ja") { _, _ ->
                        prefs.kioskPin = "1234"
                        Toast.makeText(this, "✅ PIN zurückgesetzt auf: 1234", Toast.LENGTH_LONG).show()
                    }
                    .setNegativeButton("Nein", null)
                    .show()
            }
            .show()
    }

    // ═══════════════════════════════════════════════════════════
    // SETTINGS GESTURES / WEBVIEW
    // ═══════════════════════════════════════════════════════════
    private fun initWebViewSafely(): Boolean {
        return try {
            val created = WebView(this)
            created.layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            webViewContainer.removeAllViews()
            webViewContainer.addView(created)
            webView = created
            true
        } catch (t: Throwable) {
            Log.e("TickerDisplay", "WebView init failed - fallback mode active", t)
            webView = null
            false
        }
    }

    private fun showOfflineMessage(message: String) {
        offlineView.visibility = View.VISIBLE
        findViewById<TextView>(R.id.offline_title)?.text = "Anzeige nicht verfügbar"
        findViewById<TextView>(R.id.offline_subtitle)?.text = message
    }

    private fun isSettingsEdgeSwipe(event: MotionEvent): Boolean {
        val elapsed = System.currentTimeMillis() - edgeSwipeStartTime
        if (elapsed > 1200) return false
        val dx = event.x - edgeSwipeStartX
        val dy = kotlin.math.abs(event.y - edgeSwipeStartY)
        val edgeThreshold = resources.displayMetrics.density * 28f
        val swipeThreshold = resources.displayMetrics.density * 72f
        val startedAtLeft = edgeSwipeStartX <= edgeThreshold && dx > swipeThreshold
        val activeWidth = (webView?.width ?: webViewContainer.width).toFloat()
        val startedAtRight = edgeSwipeStartX >= (activeWidth - edgeThreshold) && dx < -swipeThreshold
        return (startedAtLeft || startedAtRight) && dy < resources.displayMetrics.density * 80f
    }

    private fun setupWebViewCallbacks() {
        val client = webView?.webViewClient as? TickerWebViewClient
        client?.onPageLoaded = {
            runOnUiThread {
                Log.i("TickerDisplay", "✅ Page loaded successfully!")
                pageLoaded = true
                retryCount = 0
                offlineView.visibility = View.GONE
            }
        }
        client?.onPageError = {
            runOnUiThread {
                Log.e("TickerDisplay", "❌ Page load error")
                pageLoaded = false
                scheduleRetry()
            }
        }
    }

    private fun loadDisplayWithRetry() {
        Log.i("TickerDisplay", "Loading display (attempt ${retryCount + 1})")
        val manager = webViewMgr
        if (manager == null) {
            showOfflineMessage("WebView konnte auf diesem Android-Gerät nicht gestartet werden.")
            return
        }
        offlineView.visibility = View.GONE
        manager.load()
        handler.postDelayed({
            if (!pageLoaded) scheduleRetry()
        }, 10000)
    }

    private fun scheduleRetry() {
        retryCount++
        val delay = when {
            retryCount < 3 -> 5000L
            retryCount < 10 -> 10000L
            else -> 30000L
        }
        offlineView.visibility = View.VISIBLE
        handler.postDelayed({
            if (!pageLoaded && !isFinishing) loadDisplayWithRetry()
        }, delay)
    }

    private fun requestWriteSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!android.provider.Settings.System.canWrite(this)) {
                Toast.makeText(this, "Optional: 'Systemeinstellungen ändern' kann in den Einstellungen erlaubt werden.", Toast.LENGTH_LONG).show()
            }
        }
    }
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && prefs.kioskEnabled) kioskMgr.hideSystemUI()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (prefs.kioskEnabled) {
            showSettingsAccess()
            return
        }
        @Suppress("DEPRECATION")
        super.onBackPressed()
    }

    private fun ensureRuntimePermissions() {
        val needed = mutableListOf<String>()
        if ((prefs.frontCameraEnabled || prefs.backCameraEnabled) &&
            androidx.core.content.ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            needed += android.Manifest.permission.CAMERA
        }
        if (needed.isNotEmpty()) {
            androidx.core.app.ActivityCompat.requestPermissions(this, needed.distinct().toTypedArray(), runtimePermissionRequestCode)
        }
    }

    override fun onResume() {
        super.onResume()
        accelerometer?.also {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
        if (prefs.kioskEnabled) kioskMgr.hideSystemUI()
        ensureRuntimePermissions()
        frontCameraUploader?.start()
        backCameraUploader?.start()
        
    }

    override fun onPause() {
        super.onPause()
        sensorManager?.unregisterListener(this)
        frontCameraUploader?.stop()
        backCameraUploader?.stop()
        
    }

    override fun onDestroy() {
        try {
            handler.removeCallbacksAndMessages(null)
            sensorManager?.unregisterListener(this)
            connection.stop()
            sensors.stop()
            screenMgr.release()
            
            sound.stop()
            frontCameraUploader?.release()
            backCameraUploader?.release()
            webViewMgr?.destroy()
        } catch (e: Exception) {
            Log.e("TickerDisplay", "onDestroy error", e)
        }
        super.onDestroy()
    }
}