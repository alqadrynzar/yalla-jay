package com.yallajay.customerapp.network

import android.content.Context
import android.util.Log
import com.yallajay.customerapp.model.*
import com.yallajay.customerapp.util.AppConstants
import com.yallajay.customerapp.util.TokenManager
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.auth.*
import io.ktor.client.plugins.auth.providers.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.logging.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class FcmTokenRequest(val token: String)

object ApiClient {

    private var applicationContext: Context? = null
    private const val API_TAG = "ApiClient"
    private const val AUTH_TAG = "ApiClientAuth"
    private const val BASE_URL = "http://10.10.197.150:3000"

    fun init(context: Context) {
        this.applicationContext = context.applicationContext
    }

    val instance: HttpClient by lazy {
        requireNotNull(applicationContext) { "ApiClient must be initialized with context. Call ApiClient.init(context) in your Application class." }

        HttpClient(CIO) {
            install(ContentNegotiation) {
                json(Json {
                    isLenient = true
                    ignoreUnknownKeys = true
                    prettyPrint = true
                })
            }
            install(Logging) {
                level = LogLevel.ALL
                logger = object : Logger {
                    override fun log(message: String) {
                        Log.d(AppConstants.KTOR_LOGGER_TAG, message)
                    }
                }
            }

            install(Auth) {
                bearer {
                    loadTokens {
                        val accessToken = TokenManager.getAccessToken(applicationContext!!)
                        val refreshToken = TokenManager.getRefreshToken(applicationContext!!)
                        if (accessToken != null && refreshToken != null) {
                            BearerTokens(accessToken, refreshToken)
                        } else {
                            null
                        }
                    }

                    refreshTokens {
                        val currentRefreshToken = TokenManager.getRefreshToken(applicationContext!!)
                        if (currentRefreshToken == null) {
                            TokenManager.clearTokens(applicationContext!!)
                            return@refreshTokens null
                        }
                        try {
                            val response: RefreshTokenResponse = client.post("$BASE_URL/api/users/refresh-token") {
                                contentType(ContentType.Application.Json)
                                setBody(RefreshTokenRequest(refreshToken = currentRefreshToken))
                                markAsRefreshTokenRequest()
                            }.body()
                            TokenManager.saveAuthTokens(applicationContext!!, response.accessToken, response.refreshToken)
                            BearerTokens(response.accessToken, response.refreshToken)
                        } catch (e: Exception) {
                            TokenManager.clearTokens(applicationContext!!)
                            null
                        }
                    }
                }
            }
        }
    }

