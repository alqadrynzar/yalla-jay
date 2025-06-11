package com.yallajay.customerapp

import android.app.Activity
import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.view.MenuItem
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import com.yallajay.customerapp.databinding.ActivityAddressListBinding
import com.yallajay.customerapp.network.ApiClient
import com.yallajay.customerapp.ui.adapter.AddressAdapter
import kotlinx.coroutines.launch

class AddressListActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAddressListBinding
    private lateinit var addressAdapter: AddressAdapter
    private val TAG = "AddressListActivity"

    companion object {
        const val EXTRA_CURRENT_ADDRESS_ID = "extra_current_address_id"
        const val RESULT_SELECTED_ADDRESS_ID = "result_selected_address_id"
    }

    private val addEditAddressLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            // Address was added or edited successfully, so we refresh the list
            fetchAddresses()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAddressListBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.addressListToolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setDisplayShowHomeEnabled(true)
        supportActionBar?.title = "اختر عنوان التوصيل"

        setupRecyclerView()
        fetchAddresses()

        binding.addAddressFab.setOnClickListener {
            val intent = Intent(this, AddEditAddressActivity::class.java)
            addEditAddressLauncher.launch(intent)
        }
    }

    private fun setupRecyclerView() {
        val initiallySelectedId = intent.getIntExtra(EXTRA_CURRENT_ADDRESS_ID, -1)
        addressAdapter = AddressAdapter(
            addresses = emptyList(),
            selectedAddressId = initiallySelectedId,
            onAddressSelected = { selectedAddress ->
                // When an address is selected, send it back to the previous screen
                val resultIntent = Intent()
                resultIntent.putExtra(RESULT_SELECTED_ADDRESS_ID, selectedAddress.id)
                setResult(Activity.RESULT_OK, resultIntent)
                finish()
            },
            onEditClicked = { addressToEdit ->
                // Open the Add/Edit screen for the selected address
                val intent = Intent(this, AddEditAddressActivity::class.java)
                intent.putExtra(AddEditAddressActivity.EXTRA_ADDRESS, addressToEdit)
                addEditAddressLauncher.launch(intent)
            }
        )
        binding.addressesRecyclerView.adapter = addressAdapter
    }

    private fun fetchAddresses() {
        lifecycleScope.launch {
            showLoading(true)
            try {
                val response = ApiClient.getUserAddresses()
                if (response != null && response.addresses.isNotEmpty()) {
                    val currentSelectedId = addressAdapter.getSelectedAddressId()
                    addressAdapter.updateData(response.addresses, currentSelectedId)
                    showContent()
                } else {
                    showEmptyView()
                }
            } catch (e: Exception) {
                showErrorView("فشل تحميل قائمة العناوين.")
                Log.e(TAG, "Error fetching addresses", e)
            }
        }
    }

    private fun showLoading(isLoading: Boolean) {
        binding.addressesProgressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
        binding.addressesRecyclerView.visibility = if (isLoading) View.INVISIBLE else View.VISIBLE
    }

    private fun showContent() {
        showLoading(false)
        binding.addressesErrorTextView.visibility = View.GONE
    }

    private fun showEmptyView() {
        showLoading(false)
        binding.addressesRecyclerView.visibility = View.GONE
        binding.addressesErrorTextView.text = "لا توجد عناوين محفوظة. قم بإضافة عنوان جديد."
        binding.addressesErrorTextView.visibility = View.VISIBLE
    }

    private fun showErrorView(message: String) {
        showLoading(false)
        binding.addressesRecyclerView.visibility = View.GONE
        binding.addressesErrorTextView.text = message
        binding.addressesErrorTextView.visibility = View.VISIBLE
    }

    // A helper function to access a private property, for simplicity.
    private fun AddressAdapter.getSelectedAddressId(): Int {
        val field = javaClass.getDeclaredField("selectedAddressId")
        field.isAccessible = true
        return field.get(this) as Int
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            setResult(Activity.RESULT_CANCELED)
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
