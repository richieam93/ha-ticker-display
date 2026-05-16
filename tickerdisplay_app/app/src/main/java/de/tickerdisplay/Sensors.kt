package de.tickerdisplay

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.ToneGenerator
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.TextToSpeech
import android.os.BatteryManager
import android.os.Handler
import android.os.HandlerThread
import java.text.SimpleDateFormat
import java.util.*

// ═══════════════════════════════════════════════════════════
// SENSOR REPORTER
// ═══════════════════════════════════════════════════════════
class SensorReporter(
    private val ctx: Context,
    private val api: ApiClient,
    private val prefs: Prefs
) {
    private val battery = BatteryMonitor(ctx)
    private val light = LightSensor(ctx)
    private val proximity = ProximitySensor(ctx)
    private val cameras = CameraMonitor(ctx)
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var running = false
    private val startTime = System.currentTimeMillis()

    @Volatile private var motionDetected = false
    @Volatile private var motionLastDetectedAtMs = 0L
    @Volatile private var motionScore = 0.0
    @Volatile private var motionAvgDelta: Double? = null
    @Volatile private var motionStatus = "disabled"
    @Volatile private var motionSource = "camera"
    @Volatile private var motionLastError = ""

    fun start() {
        if (running) return
        running = true
        if (prefs.lightSensor) light.start()
        proximity.start()
        thread = HandlerThread("SensorReporter").apply { start() }
        handler = Handler(thread!!.looper)
        sendHeartbeat()
        schedule()
    }

    fun stop() {
        running = false
        handler?.removeCallbacksAndMessages(null)
        thread?.quitSafely()
        light.stop()
        proximity.stop()
    }

    private fun schedule() {
        handler?.postDelayed({
            if (running) {
                sendHeartbeat()
                schedule()
            }
        }, prefs.reportInterval * 1000L)
    }

    private fun sendHeartbeat() {
        Thread {
            try {
                api.sendHeartbeat(collectData())
            } catch (_: Exception) {}
        }.start()
    }

    fun reportNow() = sendHeartbeat()

    fun applyPreferenceChange(key: String) {
        when (key) {
            "light_sensor", "light_sensor_enabled" -> {
                if (prefs.lightSensor) light.start() else light.stop()
            }
        }
        reportNow()
    }

    fun collectData(): Map<String, Any?> {
        val b = battery.get()
        val storage = U.getStorageInfo(ctx)
        val data = mutableMapOf<String, Any?>(
            "battery_level" to b.level,
            "battery_charging" to b.charging,
            "battery_temperature" to b.temp,
            "battery_voltage_mv" to b.voltageMv,
            "battery_health" to b.health,
            "battery_status" to b.status,
            "charging_source" to b.chargingSource,
            "screen_on" to U.isScreenInteractive(ctx),
            "screen_power" to (U.isScreenInteractive(ctx) && U.getScreenBrightnessPercent(ctx) > 2),
            "screen_brightness" to U.getScreenBrightnessPercent(ctx),
            "memory_free_mb" to U.getMemoryMB(ctx),
            "memory_total_mb" to U.getTotalMemoryMB(ctx),
            "storage_free_mb" to storage.freeMb,
            "storage_total_mb" to storage.totalMb,
            "storage_used_percent" to storage.usedPercent,
            "wifi_signal" to U.getWifiSignal(ctx),
            "wifi_ssid" to U.getWifiSsid(ctx),
            "wifi_link_speed_mbps" to U.getWifiLinkSpeed(ctx),
            "network_type" to U.getNetworkType(ctx),
            "ip_address" to U.getIp(),
            "orientation" to U.getOrientation(ctx),
            "volume_percent" to U.getVolumePercent(ctx),
            "ringer_mode" to U.getRingerMode(ctx),
            "app_version" to getVersion(),
            "uptime_seconds" to (System.currentTimeMillis() - startTime) / 1000,
            "motion_detected" to motionDetected,
            "motion_last_detected_at" to formatEpochMs(motionLastDetectedAtMs),
            "motion_score" to motionScore,
            "motion_avg_delta" to motionAvgDelta,
            "motion_status" to motionStatus,
            "motion_source" to motionSource,
            "motion_last_error" to motionLastError,
            "motion_detection_enabled" to prefs.motionDetect,
            "motion_sensitivity" to prefs.motionSensitivity,
            "motion_hold_seconds" to prefs.motionHoldSeconds,
            "keep_screen_on" to prefs.screenOn,
            "kiosk_enabled" to prefs.kioskEnabled,
            "auto_start" to prefs.autoStart,
            "burn_in_protection" to prefs.burnIn,
            "light_sensor_enabled" to prefs.lightSensor,
            "camera_silent_mode" to prefs.cameraSilentMode,
            "camera_manual_only" to prefs.cameraManualOnly,
            "microphone_enabled" to prefs.microphoneEnabled,
            "assist_satellite_enabled" to prefs.assistSatelliteEnabled,
            "report_interval_seconds" to prefs.reportInterval,
            "camera_interval_seconds" to prefs.cameraIntervalSeconds,
        )

        if (prefs.lightSensor) {
            data["light_level"] = light.lux
        }

        val camInfo = cameras.get()
        data["proximity_near"] = proximity.near
        data["front_camera_present"] = camInfo.hasFront
        data["back_camera_present"] = camInfo.hasBack
        data["front_camera_enabled"] = prefs.frontCameraEnabled && camInfo.hasFront
        data["back_camera_enabled"] = prefs.backCameraEnabled && camInfo.hasBack
        return data
    }

    private fun getVersion(): String {
        return try {
            ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "1.0.0"
        } catch (_: Exception) { "1.0.0" }
    }

    fun getLightLevel() = light.lux
    fun isProximityNear() = proximity.near
    fun isMotionDetected() = motionDetected

    fun updateMotionState(active: Boolean, data: Map<String, Any?> = emptyMap()) {
        motionDetected = active
        val detectedAt = (data["motion_last_detected_at_ms"] as? Number)?.toLong() ?: 0L
        if (detectedAt > 0L) motionLastDetectedAtMs = detectedAt
        (data["motion_score"] as? Number)?.toDouble()?.let { motionScore = it }
        motionAvgDelta = (data["motion_avg_delta"] as? Number)?.toDouble()
        data["motion_status"]?.toString()?.takeIf { it.isNotBlank() }?.let { motionStatus = it }
        data["motion_source"]?.toString()?.takeIf { it.isNotBlank() }?.let { motionSource = it }
        data["motion_last_error"]?.toString()?.let { motionLastError = it }
    }

    private fun formatEpochMs(value: Long): String {
        if (value <= 0L) return ""
        return try {
            val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US)
            fmt.timeZone = TimeZone.getTimeZone("UTC")
            fmt.format(Date(value))
        } catch (_: Exception) { "" }
    }
}

