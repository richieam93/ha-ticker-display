package de.tickerdisplay

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.net.*
import android.net.http.SslError
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import android.os.PowerManager
import android.util.Log
import android.util.Base64
import android.webkit.*
import com.google.gson.Gson
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.net.Inet4Address
import java.net.NetworkInterface
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

// ═══════════════════════════════════════════════════════════
// PREFS
// ═══════════════════════════════════════════════════════════
class Prefs(context: Context) {
    private val p: SharedPreferences = context.getSharedPreferences(C.PREFS, Context.MODE_PRIVATE)

    var haUrl: String
        get() = p.getString("ha_url", "") ?: ""
        set(v) = p.edit().putString("ha_url", v).apply()

    var token: String
        get() = p.getString("token", "") ?: ""
        set(v) = p.edit().putString("token", v).apply()

    var deviceId: String
        get() = p.getString("device_id", "") ?: ""
        set(v) = p.edit().putString("device_id", v).apply()

    var deviceName: String
        get() = p.getString("device_name", "") ?: ""
        set(v) = p.edit().putString("device_name", v).apply()

    var installId: String
        get() {
            val existing = p.getString("install_id", "") ?: ""
            if (existing.isNotBlank()) return existing
            val created = UUID.randomUUID().toString().replace("-", "")
            p.edit().putString("install_id", created).apply()
            return created
        }
        set(v) = p.edit().putString("install_id", v).apply()

    var displayUrlOverride: String
        get() = p.getString("display_url_override", "") ?: ""
        set(v) = p.edit().putString("display_url_override", v).apply()

    var wsUrlOverride: String
        get() = p.getString("ws_url_override", "") ?: ""
        set(v) = p.edit().putString("ws_url_override", v).apply()

    var renderMode: String
        get() = p.getString("render_mode", "wrapper") ?: "wrapper"
        set(v) = p.edit().putString("render_mode", if (v == "direct") "direct" else "wrapper").apply()

    var directUrl: String
        get() = p.getString("direct_url", "") ?: ""
        set(v) = p.edit().putString("direct_url", v).apply()

    var directKiosk: Boolean
        get() = p.getBoolean("direct_kiosk", false)
        set(v) = p.edit().putBoolean("direct_kiosk", false).apply()

    /**
     * Kept for backwards compatibility with older configs. 3.0.13 always uses the
     * normal Home Assistant Android viewport and never forces a desktop viewport.
     */
    var directViewportMode: String
        get() = "normal"
        set(v) = p.edit().putString("direct_viewport_mode", "normal").apply()

    var directViewportWidth: Int
        get() = p.getInt("direct_viewport_width", 1920).coerceIn(800, 3840)
        set(v) = p.edit().putInt("direct_viewport_width", v.coerceIn(800, 3840)).apply()

    var directPageZoom: Int
        get() = p.getInt("direct_page_zoom", 0).coerceIn(0, 200)
        set(v) = p.edit().putInt("direct_page_zoom", v.coerceIn(0, 200)).apply()

    val isDirectMode: Boolean
        get() = renderMode == "direct"

    val isDesktopViewportMode: Boolean
        get() = isDirectMode && directViewportMode == "desktop"

    var registeredAtEpochMs: Long
        get() = p.getLong("registered_at_ms", 0L)
        set(v) = p.edit().putLong("registered_at_ms", v).apply()

    var setupDone: Boolean
        get() = p.getBoolean("setup_done", false)
        set(v) = p.edit().putBoolean("setup_done", v).apply()

    var kioskEnabled: Boolean
        get() = p.getBoolean("kiosk", false)
        set(v) = p.edit().putBoolean("kiosk", v).apply()

    var kioskPin: String
        get() = p.getString("pin", C.DEFAULT_PIN) ?: C.DEFAULT_PIN
        set(v) = p.edit().putString("pin", v).apply()

    var autoStart: Boolean
        get() = p.getBoolean("autostart", true)
        set(v) = p.edit().putBoolean("autostart", v).apply()

    var screenOn: Boolean
        get() = p.getBoolean("screen_on", true)
        set(v) = p.edit().putBoolean("screen_on", v).apply()

    var burnIn: Boolean
        get() = p.getBoolean("burnin", true)
        set(v) = p.edit().putBoolean("burnin", v).apply()

    var lightSensor: Boolean
        get() = p.getBoolean("light", true)
        set(v) = p.edit().putBoolean("light", v).apply()

    var motionDetect: Boolean
        get() = p.getBoolean("motion", false)
        set(v) = p.edit().putBoolean("motion", v).apply()

    var sensorBatteryDetails: Boolean
        get() = p.getBoolean("sensor_battery_details", true)
        set(v) = p.edit().putBoolean("sensor_battery_details", v).apply()

    var sensorNetworkDetails: Boolean
        get() = p.getBoolean("sensor_network_details", true)
        set(v) = p.edit().putBoolean("sensor_network_details", v).apply()

    var sensorStorageDetails: Boolean
        get() = p.getBoolean("sensor_storage_details", true)
        set(v) = p.edit().putBoolean("sensor_storage_details", v).apply()

    var sensorAudioDetails: Boolean
        get() = p.getBoolean("sensor_audio_details", true)
        set(v) = p.edit().putBoolean("sensor_audio_details", v).apply()

    var frontCameraEnabled: Boolean
        get() = p.getBoolean("front_camera_enabled", false)
        set(v) = p.edit().putBoolean("front_camera_enabled", v).apply()

    var backCameraEnabled: Boolean
        get() = p.getBoolean("back_camera_enabled", false)
        set(v) = p.edit().putBoolean("back_camera_enabled", v).apply()

    var cameraSilentMode: Boolean
        get() = p.getBoolean("camera_silent_mode", true)
        set(v) = p.edit().putBoolean("camera_silent_mode", v).apply()

    var cameraManualOnly: Boolean
        get() = p.getBoolean("camera_manual_only", false)
        set(v) = p.edit().putBoolean("camera_manual_only", v).apply()

    var cameraIntervalSeconds: Int
        get() = p.getInt("camera_interval_seconds", 15)
        set(v) = p.edit().putInt("camera_interval_seconds", v.coerceIn(5, 300)).apply()

    var reportInterval: Int
        get() = p.getInt("interval", 30)
        set(v) = p.edit().putInt("interval", v.coerceIn(15, 3600)).apply()


    var motionSensitivity: Float
        get() = p.getFloat("motion_sensitivity", 3.0f)
        set(v) = p.edit().putFloat("motion_sensitivity", v.coerceIn(1.0f, 20.0f)).apply()

