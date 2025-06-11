package com.yallajay.customerapp

import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.lifecycleScope
import com.yallajay.customerapp.databinding.ActivityProductListBinding
import com.yallajay.customerapp.model.AddToCartRequest
import com.yallajay.customerapp.model.Product
import com.yallajay.customerapp.network.ApiClient
import com.yallajay.customerapp.ui.adapter.ProductAdapter
import kotlinx.coroutines.launch

class ProductListActivity : AppCompatActivity() {

    private lateinit var binding: ActivityProductListBinding
    private lateinit var productAdapter: ProductAdapter
    private var categoryId: Int = -1
    private val TAG = "ProductListActivity"

    companion object {
        const val EXTRA_CATEGORY_ID = "extra_category_id"
        const val EXTRA_CATEGORY_NAME = "extra_category_name"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityProductListBinding.inflate(layoutInflater)
        setContentView(binding.root)

        categoryId = intent.getIntExtra(EXTRA_CATEGORY_ID, -1)
        val categoryName = intent.getStringExtra(EXTRA_CATEGORY_NAME)

        setSupportActionBar(binding.productListToolbar)
        supportActionBar?.title = categoryName ?: "المنتجات"
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setDisplayShowHomeEnabled(true)

        setupRecyclerView()

        if (categoryId != -1) {
            fetchProducts()
        } else {
            Log.e(TAG, "No Category ID was provided.")
            binding.productsErrorTextView.text = "خطأ: لم يتم تحديد القسم."
            binding.productsErrorTextView.visibility = View.VISIBLE
        }
    }

    private fun setupRecyclerView() {
        productAdapter = ProductAdapter(emptyList()) { product, newQuantity ->
            handleQuantityChange(product, newQuantity)
        }
        binding.productsRecyclerView.adapter = productAdapter
    }

    private fun handleQuantityChange(product: Product, quantity: Int) {
        if (quantity == 0) {
            lifecycleScope.launch {
                try {
                    ApiClient.deleteCartItem(product.id)
                    Toast.makeText(this@ProductListActivity, "تم حذف المنتج من السلة", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Toast.makeText(this@ProductListActivity, "خطأ: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
            return
        }

        lifecycleScope.launch {
            try {
                val cartResponse = ApiClient.getCart()
                val cartItems = cartResponse?.cart?.items ?: emptyList()

                if (cartItems.isEmpty()) {
                    proceedWithAddToCart(product, quantity)
                } else {
                    val cartStoreId = cartItems[0].storeId
                    if (product.storeId == cartStoreId) {
                        proceedWithAddToCart(product, quantity)
                    } else {
                        showClearCartDialog(product, quantity)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking cart before adding item", e)
                Toast.makeText(this@ProductListActivity, "فشل التحقق من السلة", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showClearCartDialog(product: Product, quantity: Int) {
        AlertDialog.Builder(this)
            .setTitle("بدء سلة جديدة؟")
            .setMessage("سلتك تحتوي على منتجات من متجر آخر. هل تود مسح السلة الحالية والبدء بسلة جديدة من هذا المتجر؟")
            .setPositiveButton("نعم، ابدأ سلة جديدة") { dialog, _ ->
                lifecycleScope.launch {
                    try {
                        val cleared = ApiClient.clearCart()
                        if (cleared) {
                            proceedWithAddToCart(product, quantity)
                        } else {
                            Toast.makeText(this@ProductListActivity, "فشل مسح السلة، لم يتم إضافة المنتج", Toast.LENGTH_LONG).show()
                        }
                    } catch (e: Exception) {
                         Toast.makeText(this@ProductListActivity, "خطأ: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
                dialog.dismiss()
            }
            .setNegativeButton("إلغاء") { dialog, _ ->
                dialog.dismiss()
            }
            .show()
    }

    private fun proceedWithAddToCart(product: Product, quantity: Int) {
        lifecycleScope.launch {
            try {
                val response = ApiClient.addItemToCart(AddToCartRequest(productId = product.id, quantity = quantity))
                if (response != null) {
                    // THIS IS THE CORRECTED LINE
                    Toast.makeText(this@ProductListActivity, response.message, Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this@ProductListActivity, "حدث خطأ في تحديث السلة", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@ProductListActivity, "خطأ: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun fetchProducts() {
        lifecycleScope.launch {
            binding.productsProgressBar.visibility = View.VISIBLE
            binding.productsErrorTextView.visibility = View.GONE
            binding.productsRecyclerView.visibility = View.INVISIBLE

            try {
                val response = ApiClient.getProducts(categoryId)
                if (response != null && response.products.isNotEmpty()) {
                    productAdapter.updateData(response.products)
                    binding.productsRecyclerView.visibility = View.VISIBLE
                } else {
                    binding.productsErrorTextView.text = "لا توجد منتجات متاحة حاليًا في هذا القسم."
                    binding.productsErrorTextView.visibility = View.VISIBLE
                }
            } catch (e: Exception) {
                binding.productsErrorTextView.text = "فشل تحميل قائمة المنتجات."
                binding.productsErrorTextView.visibility = View.VISIBLE
                Log.e(TAG, "Error fetching products: ${e.message}", e)
            } finally {
                binding.productsProgressBar.visibility = View.GONE
            }
        }
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
                val intent = Intent(this, CartActivity::class.java)
                startActivity(intent)
                return true
            }
        }
        return super.onOptionsItemSelected(item)
    }
}
