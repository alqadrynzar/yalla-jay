package com.yallajay.customerapp

import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.yallajay.customerapp.databinding.ActivitySelectServiceRegionBinding
import com.yallajay.customerapp.model.ServiceRegion
import com.yallajay.customerapp.network.ApiClient
import com.yallajay.customerapp.ui.adapter.ServiceRegionAdapter
import com.yallajay.customerapp.util.AppPreferencesManager
import kotlinx.coroutines.launch

class SelectServiceRegionActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySelectServiceRegionBinding
    private lateinit var regionAdapter: ServiceRegionAdapter
    private var currentlySelectedRegion: ServiceRegion? = null
    private val TAG = "SelectServiceRegion"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySelectServiceRegionBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbarSelectRegion)
        supportActionBar?.title = getString(R.string.title_activity_select_service_region)

        fetchServiceRegions()

        binding.buttonConfirmServiceRegion.setOnClickListener {
            handleConfirmSelection()
        }
    }

    private fun fetchServiceRegions() {
        binding.progressBarServiceRegions.visibility = View.VISIBLE
        binding.recyclerViewServiceRegions.visibility = View.GONE
        binding.textViewServiceRegionError.visibility = View.GONE
        currentlySelectedRegion = null

        lifecycleScope.launch {
            try {
                val response = ApiClient.getServiceRegions()
                binding.progressBarServiceRegions.visibility = View.GONE
                if (response != null && response.serviceRegions.isNotEmpty()) {
                    binding.recyclerViewServiceRegions.visibility = View.VISIBLE
                    regionAdapter = ServiceRegionAdapter(response.serviceRegions) { region ->
                        currentlySelectedRegion = region
                    }
                    binding.recyclerViewServiceRegions.adapter = regionAdapter
                } else if (response != null && response.serviceRegions.isEmpty()) {
                    binding.textViewServiceRegionError.text = getString(R.string.message_no_service_regions_available)
                    binding.textViewServiceRegionError.visibility = View.VISIBLE
                } else {
                    binding.textViewServiceRegionError.text = getString(R.string.message_failed_to_load_service_regions)
                    binding.textViewServiceRegionError.visibility = View.VISIBLE
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error fetching service regions: ${e.message}", e)
                binding.progressBarServiceRegions.visibility = View.GONE
                binding.textViewServiceRegionError.text = getString(R.string.message_failed_to_load_service_regions)
                binding.textViewServiceRegionError.visibility = View.VISIBLE
            }
        }
    }

    private fun handleConfirmSelection() {
        if (currentlySelectedRegion != null) {
            AppPreferencesManager.saveSelectedServiceRegion(currentlySelectedRegion!!)
            Toast.makeText(this, "تم اختيار: ${currentlySelectedRegion!!.name}", Toast.LENGTH_SHORT).show()

            val intent = Intent(this, HomeActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            finish()
        } else {
            Toast.makeText(this, getString(R.string.message_please_select_a_region), Toast.LENGTH_LONG).show()
        }
    }
}