    var motionHoldSeconds: Int
        get() = p.getInt("motion_hold_seconds", 8)
        set(v) = p.edit().putInt("motion_hold_seconds", v.coerceIn(2, 60)).apply()


    var assistSatelliteEnabled: Boolean
        get() = p.getBoolean("assist_satellite_enabled", true)
        set(v) = p.edit().putBoolean("assist_satellite_enabled", v).apply()

    var microphoneEnabled: Boolean
        get() = p.getBoolean("microphone_enabled", true)
        set(v) = p.edit().putBoolean("microphone_enabled", v).apply()

    var assistWakeWord: String
        get() = p.getString("assist_wake_word", "okay_nabu") ?: "okay_nabu"
        set(v) = p.edit().putString("assist_wake_word", v).apply()

    var assistWakeWord2: String
        get() = p.getString("assist_wake_word_2", "disabled") ?: "disabled"
        set(v) = p.edit().putString("assist_wake_word_2", v).apply()

    var assistAssistant: String
        get() = p.getString("assist_assistant", "default") ?: "default"
        set(v) = p.edit().putString("assist_assistant", v).apply()

    var assistAssistant2: String
        get() = p.getString("assist_assistant_2", "disabled") ?: "disabled"
        set(v) = p.edit().putString("assist_assistant_2", v).apply()

    var assistVadMode: String
        get() = p.getString("assist_vad_mode", "normal") ?: "normal"
        set(v) = p.edit().putString("assist_vad_mode", v).apply()

    var assistWakeSound: Boolean
        get() = p.getBoolean("assist_wake_sound", true)
        set(v) = p.edit().putBoolean("assist_wake_sound", v).apply()

    var assistButtonClickSounds: Boolean
        get() = p.getBoolean("assist_button_click_sounds", true)
        set(v) = p.edit().putBoolean("assist_button_click_sounds", v).apply()

    var assistTestMode: Boolean
        get() = p.getBoolean("assist_test_mode", false)
        set(v) = p.edit().putBoolean("assist_test_mode", v).apply()

    var assistServerAudioMode: Boolean
        get() = p.getBoolean("assist_server_audio_mode", false)
        set(v) = p.edit().putBoolean("assist_server_audio_mode", v).apply()

    var assistWakeProvider: String
        get() = p.getString("assist_wake_provider", "prepared_local") ?: "prepared_local"
        set(v) = p.edit().putString("assist_wake_provider", v).apply()

    val displayUrl: String
        get() = displayUrlOverride.ifBlank { "$haUrl${String.format(C.DISPLAY_PATH, deviceId)}" }

    fun resolveDirectDisplayUrl(): String {
        val raw = directUrl.ifBlank { "/lovelace" }.trim()
        // Direct mode should open exactly the Home Assistant page configured in the web UI.
        // Hiding the HA header/sidebar is handled by the native app WebView injection below,
        // not by adding unsupported query parameters to the URL.
        return if (raw.startsWith("http://") || raw.startsWith("https://")) raw else "${haUrl.trimEnd('/')}/${raw.trimStart('/')}"
    }

    fun resolveWsUrl(): String {
        val explicit = wsUrlOverride.trim()
        if (explicit.isNotBlank()) {
            return when {
                explicit.startsWith("ws://") || explicit.startsWith("wss://") -> explicit
                explicit.startsWith("https://") -> "wss://" + explicit.removePrefix("https://")
                explicit.startsWith("http://") -> "ws://" + explicit.removePrefix("http://")
                else -> explicit
            }
        }
        val base = haUrl.trimEnd('/')
        val wsBase = when {
            base.startsWith("https://") -> "wss://" + base.removePrefix("https://")
            base.startsWith("http://") -> "ws://" + base.removePrefix("http://")
            else -> "ws://" + base
        }
        return "$wsBase/ticker-display/ws/$deviceId"
    }

    fun isConfigured() = haUrl.isNotBlank() && token.isNotBlank()

    fun ensureStableDeviceIdentity(ctx: Context) {
        if (deviceName.isBlank()) {
            deviceName = Build.MODEL?.takeIf { it.isNotBlank() } ?: "Android Display"
        }
        if (deviceId.isBlank()) {
            val legacyBase = U.slugify(deviceName.ifBlank { Build.MODEL ?: "Android Display" })
            deviceId = legacyBase
        }
    }

    fun clear() = p.edit().clear().apply()
}

// ═══════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════
object L {
    private const val TAG = "TickerDisplay"
    private var logFile: File? = null
    private val df = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())

    fun init(ctx: Context) {
        try {
            val dir = File(ctx.filesDir, "logs")
            dir.mkdirs()
            logFile = File(dir, "ticker.log")
            if ((logFile?.length() ?: 0) > 5 * 1024 * 1024) {
                logFile?.delete()
                logFile?.createNewFile()
            }
        } catch (_: Exception) {}
    }

    fun d(tag: String, msg: String) {
        Log.d("$TAG/$tag", msg)
        write("D", tag, msg)
    }

    fun i(tag: String, msg: String) {
        Log.i("$TAG/$tag", msg)
        write("I", tag, msg)
    }

    fun w(tag: String, msg: String) {
        Log.w("$TAG/$tag", msg)
        write("W", tag, msg)
    }

    fun e(tag: String, msg: String, t: Throwable? = null) {
        Log.e("$TAG/$tag", msg, t)
        write("E", tag, "$msg ${t?.message ?: ""}")
    }

    private fun write(lvl: String, tag: String, msg: String) {
        try {
            logFile?.appendText("${df.format(Date())} [$lvl] $tag: $msg\n")
        } catch (_: Exception) {}
    }

    fun readTail(maxChars: Int = 12000): String {
        return try {
            val file = logFile ?: return ""
            if (!file.exists()) return ""
            val text = file.readText()
            if (text.length <= maxChars) text else text.takeLast(maxChars)
        } catch (_: Exception) {
            ""
        }
    }
}

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════
data class StorageInfo(val freeMb: Long, val totalMb: Long, val usedPercent: Int)

