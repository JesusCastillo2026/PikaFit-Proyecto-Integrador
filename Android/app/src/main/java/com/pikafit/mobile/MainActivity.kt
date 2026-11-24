package com.pikafit.mobile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant

class MainActivity:ComponentActivity(){
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);val store=SessionStore(applicationContext);setContent{MaterialTheme{Surface(Modifier.fillMaxSize(),color=MaterialTheme.colorScheme.background){PikaFitApp(store.read(),store::save,store::clear)}}}}
}
@Composable private fun PikaFitApp(initialToken:String?,onSaveToken:(String)->Unit,onClearToken:()->Unit){
 val api=remember{Api()};val scope=rememberCoroutineScope()
 var identifier by remember{mutableStateOf("")};var password by remember{mutableStateOf("")};var token by remember{mutableStateOf(initialToken)};var user by remember{mutableStateOf<User?>(null)}
 var pass by remember{mutableStateOf<PassResult?>(null)};var error by remember{mutableStateOf<String?>(null)};var busy by remember{mutableStateOf(false)}
 var routine by remember{mutableStateOf<RoutineResult?>(null)};var activeSession by remember{mutableStateOf<TrainingSession?>(null)};var guides by remember{mutableStateOf<List<Guide>>(emptyList())};var coachData by remember{mutableStateOf<List<CoachMember>>(emptyList())}
 fun launchRequest(action:suspend()->Unit){scope.launch{busy=true;error=null;try{action()}catch(e:Exception){error=e.message?:"Ocurrió un error"}finally{busy=false}}}
 LaunchedEffect(token){if(token!=null&&user==null)launchRequest{try{user=api.me(token!!)}catch(e:Exception){token=null;onClearToken();error=e.message}}}
 LaunchedEffect(token,user?.role){if(token!=null&&user?.role=="SOCIO")runCatching{activeSession=api.activeSession(token!!)};if(token!=null&&user?.role=="COACH")runCatching{coachData=api.coachDashboard(token!!)}}
 Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha=.35f)).padding(22.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
  Text("PikaFit",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold,color=MaterialTheme.colorScheme.primary);Text("Acceso y pases médicos");Spacer(Modifier.height(20.dp))
  if(user==null)LoginCard(identifier,{identifier=it},password,{password=it},busy,error){launchRequest{val result=api.login(identifier.trim(),password);token=result.token;user=result.user;onSaveToken(result.token)}}
  else MemberCard(user!!,pass,busy,error,{launchRequest{pass=api.createPass(token!!)}},routine,activeSession,guides,
   {launchRequest{routine=api.generateRoutine(token!!);activeSession=null}},
   {level->launchRequest{val r=routine?:api.generateRoutine(token!!).also{routine=it};api.reportFatigue(token!!,r.id,level);routine=api.generateRoutine(token!!)}},
   {launchRequest{val r=routine?:api.generateRoutine(token!!).also{routine=it};activeSession=api.startSession(token!!,r.id)}},
   {exercise,zone->launchRequest{activeSession?.let{api.reportDiscomfort(token!!,it.id,exercise,zone);activeSession=api.activeSession(token!!)}}},
   {rpe->launchRequest{activeSession?.let{api.finishSession(token!!,it.id,rpe);activeSession=null}}},
   {launchRequest{guides=api.guides(token!!)}},coachData,
   {exercise,reps,setNo->launchRequest{activeSession?.let{api.recordSet(token!!,it.id,exercise,reps,setNo);activeSession=api.activeSession(token!!)}}},
   {user=null;token=null;pass=null;password="";onClearToken()})
 }
}
@Composable private fun LoginCard(identifier:String,onIdentifier:(String)->Unit,password:String,onPassword:(String)->Unit,busy:Boolean,error:String?,onLogin:()->Unit){
 Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(22.dp)){Column(Modifier.padding(22.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Text("Iniciar sesión",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.SemiBold);Text("Ingresa con tu correo o DNI y contraseña.")
  OutlinedTextField(identifier,onIdentifier,label={Text("Correo o DNI")},modifier=Modifier.fillMaxWidth(),singleLine=true,keyboardOptions=KeyboardOptions(keyboardType=if(identifier.contains('@'))KeyboardType.Email else KeyboardType.Text))
  OutlinedTextField(password,onPassword,label={Text("Contraseña")},modifier=Modifier.fillMaxWidth(),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Password))
  if(error!=null)Text(error,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall)
  Button(onClick=onLogin,enabled=!busy&&identifier.isNotBlank()&&password.isNotBlank(),modifier=Modifier.fillMaxWidth()){if(busy)CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp)else Text("Entrar")}
 }}
}
@Composable private fun MemberCard(user:User,pass:PassResult?,busy:Boolean,error:String?,onCreatePass:()->Unit,routine:RoutineResult?,activeSession:TrainingSession?,guides:List<Guide>,onGenerateRoutine:()->Unit,onReportFatigue:(String)->Unit,onStartSession:()->Unit,onReportDiscomfort:(String,String)->Unit,onFinishSession:(Int)->Unit,onLoadGuides:()->Unit,coachData:List<CoachMember>,onRecordSet:(String,Int,Int)->Unit,onLogout:()->Unit){
 val activeMember=user.role=="SOCIO"&&user.membershipActive==true
 var secondsRemaining by remember(pass?.expiresAt){mutableLongStateOf(pass?.let{secondsUntil(it.expiresAt)}?:0L)}
 LaunchedEffect(pass?.expiresAt){while(pass!=null&&secondsRemaining>0){delay(1000);secondsRemaining=secondsUntil(pass.expiresAt)}}
 Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(22.dp)){Column(Modifier.padding(22.dp).heightIn(max=680.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp),horizontalAlignment=Alignment.CenterHorizontally){
  Text("Hola, ${user.name}",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.SemiBold);Text(user.email,style=MaterialTheme.typography.bodySmall)
  if(activeMember){Text("Membresía activa",color=MaterialTheme.colorScheme.primary,fontWeight=FontWeight.SemiBold);Button(onClick=onCreatePass,enabled=!busy,modifier=Modifier.fillMaxWidth()){if(busy)CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp)else Text("Generar pase médico")}
   pass?.let{if(secondsRemaining>0){QrImage(it.qrDataUrl);Text("Código alternativo");Text(it.code,style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold);Text("El pase vence en ${secondsRemaining/60}:${(secondsRemaining%60).toString().padStart(2,'0')}")}else Text("El pase venció. Genera uno nuevo.",color=MaterialTheme.colorScheme.error)}
  }else if(user.role=="SOCIO")Text("Tu membresía está vencida. Debes renovarla para generar un pase.",color=MaterialTheme.colorScheme.error) else Text("Los pases están disponibles para cuentas de socio.")
  if(user.role=="SOCIO"){HorizontalDivider();Text("Entrenamiento",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold);Button(onClick=onGenerateRoutine,enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("Generar rutina")}
   routine?.let{r->r.exercises.forEach{Text("${it.name} · ${it.sets} series × ${it.reps} repeticiones")};Text("¿Cómo te sientes antes de entrenar?");Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){listOf("BAJA","MEDIA","ALTA").forEach{level->Button(onClick={onReportFatigue(level)},enabled=!busy){Text(level.lowercase().replaceFirstChar(Char::uppercase))}}};if(activeSession==null)Button(onClick=onStartSession,enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("Iniciar sesión")}}
   activeSession?.let{s->Text("Sesión activa. Reporta molestias indicando ejercicio y zona.");s.exercises.forEach{exercise->Text("${exercise.name} · ${exercise.sets} × ${exercise.reps}");val completed=s.sets.count{it.exerciseId==exercise.exerciseId};if(completed<exercise.sets)OutlinedButton(onClick={onRecordSet(exercise.exerciseId,exercise.reps,completed+1)},enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("Registrar serie ${completed+1} de ${exercise.sets}")}else Text("Todas las series registradas");Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){listOf("rodilla","espalda","hombro").forEach{zone->TextButton(onClick={onReportDiscomfort(exercise.exerciseId,zone)}){Text("Molestia: $zone")}}}};Text("Esfuerzo percibido al terminar (RPE 1–10)");Row(horizontalArrangement=Arrangement.spacedBy(4.dp)){(1..10).forEach{score->TextButton(onClick={onFinishSession(score)},enabled=!busy){Text(score.toString())}}}}
   Button(onClick=onLoadGuides,enabled=!busy,modifier=Modifier.fillMaxWidth()){Text("Ver guías de nutrición")};guides.forEach{Text("${it.title}: ${it.sections.joinToString(" ")}",style=MaterialTheme.typography.bodySmall)}
  }
  if(user.role=="COACH"){Text("Panel de socios",style=MaterialTheme.typography.titleMedium);coachData.forEach{Text("${it.memberName} · RPE promedio ${it.averageRpe?:"—"}${if(it.alert)" · Atención: esfuerzo alto repetido" else ""}")}}
  if(error!=null)Text(error,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall);TextButton(onClick=onLogout){Text("Cerrar sesión")}
 }}
}
@Composable private fun QrImage(dataUrl:String){val bitmap:Bitmap?=remember(dataUrl){runCatching{val encoded=dataUrl.substringAfter("base64,");val bytes=Base64.decode(encoded,Base64.DEFAULT);BitmapFactory.decodeByteArray(bytes,0,bytes.size)}.getOrNull()};bitmap?.let{Image(it.asImageBitmap(),contentDescription="Código QR del pase médico",modifier=Modifier.size(210.dp))}}
private fun secondsUntil(expiresAt:String):Long=runCatching{Duration.between(Instant.now(),Instant.parse(expiresAt)).seconds.coerceAtLeast(0)}.getOrDefault(0)