// ═══════════════════════════════════════════════════════════
// BATTERY MONITOR
// ═══════════════════════════════════════════════════════════
data class BatteryInfo(
    val level: Int,
    val charging: Boolean,
    val temp: Float,
    val voltageMv: Int,
    val health: String,
    val status: String,
    val chargingSource: String,
)

class BatteryMonitor(private val ctx: Context) {
    fun get(): BatteryInfo {
        val intent = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.let {
            val lvl = it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = it.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            if (lvl >= 0 && scale > 0) (lvl * 100) / scale else -1
        } ?: -1
        val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL
        val temp = (intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0) / 10f
        val voltageMv = intent?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0) ?: 0
        val health = when (intent?.getIntExtra(BatteryManager.EXTRA_HEALTH, -1) ?: -1) {
            BatteryManager.BATTERY_HEALTH_GOOD -> "good"
            BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheat"
            BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
            BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "over_voltage"
            BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "failure"
            BatteryManager.BATTERY_HEALTH_COLD -> "cold"
            else -> "unknown"
        }
        val statusText = when (status) {
            BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
            BatteryManager.BATTERY_STATUS_DISCHARGING -> "discharging"
            BatteryManager.BATTERY_STATUS_FULL -> "full"
            BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "not_charging"
            else -> "unknown"
        }
        val plugged = intent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
        val chargingSource = when {
            plugged and BatteryManager.BATTERY_PLUGGED_USB != 0 -> "usb"
            plugged and BatteryManager.BATTERY_PLUGGED_AC != 0 -> "ac"
            android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN_MR1 && plugged and BatteryManager.BATTERY_PLUGGED_WIRELESS != 0 -> "wireless"
            else -> "battery"
        }
        return BatteryInfo(level, charging, temp, voltageMv, health, statusText, chargingSource)
    }
}