object U {
    fun isNetworkAvailable(ctx: Context): Boolean {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    fun getWifiSignal(ctx: Context): Int {
        val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION")
        return wm.connectionInfo?.rssi ?: -100
    }

    fun getWifiSsid(ctx: Context): String {
        val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION")
        return wm.connectionInfo?.ssid?.replace("\"", "") ?: "Unknown"
    }

    fun getWifiLinkSpeed(ctx: Context): Int {
        return try {
            val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            (wm.connectionInfo?.linkSpeed ?: 0).coerceAtLeast(0)
        } catch (_: Exception) { 0 }
    }

    fun getNetworkType(ctx: Context): String {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val net = cm.activeNetwork ?: return "offline"
                val caps = cm.getNetworkCapabilities(net) ?: return "offline"
                when {
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> "bluetooth"
                    else -> "other"
                }
            } else {
                @Suppress("DEPRECATION")
                when (cm.activeNetworkInfo?.type) {
                    ConnectivityManager.TYPE_WIFI -> "wifi"
                    ConnectivityManager.TYPE_ETHERNET -> "ethernet"
                    ConnectivityManager.TYPE_MOBILE -> "cellular"
                    ConnectivityManager.TYPE_BLUETOOTH -> "bluetooth"
                    else -> "other"
                }
            }
        } catch (_: Exception) {
            "unknown"
        }
    }

    fun getIp(): String {
        try {
            for (intf in NetworkInterface.getNetworkInterfaces()) {
                for (addr in intf.inetAddresses) {
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        return addr.hostAddress ?: ""
                    }
                }
            }
        } catch (_: Exception) {}
        return ""
    }

    fun getDeviceModel() = "${Build.MANUFACTURER} ${Build.MODEL}"
    fun getAndroidVersion() = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
    fun slugify(value: String): String {
        val lower = value.lowercase(Locale.ROOT)
        val cleaned = lower.replace(Regex("[^a-z0-9]+"), "_")
            .replace(Regex("_+"), "_")
            .trim('_')
        return if (cleaned.isBlank()) "android_display" else cleaned
    }

    fun normalizeHaUrl(raw: String): String {
        val value = raw.trim().trimEnd('/')
        if (value.isBlank() || value == "http://" || value == "https://") return value
        return if (value.startsWith("http://") || value.startsWith("https://")) value else "http://$value"
    }
    fun getAppVersion(ctx: Context): String {
        return try {
            val pm = ctx.packageManager
            val pkg = ctx.packageName
            if (Build.VERSION.SDK_INT >= 33) {
                pm.getPackageInfo(pkg, android.content.pm.PackageManager.PackageInfoFlags.of(0)).versionName
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(pkg, 0).versionName
            } ?: "unknown"
        } catch (_: Exception) { "unknown" }
    }

    fun getScreenRes(ctx: Context): String {
        val dm = ctx.resources.displayMetrics
        return "${dm.widthPixels}x${dm.heightPixels}"
    }


    fun isScreenInteractive(ctx: Context): Boolean {
        return try {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.isInteractive
        } catch (_: Exception) { true }
    }

    fun getScreenBrightnessPercent(ctx: Context): Int {
        try {
            val activity = ctx as? android.app.Activity
            val windowBrightness = activity?.window?.attributes?.screenBrightness
            if (windowBrightness != null && windowBrightness >= 0f) {
                return (windowBrightness * 100).toInt().coerceIn(0, 100)
            }
        } catch (_: Exception) {}
        return try {
            val b = Settings.System.getInt(ctx.contentResolver, Settings.System.SCREEN_BRIGHTNESS)
            ((b * 100) / 255).coerceIn(0, 100)
        } catch (_: Exception) { 0 }
    }

    fun getMemoryMB(ctx: Context): Long {
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val mi = android.app.ActivityManager.MemoryInfo()
        am.getMemoryInfo(mi)
        return mi.availMem / (1024 * 1024)
    }

    fun getTotalMemoryMB(ctx: Context): Long {
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val mi = android.app.ActivityManager.MemoryInfo()
        am.getMemoryInfo(mi)
        return mi.totalMem / (1024 * 1024)
    }

    fun getStorageInfo(ctx: Context): StorageInfo {
        return try {
            val stat = android.os.StatFs(ctx.filesDir.absolutePath)
            val total = stat.totalBytes / (1024 * 1024)
            val free = stat.availableBytes / (1024 * 1024)
            val usedPercent = if (total > 0) (((total - free).toDouble() / total) * 100).toInt() else 0
            StorageInfo(free, total, usedPercent.coerceIn(0, 100))
        } catch (_: Exception) {
            StorageInfo(0, 0, 0)
        }
    }

    fun getOrientation(ctx: Context): String {
        return when (ctx.resources.configuration.orientation) {
            android.content.res.Configuration.ORIENTATION_LANDSCAPE -> "landscape"
            android.content.res.Configuration.ORIENTATION_PORTRAIT -> "portrait"
            else -> "undefined"
        }
    }

    fun getVolumePercent(ctx: Context): Int {
        return try {
            val am = ctx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            val max = am.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC).coerceAtLeast(1)
            (am.getStreamVolume(android.media.AudioManager.STREAM_MUSIC) * 100 / max).coerceIn(0, 100)
        } catch (_: Exception) {
            0
        }
    }

    fun getRingerMode(ctx: Context): String {
        return try {
            val am = ctx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            when (am.ringerMode) {
                android.media.AudioManager.RINGER_MODE_SILENT -> "silent"
                android.media.AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
                else -> "normal"
            }
        } catch (_: Exception) {
            "unknown"
        }
    }

    fun generateDeviceId(): String {
        val model = Build.MODEL.replace(" ", "_").lowercase()
        val rand = (1000..9999).random()
        return "${model}_$rand"
    }
}

// ═══════════════════════════════════════════════════════════
// API CLIENT (MIT VOLLEM DEBUG LOGGING)
// ═══════════════════════════════════════════════════════════
class ApiClient(private val prefs: Prefs) {

    private val client: OkHttpClient

    init {
        prefs.haUrl = U.normalizeHaUrl(prefs.haUrl)
        Log.i("TickerDisplay/ApiClient", "Creating ApiClient")
        Log.i("TickerDisplay/ApiClient", "URL: ${prefs.haUrl}")
        Log.i("TickerDisplay/ApiClient", "Token length: ${prefs.token.length}")

        client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .hostnameVerifier { _, _ -> true }
            .build()
    }

    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val gson = Gson()