    suspend fun getUserProfile(): UserProfileResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.get("$BASE_URL/api/users/profile").body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error fetching user profile: ${e.message}", e)
            null
        }
    }

    suspend fun updateUserProfile(request: UpdateProfileRequest): UserProfileResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.put("$BASE_URL/api/users/profile") {
                contentType(ContentType.Application.Json)
                setBody(request)
            }.body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error updating user profile: ${e.message}", e)
            null
        }
    }

    suspend fun getServiceRegions(): ServiceRegionsResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.get("$BASE_URL/api/service-regions").body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error fetching service regions: ${e.message}", e)
            null
        }
    }

    suspend fun getStoreTypes(): StoreTypesResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.get("$BASE_URL/api/store-types").body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error fetching store types: ${e.message}", e)
            null
        }
    }

    suspend fun getStores(regionId: Int, storeType: String): StoreListResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.get("$BASE_URL/api/stores") {
                url {
                    parameters.append("region_id", regionId.toString())
                    parameters.append("store_type", storeType)
                }
            }.body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error fetching stores: ${e.message}", e)
            null
        }
    }

    suspend fun getStoreCategories(storeId: Int): CategoryListResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.get("$BASE_URL/api/stores/$storeId/categories").body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error fetching store categories: ${e.message}", e)
            null
        }
    }

    suspend fun getProducts(categoryId: Int): ProductListResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.get("$BASE_URL/api/products/search") {
                url {
                    parameters.append("categoryId", categoryId.toString())
                }
            }.body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error fetching products: ${e.message}", e)
            null
        }
    }

    suspend fun getCart(): CartResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.get("$BASE_URL/api/cart").body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error fetching cart: ${e.message}", e)
            null
        }
    }

    suspend fun addItemToCart(request: AddToCartRequest): CartItemResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.post("$BASE_URL/api/cart/items") {
                contentType(ContentType.Application.Json)
                setBody(request)
            }.body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error adding item to cart: ${e.message}", e)
            null
        }
    }

    suspend fun updateCartItem(productId: Int, request: UpdateCartItemRequest): CartItemResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.put("$BASE_URL/api/cart/items/$productId") {
                contentType(ContentType.Application.Json)
                setBody(request)
            }.body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error updating cart item: ${e.message}", e)
            null
        }
    }

    suspend fun deleteCartItem(productId: Int): GenericResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.delete("$BASE_URL/api/cart/items/$productId").body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error deleting cart item: ${e.message}", e)
            null
        }
    }

    suspend fun calculateDeliveryFee(request: DeliveryFeeRequest): DeliveryFeeResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.post("$BASE_URL/api/orders/calculate-delivery-fee") {
                contentType(ContentType.Application.Json)
                setBody(request)
            }.body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error calculating delivery fee: ${e.message}", e)
            null
        }
    }

    suspend fun getUserAddresses(): AddressListResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.get("$BASE_URL/api/users/profile/addresses").body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error fetching user addresses: ${e.message}", e)
            null
        }
    }

    suspend fun addAddress(request: CreateAddressRequest): AddressResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.post("$BASE_URL/api/users/profile/addresses") {
                contentType(ContentType.Application.Json)
                setBody(request)
            }.body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error adding address: ${e.message}", e)
            null
        }
    }

    suspend fun updateAddress(addressId: Int, request: CreateAddressRequest): AddressResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.put("$BASE_URL/api/users/profile/addresses/$addressId") {
                contentType(ContentType.Application.Json)
                setBody(request)
            }.body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error updating address: ${e.message}", e)
            null
        }
    }

    suspend fun createOrder(request: CreateOrderRequest): OrderResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.post("$BASE_URL/api/orders") {
                contentType(ContentType.Application.Json)
                setBody(request)
            }.body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error creating order: ${e.message}", e)
            null
        }
    }

    suspend fun clearCart(): Boolean = coroutineScope {
        try {
            val cartResponse = getCart()
            val itemsInCart = cartResponse?.cart?.items ?: emptyList()
            if (itemsInCart.isEmpty()) {
                return@coroutineScope true
            }

            val deleteJobs = itemsInCart.map { item ->
                async { deleteCartItem(item.productId) }
            }
            deleteJobs.awaitAll()

            val finalCartResponse = getCart()
            val isSuccess = finalCartResponse?.cart?.items?.isEmpty() ?: false
            if (!isSuccess) {
                Log.e(API_TAG, "Failed to clear all items from the cart.")
            }
            return@coroutineScope isSuccess
        } catch (e: Exception) {
            Log.e(API_TAG, "Exception while clearing cart: ${e.message}", e)
            return@coroutineScope false
        }
    }

    suspend fun sendFcmToken(request: FcmTokenRequest): GenericResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.post("$BASE_URL/api/users/fcm-token") {
                contentType(ContentType.Application.Json)
                setBody(request)
            }.body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error sending FCM token: ${e.message}", e)
            null
        }
    }

    suspend fun getOrderHistory(): OrderHistoryResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.get("$BASE_URL/api/orders").body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error fetching order history: ${e.message}", e)
            null
        }
    }

    // --- NEW FUNCTION ADDED FOR ORDER DETAILS ---
    suspend fun getOrderDetail(orderId: Int): OrderDetailResponse? {
        requireNotNull(applicationContext) { "ApiClient must be initialized." }
        return try {
            instance.get("$BASE_URL/api/orders/$orderId").body()
        } catch (e: Exception) {
            Log.e(API_TAG, "Error fetching order details for ID $orderId: ${e.message}", e)
            null
        }
    }
}
