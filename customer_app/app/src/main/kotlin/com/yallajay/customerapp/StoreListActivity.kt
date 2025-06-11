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
import com.yallajay.customerapp.databinding.ActivityStoreListBinding
import com.yallajay.customerapp.network.ApiClient
import com.yallajay.customerapp.ui.adapter.StoreAdapter
import com.yallajay.customerapp.util.AppPreferencesManager
import kotlinx.coroutines.launch

class StoreListActivity : AppCompatActivity() {

    private lateinit var binding: ActivityStoreListBinding
    private lateinit var storeAdapter: StoreAdapter
    private var storeType: String? = null
    private var storeTypeName: String? = null

    companion object {
        const val EXTRA_STORE_TYPE = "extra_store_type"
        const val EXTRA_STORE_TYPE_NAME = "extra_store_type_name"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityStoreListBinding.inflate(layoutInflater)
        setContentView(binding.root)

        storeType = intent.getStringExtra(EXTRA_STORE_TYPE)
        storeTypeName = intent.getStringExtra(EXTRA_STORE_TYPE_NAME)

        setSupportActionBar(binding.storeListToolbar)
        supportActionBar?.title = storeTypeName ?: getString(R.string.title_activity_store_list)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setDisplayShowHomeEnabled(true)

        setupRecyclerView()

        if (!storeType.isNullOrEmpty()) {
            fetchStores()
        } else {
            Log.e("StoreListActivity", "No Store Type was provided.")
            binding.storesErrorTextView.text = "خطأ: لم يتم تحديد نوع المتجر."
            binding.storesErrorTextView.visibility = View.VISIBLE
        }
    }

    private fun setupRecyclerView() {
        storeAdapter = StoreAdapter(emptyList()) { store ->
            val intent = Intent(this, CategoryListActivity::class.java).apply {
                putExtra(CategoryListActivity.EXTRA_STORE_ID, store.id)
                putExtra(CategoryListActivity.EXTRA_STORE_NAME, store.name)
            }
            startActivity(intent)
        }
        binding.storesRecyclerView.adapter = storeAdapter
    }

    private fun fetchStores() {
        val selectedRegion = AppPreferencesManager.getSelectedServiceRegion()
        if (selectedRegion == null) {
            binding.storesErrorTextView.text = "خطأ: يرجى اختيار منطقة الخدمة أولاً."
            binding.storesErrorTextView.visibility = View.VISIBLE
            return
        }
        val regionId = selectedRegion.id

        lifecycleScope.launch {
            binding.storesProgressBar.visibility = View.VISIBLE
            binding.storesErrorTextView.visibility = View.GONE
            binding.storesRecyclerView.visibility = View.INVISIBLE

            try {
                storeType?.let { type ->
                    val response = ApiClient.getStores(regionId = regionId, storeType = type)
                    if (response != null && response.stores.isNotEmpty()) {
                        storeAdapter.updateData(response.stores)
                        binding.storesRecyclerView.visibility = View.VISIBLE
                    } else {
                        binding.storesErrorTextView.text = "لا توجد متاجر متاحة حاليًا لهذا النوع."
                        binding.storesErrorTextView.visibility = View.VISIBLE
                    }
                }
            } catch (e: Exception) {
                binding.storesErrorTextView.text = "فشل تحميل قائمة المتاجر."
                binding.storesErrorTextView.visibility = View.VISIBLE
                Log.e("StoreListActivity", "Error fetching stores: ${e.message}", e)
            } finally {
                binding.storesProgressBar.visibility = View.GONE
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