    fun testConnection(): Boolean {
        val url = "${prefs.haUrl}/api/"
        Log.i("TickerDisplay/ApiClient", "==============================")
        Log.i("TickerDisplay/ApiClient", "TESTING CONNECTION")
        Log.i("TickerDisplay/ApiClient", "URL: $url")
        Log.i("TickerDisplay/ApiClient", "Token: ${prefs.token.take(30)}...")
        Log.i("TickerDisplay/ApiClient", "==============================")

        val req = Request.Builder()
            .url(url)
            .get()
            .addHeader("Authorization", "Bearer ${prefs.token}")
            .addHeader("Content-Type", "application/json")
            .build()

        return try {
            Log.i("TickerDisplay/ApiClient", "Sending request...")
            val response = client.newCall(req).execute()
            val code = response.code
            val body = response.body?.string() ?: ""
            response.close()

            Log.i("TickerDisplay/ApiClient", "Response code: $code")
            Log.i("TickerDisplay/ApiClient", "Response body: $body")

            when (code) {
                200, 201 -> {
                    Log.i("TickerDisplay/ApiClient", "✅ SUCCESS!")
                    true
                }
                401 -> {
                    Log.e("TickerDisplay/ApiClient", "❌ 401 UNAUTHORIZED - Token wrong!")
                    Log.e("TickerDisplay/ApiClient", "Token used: ${prefs.token.take(50)}...")
                    false
                }
                403 -> {
                    Log.e("TickerDisplay/ApiClient", "❌ 403 FORBIDDEN")
                    false
                }
                404 -> {
                    Log.e("TickerDisplay/ApiClient", "❌ 404 NOT FOUND")
                    false
                }
                else -> {
                    Log.w("TickerDisplay/ApiClient", "⚠️ Unexpected: $code")
                    code in 200..299
                }
            }
        } catch (e: java.net.UnknownHostException) {
            Log.e("TickerDisplay/ApiClient", "❌ UNKNOWN HOST: ${prefs.haUrl}", e)
            false
        } catch (e: java.net.ConnectException) {
            Log.e("TickerDisplay/ApiClient", "❌ CONNECTION REFUSED", e)
            false
        } catch (e: java.net.SocketTimeoutException) {
            Log.e("TickerDisplay/ApiClient", "❌ TIMEOUT", e)
            false
        } catch (e: javax.net.ssl.SSLException) {
            Log.e("TickerDisplay/ApiClient", "❌ SSL ERROR", e)
            false
        } catch (e: Exception) {
            Log.e("TickerDisplay/ApiClient", "❌ ERROR: ${e.javaClass.simpleName}: ${e.message}", e)
            false
        }
    }

    fun post(path: String, data: Map<String, Any?>): Boolean {
        val url = "${prefs.haUrl}$path"
        Log.i("TickerDisplay/ApiClient", "POST $url")

        val jsonData = gson.toJson(data)
        Log.d("TickerDisplay/ApiClient", "Body: $jsonData")

        val body = jsonData.toRequestBody(jsonType)
        val req = Request.Builder()
            .url(url)
            .post(body)
            .addHeader("Authorization", "Bearer ${prefs.token}")
            .addHeader("Content-Type", "application/json")
            .build()

        return try {
            val response = client.newCall(req).execute()
            val code = response.code
            val responseBody = response.body?.string() ?: ""
            response.close()

            Log.i("TickerDisplay/ApiClient", "Response: $code - $responseBody")
            code in 200..299
        } catch (e: Exception) {
            Log.e("TickerDisplay/ApiClient", "POST failed: ${e.message}", e)
            false
        }
    }

    fun get(path: String): Boolean {
        val url = "${prefs.haUrl}$path"
        val req = Request.Builder()
            .url(url)
            .get()
            .addHeader("Authorization", "Bearer ${prefs.token}")
            .build()

        return try {
            val response = client.newCall(req).execute()
            val success = response.isSuccessful
            response.close()
            success
        } catch (e: Exception) {
            Log.e("TickerDisplay/ApiClient", "GET failed: ${e.message}", e)
            false
        }
    }

    fun registerDevice(): Boolean {
        Log.i("TickerDisplay/ApiClient", "=== REGISTERING DEVICE ===")
        prefs.ensureStableDeviceIdentity(App.instance)
        val data = mapOf(
            "device_id" to prefs.deviceId,
            "install_id" to prefs.installId,
            "name" to prefs.deviceName,
            "model" to U.getDeviceModel(),
            "android_version" to U.getAndroidVersion(),
            "screen_resolution" to U.getScreenRes(App.instance),
            "app_version" to U.getAppVersion(App.instance)
        )
        val url = "${prefs.haUrl}${C.API_REGISTER}"
        val req = Request.Builder()
            .url(url)
            .post(gson.toJson(data).toRequestBody("application/json; charset=utf-8".toMediaType()))
            .addHeader("Authorization", "Bearer ${prefs.token}")
            .build()
        return try {
            client.newCall(req).execute().use { res ->
                val body = res.body?.string().orEmpty()
                Log.i("TickerDisplay/ApiClient", "Register response: ${res.code} - $body")
                if (!res.isSuccessful) return false
                runCatching {
                    val obj = gson.fromJson(body, Map::class.java)
                    val returnedId = obj["device_id"]?.toString()?.trim().orEmpty()
                    val displayUrl = obj["display_url"]?.toString()?.trim().orEmpty()
                    val wsUrl = obj["ws_url"]?.toString()?.trim().orEmpty()
                    if (returnedId.isNotBlank()) prefs.deviceId = returnedId
                    if (displayUrl.isNotBlank()) prefs.displayUrlOverride = displayUrl
                    if (wsUrl.isNotBlank()) prefs.wsUrlOverride = wsUrl
                    val renderMode = obj["render_mode"]?.toString()?.trim().orEmpty()
                    val directUrl = obj["direct_url"]?.toString()?.trim().orEmpty()
                    val directKiosk = obj["direct_kiosk"]
                    val directViewportMode = obj["direct_viewport_mode"]?.toString()?.trim().orEmpty()
                    val directViewportWidth = obj["direct_viewport_width"]
                    val directPageZoom = obj["direct_page_zoom"]
                    if (renderMode.isNotBlank()) prefs.renderMode = renderMode
                    if (directUrl.isNotBlank()) prefs.directUrl = directUrl
                    if (directKiosk != null) prefs.directKiosk = directKiosk.toString().equals("true", ignoreCase = true)
                    if (directViewportMode.isNotBlank()) prefs.directViewportMode = directViewportMode
                    parseIntConfig(directViewportWidth)?.let { prefs.directViewportWidth = it }
                    parseIntConfig(directPageZoom)?.let { prefs.directPageZoom = it }
                    prefs.registeredAtEpochMs = System.currentTimeMillis()
                }
                true
            }
        } catch (e: Exception) {
            Log.e("TickerDisplay/ApiClient", "Register failed", e)
            false
        }
    }

