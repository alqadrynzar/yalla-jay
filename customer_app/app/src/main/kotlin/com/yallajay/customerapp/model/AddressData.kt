package com.yallajay.customerapp.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Parcelize
@Serializable
data class CustomerAddress(
    val id: Int,
    @SerialName("address_label")
    val addressLabel: String? = null, // e.g., "المنزل", "العمل"
    @SerialName("full_address")
    val fullAddress: String,
    @SerialName("created_at")
    val createdAt: String,
    @SerialName("updated_at")
    val updatedAt: String? = null
) : Parcelable

@Serializable
data class AddressListResponse(
    val message: String,
    val addresses: List<CustomerAddress>
)

@Serializable
data class CreateAddressRequest(
    @SerialName("address_label")
    val addressLabel: String?,
    @SerialName("full_address")
    val fullAddress: String
)

@Serializable
data class AddressResponse(
    val message: String,
    val address: CustomerAddress
)
