package com.yallajay.customerapp.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CartItem(
    @SerialName("cart_item_id")
    val cartItemId: Int,
    @SerialName("product_id")
    val productId: Int,
    @SerialName("product_name")
    val productName: String,
    @SerialName("product_price")
    val productPrice: String,
    @SerialName("product_image_url")
    val productImageUrl: String? = null,
    @SerialName("store_id")
    val storeId: Int,
    @SerialName("store_name")
    val storeName: String,
    val quantity: Int,
    @SerialName("item_total")
    val itemTotal: String
)

@Serializable
data class Cart(
    val id: Int? = null,
    @SerialName("user_id")
    val userId: Int? = null,
    val items: List<CartItem>,
    val subtotal: String
)

@Serializable
data class CartResponse(
    val message: String,
    val cart: Cart
)

@Serializable
data class CartItemResponse(
    val message: String,
    val item: CartItem
)

@Serializable
data class AddToCartRequest(
    val productId: Int,
    val quantity: Int
)

@Serializable
data class UpdateCartItemRequest(
    val quantity: Int
)

@Serializable
data class GenericResponse(
    val message: String
)

// --- نماذج حساب أجور التوصيل ---

@Serializable
data class DeliveryFeeRequest(
    @SerialName("items_subtotal")
    val itemsSubtotal: Double
)

@Serializable
data class DeliveryFeeResponse(
    val message: String,
    @SerialName("items_subtotal")
    val itemsSubtotal: Double,
    @SerialName("delivery_fee")
    val deliveryFee: Double,
    @SerialName("estimated_grand_total")
    val estimatedGrandTotal: Double
)
