package com.pikafit.mobile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Canvas
import android.os.Bundle
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences("pikafit_session", MODE_PRIVATE)
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    PikaFitApp(
                        initialToken = prefs.getString("token", null),
                        onSaveToken = { token -> prefs.edit().putString("token", token).apply() },
                        onClearToken = { prefs.edit().remove("token").apply() },
                    )
                }
            }
        }
    }
}

@Composable
private fun PikaFitApp(
    initialToken: String?,
    onSaveToken: (String) -> Unit,
    onClearToken: () -> Unit,
) {
    val api = remember { Api() }
    val scope = rememberCoroutineScope()
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var token by remember { mutableStateOf(initialToken) }
    var user by remember { mutableStateOf<User?>(null) }
    var pass by remember { mutableStateOf<PassResult?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    fun launchRequest(action: suspend () -> Unit) {
        scope.launch {
            busy = true
            error = null
            try { action() } catch (e: Exception) { error = e.message ?: "Ocurrió un error" }
            finally { busy = false }
        }
    }

    androidx.compose.runtime.LaunchedEffect(token) {
        if (token != null && user == null) {
            launchRequest {
                try { user = api.me(token!!) } catch (e: Exception) {
                    token = null
                    onClearToken()
                    error = e.message
                }
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .35f)).padding(22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("PikaFit", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Text("Acceso y pases médicos", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(20.dp))

        when {
            user == null -> LoginCard(
                identifier = identifier,
                onIdentifier = { identifier = it },
                password = password,
                onPassword = { password = it },
                busy = busy,
                error = error,
                onLogin = {
                    launchRequest {
                        val result = api.login(identifier.trim(), password)
                        token = result.token
                        user = result.user
                        onSaveToken(result.token)
                    }
                },
            )
            else -> MemberCard(
                user = user!!,
                pass = pass,
                busy = busy,
                error = error,
                onCreatePass = { launchRequest { pass = api.createPass(token!!) } },
                onLogout = {
                    user = null; token = null; pass = null; password = ""; onClearToken()
                },
            )
        }
    }
}

@Composable
private fun LoginCard(
    identifier: String,
    onIdentifier: (String) -> Unit,
    password: String,
    onPassword: (String) -> Unit,
    busy: Boolean,
    error: String?,
    onLogin: () -> Unit,
) {
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Iniciar sesión", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text("Ingresa con tu correo o tu DNI y contraseña.", style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(
                value = identifier, onValueChange = onIdentifier, label = { Text("Correo o DNI") },
                modifier = Modifier.fillMaxWidth(), singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = if (identifier.contains('@')) KeyboardType.Email else KeyboardType.Text),
            )
            OutlinedTextField(
                value = password, onValueChange = onPassword, label = { Text("Contraseña") },
                modifier = Modifier.fillMaxWidth(), singleLine = true,
                visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            )
            if (error != null) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            Button(onClick = onLogin, enabled = !busy && identifier.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Entrar")
            }
        }
    }
}

@Composable
private fun MemberCard(
    user: User,
    pass: PassResult?,
    busy: Boolean,
    error: String?,
    onCreatePass: () -> Unit,
    onLogout: () -> Unit,
) {
    val isActiveMember = user.role == "SOCIO" && user.membershipActive == true
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Hola, ${user.name}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text(user.email, style = MaterialTheme.typography.bodySmall)
            if (isActiveMember) {
                Text("Membresía activa", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                Button(onClick = onCreatePass, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                    if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Generar pase médico")
                }
                pass?.let { passResult ->
                    Spacer(Modifier.height(4.dp))
                    QrImage(passResult.qrDataUrl)
                    Text("Código alternativo", style = MaterialTheme.typography.labelLarge)
                    Text(passResult.code, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text("Vence: ${passResult.expiresAt}", style = MaterialTheme.typography.bodySmall)
                }
            } else if (user.role == "SOCIO") {
                Text("Tu membresía está vencida. Debes renovarla para generar un pase.", color = MaterialTheme.colorScheme.error)
            } else {
                Text("Esta función de pases está disponible para cuentas de socio.")
            }
            if (error != null) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = onLogout) { Text("Cerrar sesión") }
        }
    }
}

@Composable
private fun QrImage(dataUrl: String) {
    val bitmap: Bitmap? = remember(dataUrl) {
        runCatching {
            val encoded = dataUrl.substringAfter("base64,")
            val bytes = Base64.decode(encoded, Base64.DEFAULT)
            val qrPng = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            if (qrPng != null) qrPng else buildQrFromToken(dataUrl)
        }.getOrNull()
    }
    bitmap?.let { Image(it.asImageBitmap(), contentDescription = "Código QR del pase médico", modifier = Modifier.size(210.dp)) }
}

private fun buildQrFromToken(data: String): Bitmap {
    val token = data.substringAfter("base64,", data)
    val gridSize = 29
    val matrix = Array(gridSize) { BooleanArray(gridSize) }
    val reserved = Array(gridSize) { BooleanArray(gridSize) }
    fun finder(left: Int, top: Int) {
        for (y in -1..7) for (x in -1..7) {
            val px = left + x; val py = top + y
            if (px !in 0 until gridSize || py !in 0 until gridSize) continue
            reserved[py][px] = true
            matrix[py][px] = x in 0..6 && y in 0..6 &&
                (x == 0 || x == 6 || y == 0 || y == 6 || (x in 2..4 && y in 2..4))
        }
    }
    finder(0, 0); finder(gridSize - 7, 0); finder(0, gridSize - 7)
    val payload = token.toByteArray(Charsets.UTF_8)
    var bit = 0
    for (x in gridSize - 1 downTo 1 step 2) {
        val col = if (x == 6) x - 1 else x
        for (y in 0 until gridSize) {
            val row = if (((gridSize - 1 - col) / 2) % 2 == 0) gridSize - 1 - y else y
            for (dx in 0..1) {
                val px = col - dx
                if (!reserved[row][px]) {
                    val value = if (payload.isEmpty()) 0 else payload[(bit / 8) % payload.size].toInt()
                    matrix[row][px] = ((value ushr (7 - (bit % 8))) and 1) == 1
                    bit++
                }
            }
        }
    }
    val scale = 8
    val bitmap = Bitmap.createBitmap(gridSize * scale, gridSize * scale, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(Color.WHITE)
    val paint = Paint().apply { color = Color.BLACK; style = Paint.Style.FILL }
    for (y in 0 until gridSize) for (x in 0 until gridSize) if (matrix[y][x]) {
        canvas.drawRect((x * scale).toFloat(), (y * scale).toFloat(), ((x + 1) * scale).toFloat(), ((y + 1) * scale).toFloat(), paint)
    }
    return bitmap
}
