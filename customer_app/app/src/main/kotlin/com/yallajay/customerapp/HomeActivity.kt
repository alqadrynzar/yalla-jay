package com.yallajay.customerapp

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.ActionBarDrawerToggle
import androidx.appcompat.app.AlertDialog
import androidx.core.view.GravityCompat
import androidx.lifecycle.lifecycleScope
import com.yallajay.customerapp.databinding.ActivityHomeBinding
import com.yallajay.customerapp.model.StoreType
import com.yallajay.customerapp.network.ApiClient
import com.yallajay.customerapp.ui.adapter.StoreTypeAdapter
import com.yallajay.customerapp.util.AppPreferencesManager
import com.yallajay.customerapp.util.GridSpacingItemDecoration
import com.yallajay.customerapp.util.TokenManager
import com.google.android.material.navigation.NavigationView
import com.google.firebase.messaging.FirebaseMessaging
import com.yallajay.customerapp.network.FcmTokenRequest
import kotlinx.coroutines.launch

class HomeActivity : AppCompatActivity(), NavigationView.OnNavigationItemSelectedListener {

    private lateinit var binding: ActivityHomeBinding
    private lateinit var toggle: ActionBarDrawerToggle
    private lateinit var storeTypeAdapter: StoreTypeAdapter
    private val storeTypesList = mutableListOf<StoreType>()
    private val TAG = "HomeActivity"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.homeToolbar)

        toggle = ActionBarDrawerToggle(
            this,
            binding.drawerLayout,
            binding.homeToolbar,
            R.string.navigation_drawer_open,
            R.string.navigation_drawer_close
        )
        binding.drawerLayout.addDrawerListener(toggle)
        toggle.syncState()

        binding.navView.setNavigationItemSelectedListener(this)

        sendFcmTokenToServer()
        setupStoreTypesRecyclerView()
        fetchAndDisplayUserProfile()
        fetchStoreTypes()
    }

    private fun sendFcmTokenToServer() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.w("FCM_TOKEN", "Fetching FCM registration token failed", task.exception)
                return@addOnCompleteListener
            }

            val token = task.result
            Log.d("FCM_TOKEN", "FCM Token retrieved in HomeActivity: $token")

            lifecycleScope.launch {
                try {
                    Log.d("FCM_TOKEN", "Attempting to send FCM token from HomeActivity...")
                    val response = ApiClient.sendFcmToken(FcmTokenRequest(token = token))
                    if (response != null) {
                        Log.i("FCM_TOKEN", "FCM Token sent to server successfully: ${response.message}")
                    } else {
                        Log.e("FCM_TOKEN", "Failed to send FCM token to server (null response).")
                    }
                } catch (e: Exception) {
                    Log.e("FCM_TOKEN", "Exception while sending FCM token.", e)
                }
            }
        }
    }

    private fun setupStoreTypesRecyclerView() {
        storeTypeAdapter = StoreTypeAdapter(this, storeTypesList) { storeType ->
            val intent = Intent(this, StoreListActivity::class.java).apply {
                putExtra(StoreListActivity.EXTRA_STORE_TYPE, storeType.id)
                putExtra(StoreListActivity.EXTRA_STORE_TYPE_NAME, storeType.name)
            }
            startActivity(intent)
        }
        binding.recyclerViewStoreTypes.adapter = storeTypeAdapter

        val spanCount = 2
        val spacingInPixels = resources.getDimensionPixelSize(R.dimen.grid_spacing)
        val includeEdge = true
        binding.recyclerViewStoreTypes.addItemDecoration(
            GridSpacingItemDecoration(spanCount, spacingInPixels, includeEdge)
        )
    }

    private fun fetchAndDisplayUserProfile() {
        lifecycleScope.launch {
            try {
                val userProfileResponse = ApiClient.getUserProfile()
                if (userProfileResponse != null && userProfileResponse.user != null) {
                    val user = userProfileResponse.user
                    val headerView = binding.navView.getHeaderView(0)
                    val navUserNameTextView = headerView.findViewById<TextView>(R.id.navHeaderUserNameTextView)
                    val navUserEmailTextView = headerView.findViewById<TextView>(R.id.navHeaderUserEmailTextView)

                    navUserNameTextView.text = user.fullName
                    if (user.email.isNotEmpty()) {
                        navUserEmailTextView.text = user.email
                        navUserEmailTextView.visibility = View.VISIBLE
                    } else {
                        navUserEmailTextView.visibility = View.GONE
                    }
                } else {
                    val headerView = binding.navView.getHeaderView(0)
                    val navUserNameTextView = headerView.findViewById<TextView>(R.id.navHeaderUserNameTextView)
                    navUserNameTextView.text = getString(R.string.navigation_drawer_user_name_placeholder)
                    headerView.findViewById<TextView>(R.id.navHeaderUserEmailTextView).visibility = View.GONE
                }
            } catch (e: Exception) {
                val headerView = binding.navView.getHeaderView(0)
                val navUserNameTextView = headerView.findViewById<TextView>(R.id.navHeaderUserNameTextView)
                navUserNameTextView.text = getString(R.string.navigation_drawer_user_name_placeholder)
                headerView.findViewById<TextView>(R.id.navHeaderUserEmailTextView).visibility = View.GONE
            }
        }
    }

    private fun fetchStoreTypes() {
        binding.progressBarStoreTypes.visibility = View.VISIBLE
        binding.recyclerViewStoreTypes.visibility = View.GONE
        binding.textViewStoreTypesError.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val response = ApiClient.getStoreTypes()
                binding.progressBarStoreTypes.visibility = View.GONE
                if (response != null && response.storeTypes.isNotEmpty()) {
                    binding.recyclerViewStoreTypes.visibility = View.VISIBLE
                    storeTypeAdapter.updateData(response.storeTypes)
                } else if (response != null && response.storeTypes.isEmpty()) {
                    binding.textViewStoreTypesError.text = getString(R.string.message_no_service_regions_available)
                    binding.textViewStoreTypesError.visibility = View.VISIBLE
                } else {
                    binding.textViewStoreTypesError.text = getString(R.string.message_failed_to_load_service_regions)
                    binding.textViewStoreTypesError.visibility = View.VISIBLE
                }
            } catch (e: Exception) {
                binding.progressBarStoreTypes.visibility = View.GONE
                binding.textViewStoreTypesError.text = getString(R.string.message_failed_to_load_service_regions)
                binding.textViewStoreTypesError.visibility = View.VISIBLE
            }
        }
    }


    override fun onNavigationItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            R.id.nav_order_history -> {
                val intent = Intent(this, OrderHistoryActivity::class.java)
                startActivity(intent)
            }
            R.id.nav_notifications -> {
                val intent = Intent(this, NotificationActivity::class.java)
                startActivity(intent)
            }
            R.id.nav_contact_admin -> {
                showContactOptions()
            }
            R.id.nav_edit_profile -> {
                val intent = Intent(this, EditProfileActivity::class.java)
                startActivity(intent)
            }
            R.id.nav_logout -> {
                TokenManager.clearTokens(applicationContext)
                AppPreferencesManager.clearSelectedServiceRegion()
                val intent = Intent(this, LoginActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()
            }
        }
        binding.drawerLayout.closeDrawer(GravityCompat.START)
        return true
    }

    private fun showContactOptions() {
        val selectedRegion = AppPreferencesManager.getSelectedServiceRegion()
        val phoneNumber = selectedRegion?.supportPhoneNumber

        if (phoneNumber.isNullOrBlank()) {
            Toast.makeText(this, "رقم الدعم غير متوفر لهذه المنطقة", Toast.LENGTH_SHORT).show()
            return
        }

        val options = arrayOf("مراسلة عبر واتساب", "الاتصال بالرقم", "مشاركة الرقم")

        AlertDialog.Builder(this)
            .setTitle("تواصل مع الإدارة")
            .setItems(options) { dialog, which ->
                when (which) {
                    0 -> openWhatsApp(phoneNumber)
                    1 -> openDialer(phoneNumber)
                    2 -> sharePhoneNumber(phoneNumber)
                }
            }
            .show()
    }

    private fun openWhatsApp(phoneNumber: String) {
        val cleanedNumber = phoneNumber.filter { it.isDigit() }
        val url = "https://wa.me/$cleanedNumber"
        try {
            val intent = Intent(Intent.ACTION_VIEW)
            intent.data = Uri.parse(url)
            intent.setPackage("com.whatsapp")
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, "تطبيق واتساب غير مثبت", Toast.LENGTH_SHORT).show()
        }
    }

    private fun openDialer(phoneNumber: String) {
        try {
            val intent = Intent(Intent.ACTION_DIAL)
            intent.data = Uri.parse("tel:$phoneNumber")
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, "لا يوجد تطبيق اتصال مناسب", Toast.LENGTH_SHORT).show()
        }
    }

    private fun sharePhoneNumber(phoneNumber: String) {
        val sendIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, phoneNumber)
            type = "text/plain"
        }
        val shareIntent = Intent.createChooser(sendIntent, "مشاركة الرقم عبر:")
        startActivity(shareIntent)
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_toolbar_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (toggle.onOptionsItemSelected(item)) {
            return true
        }
        when (item.itemId) {
            R.id.action_cart -> {
                val intent = Intent(this, CartActivity::class.java)
                startActivity(intent)
                return true
            }
        }
        return super.onOptionsItemSelected(item)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (binding.drawerLayout.isDrawerOpen(GravityCompat.START)) {
            binding.drawerLayout.closeDrawer(GravityCompat.START)
        } else {
            super.onBackPressed()
        }
    }
}
