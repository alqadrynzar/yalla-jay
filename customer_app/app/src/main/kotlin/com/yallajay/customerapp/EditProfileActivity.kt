package com.yallajay.customerapp

import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.yallajay.customerapp.databinding.ActivityEditProfileBinding
import com.yallajay.customerapp.model.UpdateProfileRequest
import com.yallajay.customerapp.network.ApiClient
import kotlinx.coroutines.launch

class EditProfileActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEditProfileBinding
    private val TAG = "EditProfileActivity"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEditProfileBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.editProfileToolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setDisplayShowHomeEnabled(true)

        fetchAndDisplayProfile()

        binding.saveProfileButton.setOnClickListener {
            saveProfileChanges()
        }
    }

    private fun fetchAndDisplayProfile() {
        lifecycleScope.launch {
            binding.profileProgressBar.visibility = View.VISIBLE
            binding.fullNameInputLayout.visibility = View.INVISIBLE
            binding.phoneNumberInputLayout.visibility = View.INVISIBLE
            binding.saveProfileButton.isEnabled = false

            try {
                val response = ApiClient.getUserProfile()
                if (response != null) {
                    binding.fullNameEditText.setText(response.user.fullName)
                    binding.phoneNumberEditText.setText(response.user.phoneNumber)

                    binding.fullNameInputLayout.visibility = View.VISIBLE
                    binding.phoneNumberInputLayout.visibility = View.VISIBLE
                    binding.saveProfileButton.isEnabled = true
                } else {
                    Toast.makeText(this@EditProfileActivity, "فشل تحميل بيانات الملف الشخصي", Toast.LENGTH_LONG).show()
                    Log.w(TAG, "getUserProfile returned null response")
                }
            } catch (e: Exception) {
                Toast.makeText(this@EditProfileActivity, "خطأ في تحميل البيانات: ${e.message}", Toast.LENGTH_LONG).show()
                Log.e(TAG, "Exception in fetchAndDisplayProfile", e)
            } finally {
                binding.profileProgressBar.visibility = View.GONE
            }
        }
    }

    private fun saveProfileChanges() {
        val newFullName = binding.fullNameEditText.text.toString().trim()
        val newPhoneNumber = binding.phoneNumberEditText.text.toString().trim()

        var isValid = true
        if (newFullName.isEmpty()) {
            binding.fullNameInputLayout.error = "الاسم لا يمكن أن يكون فارغاً"
            isValid = false
        } else {
            binding.fullNameInputLayout.error = null
        }

        if (newPhoneNumber.isEmpty()) {
            binding.phoneNumberInputLayout.error = "رقم الهاتف لا يمكن أن يكون فارغاً"
            isValid = false
        } else {
            binding.phoneNumberInputLayout.error = null
        }

        if (!isValid) {
            return
        }

        lifecycleScope.launch {
            binding.profileProgressBar.visibility = View.VISIBLE
            binding.saveProfileButton.isEnabled = false
            binding.fullNameEditText.isEnabled = false
            binding.phoneNumberEditText.isEnabled = false

            try {
                val request = UpdateProfileRequest(fullName = newFullName, phoneNumber = newPhoneNumber)
                val response = ApiClient.updateUserProfile(request)

                if (response != null) {
                    Toast.makeText(this@EditProfileActivity, response.message, Toast.LENGTH_LONG).show()
                    finish() // Close the activity on success
                } else {
                    Toast.makeText(this@EditProfileActivity, "فشل تحديث الملف الشخصي", Toast.LENGTH_LONG).show()
                    binding.saveProfileButton.isEnabled = true
                    binding.fullNameEditText.isEnabled = true
                    binding.phoneNumberEditText.isEnabled = true
                }
            } catch (e: Exception) {
                Toast.makeText(this@EditProfileActivity, "خطأ: ${e.message}", Toast.LENGTH_LONG).show()
                Log.e(TAG, "Exception in saveProfileChanges", e)
                binding.saveProfileButton.isEnabled = true
                binding.fullNameEditText.isEnabled = true
                binding.phoneNumberEditText.isEnabled = true
            } finally {
                if (!isFinishing) {
                    binding.profileProgressBar.visibility = View.GONE
                }
            }
        }
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            onBackPressedDispatcher.onBackPressed()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
