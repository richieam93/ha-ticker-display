package de.tickerdisplay

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.admin.DeviceAdminReceiver
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.core.app.NotificationCompat

class KioskManager(
    private val activity: Activity,
    private val prefs: Prefs
) {
    private var cornerTaps = 0
    private var lastTap = 0L
    var onPinRequired: (() -> Unit)? = null

    fun enable() {
        if (!prefs.kioskEnabled) return
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUI()
    }

    fun hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            activity.window.insetsController?.let { c ->
                c.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                c.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            activity.window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
        }
    }

    fun handleCornerTap(x: Float, y: Float, w: Int, h: Int) {
        if (x > w - 100 && y < 100) {
            val now = System.currentTimeMillis()
            if (now - lastTap > C.PIN_TIMEOUT) cornerTaps = 0
            cornerTaps++
            lastTap = now
            if (cornerTaps >= C.PIN_TAPS) {
                cornerTaps = 0
                onPinRequired?.invoke()
            }
        }
    }
}

class ScreenManager(private val ctx: Context) {
    private var wakeLock: PowerManager.WakeLock? = null

    fun keepScreenOn(activity: Activity) {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        @Suppress("DEPRECATION")
        wakeLock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "TickerDisplay::WakeLock"
        )
        wakeLock?.acquire(24 * 60 * 60 * 1000L)
    }

    fun release() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    fun setBrightness(percent: Int) {
        try {
            val brightness = (percent * 255) / 100
            Settings.System.putInt(ctx.contentResolver, Settings.System.SCREEN_BRIGHTNESS, brightness.coerceIn(1, 255))
        } catch (_: Exception) {}
    }

    fun getBrightness(): Int = try {
        val b = Settings.System.getInt(ctx.contentResolver, Settings.System.SCREEN_BRIGHTNESS)
        (b * 100) / 255
    } catch (_: Exception) { 50 }

    fun screenOn() {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        @Suppress("DEPRECATION")
        val wl = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP, "TickerDisplay::ScreenOn")
        wl.acquire(1000)
        wl.release()
    }

    fun screenOff() = setBrightness(0)

    fun isScreenOn(): Boolean {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isInteractive
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            val prefs = Prefs(ctx)
            if (prefs.autoStart && prefs.isConfigured()) {
                Handler(Looper.getMainLooper()).postDelayed({
                    val launchIntent = Intent(ctx, MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    }
                    ctx.startActivity(launchIntent)
                }, 3000)
            }
        }
    }
}

class WatchdogService : Service() {
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(C.WATCHDOG_ID, createNotification())
        scheduleCheck()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    private fun scheduleCheck() {
        handler.postDelayed({
            scheduleCheck()
        }, 30000)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(C.WATCHDOG_CHANNEL, "Ticker Display", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Keeps app running"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pi = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val settingsIntent = Intent(this, SettingsActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val settingsPi = PendingIntent.getActivity(this, 1, settingsIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        return NotificationCompat.Builder(this, C.WATCHDOG_CHANNEL)
            .setContentTitle("Ticker Display")
            .setContentText("Display aktiv")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pi)
            .addAction(0, "Einstellungen", settingsPi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}

class AdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(ctx: Context, intent: Intent) {
        L.i("Admin", "Device admin enabled")
    }

    override fun onDisabled(ctx: Context, intent: Intent) {
        L.i("Admin", "Device admin disabled")
    }
}
