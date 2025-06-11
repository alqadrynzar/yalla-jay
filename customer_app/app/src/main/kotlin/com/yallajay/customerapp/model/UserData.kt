package com.yallajay.customerapp.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class UserProfile(
    val id: Int,
    @SerialName("full_name")
    val fullName: String,
    val email: String,
    @SerialName("phone_number")
    val phoneNumber: String,
    @SerialName("user_role")
    val userRole: String,
    @SerialName("created_at")
    val createdAt: String
)

@Serializable
data class UserProfileResponse(
    val message: String,
    val user: UserProfile
)

@Serializable
data class UpdateProfileRequest(
    @SerialName("fullName")
    val fullName: String,
    @SerialName("phoneNumber")
    val phoneNumber: String
)