    private fun parseIntConfig(value: Any?): Int? {
        return when (value) {
            is Number -> value.toInt()
            is String -> value.trim().toDoubleOrNull()?.toInt()
            else -> null
        }
    }

    fun syncDeviceConfig(): Boolean {
        prefs.ensureStableDeviceIdentity(App.instance)
        val url = "${prefs.haUrl}/ticker-display/api/device/${prefs.deviceId}/config"
        val req = Request.Builder()
            .url(url)
            .get()
            .addHeader("Authorization", "Bearer ${prefs.token}")
            .addHeader("Accept", "application/json")
            .build()
        return try {
            client.newCall(req).execute().use { res ->
                val body = res.body?.string().orEmpty()
                if (!res.isSuccessful) {
                    Log.w("TickerDisplay/ApiClient", "Config sync failed: ${res.code} - $body")
                    return false
                }
                val obj = gson.fromJson(body, Map::class.java) ?: return false
                obj["render_mode"]?.toString()?.let { prefs.renderMode = it }
                obj["direct_url"]?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let { prefs.directUrl = it }
                obj["direct_kiosk"]?.let { prefs.directKiosk = it.toString().equals("true", ignoreCase = true) }
                obj["direct_viewport_mode"]?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let { prefs.directViewportMode = it }
                parseIntConfig(obj["direct_viewport_width"])?.let { prefs.directViewportWidth = it }
                parseIntConfig(obj["direct_page_zoom"])?.let { prefs.directPageZoom = it }
                val screens = obj["screens"] as? List<*>
                if (prefs.directUrl.isBlank() && !screens.isNullOrEmpty()) {
                    val first = screens.firstOrNull() as? Map<*, *>
                    val urlValue = (first?.get("url") ?: first?.get("page_url") ?: first?.get("kiosk_url"))?.toString()?.trim().orEmpty()
                    if (urlValue.isNotBlank()) prefs.directUrl = urlValue
                }
                L.i("ApiClient", "Config synced: render=${prefs.renderMode} direct=${prefs.directUrl} viewport=${prefs.directViewportMode}/${prefs.directViewportWidth} zoom=${prefs.directPageZoom}")
                true
            }
        } catch (e: Exception) {
            Log.e("TickerDisplay/ApiClient", "Config sync error", e)
            false
        }
    }

    fun ensureRegistered(maxAgeHours: Long = 24): Boolean {
        prefs.ensureStableDeviceIdentity(App.instance)
        val ageMs = System.currentTimeMillis() - prefs.registeredAtEpochMs
        if (prefs.registeredAtEpochMs > 0L && ageMs < maxAgeHours * 60L * 60L * 1000L) return true
        return registerDevice()
    }

    fun sendHeartbeat(sensorData: Map<String, Any?>): Boolean {
        val data = mutableMapOf<String, Any?>("device_id" to prefs.deviceId)
        data.putAll(sensorData)
        return post(C.API_HEARTBEAT, data)
    }

    fun sendEvent(event: String, eventData: Map<String, Any?> = emptyMap()): Boolean {
        val data = mapOf(
            "device_id" to prefs.deviceId,
            "event" to event,
            "data" to eventData
        )
        return post(C.API_EVENT, data)
    }

    fun sendEventAsync(event: String, eventData: Map<String, Any?> = emptyMap()) {
        Thread {
            try { sendEvent(event, eventData) } catch (_: Exception) {}
        }.start()
    }

    fun uploadCameraSnapshot(camera: String, jpegBytes: ByteArray): Boolean {
        val payload = mapOf(
            "device_id" to prefs.deviceId,
            "camera" to camera,
            "content_type" to "image/jpeg",
            "image_base64" to Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
        )
        return post(C.API_CAMERA_UPLOAD, payload)
    }
}

// ═══════════════════════════════════════════════════════════
// CONNECTION MONITOR
// ═══════════════════════════════════════════════════════════
class ConnectionMonitor(
    private val ctx: Context,
    private val onChange: (Boolean) -> Unit
) {
    private val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private var callback: ConnectivityManager.NetworkCallback? = null
    private var receiver: android.content.BroadcastReceiver? = null

    fun start() {
        try {
            onChange(isConnected())
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                callback = object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        onChange(true)
                    }
                    override fun onLost(network: Network) {
                        onChange(false)
                    }
                    override fun onUnavailable() {
                        onChange(false)
                    }
                }
                cm.registerDefaultNetworkCallback(callback!!)
            } else {
                receiver = object : android.content.BroadcastReceiver() {
                    override fun onReceive(c: Context?, intent: android.content.Intent?) {
                        onChange(isConnected())
                    }
                }
                @Suppress("DEPRECATION")
                ctx.registerReceiver(receiver, android.content.IntentFilter(ConnectivityManager.CONNECTIVITY_ACTION))
            }
        } catch (e: Exception) {
            L.w("ConnectionMonitor", "Network callback failed, using current state only: ${e.message}")
            onChange(isConnected())
        }
    }

    fun stop() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            callback?.let {
                try { cm.unregisterNetworkCallback(it) } catch (_: Exception) {}
            }
        } else {
            receiver?.let {
                try { ctx.unregisterReceiver(it) } catch (_: Exception) {}
            }
        }
    }

    fun isConnected() = U.isNetworkAvailable(ctx)
}

