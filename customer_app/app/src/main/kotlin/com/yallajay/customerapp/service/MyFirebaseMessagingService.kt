package com.yallajay.customerapp.service

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.yallajay.customerapp.NotificationActivity
import com.yallajay.customerapp.R
import com.yallajay.customerapp.db.AppDatabase
import com.yallajay.customerapp.model.Notification
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MyFirebaseMessagingService : FirebaseMessagingService() {

    private val TAG = "FirebaseService"
    private val CHANNEL_ID = "YallaJayChannel"

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "Refreshed token: $token")
        sendTokenToServer(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.d(TAG, "From: ${message.from}")

        message.notification?.let {
            val title = it.title
            val body = it.body
            Log.d(TAG, "Message Notification Title: $title")
            Log.d(TAG, "Message Notification Body: $body")

            if (title != null && body != null) {
                // Save the notification to the database
                saveNotificationToDatabase(message.messageId, title, body)
                // Display the notification to the user
                sendNotification(title, body)
            }
        }
    }

    private fun saveNotificationToDatabase(messageId: String?, title: String, body: String) {
        // Use the application context to get the database to avoid memory leaks
        val dao = AppDatabase.getDatabase(applicationContext).notificationDao()
        val notification = Notification(
            id = messageId ?: System.currentTimeMillis().toString(), // Use messageId or timestamp as a unique ID
            title = title,
            body = body,
            timestamp = System.currentTimeMillis(),
            isRead = false
        )

        // Launch a coroutine to perform the database insertion on a background thread
        CoroutineScope(Dispatchers.IO).launch {
            dao.insertNotification(notification)
            Log.d(TAG, "Notification saved to database.")
        }
    }

    private fun sendTokenToServer(token: String) {
        // This is a placeholder. We will implement this fully in Stage 3.
        Log.i(TAG, "Sending token to server (placeholder): $token")
    }

    private fun sendNotification(title: String, messageBody: String) {
        createNotificationChannel()

        val intent = Intent(this, NotificationActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent: PendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE)

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setContentTitle(title)
            .setContentText(messageBody)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        with(NotificationManagerCompat.from(this)) {
            if (ActivityCompat.checkSelfPermission(this@MyFirebaseMessagingService, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                Log.w(TAG, "POST_NOTIFICATIONS permission not granted. Cannot show notification.")
                return
            }
            val notificationId = System.currentTimeMillis().toInt()
            notify(notificationId, builder.build())
            Log.d(TAG, "Notification sent: ID=$notificationId")
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "YallaJay Notifications"
            val descriptionText = "Channel for general app notifications"
            val importance = NotificationManager.IMPORTANCE_DEFAULT
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
            }
            val notificationManager: NotificationManager =
                getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
            Log.d(TAG, "Notification channel created.")
        }
    }
}
