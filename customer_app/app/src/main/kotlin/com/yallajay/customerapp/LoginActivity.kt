package com.yallajay.customerapp

import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import com.yallajay.customerapp.databinding.ActivityLoginBinding
import com.yallajay.customerapp.network.ApiClient
import com.yallajay.customerapp.util.AppConstants
import com.yallajay.customerapp.util.AppPreferencesManager
import com.yallajay.customerapp.util.TokenManager
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class LoginAuthResponse(
    val message: String,
    val accessToken: String? = null,
    val refreshToken: String? = null
)

@Serializable
data class ErrorResponse(
    val message: String,
    val errors: List<String>? = null
)

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private val TAG = "LoginLogic"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.loginActionButton.setOnClickListener {
            val email = binding.emailEditText.text.toString().trim()
            val password = binding.passwordEditText.text.toString()

            if (email.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "يرجى إدخال البريد الإلكتروني وكلمة المرور", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val loginRequest = LoginRequest(email = email, password = password)

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val response: HttpResponse = ApiClient.instance.post("http://10.10.197.150:3000/api/users/login") {
                        contentType(ContentType.Application.Json)
                        setBody(loginRequest)
                    }

                    val responseBodyText = response.bodyAsText()
                    Log.d(TAG, "Response Status: ${response.status.value}")
                    Log.d(TAG, "Response Body: $responseBodyText")

                    withContext(Dispatchers.Main) {
                        if (response.status == HttpStatusCode.OK) {
                            try {
                                val successResponse = Json.decodeFromString<LoginAuthResponse>(responseBodyText)

                                if (successResponse.accessToken != null && successResponse.refreshToken != null) {
                                    TokenManager.saveAuthTokens(applicationContext, successResponse.accessToken, successResponse.refreshToken)
                                    Toast.makeText(applicationContext, successResponse.message, Toast.LENGTH_LONG).show()

                                    // التحقق من منطقة الخدمة قبل الانتقال
                                    val selectedRegion = AppPreferencesManager.getSelectedServiceRegion()
                                    if (selectedRegion == null) {
                                        Log.i(TAG, "Login successful, but no service region selected. Navigating to SelectServiceRegionActivity.")
                                        val regionIntent = Intent(this@LoginActivity, SelectServiceRegionActivity::class.java)
                                        regionIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                                        startActivity(regionIntent)
                                        finish()
                                    } else {
                                        Log.i(TAG, "Login successful and service region found. Navigating to HomeActivity.")
                                        val homeIntent = Intent(this@LoginActivity, HomeActivity::class.java)
                                        homeIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                                        startActivity(homeIntent)
                                        finish()
                                    }
                                } else {
                                    Log.e(TAG, "Tokens are null in the response. AccessToken: ${successResponse.accessToken}, RefreshToken: ${successResponse.refreshToken}")
                                    Toast.makeText(applicationContext, "تم تسجيل الدخول، ولكن لم يتم استلام التوكنات بشكل كامل.", Toast.LENGTH_LONG).show()
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Error decoding success response: ${e.message}")
                                Toast.makeText(applicationContext, "نجاح تسجيل الدخول، ولكن خطأ في تحليل استجابة الخادم.", Toast.LENGTH_LONG).show()
                            }
                        } else {
                            try {
                                val errorResponse = Json.decodeFromString<ErrorResponse>(responseBodyText)
                                Toast.makeText(applicationContext, "فشل تسجيل الدخول: ${errorResponse.message}", Toast.LENGTH_LONG).show()
                            } catch (e: Exception) {
                                Log.e(TAG, "Error decoding error response: ${e.message}")
                                Toast.makeText(applicationContext, "فشل تسجيل الدخول، استجابة غير متوقعة.", Toast.LENGTH_LONG).show()
                            }
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(applicationContext, "خطأ في الاتصال بالخادم: ${e.message}", Toast.LENGTH_LONG).show()
                        Log.e(TAG, "Network/Exception: ${e.message}", e)
                    }
                }
            }
        }

        binding.forgotPasswordTextView.setOnClickListener {
            // يمكن إضافة منطق "نسيت كلمة المرور" هنا لاحقًا
        }

        binding.noAccountTextView.setOnClickListener {
            val intent = Intent(this, RegisterActivity::class.java)
            startActivity(intent)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // ApiClient.instance is a singleton and its lifecycle is not tied to this activity
    }
}