// ═══════════════════════════════════════════════════════════
// JAVASCRIPT BRIDGE
// ═══════════════════════════════════════════════════════════
class Bridge(
    private val ctx: Context,
    private val prefs: Prefs,
    private val screen: ScreenManager,
    private val sound: SoundPlayer,
    private val sensors: SensorReporter,
    private val onNativeSettingChanged: ((String, Any?) -> Unit)? = null,
) {
    private fun resolveMediaUrl(url: String): String {
        val trimmed = url.trim()
        if (trimmed.isBlank()) return trimmed
        return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "${prefs.haUrl}${trimmed}"
    }

    private fun mediaHeaders(): Map<String, String> {
        val token = prefs.token.trim()
        return if (token.isBlank()) emptyMap() else mapOf(
            "Authorization" to "Bearer $token",
            "Accept" to "audio/*,*/*"
        )
    }

    private fun boolValue(value: String): Boolean {
        val normalized = value.trim().lowercase(Locale.ROOT)
        return normalized == "1" || normalized == "true" || normalized == "on" || normalized == "yes" || normalized == "enabled"
    }

    private fun floatValue(value: String, fallback: Float): Float = value.trim().replace(',', '.').toFloatOrNull() ?: fallback
    private fun intValue(value: String, fallback: Int): Int = value.trim().toFloatOrNull()?.toInt() ?: fallback

    @JavascriptInterface
    fun setDeviceSetting(key: String, value: String): Boolean {
        val setting = key.trim().lowercase(Locale.ROOT)
        return try {
            val normalized: Any? = when (setting) {
                "screen_power" -> {
                    val enabled = boolValue(value)
                    if (enabled) {
                        if (screen.getBrightness() < 5) screen.setBrightness(70)
                        screen.screenOn()
                    } else {
                        screen.screenOff()
                    }
                    enabled
                }
                "screen_brightness", "brightness" -> {
                    val level = intValue(value, screen.getBrightness()).coerceIn(1, 100)
                    screen.setBrightness(level)
                    level
                }
                "volume", "volume_percent", "media_volume" -> {
                    val level = intValue(value, 50).coerceIn(0, 100)
                    sound.setVolume(level)
                    level
                }
                "keep_screen_on", "screen_on_pref" -> boolValue(value).also { prefs.screenOn = it }
                "kiosk", "kiosk_enabled", "kiosk_mode" -> boolValue(value).also { prefs.kioskEnabled = it }
                "auto_start", "autostart" -> boolValue(value).also { prefs.autoStart = it }
                "burn_in", "burn_in_protection" -> boolValue(value).also { prefs.burnIn = it }
                "light_sensor", "light_sensor_enabled" -> boolValue(value).also { prefs.lightSensor = it }
                "motion", "motion_detect", "motion_detection", "motion_detection_enabled" -> boolValue(value).also { prefs.motionDetect = it }
                "front_camera", "front_camera_enabled" -> boolValue(value).also { prefs.frontCameraEnabled = it }
                "back_camera", "back_camera_enabled" -> boolValue(value).also { prefs.backCameraEnabled = it }
                "camera_silent", "camera_silent_mode" -> boolValue(value).also { prefs.cameraSilentMode = it }
                "camera_manual_only" -> boolValue(value).also { prefs.cameraManualOnly = it }
                "microphone", "microphone_enabled" -> boolValue(value).also { prefs.microphoneEnabled = it }
                "assist_satellite", "assist_satellite_enabled" -> boolValue(value).also { prefs.assistSatelliteEnabled = it }
                "report_interval", "report_interval_seconds" -> intValue(value, prefs.reportInterval).coerceIn(15, 3600).also { prefs.reportInterval = it }
                "camera_interval", "camera_interval_seconds" -> intValue(value, prefs.cameraIntervalSeconds).coerceIn(5, 300).also { prefs.cameraIntervalSeconds = it }
                "motion_sensitivity" -> floatValue(value, prefs.motionSensitivity).coerceIn(1.0f, 20.0f).also { prefs.motionSensitivity = it }
                "motion_hold", "motion_hold_seconds" -> intValue(value, prefs.motionHoldSeconds).coerceIn(2, 60).also { prefs.motionHoldSeconds = it }
                else -> {
                    L.w("Bridge", "Unknown device setting: $setting")
                    return false
                }
            }
            try { onNativeSettingChanged?.invoke(setting, normalized) } catch (_: Exception) {}
            true
        } catch (e: Exception) {
            L.e("Bridge", "setDeviceSetting failed for $setting", e)
            false
        }
    }

    @JavascriptInterface fun restartApp() {
        try {
            val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
            if (launch != null) {
                launch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
                ctx.startActivity(launch)
            }
        } catch (e: Exception) { L.e("Bridge", "restartApp failed", e) }
    }

    @JavascriptInterface fun openAndroidSettings() {
        try {
            val intent = android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = android.net.Uri.parse("package:${ctx.packageName}")
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(intent)
        } catch (e: Exception) { L.e("Bridge", "openAndroidSettings failed", e) }
    }

    @JavascriptInterface fun reportDeviceStateNow() = sensors.reportNow()
    @JavascriptInterface fun setScreenBrightness(b: Int) = screen.setBrightness(b)
    @JavascriptInterface fun getScreenBrightness(): Int = screen.getBrightness()
    @JavascriptInterface fun setScreenPower(on: Boolean) {
        if (on) {
            if (screen.getBrightness() < 5) screen.setBrightness(70)
            screen.screenOn()
        } else {
            screen.screenOff()
        }
    }
    @JavascriptInterface fun isScreenOn(): Boolean = screen.isScreenOn()
    @JavascriptInterface fun setScreenOrientation(degrees: Int) = screen.setOrientation(degrees)

    @JavascriptInterface fun playSound(url: String) {
        val full = resolveMediaUrl(url)
        sound.play(full, 100, false, mediaHeaders())
    }
    @JavascriptInterface fun playSoundLoop(url: String) {
        val full = resolveMediaUrl(url)
        sound.play(full, 100, true, mediaHeaders())
    }
    @JavascriptInterface fun playAlertSound(url: String, volume: Int, loop: Boolean) {
        val full = resolveMediaUrl(url)
        sound.play(full, volume.coerceIn(0, 100), loop, mediaHeaders())
    }
    @JavascriptInterface fun stopSound() = sound.stop()
    @JavascriptInterface fun setVolume(v: Int) = sound.setVolume(v)
    @JavascriptInterface fun playAnnouncement(url: String, volume: Int) {
        val full = resolveMediaUrl(url)
        L.i("Bridge", "playAnnouncement url=$full volume=$volume")
        sound.playAnnouncement(full, volume.coerceIn(0, 100), mediaHeaders())
    }
    @JavascriptInterface fun pauseSound() = sound.pause()
    @JavascriptInterface fun resumeSound() = sound.resume()
    @JavascriptInterface fun nextSound() = sound.next()
    @JavascriptInterface fun previousSound() = sound.previous()
    @JavascriptInterface
    fun assistCommand(json: String) {
        try {
            val raw = Gson().fromJson(json, Map::class.java) ?: emptyMap<String, Any?>()
            val action = raw["action"]?.toString().orEmpty().lowercase()
            L.i("Bridge", "assistCommand action=$action payload=$json")
            when (action) {
                "announce" -> {
                    val mediaUrl = raw["media_url"]?.toString().orEmpty()
                    val message = raw["message"]?.toString().orEmpty()
                    val volume = raw["volume"]?.toString()?.toIntOrNull() ?: 90
                    if (mediaUrl.isNotBlank()) {
                        playAnnouncement(mediaUrl, volume)
                    } else if (message.isNotBlank()) {
                        sound.speak(message, "de-DE", volume)
                    } else {
                        L.w("Bridge", "assist announce without media_url/message")
                    }
                }
                "restart" -> {
                    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
                    if (launch != null) {
                        launch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
                        ctx.startActivity(launch)
                        showToast("Ticker Display startet neu")
                    }
                }
                else -> L.i("Bridge", "assist/sprach action ignored: $action")
            }
        } catch (e: Exception) {
            L.e("Bridge", "assistCommand failed", e)
        }
    }

    @JavascriptInterface
    fun showToast(message: String) {
        try {
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                android.widget.Toast.makeText(ctx.applicationContext, message.take(120), android.widget.Toast.LENGTH_SHORT).show()
            }
        } catch (_: Exception) {}
    }

    @JavascriptInterface
    fun vibrate(ms: Long) {
        try {
            val pulse = ms.coerceIn(50L, 5000L)
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        val vm = ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? android.os.VibratorManager
                        val vibrator = vm?.defaultVibrator
                        if (vibrator?.hasVibrator() == true) {
                            vibrator.vibrate(android.os.VibrationEffect.createOneShot(pulse, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
                        }
                    } else {
                        @Suppress("DEPRECATION")
                        val v = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator
                        if (v?.hasVibrator() == true) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                v.vibrate(android.os.VibrationEffect.createOneShot(pulse, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
                            } else {
                                @Suppress("DEPRECATION")
                                v.vibrate(pulse)
                            }
                        }
                    }
                } catch (_: Exception) {}
            }
        } catch (_: Exception) {}
    }

    @JavascriptInterface fun getBatteryLevel(): Int = (sensors.collectData()["battery_level"] as? Int) ?: -1
    @JavascriptInterface fun isBatteryCharging(): Boolean = (sensors.collectData()["battery_charging"] as? Boolean) ?: false
    @JavascriptInterface fun getBatteryTemperature(): Float = (sensors.collectData()["battery_temperature"] as? Float) ?: 0f
    @JavascriptInterface fun getWifiSignal(): Int = U.getWifiSignal(ctx)
    @JavascriptInterface fun getWifiSsid(): String = U.getWifiSsid(ctx)
    @JavascriptInterface fun getIpAddress(): String = U.getIp()
    @JavascriptInterface fun getLightLevel(): Float = sensors.getLightLevel()
    @JavascriptInterface fun isMotionDetected(): Boolean = sensors.isMotionDetected()
    @JavascriptInterface fun getProximity(): Boolean = sensors.isProximityNear()

    @JavascriptInterface fun getDeviceId(): String = prefs.deviceId
    @JavascriptInterface fun getDeviceName(): String = prefs.deviceName
    @JavascriptInterface fun getDeviceModel(): String = U.getDeviceModel()
    @JavascriptInterface fun getAndroidVersion(): String = U.getAndroidVersion()
    @JavascriptInterface fun getAppVersion(): String {
        return try {
            ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "1.0.0"
        } catch (_: Exception) { "1.0.0" }
    }
    @JavascriptInterface fun getScreenResolution(): String = U.getScreenRes(ctx)
    @JavascriptInterface fun getMemoryFree(): Long = U.getMemoryMB(ctx)

    @JavascriptInterface fun isKioskMode(): Boolean = prefs.kioskEnabled
    @JavascriptInterface fun exitKiosk(pin: String): Boolean = pin == prefs.kioskPin
    @JavascriptInterface
    fun openSettings(pin: String): Boolean {
        if (pin == prefs.kioskPin) {
            val intent = android.content.Intent(ctx, SettingsActivity::class.java)
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
            return true
        }
        return false
    }
}


