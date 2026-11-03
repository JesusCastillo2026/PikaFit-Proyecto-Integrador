package com.pikafit.mobile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableLongStateOf
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
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.Instant

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val sessionStore = SessionStore(applicationContext)
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    PikaFitApp(
                        initialToken = sessionStore.read(),
                        onSaveToken = sessionStore::save,
                        onClearToken = sessionStore::clear,
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
    var routine by remember { mutableStateOf<RoutineResult?>(null) }
    var activeSession by remember { mutableStateOf<TrainingSession?>(null) }
    var guides by remember { mutableStateOf<List<Guide>>(emptyList()) }
    var coachData by remember { mutableStateOf<List<CoachMember>>(emptyList()) }

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
    androidx.compose.runtime.LaunchedEffect(token, user?.role) {
        if (token != null && user?.role == "SOCIO") runCatching { activeSession = api.activeSession(token!!) }
        if (token != null && user?.role == "COACH") runCatching { coachData = api.coachDashboard(token!!) }
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
                routine = routine,
                activeSession = activeSession,
                guides = guides,
                onGenerateRoutine = { launchRequest { routine = api.generateRoutine(token!!); activeSession = null } },
                onReportFatigue = { level -> launchRequest { val r = routine ?: api.generateRoutine(token!!).also { routine = it }; api.reportFatigue(token!!, r.id, level); routine = api.generateRoutine(token!!) } },
                onStartSession = { launchRequest { val r = routine ?: api.generateRoutine(token!!).also { routine = it }; activeSession = api.startSession(token!!, r.id) } },
                onReportDiscomfort = { exercise, zone -> launchRequest { activeSession?.let { api.reportDiscomfort(token!!, it.id, exercise, zone); activeSession = api.activeSession(token!!) } } },
                onFinishSession = { rpe -> launchRequest { activeSession?.let { api.finishSession(token!!, it.id, rpe); activeSession = null } } },
                onLoadGuides = { launchRequest { guides = api.guides(token!!) } },
                coachData = coachData,
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
    routine: RoutineResult?, activeSession: TrainingSession?, guides: List<Guide>,
    onGenerateRoutine: () -> Unit, onReportFatigue: (String) -> Unit, onStartSession: () -> Unit,
    onReportDiscomfort: (String, String) -> Unit, onFinishSession: (Int) -> Unit, onLoadGuides: () -> Unit,
    coachData: List<CoachMember>,
    onLogout: () -> Unit,
) {
    val isActiveMember = user.role == "SOCIO" && user.membershipActive == true
    var secondsRemaining by remember(pass?.expiresAt) {
        mutableLongStateOf(pass?.let { secondsUntil(it.expiresAt) } ?: 0L)
    }
    val currentPass = pass
    LaunchedEffect(currentPass?.expiresAt) {
        while (currentPass != null && secondsRemaining > 0) {
            delay(1_000)
            secondsRemaining = secondsUntil(currentPass.expiresAt)
        }
    }
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(22.dp).heightIn(max = 680.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Hola, ${user.name}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text(user.email, style = MaterialTheme.typography.bodySmall)
            if (isActiveMember) {
                Text("Membresía activa", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                Button(onClick = onCreatePass, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                    if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Generar pase médico")
                }
                pass?.let { passResult ->
                    if (secondsRemaining > 0) {
                        Spacer(Modifier.height(4.dp))
                        QrImage(passResult.qrDataUrl)
                        Text("Código alternativo", style = MaterialTheme.typography.labelLarge)
                        Text(passResult.code, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        Text("El pase vence en ${secondsRemaining / 60}:${(secondsRemaining % 60).toString().padStart(2, '0')}", style = MaterialTheme.typography.bodySmall)
                    } else {
                        Text("El pase venció. Genera uno nuevo para continuar.", color = MaterialTheme.colorScheme.error)
                    }
                }
            } else if (user.role == "SOCIO") {
                Text("Tu membresía está vencida. Debes renovarla para generar un pase.", color = MaterialTheme.colorScheme.error)
            } else {
                Text("Esta función de pases está disponible para cuentas de socio.")
            }
            if (user.role == "SOCIO") {
                androidx.compose.material3.HorizontalDivider()
                Text("Entrenamiento", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Button(onClick = onGenerateRoutine, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Generar rutina") }
                routine?.let { r ->
                    r.exercises.forEach { Text("${it.name} · ${it.sets} series × ${it.reps} repeticiones") }
                    Text("¿Cómo te sientes antes de entrenar?")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("BAJA", "MEDIA", "ALTA").forEach { level -> Button(onClick = { onReportFatigue(level) }, enabled = !busy) { Text(level.lowercase().replaceFirstChar(Char::uppercase)) } }
                    }
                    if (activeSession == null) Button(onClick = onStartSession, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Iniciar sesión") }
                }
                activeSession?.let { session ->
                    Text("Sesión activa. Reporta dolor indicando ejercicio y zona para pedir sustitución segura.")
                    session.exercises.forEach { exercise ->
                        Text("${exercise.name} · ${exercise.sets} × ${exercise.reps}")
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { listOf("rodilla", "espalda", "hombro").forEach { zone -> TextButton(onClick = { onReportDiscomfort(exercise.exerciseId, zone) }) { Text("Molestia: $zone") } } }
                    }
                    Text("Esfuerzo percibido al terminar (RPE 1–10)")
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { (1..10).forEach { score -> TextButton(onClick = { onFinishSession(score) }, enabled = !busy) { Text(score.toString()) } } }
                }
                Button(onClick = onLoadGuides, modifier = Modifier.fillMaxWidth()) { Text("Ver guías de nutrición") }
                guides.forEach { guide -> Text("${guide.title}: ${guide.sections.joinToString(" ")}", style = MaterialTheme.typography.bodySmall) }
            }
            if (user.role == "COACH") {
                Text("Panel de socios", style = MaterialTheme.typography.titleMedium)
                coachData.forEach { member -> Text("${member.memberName} · RPE promedio ${member.averageRpe ?: "—"}${if (member.alert) " · Atención: esfuerzo alto repetido" else ""}") }
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
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        }.getOrNull()
    }
    bitmap?.let { Image(it.asImageBitmap(), contentDescription = "Código QR del pase médico", modifier = Modifier.size(210.dp)) }
}

private fun secondsUntil(expiresAt: String): Long = runCatching {
    Duration.between(Instant.now(), Instant.parse(expiresAt)).seconds.coerceAtLeast(0)
}.getOrDefault(0)
