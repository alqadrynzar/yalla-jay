package com.yallajay.customerapp.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Serializable
@Entity(tableName = "notifications")
data class Notification(
    @PrimaryKey(autoGenerate = true)
    val uid: Int = 0,
    val id: String, // This can be the message ID from FCM if available
    val title: String,
    val body: String,
    val timestamp: Long,
    val isRead: Boolean = false
)
