package com.yallajay.customerapp.util

import android.content.Context
import android.content.SharedPreferences
import com.yallajay.customerapp.model.ServiceRegion
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object AppPreferencesManager {

    private const val PREFS_NAME = "yallajay_app_prefs"
    private const val KEY_SELECTED_SERVICE_REGION_JSON = "selected_service_region_json"
    private var sharedPreferences: SharedPreferences? = null

    fun init(context: Context) {
        sharedPreferences = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private fun ensureInitialized() {
        requireNotNull(sharedPreferences) { "AppPreferencesManager must be initialized. Call AppPreferencesManager.init(context) in your Application class." }
    }

    fun saveSelectedServiceRegion(region: ServiceRegion) {
        ensureInitialized()
        val regionJson = Json.encodeToString(region)
        sharedPreferences?.edit()?.putString(KEY_SELECTED_SERVICE_REGION_JSON, regionJson)?.apply()
    }

    fun getSelectedServiceRegion(): ServiceRegion? {
        ensureInitialized()
        val regionJson = sharedPreferences?.getString(KEY_SELECTED_SERVICE_REGION_JSON, null)
        return if (regionJson != null) {
            try {
                Json.decodeFromString<ServiceRegion>(regionJson)
            } catch (e: Exception) {
                clearSelectedServiceRegion()
                null
            }
        } else {
            null
        }
    }

    fun clearSelectedServiceRegion() {
        ensureInitialized()
        sharedPreferences?.edit()?.remove(KEY_SELECTED_SERVICE_REGION_JSON)?.apply()
    }
}
