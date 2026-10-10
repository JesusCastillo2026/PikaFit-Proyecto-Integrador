package com.pikafit.mobile

import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

data class User(
    val id: String = "",
    val name: String = "",
    val email: String = "",
    val dni: String? = null,
    val role: String = "",
    val membershipExpiresAt: String? = null,
    val membershipActive: Boolean? = null,
)

data class LoginResult(val token: String, val user: User)
data class PassResult(val code: String, val expiresAt: String, val qrDataUrl: String)

class Api {
    private val gson = Gson()

    suspend fun login(identifier: String, password: String): LoginResult = request(
        path = "/api/auth/login",
        method = "POST",
        body = if (identifier.contains('@')) mapOf("email" to identifier, "password" to password)
        else mapOf("dni" to identifier, "password" to password),
    ).let { gson.fromJson(it, LoginResult::class.java) }

    suspend fun me(token: String): User = request("/api/me", token = token)
        .let { gson.fromJson(it, MeEnvelope::class.java).user }

    suspend fun createPass(token: String): PassResult = request(
        "/api/medical-passes", method = "POST", token = token,
    ).let { gson.fromJson(it, PassEnvelope::class.java).pass }

    private suspend fun request(
        path: String,
        method: String = "GET",
        token: String? = null,
        body: Any? = null,
    ): String = withContext(Dispatchers.IO) {
        val connection = (URL(BuildConfig.API_BASE_URL + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 10_000
            setRequestProperty("Accept", "application/json")
            token?.let { setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                outputStream.bufferedWriter().use { it.write(gson.toJson(body)) }
            }
        }
        try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val response = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                val message = runCatching { gson.fromJson(response, ErrorEnvelope::class.java).error }.getOrNull()
                throw ApiException(message ?: "No se pudo conectar con PikaFit (HTTP $status)")
            }
            response
        } finally {
            connection.disconnect()
        }
    }

    private data class MeEnvelope(val user: User)
    private data class PassEnvelope(val pass: PassResult)
    private data class ErrorEnvelope(val error: String?)
}

class ApiException(message: String) : Exception(message)
