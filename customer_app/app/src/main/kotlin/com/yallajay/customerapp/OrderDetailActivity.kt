package com.yallajay.customerapp

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.yallajay.customerapp.databinding.ActivityOrderDetailBinding
import com.yallajay.customerapp.model.OrderDetail
import com.yallajay.customerapp.network.ApiClient
import com.yallajay.customerapp.ui.adapter.OrderDetailAdapter
import kotlinx.coroutines.launch

class OrderDetailActivity : AppCompatActivity() {

    private lateinit var binding: ActivityOrderDetailBinding
    private var orderId: Int = -1

    companion object {
        const val EXTRA_ORDER_ID = "extra_order_id"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityOrderDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        orderId = intent.getIntExtra(EXTRA_ORDER_ID, -1)

        setupToolbar()

        if (orderId == -1) {
            showError("رقم الطلب غير صالح.")
        } else {
            fetchOrderDetails()
        }
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = getString(R.string.title_activity_order_detail)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
    }

    private fun fetchOrderDetails() {
        lifecycleScope.launch {
            showLoading(true)
            try {
                val response = ApiClient.getOrderDetail(orderId)
                if (response != null) {
                    populateUi(response.order)
                    showLoading(false)
                } else {
                    showError("ไม่สามารถ تحميل تفاصيل الطلب.")
                }
            } catch (e: Exception) {
                showError("حدث خطأ في الشبكة. يرجى المحاولة مرة أخرى.")
            }
        }
    }

    private fun populateUi(order: OrderDetail) {
        binding.textViewOrderId.text = "تفاصيل طلب #${order.id}"
        binding.textViewStoreName.text = "من: ${order.storeName}"
        binding.textViewOrderStatus.text = order.status
        binding.textViewDeliveryAddress.text = order.deliveryAddress

        if (order.specialNotes.isNullOrEmpty()) {
            binding.cardViewSpecialNotes.visibility = View.GONE
        } else {
            binding.cardViewSpecialNotes.visibility = View.VISIBLE
            binding.textViewSpecialNotes.text = order.specialNotes
        }

        // Setup products list
        binding.recyclerViewProducts.layoutManager = LinearLayoutManager(this)
        binding.recyclerViewProducts.adapter = OrderDetailAdapter(order.items)

        // Populate summary
        binding.textViewSubtotal.text = "${order.itemsSubtotal} ل.س"
        binding.textViewDeliveryFee.text = "${order.deliveryFee} ل.س"
        binding.textViewGrandTotal.text = "${order.grandTotal} ل.س"
    }


    private fun showLoading(isLoading: Boolean) {
        binding.progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
        binding.contentScrollView.visibility = if (isLoading) View.GONE else View.VISIBLE
        binding.textViewError.visibility = View.GONE
    }

    private fun showError(message: String) {
        binding.progressBar.visibility = View.GONE
        binding.contentScrollView.visibility = View.GONE
        binding.textViewError.visibility = View.VISIBLE
        binding.textViewError.text = message
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }
}
