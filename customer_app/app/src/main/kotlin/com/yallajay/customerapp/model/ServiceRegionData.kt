package com.yallajay.customerapp.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ServiceRegion(
    val id: Int,
    val name: String,
    val description: String? = null,
    @SerialName("support_phone_number")
    val supportPhoneNumber: String? = null
)

@Serializable
data class ServiceRegionsResponse(
    val message: String,
    @SerialName("service_regions")
    val serviceRegions: List<ServiceRegion>
)
