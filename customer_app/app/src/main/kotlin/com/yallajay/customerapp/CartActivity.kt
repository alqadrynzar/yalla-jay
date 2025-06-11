package com.yallajay.customerapp

import android.app.Activity
import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import com.yallajay.customerapp.databinding.ActivityCartBinding
import com.yallajay.customerapp.model.*
import com.yallajay.customerapp.network.ApiClient
import com.yallajay.customerapp.ui.adapter.CartAdapter
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

class CartActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCartBinding
    private lateinit var cartAdapter: CartAdapter
    private var currentAddresses: List<CustomerAddress> = emptyList()
    private var selectedAddress: CustomerAddress? = null
    private var cartStoreId: Int? = null 
    private val TAG = "CartActivity"

    // CORRECTED LOGIC
    private val addressLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            // An address was selected/added/edited. We must refetch the addresses list
            // to ensure we have the latest data before trying to display it.
            val selectedId = result.data?.getIntExtra(AddressListActivity.RESULT_SELECTED_ADDRESS_ID, -1) ?: -1

            lifecycleScope.launch {
                try {
                    val addressResponse = ApiClient.getUserAddresses()
                    if (addressResponse != null) {
                        currentAddresses = addressResponse.addresses // Update the cached list with fresh data

                        if (selectedId != -1) {
                            // Now, find the selected address in the FRESH list
                            selectedAddress = currentAddresses.find { it.id == selectedId }
                        } else if (currentAddresses.isNotEmpty()) {
                            // If no specific ID was returned (e.g., after a new add), default to the first
                            selectedAddress = currentAddresses.first()
                        }

                        updateAddressView() // Update the UI with the correct address

                        // Recalculate fees since the address might affect them
                        val subtotal = binding.subtotalTextView.text.toString().filter { it.isDigit() }.toDoubleOrNull() ?: 0.0
                        if (subtotal > 0) fetchDeliveryFee(subtotal)
                    }
                } catch (e: Exception) {
                    Toast.makeText(this@CartActivity, "فشل تحديث قائمة العناوين", Toast.LENGTH_SHORT).show()
                    Log.e(TAG, "Error refetching addresses after selection", e)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCartBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.cartToolbar)
        supportActionBar?.title = getString(R.string.title_activity_cart)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setDisplayShowHomeEnabled(true)

        setupRecyclerView()
        fetchCartAndDependentData()

        binding.changeAddressButton.setOnClickListener {
            val intent = Intent(this, AddressListActivity::class.java)
            intent.putExtra(AddressListActivity.EXTRA_CURRENT_ADDRESS_ID, selectedAddress?.id ?: -1)
            addressLauncher.launch(intent)
        }

        binding.checkoutButton.setOnClickListener {
            createOrder()
        }
    }

    private fun createOrder() {
        if (selectedAddress == null) {
            Toast.makeText(this, "يرجى اختيار عنوان توصيل أولاً", Toast.LENGTH_LONG).show()
            return
        }
        if (cartStoreId == null) {
            Toast.makeText(this, "خطأ: لا يمكن تحديد المتجر. حاول تحديث السلة.", Toast.LENGTH_LONG).show()
            return
        }

        val notes = binding.specialNotesEditText.text.toString().trim()
        val request = CreateOrderRequest(
            storeId = cartStoreId!!,
            deliveryAddress = selectedAddress!!.fullAddress,
            specialNotes = if (notes.isNotEmpty()) notes else null
        )

        showLoading(true, isCheckout = true)

        lifecycleScope.launch {
            try {
                val response = ApiClient.createOrder(request)
                if (response != null) {
                    val intent = Intent(this@CartActivity, OrderSuccessActivity::class.java)
                    intent.putExtra("ORDER_ID", response.order.id.toString())
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                    startActivity(intent)
                    finish()
                } else {
                    Toast.makeText(this@CartActivity, "فشل إنشاء الطلب", Toast.LENGTH_LONG).show()
                    showContent() 
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error creating order", e)
                Toast.makeText(this@CartActivity, "فشل الاتصال: ${e.message}", Toast.LENGTH_LONG).show()
                showContent()
            }
        }
    }

    private fun setupRecyclerView() {
        cartAdapter = CartAdapter(
            cartItems = emptyList(),
            onIncrease = { cartItem -> handleUpdateQuantity(cartItem.productId, cartItem.quantity + 1) },
            onDecrease = { cartItem -> handleUpdateQuantity(cartItem.productId, cartItem.quantity - 1) },
            onDelete = { cartItem -> handleDeleteItem(cartItem.productId) }
        )
        binding.cartRecyclerView.adapter = cartAdapter
    }

    private fun fetchCartAndDependentData() {
        lifecycleScope.launch {
            showLoading(true)
            try {
                val cartResponse = ApiClient.getCart()
                if (cartResponse != null && cartResponse.cart.items.isNotEmpty()) {
                    val cart = cartResponse.cart
                    cartAdapter.updateData(cart.items)

                    cartStoreId = cart.items[0].storeId

                    val subtotal = cart.subtotal.toDoubleOrNull() ?: 0.0

                    fetchAddressesAndFees(subtotal)
                    showContent()
                } else {
                    cartStoreId = null 
                    showEmptyView()
                }
            } catch (e: Exception) {
                showErrorView("فشل تحميل سلة المشتريات.")
                Log.e(TAG, "Error fetching cart", e)
            }
        }
    }

    private fun fetchAddressesAndFees(subtotal: Double) {
        lifecycleScope.launch {
            try {
                val addressResponse = ApiClient.getUserAddresses()
                if (addressResponse != null && addressResponse.addresses.isNotEmpty()) {
                    currentAddresses = addressResponse.addresses
                    if (selectedAddress == null) {
                        selectedAddress = currentAddresses.first()
                    }
                    updateAddressView()
                } else {
                    showNoAddressView()
                }
                fetchDeliveryFee(subtotal)

            } catch (e: Exception) {
                Log.e(TAG, "Error fetching addresses", e)
                showNoAddressView("خطأ في جلب العناوين")
                fetchDeliveryFee(subtotal)
            }
        }
    }

    private fun fetchDeliveryFee(subtotal: Double) {
         lifecycleScope.launch {
            try {
                val feeResponse = ApiClient.calculateDeliveryFee(DeliveryFeeRequest(itemsSubtotal = subtotal))
                if(feeResponse != null) {
                    updateSummary(subtotal, feeResponse.deliveryFee)
                } else {
                    updateSummary(subtotal, null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error fetching delivery fee", e)
                updateSummary(subtotal, null, true)
            }
         }
    }

    private fun handleUpdateQuantity(productId: Int, newQuantity: Int) {
        if (newQuantity <= 0) {
            handleDeleteItem(productId)
            return
        }

        lifecycleScope.launch {
            try {
                val response = ApiClient.updateCartItem(productId, UpdateCartItemRequest(quantity = newQuantity))
                if (response != null) {
                    fetchCartAndDependentData()
                } else {
                    Toast.makeText(this@CartActivity, "فشل تحديث الكمية", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@CartActivity, "خطأ: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun handleDeleteItem(productId: Int) {
        lifecycleScope.launch {
            try {
                val response = ApiClient.deleteCartItem(productId)
                if (response != null) {
                    Toast.makeText(this@CartActivity, response.message, Toast.LENGTH_SHORT).show()
                    fetchCartAndDependentData()
                } else {
                    Toast.makeText(this@CartActivity, "فشل حذف المنتج", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@CartActivity, "خطأ: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun updateAddressView() {
        selectedAddress?.let {
            binding.deliveryAddressTextView.visibility = View.VISIBLE
            binding.noAddressTextView.visibility = View.GONE
            val label = it.addressLabel ?: "عنوان"
            binding.deliveryAddressTextView.text = "$label: ${it.fullAddress}"
        } ?: showNoAddressView()
    }

    private fun showNoAddressView(message: String = "الرجاء اختيار أو إضافة عنوان للتوصيل") {
        binding.deliveryAddressTextView.visibility = View.GONE
        binding.noAddressTextView.visibility = View.VISIBLE
        binding.noAddressTextView.text = message
        selectedAddress = null
    }

    private fun updateSummary(subtotal: Double, deliveryFee: Double?, isError: Boolean = false) {
        binding.subtotalTextView.text = formatCurrency(subtotal)
        if (isError) {
            binding.deliveryFeeTextView.text = "خطأ"
            binding.totalTextView.text = "خطأ"
        } else if (deliveryFee != null) {
            binding.deliveryFeeTextView.text = formatCurrency(deliveryFee)
            binding.totalTextView.text = formatCurrency(subtotal + deliveryFee)
        } else {
            binding.deliveryFeeTextView.text = "غير محسوب"
            binding.totalTextView.text = formatCurrency(subtotal)
        }
    }

    private fun showLoading(isInitialLoad: Boolean, isCheckout: Boolean = false) {
        if(isInitialLoad) binding.cartProgressBar.visibility = View.VISIBLE
        binding.checkoutButton.isEnabled = false 
        if (isCheckout) {
            binding.checkoutButton.text = "جارٍ إنشاء الطلب..."
        }
        if(isInitialLoad) {
            binding.cartRecyclerView.visibility = View.GONE
            binding.addressCardView.visibility = View.GONE
            binding.summaryCardView.visibility = View.GONE
            binding.cartErrorTextView.visibility = View.GONE
        }
    }

    private fun showContent() {
        binding.cartProgressBar.visibility = View.GONE
        binding.checkoutButton.isEnabled = true
        binding.checkoutButton.text = "إتمام الطلب"
        binding.cartRecyclerView.visibility = View.VISIBLE
        binding.addressCardView.visibility = View.VISIBLE
        binding.summaryCardView.visibility = View.VISIBLE
        binding.cartErrorTextView.visibility = View.GONE
    }

    private fun showEmptyView() {
        binding.cartProgressBar.visibility = View.GONE
        binding.cartRecyclerView.visibility = View.GONE
        binding.addressCardView.visibility = View.GONE
        binding.summaryCardView.visibility = View.GONE
        binding.checkoutButton.visibility = View.GONE
        binding.cartErrorTextView.text = "سلة المشتريات فارغة."
        binding.cartErrorTextView.visibility = View.VISIBLE
    }

    private fun showErrorView(message: String) {
        binding.cartProgressBar.visibility = View.GONE
        binding.cartRecyclerView.visibility = View.GONE
        binding.addressCardView.visibility = View.GONE
        binding.summaryCardView.visibility = View.GONE
        binding.checkoutButton.visibility = View.GONE
        binding.cartErrorTextView.text = message
        binding.cartErrorTextView.visibility = View.VISIBLE
    }

    private fun formatCurrency(value: Double): String {
        return String.format(Locale.ENGLISH, "%,.0f ل.س", value)
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_toolbar_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            android.R.id.home -> {
                onBackPressedDispatcher.onBackPressed()
                return true
            }
            R.id.action_cart -> {
                Toast.makeText(this, "أنت في السلة بالفعل", Toast.LENGTH_SHORT).show()
                return true
            }
        }
        return super.onOptionsItemSelected(item)
    }
}
