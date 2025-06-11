package com.yallajay.customerapp

import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import com.yallajay.customerapp.databinding.ActivityRegisterBinding
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.logging.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class RegisterRequest(
    val fullName: String,
    val phoneNumber: String,
    val email: String,
    val password: String
)

@Serializable
data class RegisterErrorResponse(
    val message: String,
    val errors: List<String>? = null
)

@Serializable
data class RegisterSuccessResponse(
    val message: String,
    val user: RegisteredUser? = null
)

@Serializable
data class RegisteredUser(
    val id: Int,
    val email: String,
    val user_role: String,
    val created_at: String
)

class RegisterActivity : AppCompatActivity() {

    private lateinit var binding: ActivityRegisterBinding
    private val KTOR_LOGGER_TAG = "KtorLogger"

    private val client by lazy {
        HttpClient(CIO) {
            install(ContentNegotiation) {
                json(Json {
                    isLenient = true
                    ignoreUnknownKeys = true
                })
            }
            install(Logging) {
                level = LogLevel.ALL
                logger = object : Logger {
                    override fun log(message: String) {
                        Log.d(KTOR_LOGGER_TAG, message)
                    }
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRegisterBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.registerActionButton.setOnClickListener {
            val fullName = binding.fullNameEditText.text.toString().trim()
            val phoneNumber = binding.phoneNumberEditText.text.toString().trim()
            val email = binding.emailEditTextRegister.text.toString().trim()
            val password = binding.passwordEditTextRegister.text.toString()
            val confirmPassword = binding.confirmPasswordEditText.text.toString()

            if (fullName.isEmpty() || phoneNumber.isEmpty() || email.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "يرجى ملء جميع الحقول", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (password != confirmPassword) {
                Toast.makeText(this, "كلمتا المرور غير متطابقتين", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val registerRequest = RegisterRequest(
                fullName = fullName,
                phoneNumber = phoneNumber,
                email = email,
                password = password
            )

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val response: HttpResponse = client.post("http://10.10.197.150:3000/api/users/register") {
                        contentType(ContentType.Application.Json)
                        setBody(registerRequest)
                    }

                    val responseBodyText = response.bodyAsText()
                    Log.d("RegisterAPI", "Response Status: ${response.status.value}")
                    Log.d("RegisterAPI", "Response Body: $responseBodyText")


                    withContext(Dispatchers.Main) {
                        if (response.status == HttpStatusCode.Created) {
                            try {
                                val successResponse = Json.decodeFromString<RegisterSuccessResponse>(responseBodyText)
                                Toast.makeText(applicationContext, successResponse.message, Toast.LENGTH_LONG).show()
                                val intent = Intent(this@RegisterActivity, LoginActivity::class.java)
                                startActivity(intent)
                                finish()
                            } catch (e: Exception) {
                                Log.e("RegisterAPI", "Error decoding success response: ${e.message}")
                                Toast.makeText(applicationContext, "تم إنشاء الحساب، ولكن حدث خطأ في تحليل استجابة الخادم.", Toast.LENGTH_LONG).show()
                            }
                        } else {
                            try {
                                val errorResponse = Json.decodeFromString<RegisterErrorResponse>(responseBodyText)
                                Toast.makeText(applicationContext, "فشل إنشاء الحساب: ${errorResponse.message}", Toast.LENGTH_LONG).show()
                            } catch (e: Exception) {
                                Log.e("RegisterAPI", "Error decoding error response: ${e.message}")
                                Toast.makeText(applicationContext, "فشل إنشاء الحساب، استجابة غير متوقعة من الخادم: $responseBodyText", Toast.LENGTH_LONG).show()
                            }
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(applicationContext, "خطأ في الاتصال بالخادم: ${e.message}", Toast.LENGTH_LONG).show()
                        Log.e("RegisterAPI", "Network/Exception: ${e.message}", e)
                    }
                }
            }
        }

        binding.alreadyHaveAccountTextView.setOnClickListener {
            val intent = Intent(this, LoginActivity::class.java)
            startActivity(intent)
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // تمت إزالة التحقق if (::client.isInitialized)
        client.close() 
    }
}
