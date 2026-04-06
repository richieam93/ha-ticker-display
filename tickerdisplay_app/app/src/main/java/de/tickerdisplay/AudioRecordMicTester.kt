package de.tickerdisplay

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import kotlin.concurrent.thread
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sqrt

class AudioRecordMicTester(
    context: Context,
    private val api: ApiClient,
) {
    private val appCtx = context.applicationContext
    @Volatile private var running = false
    private var worker: Thread? = null

    fun start(seconds: Int = 8) {
        stop()
        startInternal(maxMs = seconds * 1000L, continuous = false)
    }

    fun startContinuous() {
        if (running) return
        startInternal(maxMs = 0L, continuous = true)
    }

    fun stop() {
        running = false
        worker?.interrupt()
        worker = null
    }

    private fun startInternal(maxMs: Long, continuous: Boolean) {
        if (ContextCompat.checkSelfPermission(appCtx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            send("error", "Mikrofonberechtigung fehlt")
            return
        }
        val sampleRate = 16000
        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuffer <= 0) {
            send("error", "AudioRecord nicht verfügbar")
            return
        }
        running = true
        worker = thread(start = true, name = "AudioRecordMicTester") {
            var recorder: AudioRecord? = null
            try {
                recorder = AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    sampleRate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    minBuffer * 2
                )
                if (recorder.state != AudioRecord.STATE_INITIALIZED) {
                    send("error", "Mikrofon konnte nicht initialisiert werden")
                    running = false
                    return@thread
                }
                val buf = ShortArray(minBuffer)
                val started = System.currentTimeMillis()
                var lastReport = 0L
                recorder.startRecording()
                send("testing", if (continuous) "Mikrofon-Testmodus aktiv" else "Mikrofon-Test gestartet")
                while (running) {
                    val read = recorder.read(buf, 0, buf.size)
                    if (read > 0) {
                        var sum = 0.0
                        var peak = 0
                        for (i in 0 until read) {
                            val s = buf[i].toInt()
                            val a = abs(s)
                            if (a > peak) peak = a
                            sum += (s * s).toDouble()
                        }
                        val rms = sqrt(sum / read.coerceAtLeast(1))
                        val db = if (rms > 0.0) (20.0 * log10(rms / 32767.0)).coerceAtLeast(-90.0) else -90.0
                        val now = System.currentTimeMillis()
                        if (now - lastReport >= 500) {
                            lastReport = now
                            val msg = "Mic RMS ${"%.1f".format(db)} dB, Peak $peak"
                            send("testing", msg, mapOf("rms_db" to db, "peak" to peak, "source" to "audiorecord"))
                        }
                    }
                    if (!continuous && maxMs > 0 && System.currentTimeMillis() - started >= maxMs) break
                }
                send("idle", if (continuous) "Mikrofon-Testmodus gestoppt" else "Mikrofon-Test beendet")
            } catch (t: Throwable) {
                send("error", "Mikrofontest fehlgeschlagen: ${t.message ?: t.javaClass.simpleName}")
            } finally {
                try { recorder?.stop() } catch (_: Exception) {}
                try { recorder?.release() } catch (_: Exception) {}
                running = false
            }
        }
    }

    private fun send(state: String, message: String, extra: Map<String, Any?> = emptyMap()) {
        val payload = linkedMapOf<String, Any?>("state" to state, "message" to message)
        payload.putAll(extra)
        try {
            api.sendEvent("assist_state", payload)
        } catch (_: Exception) {}
    }
}
