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
    private var nativeOverlay: NativeOverlayManager? = null
    private lateinit var sensors: SensorReporter
    private lateinit var connection: ConnectionMonitor
    private var frontCameraUploader: CameraSnapshotUploader? = null
    private var backCameraUploader: CameraSnapshotUploader? = null
    private var motionDetector: MotionCameraDetector? = null
    private val handler = Handler(Looper.getMainLooper())
    private var pageLoaded = false
    private var retryCount = 0
    private var lastConsoleError: String? = null
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

            prepareFullscreenWindow()
            setContentView(R.layout.activity_main)
            webViewContainer = findViewById(R.id.webview_container)
            offlineView = findViewById(R.id.offline_view)
            offlineView.visibility = View.GONE
            setupOfflineActions()
            val webViewReady = initWebViewSafely()

            // Shake Detection einrichten
            setupShakeDetection()

            screenMgr = ScreenManager(this)
            sound = SoundPlayer(this)
            nativeOverlay = NativeOverlayManager(this, prefs, sound)
            val api = ApiClient(prefs)
            Thread {
                try {
                    api.ensureRegistered()
                    api.syncDeviceConfig()
                    runOnUiThread { nativeOverlay?.refreshForPrefs() }
                } catch (_: Exception) {}
            }.start()
            sensors = SensorReporter(this, api, prefs)
            motionDetector = MotionCameraDetector(this, api, prefs) { active, data ->
                sensors.updateMotionState(active, data)
            }
            frontCameraUploader = CameraSnapshotUploader(this, api, prefs, CameraFacing.FRONT)
            backCameraUploader = CameraSnapshotUploader(this, api, prefs, CameraFacing.BACK)
            if (webViewReady) {
                val bridge = Bridge(this, prefs, screenMgr, sound, sensors) { key, value ->
                    handleNativeSettingChanged(key, value)
                }
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
            applyImmersiveModeIfNeeded()
            if (prefs.screenOn) screenMgr.keepScreenOn(this)
            connection.start()
            sensors.start()
            loadDisplayWithRetry()

            if (prefs.kioskEnabled) {
                try {
                    val watchdogIntent = Intent(this, WatchdogService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        androidx.core.content.ContextCompat.startForegroundService(this, watchdogIntent)
                    } else {
                        startService(watchdogIntent)
                    }
                } catch (e: Exception) {
                    Log.e("TickerDisplay", "Watchdog start failed", e)
                }
            }

            Log.i("TickerDisplay", "=== MainActivity Started ===")

            // Info-Toast zeigen
            handler.postDelayed({
                Toast.makeText(
                    this,
                    "Menü: Rand-Wischgeste, 3-Finger-Tap, Ecke, Schütteln oder 5x Lautstärke runter",
                    Toast.LENGTH_LONG
                ).show()
            }, 2000)

        } catch (e: Exception) {
            Log.e("TickerDisplay", "onCreate failed", e)
            Toast.makeText(this, "Fehler: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun prepareFullscreenWindow() {
        try {
            requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN or
                    android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                    android.view.WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.attributes = window.attributes.apply {
                    layoutInDisplayCutoutMode = android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(false)
            }
            window.statusBarColor = android.graphics.Color.TRANSPARENT
            window.navigationBarColor = android.graphics.Color.TRANSPARENT
        } catch (e: Exception) {
            Log.w("TickerDisplay", "Fullscreen window setup failed: ${e.message}")
        }
    }

    private fun shouldUseImmersiveMode(): Boolean {
        return try { prefs.kioskEnabled || prefs.isDirectMode } catch (_: Exception) { false }
    }

    private fun applyImmersiveModeIfNeeded() {
        if (shouldUseImmersiveMode() && ::kioskMgr.isInitialized) {
            kioskMgr.hideSystemUI()
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
            "Cache leeren & neu laden",
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
                    2 -> {
                        clearWebViewData()
                        pageLoaded = false
                        retryCount = 0
                        loadDisplayWithRetry()
                        Toast.makeText(this, "Cache geleert, Display lädt neu", Toast.LENGTH_SHORT).show()
                    }
                    3 -> showDeviceInfo()
                    4 -> {
                        if (prefs.kioskEnabled) {
                            showPinDialog {
                                prefs.kioskEnabled = false
                                Toast.makeText(this, "Kiosk-Modus beendet", Toast.LENGTH_SHORT).show()
                                recreate()
                            }
                        }
                    }
                    5 -> { /* Abbrechen */ }
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
            🧩 App: ${U.getAppVersion(this)}
            🌐 Netzwerk: ${U.getNetworkType(this)}
            
            📶 WiFi: ${U.getWifiSsid(this)}
            📡 Signal: ${U.getWifiSignal(this)} dBm
            🌐 IP: ${U.getIp()}
            
            🔋 Batterie: ${sensors.collectData()["battery_level"]}%
            💾 RAM frei: ${U.getMemoryMB(this)} MB
            🚶 Motion: ${if (sensors.isMotionDetected()) "erkannt" else "keine Bewegung"}
            🔁 Retry: $retryCount
            ⚠️ WebView: ${lastConsoleError ?: "kein Fehler protokolliert"}
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
            .setTitle("PIN eingeben")
            .setMessage("Bitte PIN eingeben, um die Einstellungen zu öffnen.")
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
            .setNeutralButton("Hinweis") { _, _ ->
                Toast.makeText(this, "PIN kann in den Einstellungen geändert werden.", Toast.LENGTH_LONG).show()
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

    private fun showOfflineMessage(message: String, title: String = "Anzeige nicht verfügbar") {
        offlineView.visibility = View.VISIBLE
        findViewById<TextView>(R.id.offline_title)?.text = title
        findViewById<TextView>(R.id.offline_subtitle)?.text = message
        findViewById<TextView>(R.id.offline_status_badge)?.text = when {
            retryCount <= 0 -> "Verbindung wird aufgebaut"
            retryCount < 4 -> "Retry $retryCount"
            else -> "Retry $retryCount · langsamer Modus"
        }
    }

    private fun setupOfflineActions() {
        findViewById<View>(R.id.btn_offline_reload)?.setOnClickListener {
            clearWebViewData()
            pageLoaded = false
            retryCount = 0
            loadDisplayWithRetry()
        }
        findViewById<View>(R.id.btn_offline_settings)?.setOnClickListener {
            showSettingsAccess()
        }
    }

    private fun clearWebViewData() {
        try {
            webView?.clearCache(true)
            webView?.clearHistory()
            android.webkit.WebStorage.getInstance().deleteAllData()
            android.webkit.CookieManager.getInstance().removeAllCookies(null)
            android.webkit.CookieManager.getInstance().flush()
        } catch (e: Exception) {
            Log.w("TickerDisplay", "WebView data cleanup failed: ${e.message}")
        }
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
        val chrome = webView?.webChromeClient as? TickerWebChromeClient
        chrome?.onConsoleError = { msg ->
            lastConsoleError = msg
            Log.e("TickerDisplay", "Web console error: $msg")
            handler.postDelayed({ verifyDisplayStarted() }, 2500)
        }
        client?.onPageLoaded = {
            runOnUiThread {
                Log.i("TickerDisplay", "✅ Page loaded successfully!")
                pageLoaded = true
                retryCount = 0
                offlineView.visibility = View.GONE
                handler.postDelayed({ verifyDisplayStarted() }, 8000)
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

    private fun verifyDisplayStarted() {
        val activeWebView = webView ?: return
        if (isFinishing) return
        try {
            activeWebView.evaluateJavascript(
                """
                (function(){
                  var loading = document.getElementById('loading-screen');
                  var screen = document.getElementById('screen-container');
                  var hidden = !loading || loading.hidden || loading.style.display === 'none' || loading.offsetParent === null;
                  var hasContent = !!(screen && screen.children && screen.children.length > 0);
                  return (hidden || hasContent) ? 'ok' : 'loading';
                })();
                """.trimIndent()
            ) { result ->
                if (result?.contains("loading", ignoreCase = true) == true && !isFinishing) {
                    Log.w("TickerDisplay", "Display page still shows loading screen")
                    pageLoaded = false
                    val detail = lastConsoleError?.let { "\n\nLetzter WebView-Fehler: $it" } ?: ""
                    clearWebViewData()
                    showOfflineMessage("Display lädt, aber die Oberfläche startet nicht. Cache wurde geleert und die App lädt automatisch neu.$detail", "Display hängt im Ladebildschirm")
                    scheduleRetry()
                }
            }
        } catch (e: Exception) {
            Log.e("TickerDisplay", "Display startup verification failed", e)
        }
    }

    private fun loadDisplayWithRetry() {
        Log.i("TickerDisplay", "Loading display (attempt ${retryCount + 1})")
        val manager = webViewMgr
        if (manager == null) {
            showOfflineMessage("WebView konnte auf diesem Android-Gerät nicht gestartet werden. Prüfe Android System WebView oder Chrome.")
            return
        }
        offlineView.visibility = View.GONE
        Thread {
            try {
                val api = ApiClient(prefs)
                api.ensureRegistered(1)
                api.syncDeviceConfig()
            } catch (e: Exception) {
                Log.w("TickerDisplay", "Config sync before load failed: ${e.message}")
            }
            runOnUiThread {
                nativeOverlay?.refreshForPrefs()
                manager.load()
                handler.postDelayed({
                    if (!pageLoaded) scheduleRetry()
                }, 10000)
            }
        }.start()
    }

    private fun scheduleRetry() {
        retryCount++
        val delay = when {
            retryCount < 3 -> 5000L
            retryCount < 10 -> 10000L
            else -> 30000L
        }
        showOfflineMessage(
            "Automatischer Neuversuch in ${delay / 1000} Sekunden. Prüfe WLAN, Home-Assistant-URL und Token, falls es so bleibt.",
            "Verbindung wird wiederhergestellt"
        )
        handler.postDelayed({
            if (!pageLoaded && !isFinishing) loadDisplayWithRetry()
        }, delay)
    }

    private fun handleNativeSettingChanged(key: String, value: Any?) {
        runOnUiThread {
            try {
                when (key) {
                    "keep_screen_on", "screen_on_pref" -> {
                        if (prefs.screenOn) screenMgr.keepScreenOn(this) else screenMgr.clearKeepScreenOn(this)
                    }
                    "kiosk", "kiosk_enabled", "kiosk_mode" -> {
                        applyImmersiveModeIfNeeded()
                    }
                    "light_sensor", "light_sensor_enabled" -> sensors.applyPreferenceChange(key)
                    "motion", "motion_detect", "motion_detection", "motion_detection_enabled" -> {
                        ensureRuntimePermissions()
                        if (prefs.motionDetect) {
                            frontCameraUploader?.stop()
                            backCameraUploader?.stop()
                            motionDetector?.start()
                        } else {
                            motionDetector?.stop()
                            if (prefs.frontCameraEnabled) frontCameraUploader?.start()
                            if (prefs.backCameraEnabled) backCameraUploader?.start()
                        }
                    }
                    "front_camera", "front_camera_enabled", "back_camera", "back_camera_enabled",
                    "camera_manual_only", "camera_silent", "camera_silent_mode", "camera_interval", "camera_interval_seconds" -> {
                        ensureRuntimePermissions()
                        if (!prefs.motionDetect) {
                            if (prefs.frontCameraEnabled) frontCameraUploader?.start() else frontCameraUploader?.stop()
                            if (prefs.backCameraEnabled) backCameraUploader?.start() else backCameraUploader?.stop()
                        }
                    }
                }
                sensors.reportNow()
            } catch (e: Exception) {
                Log.e("TickerDisplay", "native setting change failed: $key=$value", e)
            }
        }
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
        if (hasFocus) applyImmersiveModeIfNeeded()
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
        if ((prefs.frontCameraEnabled || prefs.backCameraEnabled || prefs.motionDetect) &&
            androidx.core.content.ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            needed += android.Manifest.permission.CAMERA
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            androidx.core.content.ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            needed += android.Manifest.permission.POST_NOTIFICATIONS
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
        applyImmersiveModeIfNeeded()
        ensureRuntimePermissions()
        motionDetector?.start()
        // Motion detection owns the camera while active. Avoid opening a second
        // camera preview in parallel on Android 9 wall tablets.
        if (!prefs.motionDetect) {
            frontCameraUploader?.start()
            backCameraUploader?.start()
        }
        
    }

    override fun onPause() {
        super.onPause()
        sensorManager?.unregisterListener(this)
        motionDetector?.stop()
        frontCameraUploader?.stop()
        backCameraUploader?.stop()
        
    }

    override fun onDestroy() {
        try {
            handler.removeCallbacksAndMessages(null)
            sensorManager?.unregisterListener(this)
            motionDetector?.stop()
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