package de.tickerdisplay

import android.app.Application

class App : Application() {
    companion object {
        lateinit var instance: App
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        // Logger initialisieren
        try {
            L.init(this)
            L.i("App", "Ticker Display started")
        } catch (e: Exception) {
            android.util.Log.e("App", "Logger init failed", e)
        }

        // Auto-restart on crash
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            android.util.Log.e("CRASH", "Uncaught exception", throwable)
            try {
                L.e("CRASH", "App crashed", throwable)
            } catch (_: Exception) {}

            // Restart nach 1 Sekunde
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                val intent = packageManager.getLaunchIntentForPackage(packageName)
                intent?.addFlags(
                    android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                            android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
                )
                startActivity(intent)
                android.os.Process.killProcess(android.os.Process.myPid())
            }, 1000)
        }
    }
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
object C {
    const val PREFS = "ticker_prefs"
    const val API_REGISTER = "/ticker-display/api/device/register"
    const val API_HEARTBEAT = "/ticker-display/api/device/heartbeat"
    const val API_EVENT = "/ticker-display/api/device/event"
    const val API_CAMERA_UPLOAD = "/ticker-display/api/camera/upload"
    const val DISPLAY_PATH = "/ticker-display/%s"
    const val DEFAULT_PIN = "1234"
    const val PIN_TAPS = 5
    const val PIN_TIMEOUT = 3000L
    const val WATCHDOG_ID = 1001
    const val WATCHDOG_CHANNEL = "ticker_watchdog"
    const val VOICE_CHANNEL = "ticker_voice"
    const val VOICE_ID = 1002
}