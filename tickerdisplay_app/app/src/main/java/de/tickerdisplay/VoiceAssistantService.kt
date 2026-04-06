package de.tickerdisplay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class VoiceAssistantService : Service() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val notification = buildNotification("Sprachassistent aktiv")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(C.VOICE_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(C.VOICE_ID, notification)
        }
        AssistRuntime.start(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                AssistRuntime.stop()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_REFRESH -> AssistRuntime.refresh(this)
            else -> AssistRuntime.start(this)
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        AssistRuntime.attachPreview(null)
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(C.VOICE_CHANNEL, "Ticker Voice", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Lokales Wake Word und Mikrofon"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(text: String): Notification {
        val openIntent = Intent(this, MainActivity::class.java)
        val openPi = PendingIntent.getActivity(this, 50, openIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val settingsIntent = Intent(this, SettingsActivity::class.java)
        val settingsPi = PendingIntent.getActivity(this, 51, settingsIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stopIntent = Intent(this, VoiceAssistantService::class.java).apply { action = ACTION_STOP }
        val stopPi = PendingIntent.getService(this, 52, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, C.VOICE_CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Ticker Display Voice")
            .setContentText(text)
            .setContentIntent(openPi)
            .addAction(0, "Einstellungen", settingsPi)
            .addAction(0, "Stop", stopPi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        const val ACTION_STOP = "de.tickerdisplay.action.STOP_VOICE"
        const val ACTION_REFRESH = "de.tickerdisplay.action.REFRESH_VOICE"
    }
}
