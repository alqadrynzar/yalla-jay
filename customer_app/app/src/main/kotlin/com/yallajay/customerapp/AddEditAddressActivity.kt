package com.yallajay.customerapp

import android.app.Activity
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.yallajay.customerapp.databinding.ActivityAddEditAddressBinding
import com.yallajay.customerapp.model.CreateAddressRequest
import com.yallajay.customerapp.model.CustomerAddress
import com.yallajay.customerapp.network.ApiClient
import kotlinx.coroutines.launch

class AddEditAddressActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAddEditAddressBinding
    private var existingAddress: CustomerAddress? = null

    companion object {
        const val EXTRA_ADDRESS = "extra_address"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAddEditAddressBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            existingAddress = intent.getParcelableExtra(EXTRA_ADDRESS, CustomerAddress::class.java)
        } else {
            @Suppress("DEPRECATION")
            existingAddress = intent.getParcelableExtra(EXTRA_ADDRESS)
        }

        setupToolbar()
        populateFieldsIfEditing()

        binding.saveAddressButton.setOnClickListener {
            saveAddress()
        }
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.addEditAddressToolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setDisplayShowHomeEnabled(true)
        if (existingAddress != null) {
            supportActionBar?.title = "تعديل العنوان"
        } else {
            supportActionBar?.title = "إضافة عنوان جديد"
        }
    }

    private fun populateFieldsIfEditing() {
        existingAddress?.let {
            binding.addressLabelEditText.setText(it.addressLabel ?: "")
            binding.fullAddressEditText.setText(it.fullAddress)
        }
    }

    private fun saveAddress() {
        val label = binding.addressLabelEditText.text.toString().trim()
        val fullAddress = binding.fullAddressEditText.text.toString().trim()

        if (fullAddress.isEmpty()) {
            Toast.makeText(this, "يرجى ملء حقل العنوان الكامل", Toast.LENGTH_SHORT).show()
            return
        }

        val request = CreateAddressRequest(
            addressLabel = if (label.isNotEmpty()) label else null,
            fullAddress = fullAddress
        )

        showLoading(true)

        lifecycleScope.launch {
            try {
                val response = if (existingAddress == null) {
                    ApiClient.addAddress(request)
                } else {
                    ApiClient.updateAddress(existingAddress!!.id, request)
                }

                if (response != null) {
                    Toast.makeText(this@AddEditAddressActivity, response.message, Toast.LENGTH_LONG).show()
                    setResult(Activity.RESULT_OK) // Signal success to the previous activity
                    finish() // Close this activity
                } else {
                    Toast.makeText(this@AddEditAddressActivity, "حدث خطأ غير متوقع", Toast.LENGTH_LONG).show()
                    showLoading(false)
                }
            } catch (e: Exception) {
                Toast.makeText(this@AddEditAddressActivity, "فشل الاتصال: ${e.message}", Toast.LENGTH_LONG).show()
                showLoading(false)
            }
        }
    }

    private fun showLoading(isLoading: Boolean) {
        binding.saveAddressButton.isEnabled = !isLoading
        // Here you could also show a progress bar if you add one to the layout
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
