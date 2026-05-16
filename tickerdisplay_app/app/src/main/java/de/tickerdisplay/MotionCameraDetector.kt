package de.tickerdisplay

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.Camera
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Lightweight camera based motion detector for Android 9+ compatible WebView panels.
 *
 * It uses the legacy Camera API intentionally because the project already supports old
 * wall tablets and Android 9 devices. No image is stored or uploaded here; only a small
 * down-sampled luminance difference is calculated in memory and Home Assistant receives
 * motion_detected / motion_stopped events.
 */
class MotionCameraDetector(
    private val ctx: Context,
    private val api: ApiClient,
    private val prefs: Prefs,
    private val onStateChanged: (Boolean, Map<String, Any?>) -> Unit,
) {
    companion object {
        private const val TAG = "TickerDisplay/Motion"
        private const val FRAME_MIN_INTERVAL_MS = 320L
        private const val MOTION_PIXEL_DELTA = 22
        private const val LIGHT_CHANGE_PERCENT = 82.0
        private const val LIGHT_CHANGE_AVG_DELTA = 34.0
    }

    private val handler = Handler(Looper.getMainLooper())
    private var camera: Camera? = null
    private var texture: SurfaceTexture? = null
    private var running = false
    private var previewWidth = 0
    private var previewHeight = 0
    private var previousFrame: IntArray? = null
    private var lastProcessedAt = 0L
    private var activeCameraId: Int? = null

    @Volatile var motionDetected: Boolean = false
        private set
    @Volatile var lastDetectedAtMs: Long = 0L
        private set
    @Volatile var lastScore: Double = 0.0
        private set
    @Volatile var status: String = "disabled"
        private set
    @Volatile var source: String = "camera"
        private set
    @Volatile var lastError: String = ""
        private set

    private val clearRunnable = Runnable {
        val holdMs = prefs.motionHoldSeconds * 1000L
        val quietFor = System.currentTimeMillis() - lastDetectedAtMs
        if (motionDetected && quietFor >= holdMs - 250L) {
            setMotion(false, "timeout", lastScore)
        }
    }

    fun start() {
        if (running) return
        if (!prefs.motionDetect) {
            status = "disabled"
            updateReporter(false, mapOf("motion_status" to status, "motion_source" to source))
            return
        }
        if (!hasCameraPermission()) {
            status = "permission_missing"
            lastError = "Kamera-Berechtigung fehlt"
            updateReporter(false, statusMap())
            api.sendEventAsync("motion_detector_status", statusMap())
            return
        }
        running = true
        openCamera()
    }

    fun stop(sendStoppedEvent: Boolean = true) {
        running = false
        handler.removeCallbacks(clearRunnable)
        closeCamera()
        previousFrame = null
        status = if (prefs.motionDetect) "stopped" else "disabled"
        if (motionDetected) {
            motionDetected = false
            val data = statusMap() + mapOf(
                "reason" to "detector_stopped",
                "motion_detected" to false,
                "motion_score" to lastScore,
            )
            updateReporter(false, data)
            if (sendStoppedEvent) api.sendEventAsync("motion_stopped", data)
        } else {
            updateReporter(false, statusMap())
        }
    }

    fun currentStateMap(): Map<String, Any?> = statusMap() + mapOf(
        "motion_detected" to motionDetected,
        "motion_last_detected_at_ms" to lastDetectedAtMs,
        "motion_score" to lastScore,
    )

    private fun openCamera() {
        closeCamera()
        try {
            val cameraInfo = findBestCamera() ?: run {
                status = "no_camera"
                lastError = "Keine Kamera gefunden"
                updateReporter(false, statusMap())
                api.sendEventAsync("motion_detector_status", statusMap())
                running = false
                return
            }
            activeCameraId = cameraInfo.first
            source = cameraInfo.second

            @Suppress("DEPRECATION")
            val cam = Camera.open(cameraInfo.first) ?: throw IllegalStateException("Camera.open returned null")
            @Suppress("DEPRECATION")
            val params = cam.parameters
            val preview = params.supportedPreviewSizes?.minByOrNull { size ->
                abs(size.width * size.height - 320 * 240)
            }
            if (preview != null) {
                params.setPreviewSize(preview.width, preview.height)
                previewWidth = preview.width
                previewHeight = preview.height
            } else {
                previewWidth = params.previewSize.width
                previewHeight = params.previewSize.height
            }
            if (params.supportedPreviewFormats?.contains(ImageFormat.NV21) == true) {
                params.previewFormat = ImageFormat.NV21
            }
            try {
                params.set("shutter-sound", if (prefs.cameraSilentMode) "off" else "on")
            } catch (_: Exception) {}
            cam.parameters = params

            val surface = SurfaceTexture(43)
            texture = surface
            cam.setPreviewTexture(surface)
            val bufferSize = max(previewWidth * previewHeight * 3 / 2, 1024)
            cam.addCallbackBuffer(ByteArray(bufferSize))
            cam.addCallbackBuffer(ByteArray(bufferSize))
            cam.setPreviewCallbackWithBuffer { data, cameraRef ->
                try {
                    processFrame(data)
                } catch (t: Throwable) {
                    Log.w(TAG, "motion frame processing failed: ${t.message}")
                } finally {
                    try { cameraRef.addCallbackBuffer(data) } catch (_: Exception) {}
                }
            }
            cam.startPreview()
            camera = cam
            status = "running"
            lastError = ""
            updateReporter(motionDetected, statusMap())
            api.sendEventAsync("motion_detector_status", statusMap())
            Log.i(TAG, "Motion detector started with $source ${previewWidth}x${previewHeight}")
        } catch (e: Exception) {
            Log.e(TAG, "Motion detector start failed", e)
            lastError = e.message ?: e.javaClass.simpleName
            status = "error"
            updateReporter(false, statusMap())
            api.sendEventAsync("motion_detector_status", statusMap())
            closeCamera()
            running = false
        }
    }

    private fun processFrame(data: ByteArray?) {
        if (!running || data == null || previewWidth <= 0 || previewHeight <= 0) return
        val now = System.currentTimeMillis()
        if (now - lastProcessedAt < FRAME_MIN_INTERVAL_MS) return
        lastProcessedAt = now

        val step = max(4, min(previewWidth, previewHeight) / 52)
        val sampleCount = ((previewWidth + step - 1) / step) * ((previewHeight + step - 1) / step)
        if (sampleCount <= 0) return
        val current = IntArray(sampleCount)
        var idx = 0
        var changed = 0
        var deltaSum = 0L
        val previous = previousFrame

        var y = 0
        while (y < previewHeight) {
            val row = y * previewWidth
            var x = 0
            while (x < previewWidth) {
                val lum = data[row + x].toInt() and 0xff
                current[idx] = lum
                if (previous != null && idx < previous.size) {
                    val delta = abs(lum - previous[idx])
                    deltaSum += delta.toLong()
                    if (delta >= MOTION_PIXEL_DELTA) changed++
                }
                idx++
                x += step
            }
            y += step
        }
        previousFrame = current
        if (previous == null) return

        val samples = min(idx, previous.size).coerceAtLeast(1)
        val changedPercent = changed * 100.0 / samples
        val avgDelta = deltaSum.toDouble() / samples
        lastScore = changedPercent
        val isGlobalLightChange = changedPercent >= LIGHT_CHANGE_PERCENT && avgDelta >= LIGHT_CHANGE_AVG_DELTA
        val isMotion = !isGlobalLightChange && changedPercent >= prefs.motionSensitivity.toDouble()
        if (isMotion) {
            lastDetectedAtMs = now
            setMotion(true, "camera_frame_delta", changedPercent, avgDelta)
            handler.removeCallbacks(clearRunnable)
            handler.postDelayed(clearRunnable, prefs.motionHoldSeconds * 1000L)
        }
    }

    private fun setMotion(active: Boolean, reason: String, score: Double, avgDelta: Double? = null) {
        val changed = motionDetected != active
        motionDetected = active
        val now = System.currentTimeMillis()
        val data = statusMap() + mapOf(
            "motion_detected" to active,
            "motion_score" to score,
            "motion_avg_delta" to avgDelta,
            "motion_last_detected_at_ms" to lastDetectedAtMs,
            "hold_ms" to prefs.motionHoldSeconds * 1000L,
            "motion_sensitivity" to prefs.motionSensitivity,
            "reason" to reason,
            "changed_at_ms" to now,
        )
        updateReporter(active, data)
        if (changed) {
            api.sendEventAsync(if (active) "motion_detected" else "motion_stopped", data)
            Log.i(TAG, "Motion state changed: $active score=$score reason=$reason")
        }
    }

    private fun updateReporter(active: Boolean, data: Map<String, Any?>) {
        try { onStateChanged(active, data) } catch (_: Exception) {}
    }

    private fun statusMap(): Map<String, Any?> = mapOf(
        "motion_status" to status,
        "motion_source" to source,
        "motion_camera_id" to activeCameraId,
        "motion_last_error" to lastError,
        "motion_sensitivity" to prefs.motionSensitivity,
        "motion_hold_seconds" to prefs.motionHoldSeconds,
    )

    private fun closeCamera() {
        try { camera?.setPreviewCallbackWithBuffer(null) } catch (_: Exception) {}
        try { camera?.stopPreview() } catch (_: Exception) {}
        try { camera?.release() } catch (_: Exception) {}
        camera = null
        try { texture?.release() } catch (_: Exception) {}
        texture = null
        activeCameraId = null
    }

    private fun hasCameraPermission(): Boolean =
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun findBestCamera(): Pair<Int, String>? {
        return try {
            @Suppress("DEPRECATION")
            val count = Camera.getNumberOfCameras()
            if (count <= 0) return null
            val info = Camera.CameraInfo()
            var fallback: Pair<Int, String>? = null
            for (i in 0 until count) {
                Camera.getCameraInfo(i, info)
                val label = when (info.facing) {
                    Camera.CameraInfo.CAMERA_FACING_FRONT -> "front_camera"
                    Camera.CameraInfo.CAMERA_FACING_BACK -> "back_camera"
                    else -> "camera"
                }
                if (fallback == null) fallback = i to label
                if (info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT) return i to label
            }
            fallback
        } catch (_: Exception) {
            null
        }
    }
}
