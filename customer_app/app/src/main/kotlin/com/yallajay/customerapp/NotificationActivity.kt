package com.yallajay.customerapp

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.yallajay.customerapp.databinding.ActivityNotificationBinding
import com.yallajay.customerapp.db.AppDatabase
import com.yallajay.customerapp.ui.adapter.NotificationAdapter

class NotificationActivity : AppCompatActivity() {

    private lateinit var binding: ActivityNotificationBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityNotificationBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupToolbar()
        setupRecyclerView()
        observeNotifications()
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = "مركز الإشعارات"
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
    }

    private fun setupRecyclerView() {
        // We set up the layout manager here, but the adapter will be set when data is loaded.
        binding.notificationsRecyclerView.layoutManager = LinearLayoutManager(this@NotificationActivity)
    }

    private fun observeNotifications() {
        // Get a reference to the DAO from our database
        val dao = AppDatabase.getDatabase(applicationContext).notificationDao()

        // Observe the LiveData returned by the DAO
        dao.getAllNotifications().observe(this) { notifications ->
            // This block will be executed every time the data in the "notifications" table changes.
            // Create a new adapter with the updated list and set it to the RecyclerView.
            val notificationAdapter = NotificationAdapter(notifications)
            binding.notificationsRecyclerView.adapter = notificationAdapter
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }
}