/**
 * Minimal official Home Assistant externalApp bridge.
 *
 * Home Assistant Companion does not authenticate Lovelace by sending an
 * Authorization header to the page. It loads the frontend with
 * ?external_auth=1 and exposes window.externalApp. The frontend then asks the
 * native app for an access token through getExternalAuth().
 *
 * Without this bridge HA behaves like a normal Android browser instead of the
 * Companion App, which is exactly what broke sections dashboards on the user's
 * tablet/phone.
 */
private class HaExternalAppBridge(
    private val webView: WebView,
    private val prefs: Prefs,
) {
    private val gson = Gson()

    private fun evaluate(script: String) {
        try {
            webView.post { webView.evaluateJavascript(script, null) }
        } catch (_: Throwable) {}
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseMap(raw: String): Map<String, Any?> {
        return try {
            (gson.fromJson(raw, Map::class.java) as? Map<String, Any?>) ?: emptyMap()
        } catch (_: Throwable) {
            emptyMap()
        }
    }

    @JavascriptInterface
    fun getExternalAuth(payload: String) {
        val data = parseMap(payload)
        val callback = (data["callback"]?.toString()?.takeIf { it.isNotBlank() } ?: "externalAuthSetToken").trim()
        if (callback != "externalAuthSetToken") return

        val token = prefs.token.trim()
        if (token.isBlank()) {
            evaluate("$callback(false);")
            return
        }

        // HA frontend expects the same JSON shape as the official Android app:
        // externalAuthSetToken(true, {"access_token":"...","expires_in":3600})
        // The configured HA token is used as the access token for this app mode.
        val authJson = gson.toJson(
            mapOf(
                "access_token" to token,
                "expires_in" to 315360000
            )
        )
        evaluate("$callback(true, $authJson);")
    }

    @JavascriptInterface
    fun revokeExternalAuth(payload: String) {
        val data = parseMap(payload)
        val callback = (data["callback"]?.toString()?.takeIf { it.isNotBlank() } ?: "externalAuthRevokeToken").trim()
        if (callback == "externalAuthRevokeToken") {
            evaluate("$callback(true);")
        }
    }

    @JavascriptInterface
    fun externalBus(message: String) {
        val data = parseMap(message)
        val type = data["type"]?.toString().orEmpty()
        val rawId = data["id"]
        val id: Any? = when (rawId) {
            is Number -> rawId.toInt()
            else -> rawId
        }

        when (type) {
            "config/get" -> {
                val result = mapOf(
                    "hasSettingsScreen" to false,
                    "canWriteTag" to false,
                    "hasExoPlayer" to false,
                    "canCommissionMatter" to false,
                    "canImportThreadCredentials" to false,
                    "hasAssist" to false,
                    "hasBarCodeScanner" to 0,
                    "canSetupImprov" to false,
                    "downloadFileSupported" to true,
                    "appVersion" to "Ticker Display 3.0.15",
                    "hasEntityAddTo" to false,
                    "hasAssistSettings" to false
                )
                val response = gson.toJson(
                    mapOf(
                        "id" to id,
                        "type" to "result",
                        "success" to true,
                        "result" to result
                    )
                )
                evaluate("if (window.externalBus) { window.externalBus($response); }")
            }
            "connection-status", "theme-update", "haptic" -> {
                // Fire-and-forget messages. No response required.
            }
            else -> {
                if (id != null) {
                    val response = gson.toJson(
                        mapOf(
                            "id" to id,
                            "type" to "result",
                            "success" to true,
                            "result" to emptyMap<String, Any>()
                        )
                    )
                    evaluate("if (window.externalBus) { window.externalBus($response); }")
                }
            }
        }
    }
}


// ═══════════════════════════════════════════════════════════
// WEBVIEW MANAGER
// ═══════════════════════════════════════════════════════════
class WebViewManager(
    private val webView: WebView,
    private val prefs: Prefs,
    private val bridge: Bridge
) {
    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    fun configure() {
        try {
            WebView.setWebContentsDebuggingEnabled(true)
        } catch (_: Throwable) {}

        try {
            CookieManager.getInstance().setAcceptCookie(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
            }
        } catch (_: Throwable) {}

        webView.settings.apply {
            // 3.0.14: keep this intentionally close to the official Home Assistant
            // Android HAWebView.defaultSettings(). The old Ticker Display WebView
            // changed viewport, overview mode, layout flags and injected CSS/JS; those
            // changes break Home Assistant sections dashboards on Android.
            minimumFontSize = 5
            javaScriptEnabled = true
            domStorageEnabled = true
            displayZoomControls = false
            builtInZoomControls = false
            setSupportZoom(false)
            userAgentString = "$userAgentString HomeAssistant/Android TickerDisplayAndroid/3.0.14"

            // Keep storage/cache like a normal browser / the official HA app.
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            loadsImagesAutomatically = true
            blockNetworkImage = false
            javaScriptCanOpenWindowsAutomatically = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                safeBrowsingEnabled = false
            }

            // Important: do not touch these in Direct Mode. The defaults are what the
            // official app uses and what HA sections expects.
            if (!prefs.isDirectMode) {
                useWideViewPort = false
                loadWithOverviewMode = false
                layoutAlgorithm = WebSettings.LayoutAlgorithm.NORMAL
                textZoom = 100
            }
        }

        webView.setBackgroundColor(android.graphics.Color.TRANSPARENT)
        webView.overScrollMode = android.view.View.OVER_SCROLL_IF_CONTENT_SCROLLS

        if (prefs.isDirectMode) {
            webView.removeJavascriptInterface("TickerBridge")
            webView.addJavascriptInterface(HaExternalAppBridge(webView, prefs), "externalApp")
        } else {
            webView.removeJavascriptInterface("externalApp")
            webView.addJavascriptInterface(bridge, "TickerBridge")
        }
        webView.webViewClient = TickerWebViewClient(prefs)
        webView.webChromeClient = TickerWebChromeClient()
    }

    private fun addCacheBuster(url: String): String {
        val separator = if (url.contains("?")) "&" else "?"
        return "$url${separator}_td_app_ts=${System.currentTimeMillis()}"
    }

    private fun addQueryParam(url: String, key: String, value: String): String {
        val separator = if (url.contains("?")) "&" else "?"
        return if (url.contains("$key=")) url else "$url$separator$key=$value"
    }

    fun load() {
        val targetUrl = if (prefs.isDirectMode) prefs.resolveDirectDisplayUrl() else prefs.displayUrl
        val url = if (prefs.isDirectMode) {
            // Official HA app behaviour: no Authorization header for the page.
            // Instead load with external_auth=1 and answer frontend auth requests through window.externalApp.
            addQueryParam(targetUrl, "external_auth", "1")
        } else {
            addCacheBuster(targetUrl)
        }
        Log.i("TickerDisplay/WebView", "Loading: $url mode=${prefs.renderMode} haExternalApp=${prefs.isDirectMode}")
        val headers = mutableMapOf<String, String>()
        if (!prefs.isDirectMode) {
            headers["Cache-Control"] = "no-cache"
            headers["Pragma"] = "no-cache"
            val token = prefs.token.trim()
            if (token.isNotBlank()) {
                headers["Authorization"] = "Bearer $token"
            }
        }
        webView.loadUrl(url, headers)
    }

    fun reload() = load()

    fun destroy() {
        try { webView.removeJavascriptInterface("TickerBridge") } catch (_: Throwable) {}
        try { webView.removeJavascriptInterface("externalApp") } catch (_: Throwable) {}
        webView.destroy()
    }
}

