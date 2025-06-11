package com.yallajay.customerapp.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class StoreType(
    val id: String, // مثل "restaurant", "grocery_supermarket"
    val name: String, // الاسم المعروض باللغة العربية مثل "مطاعم"
    @SerialName("icon_identifier")
    val iconIdentifier: String // مثل "ic_storetype_restaurant"
)

@Serializable
data class StoreTypesResponse(
    val message: String,
    @SerialName("store_types")
    val storeTypes: List<StoreType>
)
