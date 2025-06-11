package com.yallajay.customerapp.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Data class representing the payload for creating a new order.
 */
@Serializable
data class CreateOrderRequest(
    @SerialName("store_id")
    val storeId: Int,
    @SerialName("delivery_address")
    val deliveryAddress: String,
    @SerialName("special_notes")
    val specialNotes: String?
)

/**
 * Data class representing the detailed Order object returned AFTER CREATING an order.
 */
@Serializable
data class Order(
    val id: Int,
    val status: String,
    @SerialName("grand_total")
    val grandTotal: Double,
    @SerialName("items_subtotal")
    val itemsSubtotal: Double,
    @SerialName("delivery_fee")
    val deliveryFee: Double,
    @SerialName("delivery_address")
    val deliveryAddress: String,
    @SerialName("special_notes")
    val specialNotes: String?,
    @SerialName("order_placed_at")
    val orderPlacedAt: String,
    @SerialName("created_at")
    val createdAt: String
)

/**
 * The wrapper for the API response when an order is created successfully.
 */
@Serializable
data class OrderResponse(
    val message: String,
    val order: Order
)

/**
 * Represents a single order summary in the order history list.
 */
@Serializable
data class OrderSummary(
    val id: Int,
    @SerialName("store_name")
    val storeName: String,
    val status: String,
    @SerialName("grand_total")
    val grandTotal: String,
    @SerialName("order_placed_at")
    val orderPlacedAt: String
)

/**
 * The wrapper for the API response when fetching the order history list.
 */
@Serializable
data class OrderHistoryResponse(
    val message: String,
    val orders: List<OrderSummary>
)


// --- NEW CLASSES ADDED FOR ORDER DETAILS ---

/**
 * Represents a single product item within a detailed order.
 */
@Serializable
data class OrderItem(
    @SerialName("product_id") val productId: Int,
    @SerialName("product_name") val productName: String,
    @SerialName("product_image_url") val productImageUrl: String?,
    val quantity: Int,
    @SerialName("price_at_purchase") val priceAtPurchase: String,
    @SerialName("item_subtotal") val itemSubtotal: String
)

/**
 * Represents the full details of a single order.
 */
@Serializable
data class OrderDetail(
    val id: Int,
    @SerialName("store_name") val storeName: String,
    val status: String,
    @SerialName("delivery_address") val deliveryAddress: String,
    @SerialName("special_notes") val specialNotes: String?,
    @SerialName("items_subtotal") val itemsSubtotal: String,
    @SerialName("delivery_fee") val deliveryFee: String,
    @SerialName("grand_total") val grandTotal: String,
    @SerialName("order_placed_at") val orderPlacedAt: String,
    val items: List<OrderItem>
)

/**
 * The wrapper for the API response when fetching full order details.
 */
@Serializable
data class OrderDetailResponse(
    val message: String,
    val order: OrderDetail
)