// ═══════════════════════════════════════════════════════════
// LIGHT SENSOR
// ═══════════════════════════════════════════════════════════
class LightSensor(ctx: Context) : SensorEventListener {
    private val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val sensor = sm.getDefaultSensor(Sensor.TYPE_LIGHT)
    var lux = 0f

    fun start() {
        sensor?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
    }

    fun stop() = sm.unregisterListener(this)

    override fun onSensorChanged(e: SensorEvent) {
        if (e.sensor.type == Sensor.TYPE_LIGHT) lux = e.values[0]
    }

    override fun onAccuracyChanged(s: Sensor?, a: Int) {}
}

// ═══════════════════════════════════════════════════════════
// PROXIMITY SENSOR
// ═══════════════════════════════════════════════════════════
class ProximitySensor(ctx: Context) : SensorEventListener {
    private val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val sensor = sm.getDefaultSensor(Sensor.TYPE_PROXIMITY)
    var near = false

    fun start() {
        sensor?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
    }

    fun stop() = sm.unregisterListener(this)

    override fun onSensorChanged(e: SensorEvent) {
        if (e.sensor.type == Sensor.TYPE_PROXIMITY) {
            near = e.values[0] < e.sensor.maximumRange
        }
    }

    override fun onAccuracyChanged(s: Sensor?, a: Int) {}
}



data class CameraInfo(
    val hasFront: Boolean,
    val hasBack: Boolean,
)

class CameraMonitor(private val ctx: Context) {
    fun get(): CameraInfo {
        return try {
            val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as android.hardware.camera2.CameraManager
            var front = false
            var back = false
            for (id in cm.cameraIdList) {
                val chars = cm.getCameraCharacteristics(id)
                when (chars.get(android.hardware.camera2.CameraCharacteristics.LENS_FACING)) {
                    android.hardware.camera2.CameraCharacteristics.LENS_FACING_FRONT -> front = true
                    android.hardware.camera2.CameraCharacteristics.LENS_FACING_BACK -> back = true
                }
            }
            CameraInfo(front, back)
        } catch (_: Exception) {
            CameraInfo(false, false)
        }
    }
}

// ═══════════════════════════════════════════════════════════
// SOUND PLAYER
// ═══════════════════════════════════════════════════════════
class SoundPlayer(private val ctx: Context) {
    private val appCtx = ctx.applicationContext
    private val prefs = Prefs(appCtx)
    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val audioManager = appCtx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
    private var player: MediaPlayer? = null
    private var vol = 1.0f
    private var lastUrl: String? = null
    private var lastHeaders: Map<String, String> = emptyMap()
    private var lastLoop: Boolean = false
    private var paused = false
    private var tone: ToneGenerator? = null
    private var lastToneAt = 0L
    var onPlaybackCompleted: (() -> Unit)? = null
    var onPlaybackStarted: (() -> Unit)? = null
    var onPlaybackFailed: ((String) -> Unit)? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var audioFocusRequest: android.media.AudioFocusRequest? = null
    private var hasAudioFocus = false

