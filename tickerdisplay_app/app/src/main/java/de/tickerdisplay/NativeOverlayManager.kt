package de.tickerdisplay

import android.app.Activity
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import com.google.gson.Gson
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

class NativeOverlayManager(
    private val activity: Activity,
    private val prefs: Prefs,
    private val sound: SoundPlayer,
) {
    private val gson = Gson()
    private val handler = Handler(Looper.getMainLooper())
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .hostnameVerifier { _, _ -> true }
        .build()

    private var ws: WebSocket? = null
    private var reconnectRunnable: Runnable? = null
    private var active = false
    private var reconnectDelayMs = 1500L
    private var alertHideRunnable: Runnable? = null
    private var tickerHideRunnable: Runnable? = null

    private val root: FrameLayout? by lazy { activity.findViewById(R.id.native_overlay_root) }
    private val alertOverlay: View? by lazy { activity.findViewById(R.id.native_alert_overlay) }
    private val alertCard: View? by lazy { activity.findViewById(R.id.native_alert_card) }
    private val alertTitle: TextView? by lazy { activity.findViewById(R.id.native_alert_title) }
    private val alertMessage: TextView? by lazy { activity.findViewById(R.id.native_alert_message) }
    private val tickerBar: TextView? by lazy { activity.findViewById(R.id.native_ticker_bar) }

    fun setActive(enabled: Boolean) {
        if (active == enabled) return
        active = enabled
        handler.post {
            root?.visibility = if (enabled) View.VISIBLE else View.GONE
            if (!enabled) clearUi()
        }
        if (enabled) connect() else disconnect()
    }

    fun refreshForPrefs() {
        setActive(prefs.isDirectMode)
        if (active) {
            disconnect()
            connect()
        }
    }

    fun connect() {
        if (!active) return
        disconnect(cancelReconnect = false)
        val url = prefs.resolveWsUrl()
        val requestBuilder = Request.Builder().url(url)
        val token = prefs.token.trim()
        if (token.isNotBlank()) requestBuilder.addHeader("Authorization", "Bearer $token")
        L.i("NativeOverlay", "Connecting overlay websocket: $url")
        ws = client.newWebSocket(requestBuilder.build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                reconnectDelayMs = 1500L
                webSocket.send("{\"type\":\"subscribe\",\"entities\":[]}")
                L.i("NativeOverlay", "Overlay websocket connected")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                L.w("NativeOverlay", "Overlay websocket failed: ${t.message}")
                scheduleReconnect()
            }
        })
    }

    fun disconnect(cancelReconnect: Boolean = true) {
        try { ws?.close(1000, "closed") } catch (_: Exception) {}
        ws = null
        if (cancelReconnect) {
            reconnectRunnable?.let { handler.removeCallbacks(it) }
            reconnectRunnable = null
        }
    }

    private fun scheduleReconnect() {
        if (!active) return
        reconnectRunnable?.let { handler.removeCallbacks(it) }
        val delay = reconnectDelayMs.coerceAtMost(30000L)
        reconnectDelayMs = (reconnectDelayMs * 1.6).toLong().coerceAtMost(30000L)
        reconnectRunnable = Runnable { if (active) connect() }
        handler.postDelayed(reconnectRunnable!!, delay)
    }

    private fun handleMessage(text: String) {
        try {
            val raw = gson.fromJson(text, Map::class.java) ?: return
            val type = raw["type"]?.toString().orEmpty()
            when (type) {
                "alert" -> showAlert((raw["data"] as? Map<*, *>) ?: emptyMap<Any, Any>())
                "ticker" -> showTicker(raw["messages"] as? List<*> ?: emptyList<Any>())
                "command" -> handleCommand(raw["command"]?.toString().orEmpty(), (raw["data"] as? Map<*, *>) ?: emptyMap<Any, Any>())
                "audio" -> handleAudio((raw["data"] as? Map<*, *>) ?: emptyMap<Any, Any>())
            }
        } catch (e: Exception) {
            L.w("NativeOverlay", "Message parse failed: ${e.message}")
        }
    }

    private fun value(data: Map<*, *>, key: String, fallback: String = ""): String = data[key]?.toString() ?: fallback
    private fun intValue(data: Map<*, *>, key: String, fallback: Int): Int = value(data, key).toDoubleOrNull()?.toInt() ?: fallback
    private fun boolValue(data: Map<*, *>, key: String): Boolean = value(data, key).lowercase() in setOf("1", "true", "yes", "on", "ja")

    private fun handleCommand(command: String, data: Map<*, *>) {
        when (command) {
            "clear_alert" -> handler.post { hideAlert() }
            "clear_ticker" -> handler.post { hideTicker() }
            "identify" -> showAlert(mapOf("title" to prefs.deviceName, "message" to prefs.deviceId, "color" to "#2196f3", "duration" to 3))
            "show_clock", "show_weather", "show_camera" -> {
                // These rich modules still render in the web wrapper. In Direct mode we keep the HA view clean.
                L.i("NativeOverlay", "Command $command ignored in native direct mode")
            }
        }
    }

    private fun handleAudio(data: Map<*, *>) {
        val action = value(data, "action")
        val url = value(data, "url", value(data, "media_url"))
        val volume = intValue(data, "volume", 100).coerceIn(0, 100)
        if ((action == "play" || action == "announce") && url.isNotBlank()) sound.play(resolveMediaUrl(url), volume, boolValue(data, "loop"), mediaHeaders())
        else if (action == "stop") sound.stop()
    }

    private fun showAlert(data: Map<*, *>) {
        val title = value(data, "title", "Info")
        val message = value(data, "message", "")
        val color = value(data, "color", if (value(data, "severity") == "critical") "#dc2626" else "#ff9800")
        val duration = intValue(data, "duration", 0).coerceIn(0, 86400)
        val soundUrl = value(data, "sound_url", value(data, "sound"))
        val volume = intValue(data, "volume", 100).coerceIn(0, 100)
        handler.post {
            root?.visibility = View.VISIBLE
            alertOverlay?.visibility = View.VISIBLE
            alertTitle?.text = title
            alertMessage?.text = message
            try { alertCard?.setBackgroundColor(Color.parseColor(color)) } catch (_: Exception) {}
            alertHideRunnable?.let { handler.removeCallbacks(it) }
            if (duration > 0) {
                alertHideRunnable = Runnable { hideAlert() }
                handler.postDelayed(alertHideRunnable!!, duration * 1000L)
            }
        }
        if (soundUrl.isNotBlank()) sound.play(resolveMediaUrl(soundUrl), volume, false, mediaHeaders())
        if (boolValue(data, "vibrate")) vibrate(500)
    }

    private fun showTicker(items: List<*>) {
        val texts = items.mapNotNull { item ->
            when (item) {
                is String -> item
                is Map<*, *> -> item["message"]?.toString() ?: item["text"]?.toString()
                else -> item?.toString()
            }
        }.filter { it.isNotBlank() }
        if (texts.isEmpty()) return
        val first = items.firstOrNull() as? Map<*, *>
        val duration = first?.get("duration")?.toString()?.toDoubleOrNull()?.toInt() ?: 0
        val color = first?.get("color")?.toString()
        handler.post {
            root?.visibility = View.VISIBLE
            tickerBar?.text = texts.joinToString("   │   ")
            tickerBar?.visibility = View.VISIBLE
            tickerBar?.isSelected = true
            if (!color.isNullOrBlank()) {
                try { tickerBar?.setBackgroundColor(Color.parseColor(color)) } catch (_: Exception) {}
            } else {
                tickerBar?.setBackgroundColor(Color.argb(230, 0, 0, 0))
            }
            tickerHideRunnable?.let { handler.removeCallbacks(it) }
            if (duration > 0) {
                tickerHideRunnable = Runnable { hideTicker() }
                handler.postDelayed(tickerHideRunnable!!, duration * 1000L)
            }
        }
    }

    private fun hideAlert() {
        alertOverlay?.visibility = View.GONE
        alertTitle?.text = ""
        alertMessage?.text = ""
        if (tickerBar?.visibility != View.VISIBLE) root?.visibility = if (active) View.VISIBLE else View.GONE
    }

    private fun hideTicker() {
        tickerBar?.visibility = View.GONE
        tickerBar?.text = ""
        if (alertOverlay?.visibility != View.VISIBLE) root?.visibility = if (active) View.VISIBLE else View.GONE
    }

    private fun clearUi() {
        hideAlert()
        hideTicker()
    }

    private fun resolveMediaUrl(url: String): String {
        val trimmed = url.trim()
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed
        return "${prefs.haUrl.trimEnd('/')}/${trimmed.trimStart('/')}"
    }

    private fun mediaHeaders(): Map<String, String> {
        val token = prefs.token.trim()
        return if (token.isBlank()) emptyMap() else mapOf("Authorization" to "Bearer $token", "Accept" to "audio/*,*/*")
    }

    private fun vibrate(ms: Long) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                val vm = activity.getSystemService(android.content.Context.VIBRATOR_MANAGER_SERVICE) as? android.os.VibratorManager
                vm?.defaultVibrator?.vibrate(android.os.VibrationEffect.createOneShot(ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                val v = activity.getSystemService(android.content.Context.VIBRATOR_SERVICE) as? android.os.Vibrator
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    v?.vibrate(android.os.VibrationEffect.createOneShot(ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION") v?.vibrate(ms)
                }
            }
        } catch (_: Exception) {}
    }
}
