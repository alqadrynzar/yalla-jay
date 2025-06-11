package com.yallajay.customerapp

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.yallajay.customerapp.databinding.ActivityOrderHistoryBinding
import com.yallajay.customerapp.model.OrderSummary
import com.yallajay.customerapp.network.ApiClient
import com.yallajay.customerapp.ui.adapter.OrderHistoryAdapter
import kotlinx.coroutines.launch

class OrderHistoryActivity : AppCompatActivity() {

    private lateinit var binding: ActivityOrderHistoryBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityOrderHistoryBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupToolbar()
        setupRecyclerView()
        fetchOrderHistory()
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = getString(R.string.title_activity_order_history)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
    }

    private fun setupRecyclerView() {
        binding.recyclerViewOrders.layoutManager = LinearLayoutManager(this)
    }

    private fun fetchOrderHistory() {
        lifecycleScope.launch {
            binding.progressBar.visibility = View.VISIBLE
            binding.recyclerViewOrders.visibility = View.GONE
            binding.textViewError.visibility = View.GONE

            try {
                val response = ApiClient.getOrderHistory()
                binding.progressBar.visibility = View.GONE

                if (response != null && response.orders.isNotEmpty()) {
                    // Pass the click handler function to the adapter
                    binding.recyclerViewOrders.adapter = OrderHistoryAdapter(response.orders) { clickedOrder ->
                        onOrderItemClicked(clickedOrder)
                    }
                    binding.recyclerViewOrders.visibility = View.VISIBLE
                } else {
                    binding.textViewError.text = "لا توجد لديك طلبات سابقة."
                    binding.textViewError.visibility = View.VISIBLE
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                binding.textViewError.text = "فشل تحميل الطلبات. يرجى المحاولة مرة أخرى."
                binding.textViewError.visibility = View.VISIBLE
            }
        }
    }

    private fun onOrderItemClicked(order: OrderSummary) {
        val intent = Intent(this, OrderDetailActivity::class.java).apply {
            putExtra(OrderDetailActivity.EXTRA_ORDER_ID, order.id)
        }
        startActivity(intent)
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }
}
