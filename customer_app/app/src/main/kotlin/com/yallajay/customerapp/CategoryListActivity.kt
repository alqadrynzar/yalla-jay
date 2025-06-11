package com.yallajay.customerapp

import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.yallajay.customerapp.databinding.ActivityCategoryListBinding
import com.yallajay.customerapp.network.ApiClient
import com.yallajay.customerapp.ui.adapter.CategoryAdapter
import kotlinx.coroutines.launch

class CategoryListActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCategoryListBinding
    private lateinit var categoryAdapter: CategoryAdapter
    private var storeId: Int = -1

    companion object {
        const val EXTRA_STORE_ID = "extra_store_id"
        const val EXTRA_STORE_NAME = "extra_store_name"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCategoryListBinding.inflate(layoutInflater)
        setContentView(binding.root)

        storeId = intent.getIntExtra(EXTRA_STORE_ID, -1)
        val storeName = intent.getStringExtra(EXTRA_STORE_NAME)

        setSupportActionBar(binding.categoryListToolbar)
        supportActionBar?.title = storeName ?: getString(R.string.title_activity_category_list)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setDisplayShowHomeEnabled(true)

        setupRecyclerView()

        if (storeId != -1) {
            fetchCategories()
        } else {
            Log.e("CategoryListActivity", "No Store ID was provided.")
            binding.categoriesErrorTextView.text = "خطأ: لم يتم تحديد المتجر."
            binding.categoriesErrorTextView.visibility = View.VISIBLE
        }
    }

    private fun setupRecyclerView() {
        categoryAdapter = CategoryAdapter(emptyList()) { category ->
            val intent = Intent(this, ProductListActivity::class.java).apply {
                putExtra(ProductListActivity.EXTRA_CATEGORY_ID, category.id)
                putExtra(ProductListActivity.EXTRA_CATEGORY_NAME, category.name)
            }
            startActivity(intent)
        }
        binding.categoriesRecyclerView.adapter = categoryAdapter
    }

    private fun fetchCategories() {
        lifecycleScope.launch {
            binding.categoriesProgressBar.visibility = View.VISIBLE
            binding.categoriesErrorTextView.visibility = View.GONE
            binding.categoriesRecyclerView.visibility = View.INVISIBLE

            try {
                val response = ApiClient.getStoreCategories(storeId)
                if (response != null && response.categories.isNotEmpty()) {
                    categoryAdapter.updateData(response.categories)
                    binding.categoriesRecyclerView.visibility = View.VISIBLE
                } else {
                    binding.categoriesErrorTextView.text = "لا توجد أقسام متاحة حاليًا لهذا المتجر."
                    binding.categoriesErrorTextView.visibility = View.VISIBLE
                }
            } catch (e: Exception) {
                binding.categoriesErrorTextView.text = "فشل تحميل قائمة الأقسام."
                binding.categoriesErrorTextView.visibility = View.VISIBLE
                Log.e("CategoryListActivity", "Error fetching categories: ${e.message}", e)
            } finally {
                binding.categoriesProgressBar.visibility = View.GONE
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
