package de.tickerdisplay

import android.Manifest
import android.content.Context
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.SurfaceTexture
import android.graphics.YuvImage
import android.hardware.Camera
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean

enum class CameraFacing { FRONT, BACK }

class CameraSnapshotUploader(
    private val ctx: Context,
    private val api: ApiClient,
    private val prefs: Prefs,
    private val facing: CameraFacing,
) {
    private companion object {
        private val captureLock = Any()
        @Volatile private var activeFacing: CameraFacing? = null
    }

    private val handler = Handler(Looper.getMainLooper())
    private var camera: Camera? = null
    private var started = false
    private var retryPosted = false
    private val busy = AtomicBoolean(false)
    private val loop = object : Runnable {
        override fun run() {
            if (!started) return
            if (!prefs.cameraManualOnly) {
                requestPreviewFrameUpload()
            }
            handler.postDelayed(this, prefs.cameraIntervalSeconds * 1000L)
        }
    }

    fun start() {
        if (started || !isEnabled() || !hasPermission()) return
        started = true
        openCamera()
        if (!prefs.cameraManualOnly) {
            val initialDelay = if (facing == CameraFacing.BACK && prefs.frontCameraEnabled && prefs.backCameraEnabled) {
                (prefs.cameraIntervalSeconds * 500L).coerceAtLeast(1200L)
            } else {
                0L
            }
            val intervalMs = (prefs.cameraIntervalSeconds * 1000L).coerceAtLeast(5000L)
            if (initialDelay == 0L) {
                requestPreviewFrameUpload()
                handler.postDelayed(loop, intervalMs)
            } else {
                handler.postDelayed({ requestPreviewFrameUpload() }, initialDelay)
                handler.postDelayed(loop, initialDelay + intervalMs)
            }
        }
    }

    fun stop() {
        started = false
        handler.removeCallbacksAndMessages(null)
        closeCamera()
    }

    fun release() = stop()

    fun triggerManualUpload() {
        if (!isEnabled() || !hasPermission()) return
        if (!started) {
            started = true
            openCamera()
        }
        requestPreviewFrameUpload()
        if (prefs.cameraManualOnly) {
            handler.postDelayed({ if (prefs.cameraManualOnly) stop() }, 1500L)
        }
    }

    private fun isEnabled(): Boolean = when (facing) {
        CameraFacing.FRONT -> prefs.frontCameraEnabled
        CameraFacing.BACK -> prefs.backCameraEnabled
    }

    private fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED

    private fun openCamera() {
        if (camera != null) return
        try {
            val id = findCameraId() ?: return
            @Suppress("DEPRECATION")
            val cam = Camera.open(id) ?: return
            @Suppress("DEPRECATION")
            val params = cam.parameters
            val previews = params.supportedPreviewSizes
            val prev = previews?.minByOrNull { kotlin.math.abs((it.width * it.height) - (640 * 480)) }
            if (prev != null) params.setPreviewSize(prev.width, prev.height)
            if (params.supportedPreviewFormats?.contains(ImageFormat.NV21) == true) {
                params.previewFormat = ImageFormat.NV21
            }
            try {
                params.set("shutter-sound", if (prefs.cameraSilentMode) "off" else "on")
            } catch (_: Exception) {}
            cam.parameters = params
            cam.setPreviewTexture(SurfaceTexture(42))
            cam.startPreview()
            camera = cam
        } catch (_: Exception) {
            closeCamera()
        }
    }

    private fun closeCamera() {
        try { camera?.setPreviewCallback(null) } catch (_: Exception) {}
        try { camera?.stopPreview() } catch (_: Exception) {}
        try { camera?.release() } catch (_: Exception) {}
        camera = null
        busy.set(false)
    }

    private fun requestPreviewFrameUpload() {
        if (!started || busy.get()) return
        if (!isEnabled() || !hasPermission()) {
            stop()
            return
        }
        if (!busy.compareAndSet(false, true)) return
        synchronized(captureLock) {
            if (activeFacing != null && activeFacing != facing) {
                busy.set(false)
                if (!retryPosted && started) {
                    retryPosted = true
                    handler.postDelayed({
                        retryPosted = false
                        requestPreviewFrameUpload()
                    }, 1200L)
                }
                return
            }
            activeFacing = facing
            retryPosted = false
        }
        if (camera == null) openCamera()
        val cam = camera ?: run {
            synchronized(captureLock) { if (activeFacing == facing) activeFacing = null }
            busy.set(false)
            return
        }
        try {
            @Suppress("DEPRECATION")
            cam.setOneShotPreviewCallback { data, cameraRef ->
                try {
                    val params = cameraRef.parameters
                    val size = params.previewSize
                    val image = YuvImage(data, params.previewFormat, size.width, size.height, null)
                    val out = ByteArrayOutputStream()
                    image.compressToJpeg(Rect(0, 0, size.width, size.height), 75, out)
                    val jpeg = out.toByteArray()
                    Thread {
                        try {
                            api.uploadCameraSnapshot(if (facing == CameraFacing.FRONT) "front" else "back", jpeg)
                            handler.post { if (prefs.cameraManualOnly) closeCamera() }
                        } catch (_: Exception) {
                            handler.post { closeCamera() }
                        } finally {
                            synchronized(captureLock) { if (activeFacing == facing) activeFacing = null }
                            busy.set(false)
                        }
                    }.start()
                } catch (_: Exception) {
                    synchronized(captureLock) { if (activeFacing == facing) activeFacing = null }
                    busy.set(false)
                }
            }
        } catch (_: Exception) {
            synchronized(captureLock) { if (activeFacing == facing) activeFacing = null }
            busy.set(false)
            closeCamera()
        }
    }

    private fun findCameraId(): Int? {
        return try {
            @Suppress("DEPRECATION")
            val count = Camera.getNumberOfCameras()
            val info = Camera.CameraInfo()
            for (i in 0 until count) {
                Camera.getCameraInfo(i, info)
                if (facing == CameraFacing.FRONT && info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT) return i
                if (facing == CameraFacing.BACK && info.facing == Camera.CameraInfo.CAMERA_FACING_BACK) return i
            }
            null
        } catch (_: Exception) {
            null
        }
    }
}
