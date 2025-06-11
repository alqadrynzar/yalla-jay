package com.yallajay.customerapp

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.yallajay.customerapp.databinding.ActivityMainBinding
import com.yallajay.customerapp.util.AppPreferencesManager
import com.yallajay.customerapp.util.TokenManager

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val TAG = "MainActivityLogic"

    // --- NEW: Launcher for the notification permission request ---
    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted: Boolean ->
            if (isGranted) {
                // Permission is granted. You can expect notifications to be delivered.
                Log.d("Permissions", "Notification permission granted.")
                Toast.makeText(this, "تم منح إذن الإشعارات.", Toast.LENGTH_SHORT).show()
            } else {
                // Permission is denied. Explain to the user that they will not receive notifications.
                Log.w("Permissions", "Notification permission denied.")
                Toast.makeText(this, "تم رفض إذن الإشعارات. قد لا تصلك التحديثات الهامة.", Toast.LENGTH_LONG).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // --- NEW: Ask for notification permission on startup ---
        askNotificationPermission()

        val accessToken = TokenManager.getAccessToken(applicationContext)
        val refreshToken = TokenManager.getRefreshToken(applicationContext)

        if (accessToken != null && refreshToken != null) {
            // Tokens exist, check for service region
            val selectedRegion = AppPreferencesManager.getSelectedServiceRegion()
            if (selectedRegion == null) {
                Log.i(TAG, "Tokens found, but no service region selected. Navigating to SelectServiceRegionActivity.")
                val regionIntent = Intent(this, SelectServiceRegionActivity::class.java)
                regionIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(regionIntent)
                finish()
                return
            } else {
                Log.i(TAG, "Tokens and service region found. Navigating to HomeActivity.")
                val homeIntent = Intent(this, HomeActivity::class.java)
                homeIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(homeIntent)
                finish()
                return
            }
        } else {
            Log.i(TAG, "Tokens not found, showing MainActivity.")
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.loginButton.setOnClickListener {
            val intent = Intent(this, LoginActivity::class.java)
            startActivity(intent)
        }

        binding.registerButton.setOnClickListener {
            val intent = Intent(this, RegisterActivity::class.java)
            startActivity(intent)
        }
    }

    // --- NEW: Function to check and ask for permission ---
    private fun askNotificationPermission() {
        // This is only required for API level 33 (TIRAMISU) and higher.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                // Permission is already granted.
                Log.d("Permissions", "POST_NOTIFICATIONS permission already granted.")
            } else {
                // Directly ask for the permission.
                Log.d("Permissions", "POST_NOTIFICATIONS permission not granted, requesting it...")
                requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}