class TickerWebViewClient(private val prefs: Prefs) : WebViewClient() {
    var onPageLoaded: (() -> Unit)? = null
    var onPageError: (() -> Unit)? = null

    private fun applyOfficialHaAppZoom(view: WebView?) {
        // Intentionally no forced scale here.
        // The official app applies user-configurable page zoom; forcing density * 100
        // in this project made sections dashboards render as very narrow columns.
        // Leaving the WebView at its default scale matches Chrome/HA app rendering better.
    }

    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
        Log.d("TickerDisplay/WebView", "Loading: $url")
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        Log.d("TickerDisplay/WebView", "Loaded: $url")
        applyOfficialHaAppZoom(view)
        onPageLoaded?.invoke()
    }

    override fun onReceivedError(view: WebView?, req: WebResourceRequest?, err: WebResourceError?) {
        if (req?.isForMainFrame == true) {
            Log.e("TickerDisplay/WebView", "Error: ${err?.description}")
            onPageError?.invoke()
        }
    }

    override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
        handler?.proceed()
    }

    override fun shouldOverrideUrlLoading(view: WebView?, req: WebResourceRequest?): Boolean {
        // Let the WebView handle normal HTTP(S) navigation exactly like the HA app browser.
        val url = req?.url?.toString() ?: return false
        return !(url.startsWith("http://") || url.startsWith("https://"))
    }
}

class TickerWebChromeClient : WebChromeClient() {
    var onConsoleError: ((String) -> Unit)? = null

    override fun onConsoleMessage(cm: ConsoleMessage?): Boolean {
        cm?.let {
            val msg = "[${it.messageLevel()}] ${it.message()} (${it.sourceId()}:${it.lineNumber()})"
            Log.d("TickerDisplay/WebConsole", msg)
            if (it.messageLevel() == ConsoleMessage.MessageLevel.ERROR || it.message().contains("Uncaught", ignoreCase = true)) {
                onConsoleError?.invoke(msg)
            }
        }
        return true
    }
}