    init {
        try {
            tts = TextToSpeech(appCtx) { status ->
                ttsReady = status == TextToSpeech.SUCCESS
            }.apply {
                setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) {
                        mainHandler.post {
                            abandonAudioFocus()
                            onPlaybackCompleted?.invoke()
                        }
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        mainHandler.post {
                            abandonAudioFocus()
                            onPlaybackCompleted?.invoke()
                        }
                    }
                    override fun onError(utteranceId: String?, errorCode: Int) {
                        mainHandler.post {
                            abandonAudioFocus()
                            onPlaybackCompleted?.invoke()
                        }
                    }
                })
            }
        } catch (_: Exception) {}
    }


    private fun requestAudioFocus(): Boolean {
        return try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                val req = android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANT)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    .setOnAudioFocusChangeListener { }
                    .build()
                audioFocusRequest = req
                hasAudioFocus = audioManager.requestAudioFocus(req) == android.media.AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            } else {
                @Suppress("DEPRECATION")
                hasAudioFocus = audioManager.requestAudioFocus(
                    null,
                    android.media.AudioManager.STREAM_MUSIC,
                    android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                ) == android.media.AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            }
            hasAudioFocus
        } catch (_: Exception) {
            false
        }
    }

    private fun abandonAudioFocus() {
        try {
            if (!hasAudioFocus) return
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
            } else {
                @Suppress("DEPRECATION")
                audioManager.abandonAudioFocus(null)
            }
        } catch (_: Exception) {
        } finally {
            hasAudioFocus = false
        }
    }

    private fun forceAudioRoute(volume: Int) {
        try {
            requestAudioFocus()
            @Suppress("DEPRECATION")
            audioManager.mode = android.media.AudioManager.MODE_NORMAL
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
            @Suppress("DEPRECATION")
            audioManager.setSpeakerphoneOn(true)
            val maxMusic = audioManager.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC).coerceAtLeast(1)
            val targetMusic = ((maxMusic * (volume / 100f)).toInt()).coerceIn(1, maxMusic)
            audioManager.setStreamVolume(android.media.AudioManager.STREAM_MUSIC, targetMusic, 0)
            val maxVoice = audioManager.getStreamMaxVolume(android.media.AudioManager.STREAM_VOICE_CALL).coerceAtLeast(1)
            val targetVoice = ((maxVoice * (volume / 100f)).toInt()).coerceIn(1, maxVoice)
            audioManager.setStreamVolume(android.media.AudioManager.STREAM_VOICE_CALL, targetVoice, 0)
        } catch (_: Exception) {
        }
    }
    private fun resolveUrl(url: String): String {
        if (url.startsWith("http://") || url.startsWith("https://")) return url
        if (url.startsWith("/")) return prefs.haUrl.trimEnd('/') + url
        return url
    }

    fun play(url: String, volume: Int, loop: Boolean, headers: Map<String, String> = emptyMap()) {
        stop()
        try {
            val resolved = resolveUrl(url)
            lastUrl = resolved
            lastHeaders = headers
            lastLoop = loop
            paused = false
            val sourceUri = android.net.Uri.parse(resolved)
            forceAudioRoute(volume)
            player = MediaPlayer().apply {
                setAudioStreamType(android.media.AudioManager.STREAM_MUSIC)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                         .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .build()
                )
                if (headers.isNotEmpty()) setDataSource(appCtx, sourceUri, headers) else setDataSource(resolved)
                isLooping = loop
                setVolume(volume / 100f, volume / 100f)
                vol = volume / 100f
                setOnPreparedListener { mp ->
                    try {
                        mp.start()
                        L.i("SoundPlayer", "playback started: $resolved")
                        try { onPlaybackStarted?.invoke() } catch (_: Exception) {}
                    } catch (e: Exception) {
                        L.e("SoundPlayer", "playback start failed", e)
                        try { onPlaybackFailed?.invoke("start_failed") } catch (_: Exception) {}
                    }
                }
                setOnErrorListener { mp, what, extra ->
                    L.e("SoundPlayer", "player error what=$what extra=$extra")
                    try { mp.release() } catch (_: Exception) {}
                    player = null
                    abandonAudioFocus()
                    try { onPlaybackFailed?.invoke("error_${what}_${extra}") } catch (_: Exception) {}
                    false
                }
                setOnCompletionListener { mp ->
                    if (!loop) {
                        try { mp.release() } catch (_: Exception) {}
                        if (player === mp) player = null
                        abandonAudioFocus()
                        try { onPlaybackCompleted?.invoke() } catch (_: Exception) {}
                    }
                }
                prepareAsync()
            }
        } catch (e: Exception) { L.e("SoundPlayer", "play failed", e) }
    }

    fun playAnnouncement(url: String, volume: Int, headers: Map<String, String> = emptyMap()) {
        L.i("SoundPlayer", "announcement url received: $url")
        play(url, volume, false, headers)
    }

    fun speak(text: String, languageTag: String = "de-DE", volume: Int = 90) {
        try {
            stop()
            vol = volume / 100f
            forceAudioRoute(volume)
            val engine = tts
            if (engine == null || !ttsReady) {
                L.w("SoundPlayer", "tts not ready for text: $text")
                try { onPlaybackFailed?.invoke("tts_not_ready") } catch (_: Exception) {}
                return
            }
            val locale = java.util.Locale.forLanguageTag(languageTag.ifBlank { "de-DE" })
            try { engine.language = locale } catch (_: Exception) {}
            L.i("SoundPlayer", "tts speak: $text")
            val params = android.os.Bundle().apply {
                putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, vol)
                putString(TextToSpeech.Engine.KEY_PARAM_STREAM, android.media.AudioManager.STREAM_MUSIC.toString())
                putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "ticker_announce")
            }
            try { onPlaybackStarted?.invoke() } catch (_: Exception) {}
            engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, "ticker_announce")
        } catch (e: Exception) { L.e("SoundPlayer", "tts speak failed", e) }
    }

    fun pause() {
        try { if (player?.isPlaying == true) { player?.pause(); paused = true; L.i("SoundPlayer", "paused") } } catch (_: Exception) {}
    }

    fun resume() {
        try {
            when {
                paused && player != null -> { player?.start(); paused = false; L.i("SoundPlayer", "resumed") }
                lastUrl != null -> play(lastUrl!!, (vol * 100).toInt(), lastLoop, lastHeaders)
            }
        } catch (_: Exception) {}
    }

    fun next() { L.i("SoundPlayer", "next requested (not implemented)") }
    fun previous() { L.i("SoundPlayer", "previous requested (not implemented)") }

    fun stop() {
        stopTone()
        try { tts?.stop() } catch (_: Exception) {}
        try {
            player?.apply {
                if (isPlaying) stop()
                release()
            }
        } catch (_: Exception) {}
        player = null
        paused = false
        abandonAudioFocus()
    }

    fun setVolume(v: Int) {
        val percent = v.coerceIn(0, 100)
        vol = percent / 100f
        try {
            val maxMusic = audioManager.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC).coerceAtLeast(1)
            val targetMusic = ((maxMusic * vol).toInt()).coerceIn(0, maxMusic)
            audioManager.setStreamVolume(android.media.AudioManager.STREAM_MUSIC, targetMusic, 0)
            val maxVoice = audioManager.getStreamMaxVolume(android.media.AudioManager.STREAM_VOICE_CALL).coerceAtLeast(1)
            val targetVoice = ((maxVoice * vol).toInt()).coerceIn(0, maxVoice)
            audioManager.setStreamVolume(android.media.AudioManager.STREAM_VOICE_CALL, targetVoice, 0)
        } catch (_: Exception) {}
        player?.setVolume(vol, vol)
    }

    fun stopTone() {
        try { tone?.stopTone() } catch (_: Exception) {}
        try { tone?.release() } catch (_: Exception) {}
        tone = null
    }

    fun playAssistTone(kind: String = "wake") {
        try {
            val now = System.currentTimeMillis()
            val minGap = if (kind == "click") 250L else 900L
            if (now - lastToneAt < minGap) return
            lastToneAt = now
            stopTone()
            val stream = android.media.AudioManager.STREAM_MUSIC
            val toneType = if (kind == "click") ToneGenerator.TONE_PROP_BEEP else ToneGenerator.TONE_PROP_ACK
            val duration = if (kind == "click") 80 else 160
            tone = ToneGenerator(stream, 70).also { tg ->
                tg.startTone(toneType, duration)
                mainHandler.postDelayed({ stopTone() }, (duration + 80).toLong())
            }
        } catch (e: Exception) {
            L.e("SoundPlayer", "assist tone failed", e)
        }
    }
}
