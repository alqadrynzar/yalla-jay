package com.yallajay.customerapp.util

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

object TokenManager {

    private const val TAG = "TokenManager"

    private fun getEncryptedSharedPreferences(context: Context): SharedPreferences? {
        return try {
            val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            EncryptedSharedPreferences.create(
                AppConstants.SHARED_PREFS_FILE_NAME,
                masterKeyAlias,
                context.applicationContext,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error creating EncryptedSharedPreferences: ${e.message}", e)
            null
        }
    }

    fun saveAuthTokens(context: Context, accessToken: String, refreshToken: String) {
        val sharedPreferences = getEncryptedSharedPreferences(context)
        sharedPreferences?.edit()?.apply {
            putString(AppConstants.ACCESS_TOKEN_KEY, accessToken)
            putString(AppConstants.REFRESH_TOKEN_KEY, refreshToken)
            apply()
            Log.i(TAG, "Auth tokens saved successfully.")
        } ?: Log.e(TAG, "Failed to save auth tokens: SharedPreferences not available.")
    }

    fun getAccessToken(context: Context): String? {
        val sharedPreferences = getEncryptedSharedPreferences(context)
        return sharedPreferences?.getString(AppConstants.ACCESS_TOKEN_KEY, null)
    }

    fun getRefreshToken(context: Context): String? {
        val sharedPreferences = getEncryptedSharedPreferences(context)
        return sharedPreferences?.getString(AppConstants.REFRESH_TOKEN_KEY, null)
    }

    fun clearTokens(context: Context) {
        val sharedPreferences = getEncryptedSharedPreferences(context)
        sharedPreferences?.edit()?.apply {
            remove(AppConstants.ACCESS_TOKEN_KEY)
            remove(AppConstants.REFRESH_TOKEN_KEY)
            apply()
            Log.i(TAG, "Auth tokens cleared successfully.")
        } ?: Log.e(TAG, "Failed to clear auth tokens: SharedPreferences not available.")
    }
}
