package de.tickerdisplay

import android.Manifest
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import java.io.ByteArrayOutputStream
import java.util.ArrayDeque
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlin.math.sqrt

class AssistSpeechController(
    context: Context,
    private val prefs: Prefs,
    private val api: ApiClient,
    private val sound: SoundPlayer,
    private var onPreview: ((String, String) -> Unit)? = null,
) {
    private val micTester = AudioRecordMicTester(context, api)
    private val appCtx = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private var mode: Mode = Mode.IDLE
    private var languageTag: String = "de-DE"
    private var lastWakeWord: String = ""
    private var localVad: LocalVadCapture? = null
    private var localCommandMode = false
    private var lastStateKey: String = ""
    private val pipelineBusy = AtomicBoolean(false)
    private var wakeArmUntil: Long = 0L
    private var commandArmUntil: Long = 0L
    private val pipelineClient = HaAssistPipelineClient(
        prefs = prefs,
        sound = sound,
        api = api,
        onState = { state, message -> sendState(state, message) },
        onTranscript = { text ->
            api.sendEvent(
                "assist_stt",
                mapOf(
                    "text" to text,
                    "assistant" to prefs.assistAssistant,
                    "assistant_secondary" to prefs.assistAssistant2,
                    "wake_word" to lastWakeWord,
                    "language" to languageTag,
                )
            )
        },
        onReply = { text, url, pipelineId, triggerSource ->
            api.sendEvent(
                "assist_reply",
                mapOf(
                    "text" to text,
                    "url" to url,
                    "pipeline_id" to pipelineId,
                    "trigger_source" to triggerSource,
                )
            )
        },
        onFinished = { _, _, _ ->
            pipelineBusy.set(false)
            handler.postDelayed({
                if (!prefs.assistSatelliteEnabled || !prefs.microphoneEnabled || prefs.assistTestMode) return@postDelayed
                if (usePreparedLocalWakeWord()) {
                    startWakeWordLoop(force = true)
                } else if (prefs.assistServerAudioMode) {
                    startServerVadMode(force = true)
                }
            }, 1800)
        },
    )

    private enum class Mode { IDLE, WAKE_WORD, SERVER_VAD, LOCAL_COMMAND_VAD }

    private fun usePreparedLocalWakeWord(): Boolean =
        prefs.assistWakeProvider.equals("prepared_local", true)

    fun startIfEnabled() {
        if (!prefs.assistSatelliteEnabled || !prefs.microphoneEnabled) return
        if (!hasAudioPermission()) {
            sendState("error", "Mikrofonberechtigung fehlt")
            return
        }
        if (prefs.assistTestMode) {
            startMicTestMode()
            return
        }
        if (usePreparedLocalWakeWord()) {
            startWakeWordLoop(force = true)
            return
        }
        if (prefs.assistServerAudioMode) {
            startServerVadMode(force = true)
            return
        }
        sendState("idle", "Wake Word deaktiviert - nur lokaler Modus wird unterstützt")
    }

    fun applyUpdatedConfig() {
        if (!prefs.assistSatelliteEnabled || !prefs.microphoneEnabled) {
            stopAll()
            return
        }
        if (prefs.assistTestMode) {
            startMicTestMode()
            return
        }
        if (usePreparedLocalWakeWord()) {
            startWakeWordLoop(force = true)
            return
        }
        if (prefs.assistServerAudioMode) {
            startServerVadMode(force = true)
            return
        }
        stopAll()
    }

    fun startWakeWordLoop(force: Boolean = false) {
        if (!prefs.assistSatelliteEnabled || !prefs.microphoneEnabled) return
        if (!hasAudioPermission()) {
            sendState("error", "Mikrofonberechtigung fehlt")
            return
        }
        if (!usePreparedLocalWakeWord()) {
            sendState("idle", "Android-Spracherkennung ist deaktiviert")
            return
        }
        if (!force && mode == Mode.WAKE_WORD) return
        stopLocalVad()
        mode = Mode.WAKE_WORD
        localCommandMode = false
        pipelineBusy.set(false)
        wakeArmUntil = System.currentTimeMillis() + 1200L
        lastWakeWord = ""
        localVad = LocalVadCapture().also { it.start() }
        sendState("idle", "Lokales Wake Word bereit")
    }

    fun startServerVadMode(force: Boolean = false) {
        if (!prefs.assistSatelliteEnabled || !prefs.microphoneEnabled) return
        if (!hasAudioPermission()) {
            sendState("error", "Mikrofonberechtigung fehlt")
            return
        }
        if (!force && mode == Mode.SERVER_VAD) return
        stopLocalVad()
        mode = Mode.SERVER_VAD
        localCommandMode = false
        pipelineBusy.set(false)
        lastWakeWord = prefs.assistWakeWord
        localVad = LocalVadCapture().also { it.start() }
        sendState("idle", "Server-Audio-Modus bereit")
    }

    fun startConversation(language: String = "de-DE") {
        if (!prefs.assistSatelliteEnabled || !prefs.microphoneEnabled) return
        if (!hasAudioPermission()) {
            sendState("error", "Mikrofonberechtigung fehlt")
            return
        }
        languageTag = language.ifBlank { "de-DE" }
        startLocalCommandCapture()
    }

    private fun startLocalCommandCapture() {
        if (!prefs.assistSatelliteEnabled || !prefs.microphoneEnabled) return
        stopLocalVad()
        mode = Mode.LOCAL_COMMAND_VAD
        localCommandMode = true
        pipelineBusy.set(false)
        commandArmUntil = System.currentTimeMillis() + 250L
        localVad = LocalVadCapture().also { it.start() }
        sendState("listening", "Sprich jetzt")
    }

    fun stopAll() {
        micTester.stop()
        stopLocalVad()
        mode = Mode.IDLE
        localCommandMode = false
        pipelineBusy.set(false)
        handler.removeCallbacksAndMessages(null)
        sendState("idle", "")
    }

    fun setPreviewCallback(callback: ((String, String) -> Unit)?) {
        onPreview = callback
    }

    private fun stopLocalVad() {
        try { localVad?.stop() } catch (_: Exception) {}
        localVad = null
    }

    private fun hasAudioPermission(): Boolean =
        ContextCompat.checkSelfPermission(appCtx, Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED

    fun runMicTest(seconds: Int = 8) {
        if (!hasAudioPermission()) {
            sendState("error", "Mikrofonberechtigung fehlt")
            return
        }
        mode = Mode.IDLE
        micTester.start(seconds)
    }

    private fun startMicTestMode() {
        stopLocalVad()
        mode = Mode.IDLE
        localCommandMode = false
        micTester.startContinuous()
        sendState("testing", "Mikrofon-Testmodus aktiv")
    }

    private fun sendState(state: String, message: String) {
        val key = "$state|$message"
        if (key == lastStateKey) return
        lastStateKey = key
        onPreview?.invoke(state, message)
        thread(start = true) { api.sendEvent("assist_state", mapOf("state" to state, "message" to message)) }
    }

    private inner class LocalVadCapture {
        private val running = AtomicBoolean(false)
        private var record: AudioRecord? = null
        private var worker: Thread? = null

        fun start() {
            if (running.getAndSet(true)) return
            worker = thread(start = true, name = "TickerLocalVad") {
                val sampleRate = 16000
                val minBuffer = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                val bufferSize = maxOf(minBuffer, 3200)
                val chunkBytes = 3200
                val preRollSeconds = when (mode) {
                    Mode.LOCAL_COMMAND_VAD -> 1
                    Mode.WAKE_WORD -> 2
                    else -> 3
                }
                val preRollBytes = sampleRate * 2 * preRollSeconds
                val preRoll = ArrayDeque<ByteArray>()
                var preRollSize = 0
                var clipOut: ByteArrayOutputStream? = null
                var speechFrames = 0
                var silenceFrames = 0
                val currentMode = mode
                val startThreshold = when (prefs.assistVadMode.lowercase()) {
                    "kurz", "short" -> if (currentMode == Mode.LOCAL_COMMAND_VAD) -38.0 else -35.0
                    "lang", "long" -> if (currentMode == Mode.LOCAL_COMMAND_VAD) -43.0 else -41.0
                    else -> if (currentMode == Mode.LOCAL_COMMAND_VAD) -40.0 else -38.0
                }
                val stopThreshold = startThreshold - 11.0
                val startNeeded = if (currentMode == Mode.LOCAL_COMMAND_VAD) 4 else 8
                val stopNeeded = if (currentMode == Mode.LOCAL_COMMAND_VAD) 26 else 30
                val maxFrames = if (currentMode == Mode.LOCAL_COMMAND_VAD) 220 else 140
                var cooldownUntil = 0L
                try {
                    record = AudioRecord(
                        MediaRecorder.AudioSource.MIC,
                        sampleRate,
                        AudioFormat.CHANNEL_IN_MONO,
                        AudioFormat.ENCODING_PCM_16BIT,
                        bufferSize,
                    )
                    val recorder = record ?: return@thread
                    recorder.startRecording()
                    sendState(
                        if (currentMode == Mode.LOCAL_COMMAND_VAD) "listening" else "idle",
                        when (currentMode) {
                            Mode.WAKE_WORD -> "Lokales Wake Word bereit"
                            Mode.LOCAL_COMMAND_VAD -> "Befehl wird aufgenommen"
                            else -> "VAD bereit"
                        }
                    )
                    while (running.get()) {
                        val buf = ByteArray(chunkBytes)
                        val read = recorder.read(buf, 0, buf.size)
                        if (read <= 0) continue
                        val chunk = if (read == buf.size) buf else buf.copyOf(read)
                        val rmsDb = calcRmsDb(chunk)
                        if (pipelineBusy.get() || System.currentTimeMillis() < cooldownUntil) continue
                        if (clipOut == null) {
                            preRoll.addLast(chunk)
                            preRollSize += chunk.size
                            while (preRollSize > preRollBytes && preRoll.isNotEmpty()) {
                                preRollSize -= preRoll.removeFirst().size
                            }
                            if (rmsDb > startThreshold) {
                                speechFrames += 1
                                if (speechFrames >= startNeeded) {
                                    clipOut = ByteArrayOutputStream()
                                    preRoll.forEach { clipOut?.write(it) }
                                    clipOut?.write(chunk)
                                    silenceFrames = 0
                                    speechFrames = 0
                                    sendState(
                                        "listening",
                                        when (currentMode) {
                                            Mode.WAKE_WORD -> "Lokale Sprache erkannt"
                                            Mode.LOCAL_COMMAND_VAD -> "Befehl erkannt - sende an HA"
                                            else -> "Sprache erkannt - sende an HA"
                                        }
                                    )
                                }
                            } else {
                                speechFrames = 0
                            }
                        } else {
                            clipOut?.write(chunk)
                            if (rmsDb > stopThreshold) silenceFrames = 0 else silenceFrames += 1
                            val frameCount = (clipOut?.size() ?: 0) / chunk.size.coerceAtLeast(1)
                            if (silenceFrames >= stopNeeded || frameCount >= maxFrames) {
                                val audio = clipOut?.toByteArray() ?: ByteArray(0)
                                clipOut = null
                                preRoll.clear()
                                preRollSize = 0
                                silenceFrames = 0
                                if (audio.isNotEmpty()) {
                                    when (currentMode) {
                                        Mode.WAKE_WORD -> {
                                            if (System.currentTimeMillis() < wakeArmUntil) continue
                                            if (audio.size >= sampleRate * 2) {
                                                cooldownUntil = System.currentTimeMillis() + 2500L
                                                lastWakeWord = prefs.assistWakeWord.ifBlank { "okay_nabu" }
                                                if (prefs.assistWakeSound) sound.playAssistTone("wake")
                                                sendState("listening", "Lokaler Trigger erkannt: $lastWakeWord")
                                                api.sendEventAsync(
                                                    "assist_state",
                                                    mapOf(
                                                        "state" to "listening",
                                                        "message" to "Lokaler Trigger erkannt: $lastWakeWord",
                                                        "wake_word" to lastWakeWord,
                                                        "trigger_source" to "local_audio",
                                                    )
                                                )
                                                handler.post { startLocalCommandCapture() }
                                                return@thread
                                            } else {
                                                sendState("idle", "Sprachsegment zu kurz")
                                            }
                                        }
                                        Mode.LOCAL_COMMAND_VAD -> {
                                            if (System.currentTimeMillis() < commandArmUntil) continue
                                            if (audio.size >= sampleRate * 2) {
                                                cooldownUntil = System.currentTimeMillis() + 8000L
                                                pipelineBusy.set(true)
                                                pipelineClient.runCommandPipeline(audio, languageTag, lastWakeWord)
                                            } else {
                                                sendState("idle", "Befehl zu kurz")
                                                handler.postDelayed({ startWakeWordLoop(force = true) }, 800)
                                                return@thread
                                            }
                                        }
                                        Mode.SERVER_VAD -> {
                                            if (audio.size >= sampleRate * 2) {
                                                cooldownUntil = System.currentTimeMillis() + 12000L
                                                pipelineBusy.set(true)
                                                pipelineClient.runCommandPipeline(audio, languageTag, lastWakeWord)
                                            }
                                        }
                                        else -> Unit
                                    }
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    L.e("AssistSpeech", "LocalVadCapture failed", e)
                    sendState("error", e.message ?: "Lokaler Audiomodus fehlgeschlagen")
                } finally {
                    try { record?.stop() } catch (_: Exception) {}
                    try { record?.release() } catch (_: Exception) {}
                    record = null
                }
            }
        }

        fun stop() {
            running.set(false)
            try { record?.stop() } catch (_: Exception) {}
        }

        private fun calcRmsDb(buffer: ByteArray): Double {
            if (buffer.isEmpty()) return -90.0
            var sum = 0.0
            var count = 0
            var i = 0
            while (i + 1 < buffer.size) {
                val sample = ((buffer[i + 1].toInt() shl 8) or (buffer[i].toInt() and 0xFF)).toShort().toInt()
                sum += (sample * sample).toDouble()
                count += 1
                i += 2
            }
            if (count == 0) return -90.0
            val rms = sqrt(sum / count)
            if (rms <= 1.0) return -90.0
            return 20.0 * kotlin.math.log10(rms / 32768.0)
        }
    }
}

object AssistRuntime {
    @Volatile private var controller: AssistSpeechController? = null

    @Synchronized
    fun get(context: Context, onPreview: ((String, String) -> Unit)? = null): AssistSpeechController {
        val existing = controller
        if (existing != null) {
            existing.setPreviewCallback(onPreview)
            return existing
        }
        val appCtx = context.applicationContext
        val created = AssistSpeechController(
            context = appCtx,
            prefs = Prefs(appCtx),
            api = ApiClient(Prefs(appCtx)),
            sound = SoundPlayer(appCtx),
            onPreview = onPreview,
        )
        controller = created
        return created
    }

    @Synchronized
    fun attachPreview(callback: ((String, String) -> Unit)?) {
        controller?.setPreviewCallback(callback)
    }

    @Synchronized
    fun refresh(context: Context) {
        get(context).applyUpdatedConfig()
    }

    @Synchronized
    fun start(context: Context) {
        get(context).startIfEnabled()
    }

    @Synchronized
    fun stop() {
        controller?.stopAll()
    }
}
