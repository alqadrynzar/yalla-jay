package com.yallajay.customerapp.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Product(
    val id: Int,
    val name: String,
    val description: String? = null,
    val price: Double,
    @SerialName("stock_quantity")
    val stockQuantity: Int,
    @SerialName("image_url")
    val imageUrl: String? = null,
    @SerialName("is_available")
    val isAvailable: Boolean,
    @SerialName("store_id")
    val storeId: Int,
    @SerialName("store_name")
    val storeName: String,
    @SerialName("category_id")
    val categoryId: Int,
    @SerialName("category_name")
    val categoryName: String,
    @SerialName("created_at")
    val createdAt: String,
    @SerialName("updated_at")
    val updatedAt: String? = null
)

@Serializable
data class PaginationInfo(
    @SerialName("totalItems")
    val totalItems: Int,
    @SerialName("totalPages")
    val totalPages: Int,
    @SerialName("currentPage")
    val currentPage: Int,
    val limit: Int
)

@Serializable
data class ProductListResponse(
    val message: String,
    val products: List<Product>,
    val pagination: PaginationInfo
)
