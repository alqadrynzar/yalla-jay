package com.yallajay.customerapp.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Store(
    val id: Int,
    val name: String,
    val description: String? = null,
    val address: String? = null,
    @SerialName("phone_number")
    val phoneNumber: String? = null,
    @SerialName("logo_url")
    val logoUrl: String? = null,
    @SerialName("store_type")
    val storeType: String, // تم التعديل هنا من Int إلى String
    @SerialName("created_at")
    val createdAt: String,
    @SerialName("is_currently_accepting_orders")
    val isCurrentlyAcceptingOrders: Boolean
)

@Serializable
data class StoreListResponse(
    val message: String,
    val stores: List<Store>
)
