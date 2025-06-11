package com.yallajay.customerapp

import android.app.Application
import com.yallajay.customerapp.network.ApiClient
import com.yallajay.customerapp.util.AppPreferencesManager // تمت الإضافة

class YallaJayApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ApiClient.init(this)
        AppPreferencesManager.init(this) // تمت الإضافة
    }
}
