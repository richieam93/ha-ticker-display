package de.tickerdisplay

import android.os.Handler
import android.os.Looper

import com.google.gson.Gson
import com.google.gson.JsonParser
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class HaAssistPipelineClient(
    private val prefs: Prefs,
    private val sound: SoundPlayer,
    private val api: ApiClient,
    private val onState: (String, String) -> Unit,
    private val onTranscript: (String) -> Unit,
    private val onReply: (String, String, String, String) -> Unit,
    private val onFinished: (Boolean, String, String) -> Unit,
) {
    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()

    fun runWakeWordPipeline(audioPcm16Mono16k: ByteArray, language: String = "de-DE") {
        runPipeline(audioPcm16Mono16k, language, "wake_word", "vad")
    }

    fun runCommandPipeline(audioPcm16Mono16k: ByteArray, language: String = "de-DE", wakeWord: String = "") {
        runPipeline(audioPcm16Mono16k, language, "stt", if (wakeWord.isBlank()) "manual" else "wakeword")
    }

    private fun runPipeline(audioPcm16Mono16k: ByteArray, language: String, startStage: String, trigger: String) {
        if (audioPcm16Mono16k.isEmpty()) {
            onState("error", "Kein Audio für HA-Pipeline")
            onFinished(false, "error", "Kein Audio für HA-Pipeline")
            return
        }
        val wsUrl = prefs.haUrl
            .replaceFirst("https://", "wss://")
            .replaceFirst("http://", "ws://")
            .trimEnd('/') + "/api/websocket"

        val request = Request.Builder().url(wsUrl).build()
        client.newWebSocket(request, PipelineRunner(audioPcm16Mono16k, language, startStage, trigger))
    }

    private inner class PipelineRunner(
        private val audio: ByteArray,
        private val language: String,
        private val requestedStartStage: String,
        private val requestedTriggerSource: String,
    ) : WebSocketListener() {
        private var webSocket: WebSocket? = null
        private var msgId = 1
        private var sttHandlerId: Int? = null
        private val sentAudio = AtomicBoolean(false)
        private val finished = AtomicBoolean(false)
        private val closed = AtomicBoolean(false)
        private var retryWithDefault = false
        private var activePipelineId: String = "default"
        private var triggerSource: String = requestedTriggerSource
        private var replyText: String = ""
        private var replyUrl: String = ""
        private var transcriptText: String = ""
        private var waitingForPlayback = false
        private val handler = Handler(Looper.getMainLooper())
        private var playbackFallbackRunnable: Runnable? = null
        private var playbackActuallyStarted = false
        private var runStarted = false
        private var wakeWordStarted = false
        private var ttsStarted = false
        private var pipelineListCommandId: Int? = null
        private var runCommandId: Int? = null
        private var preferredPipelineRaw: String = ""

        override fun onOpen(webSocket: WebSocket, response: Response) {
            this.webSocket = webSocket
            onState("processing", "Verbinde Assist-Pipeline")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            try {
                val root = JsonParser.parseString(text)
                if (root.isJsonArray) {
                    root.asJsonArray.forEach { item ->
                        if (item.isJsonObject) {
                            handleJsonMessage(webSocket, gson.fromJson(item, Map::class.java) ?: emptyMap<String, Any?>())
                        }
                    }
                } else if (root.isJsonObject) {
                    handleJsonMessage(webSocket, gson.fromJson(root, Map::class.java) ?: emptyMap<String, Any?>())
                }
            } catch (e: Exception) {
                L.e("AssistPipeline", "handle text failed", e)
                finalize(webSocket, false, "error", e.message ?: "Assist-WebSocket Fehler")
            }
        }

        private fun handleJsonMessage(webSocket: WebSocket, obj: Map<*, *>) {
            when (obj["type"]?.toString()) {
                "auth_required" -> webSocket.send(gson.toJson(mapOf("type" to "auth", "access_token" to prefs.token)))
                "auth_ok" -> {
                    preferredPipelineRaw = prefs.assistAssistant.trim()
                    if (preferredPipelineRaw.isNotBlank() && preferredPipelineRaw.lowercase() !in setOf("default", "preferred", "secondary", "disabled")) {
                        retryWithDefault = true
                        pipelineListCommandId = nextId()
                        webSocket.send(gson.toJson(mapOf("id" to pipelineListCommandId, "type" to "assist_pipeline/pipeline/list")))
                    } else {
                        startRun(webSocket, preferredPipelineRaw)
                    }
                }
                "result" -> handleResult(webSocket, obj)
                "event" -> handleEvent(webSocket, obj)
                "auth_invalid" -> finalize(webSocket, false, "error", "HA Token für Assist-WebSocket ungültig")
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            L.e("AssistPipeline", "websocket failed", t as? Exception ?: Exception(t))
            finalize(webSocket, false, "error", t.message ?: "Assist-WebSocket fehlgeschlagen")
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (!finished.get()) finalize(null, false, "idle", reason.ifBlank { "Assist-Verbindung beendet" }, closeSocket = false)
        }

        private fun handleResult(webSocket: WebSocket, obj: Map<*, *>) {
            val id = (obj["id"] as? Number)?.toInt()
            val success = obj["success"] as? Boolean ?: false
            if (id != null && id == pipelineListCommandId) {
                val resolved = if (success) resolvePipelineId(obj["result"], preferredPipelineRaw) else preferredPipelineRaw
                startRun(webSocket, resolved)
                return
            }
            if (id != null && id == runCommandId && !success) {
                val errorObj = obj["error"] as? Map<*, *>
                val errorCode = errorObj?.get("code")?.toString().orEmpty()
                val msg = errorObj?.get("message")?.toString().orEmpty().ifBlank { obj["error"]?.toString() ?: "Unbekannter Fehler" }
                if (errorCode == "pipeline-not-found" && retryWithDefault) {
                    retryWithDefault = false
                    sentAudio.set(false)
                    sttHandlerId = null
                    runStarted = false
                    wakeWordStarted = false
                    ttsStarted = false
                    onState("processing", "Pipeline nicht gefunden - nutze Standard")
                    startRun(webSocket, "default")
                } else {
                    finalize(webSocket, false, "error", "Assist-WS: $msg")
                }
            }
        }


        private fun emitReplySnapshot(reason: String) {
            val payload = mutableMapOf<String, Any>(
                "pipeline_id" to activePipelineId,
                "trigger_source" to triggerSource,
            )
            if (transcriptText.isNotBlank()) payload["heard_text"] = transcriptText
            if (replyText.isNotBlank()) payload["text"] = replyText
            if (replyUrl.isNotBlank()) payload["url"] = replyUrl
            if (reason.isNotBlank()) payload["reason"] = reason
            if (payload.size > 2) {
                api.sendEvent("assist_reply", payload)
            }
        }

        private fun startRun(webSocket: WebSocket, requestedPipeline: String?) {
            val normalized = requestedPipeline?.trim().orEmpty()
            activePipelineId = when {
                normalized.isBlank() -> "default"
                normalized.lowercase() in setOf("default", "preferred", "secondary", "disabled") -> normalized.lowercase()
                else -> normalized
            }
            val runId = nextId()
            runCommandId = runId
            val input = mutableMapOf<String, Any?>(
                "sample_rate" to 16000,
                "timeout" to 8,
                "noise_suppression_level" to 2,
                "auto_gain_dbfs" to 31,
                "volume_multiplier" to 2.0,
            )
            val runMsg = mutableMapOf<String, Any?>(
                "id" to runId,
                "type" to "assist_pipeline/run",
                "start_stage" to requestedStartStage,
                "end_stage" to "tts",
                "input" to input,
                "device_id" to prefs.deviceId,
                "conversation_id" to "ticker-${System.currentTimeMillis()}",
                "timeout" to 90,
            )
            if (activePipelineId != "default") runMsg["pipeline"] = activePipelineId
            webSocket.send(gson.toJson(runMsg))
            onState("processing", "Assist-Pipeline gestartet")
        }

        private fun handleEvent(webSocket: WebSocket, obj: Map<*, *>) {
            val event = obj["event"] as? Map<*, *> ?: return
            val eventType = event["type"]?.toString().orEmpty()
            val data = event["data"] as? Map<*, *> ?: emptyMap<String, Any?>()
            L.d("AssistPipeline", "event=$eventType keys=${data.keys.joinToString(",")}")
            when (eventType) {
                "run-start" -> {
                    runStarted = true
                    activePipelineId = data["pipeline"]?.toString()?.ifBlank { activePipelineId } ?: activePipelineId
                    val runnerData = data["runner_data"] as? Map<*, *> ?: emptyMap<String, Any?>()
                    sttHandlerId = (runnerData["stt_binary_handler_id"] as? Number)?.toInt()
                    if (sttHandlerId == null) sttHandlerId = (runnerData["binary_handler_id"] as? Number)?.toInt()
                    L.d("AssistPipeline", "runner_data stt_handler=$sttHandlerId start_stage=$requestedStartStage")
                    if (requestedStartStage == "stt") sendAudioIfReady(webSocket)
                }
                "wake_word-start" -> {
                    wakeWordStarted = true
                    triggerSource = "wakeword"
                    onState("processing", "HA hört auf Wake Word")
                    sendAudioIfReady(webSocket)
                }
                "wake_word-end" -> {
                    val ww = ((data["wake_word_output"] as? Map<*, *>)?.get("wake_word_id")?.toString()).orEmpty()
                    if (ww.isBlank()) {
                        emitReplySnapshot("wake-word-not-detected")
                        finalize(webSocket, false, "idle", "Wake word was not detected")
                        return
                    }
                    val wakeMsg = "Wake Word erkannt: $ww"
                    onState("listening", wakeMsg)
                    api.sendEvent("assist_state", mapOf("state" to "listening", "message" to wakeMsg, "trigger_source" to triggerSource, "pipeline_id" to activePipelineId))
                }
                "stt-start" -> {
                    onState("listening", "Sende Sprache an HA")
                    sendAudioIfReady(webSocket)
                }
                "stt-vad-start" -> onState("listening", "HA-VAD hat Sprache erkannt")
                "stt-vad-end" -> onState("processing", "Verarbeite Sprache")
                "stt-end" -> {
                    val sttOutput = data["stt_output"] as? Map<*, *> ?: emptyMap<String, Any?>()
                    val text = sttOutput["text"]?.toString().orEmpty().trim()
                    transcriptText = text
                    if (text.isNotBlank()) {
                        onTranscript(text)
                        emitReplySnapshot("stt-end")
                        api.sendEvent("assist_state", mapOf("state" to "processing", "message" to "STT: $text", "pipeline_id" to activePipelineId, "trigger_source" to triggerSource))
                        onState("processing", "STT: $text")
                    } else {
                        api.sendEvent("assist_state", mapOf("state" to "processing", "message" to "STT leer", "pipeline_id" to activePipelineId, "trigger_source" to triggerSource))
                    }
                }
                "intent-start" -> onState("processing", "Intent wird erkannt")
                "intent-end" -> {
                    val intentOutput = data["intent_output"] as? Map<*, *> ?: emptyMap<String, Any?>()
                    val response = intentOutput["response"]
                    val speech = (response as? Map<*, *>)?.get("speech") ?: response
                    replyText = cleanReplyText(extractSpeechText(speech))
                    if (replyText.isNotBlank()) {
                        onReply(replyText, replyUrl, activePipelineId, triggerSource)
                        emitReplySnapshot("intent-end")
                        api.sendEvent("assist_state", mapOf("state" to "responding", "message" to "Antwort: $replyText", "pipeline_id" to activePipelineId, "trigger_source" to triggerSource))
                        onState("responding", "Antwort: $replyText")
                    } else {
                        onState("responding", "Antwort wird vorbereitet")
                    }
                }
                "tts-start" -> {
                    ttsStarted = true
                    val ttsInput = data["tts_input"]?.toString().orEmpty()
                    if (ttsInput.isNotBlank() && replyText.isBlank()) replyText = ttsInput
                }
                "tts-end" -> {
                    val url = extractTtsUrl(data)
                    if (url.isNotBlank()) {
                        replyUrl = url
                        onReply(replyText, replyUrl, activePipelineId, triggerSource)
                        emitReplySnapshot("tts-end")
                        api.sendEvent("assist_state", mapOf("state" to "responding", "message" to "TTS-URL: $url", "pipeline_id" to activePipelineId, "trigger_source" to triggerSource))
                        waitingForPlayback = true
                        playbackActuallyStarted = false
                        sound.onPlaybackStarted = {
                            playbackActuallyStarted = true
                            cancelPlaybackFallback()
                        }
                        sound.onPlaybackFailed = {
                            if (!playbackActuallyStarted && replyText.isNotBlank()) {
                                L.w("HAAssist", "Server audio failed before start: $it")
                                cancelPlaybackFallback()
                                sound.speak(replyText, language, 90)
                            }
                        }
                        sound.onPlaybackCompleted = {
                            cancelPlaybackFallback()
                            waitingForPlayback = false
                            finalize(null, true, "idle", "Assist fertig", closeSocket = false)
                        }
                        val playUrl = if (url.startsWith("/")) prefs.haUrl.trimEnd('/') + url else url
                        scheduleReplyFallbackToLocalTts()
                        sound.playAnnouncement(playUrl, 90, headers = mapOf("Authorization" to "Bearer ${prefs.token}"))
                        onState("responding", "Antwort wird abgespielt")
                    } else if (replyText.isNotBlank()) {
                        speakReplyLocallyAndFinish()
                    }
                }
                "run-end" -> {
                    emitReplySnapshot("run-end")
                    if (replyText.isNotBlank() || replyUrl.isNotBlank()) {
                        onReply(replyText, replyUrl, activePipelineId, triggerSource)
                    }
                    if (!waitingForPlayback) {
                        if (replyText.isNotBlank()) {
                            speakReplyLocallyAndFinish()
                        } else {
                            finalize(webSocket, true, "idle", "Assist fertig")
                        }
                    }
                }
                "error" -> {
                    val code = data["code"]?.toString().orEmpty()
                    val message = data["message"]?.toString().orEmpty().ifBlank { code.ifBlank { "Assist Fehler" } }
                    finalize(webSocket, false, if (code == "wake-word-timeout") "idle" else "error", message)
                }
            }
        }


        private fun extractSpeechText(value: Any?): String {
            return when (value) {
                null -> ""
                is String -> value
                is Map<*, *> -> {
                    val direct = sequenceOf("plain", "text", "speech", "message", "say", "value")
                        .mapNotNull { k -> extractSpeechText(value[k]) }
                        .firstOrNull { it.isNotBlank() }
                    if (!direct.isNullOrBlank()) direct else value.values
                        .asSequence()
                        .map { extractSpeechText(it) }
                        .firstOrNull { it.isNotBlank() }
                        .orEmpty()
                }
                is List<*> -> value.asSequence().map { extractSpeechText(it) }.firstOrNull { it.isNotBlank() }.orEmpty()
                else -> value.toString()
            }
        }

        private fun cleanReplyText(raw: String): String {
            val t = raw.trim()
            if (t.startsWith("{speech=") && t.endsWith("}")) {
                return t.removePrefix("{speech=").substringBefore(", extra_data=").trim()
            }
            return t
        }

        private fun extractTtsUrl(data: Map<*, *>): String {
            val direct = data["url"]?.toString().orEmpty()
            if (direct.isNotBlank()) return direct
            val nested = data["tts_output"]
            return when (nested) {
                is Map<*, *> -> sequenceOf("url", "path", "media_id")
                    .map { nested[it]?.toString().orEmpty() }
                    .firstOrNull { it.isNotBlank() }
                    .orEmpty()
                else -> ""
            }
        }

        private fun speakReplyLocallyAndFinish() {
            val spoken = cleanReplyText(replyText)
            if (spoken.isBlank()) {
                finalize(null, true, "idle", "Assist fertig", closeSocket = false)
                return
            }
            cancelPlaybackFallback()
            waitingForPlayback = true
            sound.onPlaybackCompleted = {
                waitingForPlayback = false
                finalize(null, true, "idle", "Assist fertig", closeSocket = false)
            }
            sound.onPlaybackFailed = {
                waitingForPlayback = false
                finalize(null, false, "error", "Lokale Sprach-Ausgabe fehlgeschlagen", closeSocket = false)
            }
            sound.speak(spoken, language, 90)
        }


        private fun cancelPlaybackFallback() {
            playbackFallbackRunnable?.let { handler.removeCallbacks(it) }
            playbackFallbackRunnable = null
        }

        private fun scheduleReplyFallbackToLocalTts() {
            cancelPlaybackFallback()
            replyText = cleanReplyText(replyText)
            if (replyText.isBlank()) return
            playbackActuallyStarted = false
            playbackFallbackRunnable = Runnable {
                if (!playbackActuallyStarted && replyText.isNotBlank()) {
                    L.w("HAAssist", "Server audio did not start, fallback to local TTS")
                    waitingForPlayback = true
                    sound.onPlaybackCompleted = {
                        waitingForPlayback = false
                        finalize(null, true, "idle", "Assist fertig", closeSocket = false)
                    }
                    sound.speak(replyText, language, 90)
                }
            }
            handler.postDelayed(playbackFallbackRunnable!!, 4000)
        }

        private fun sendAudioIfReady(webSocket: WebSocket) {
            if (sentAudio.get() || !runStarted) return
            if (requestedStartStage == "wake_word" && !wakeWordStarted) return
            val hid = sttHandlerId ?: return
            sentAudio.set(true)
            try {
                val chunkSize = 3200
                var offset = 0
                while (offset < audio.size) {
                    val end = minOf(offset + chunkSize, audio.size)
                    val packet = ByteArray(1 + end - offset)
                    packet[0] = hid.toByte()
                    System.arraycopy(audio, offset, packet, 1, end - offset)
                    webSocket.send(packet.toByteString(0, packet.size))
                    offset = end
                }
                webSocket.send(byteArrayOf(hid.toByte()).toByteString(0, 1))
                onState("processing", "Audio an HA gesendet")
            } catch (e: Exception) {
                L.e("AssistPipeline", "sendAudio failed", e)
                finalize(webSocket, false, "error", e.message ?: "Audio-Upload zur Assist-Pipeline fehlgeschlagen")
            }
        }

        private fun resolvePipelineId(result: Any?, requested: String): String {
            val normalized = requested.trim()
            if (normalized.isBlank()) return "default"
            val entries = mutableListOf<Map<String, String>>()
            fun walk(obj: Any?) {
                when (obj) {
                    is Map<*, *> -> {
                        val id = obj["id"]?.toString()?.trim().orEmpty()
                        val name = obj["name"]?.toString()?.trim().orEmpty()
                        if (id.isNotBlank()) entries += mapOf("id" to id, "name" to name)
                        obj.values.forEach(::walk)
                    }
                    is Iterable<*> -> obj.forEach(::walk)
                }
            }
            walk(result)
            return entries.firstOrNull { it["name"].equals(normalized, true) || it["id"].equals(normalized, true) }?.get("id") ?: normalized
        }

        private fun finalize(webSocket: WebSocket?, success: Boolean, state: String, message: String, closeSocket: Boolean = true) {
            if (!finished.compareAndSet(false, true)) return
            onState(state, message)
            onFinished(success, state, message)
            if (closeSocket && closed.compareAndSet(false, true)) {
                safeClose(webSocket ?: this.webSocket)
            }
        }

        private fun nextId(): Int = msgId++
    }

    private fun safeClose(webSocket: WebSocket?) {
        try { webSocket?.close(1000, "done") } catch (_: Exception) {}
    }
}
