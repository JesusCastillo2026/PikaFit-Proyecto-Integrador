package com.pikafit.mobile

import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

data class User(val id:String="",val name:String="",val email:String="",val dni:String?=null,val role:String="",val membershipExpiresAt:String?=null,val membershipActive:Boolean?=null)
data class LoginResult(val token:String,val user:User)
data class PassResult(val code:String,val expiresAt:String,val qrDataUrl:String)
data class RoutineExercise(val exerciseId:String,val name:String,val sets:Int,val reps:Int,val restSeconds:Int=60)
data class RoutineResult(val id:String,val exercises:List<RoutineExercise> = emptyList())
data class TrainingSet(val exerciseId:String,val setNumber:Int)
data class TrainingSession(val id:String,val exercises:List<RoutineExercise> = emptyList(),val sets:List<TrainingSet> = emptyList())
data class Guide(val id:String,val goal:String,val title:String,val sections:List<String> = emptyList())
data class CoachMember(val memberId:String,val memberName:String,val averageRpe:Double?,val alert:Boolean)
class Api {
 private val gson=Gson()
 suspend fun login(identifier:String,password:String):LoginResult=request("/api/auth/login","POST",body=if(identifier.contains('@'))mapOf("email" to identifier,"password" to password)else mapOf("dni" to identifier,"password" to password)).let{gson.fromJson(it,LoginResult::class.java)}
 suspend fun me(token:String):User=gson.fromJson(request("/api/me",token=token),MeEnvelope::class.java).user
 suspend fun createPass(token:String):PassResult=gson.fromJson(request("/api/medical-passes","POST",token),PassEnvelope::class.java).pass
 suspend fun generateRoutine(token:String):RoutineResult=gson.fromJson(request("/api/me/routines/generate","POST",token,emptyMap<String,String>()),RoutineEnvelope::class.java).routine
 suspend fun activeSession(token:String):TrainingSession?=gson.fromJson(request("/api/me/training/sessions/active",token=token),ActiveSessionEnvelope::class.java).session
 suspend fun startSession(token:String,routineId:String):TrainingSession=gson.fromJson(request("/api/me/training/sessions","POST",token,mapOf("routineId" to routineId)),SessionEnvelope::class.java).session
 suspend fun reportFatigue(token:String,routineId:String,level:String):String=request("/api/me/fatigue-reports","POST",token,mapOf("routineId" to routineId,"level" to level))
 suspend fun reportDiscomfort(token:String,sessionId:String,exerciseId:String,zone:String):String=request("/api/me/training/sessions/$sessionId/discomfort","POST",token,mapOf("exerciseId" to exerciseId,"zone" to zone))
 suspend fun guides(token:String):List<Guide> = gson.fromJson(request("/api/me/nutrition-guides",token=token),GuidesEnvelope::class.java).items
 suspend fun finishSession(token:String,sessionId:String,rpe:Int):String=request("/api/me/training/sessions/$sessionId/finish","POST",token,mapOf("rpe" to rpe))
 suspend fun recordSet(token:String,sessionId:String,exerciseId:String,reps:Int,setNumber:Int):String=request("/api/me/training/sessions/$sessionId/sets","POST",token,mapOf("exerciseId" to exerciseId,"reps" to reps,"setNumber" to setNumber))
 suspend fun coachDashboard(token:String):List<CoachMember> = gson.fromJson(request("/api/coach/dashboard",token=token),CoachEnvelope::class.java).items
 private suspend fun request(path:String,method:String="GET",token:String?=null,body:Any?=null):String=withContext(Dispatchers.IO){
  val c=(URL(BuildConfig.API_BASE_URL+path).openConnection() as HttpURLConnection).apply{requestMethod=method;connectTimeout=10000;readTimeout=10000;setRequestProperty("Accept","application/json");token?.let{setRequestProperty("Authorization","Bearer $it")};if(body!=null){doOutput=true;setRequestProperty("Content-Type","application/json; charset=utf-8");outputStream.bufferedWriter().use{it.write(gson.toJson(body))}}}
  try{val status=c.responseCode;val stream=if(status in 200..299)c.inputStream else c.errorStream;val response=stream?.bufferedReader()?.use{it.readText()}.orEmpty();if(status !in 200..299){val message=runCatching{gson.fromJson(response,ErrorEnvelope::class.java).error}.getOrNull();throw ApiException(message?:"No se pudo conectar con PikaFit (HTTP $status)")};response}finally{c.disconnect()}
 }
 private data class MeEnvelope(val user:User)
 private data class PassEnvelope(val pass:PassResult)
 private data class ErrorEnvelope(val error:String?)
 private data class RoutineEnvelope(val routine:RoutineResult)
 private data class ActiveSessionEnvelope(val session:TrainingSession?)
 private data class SessionEnvelope(val session:TrainingSession)
 private data class GuidesEnvelope(val items:List<Guide>)
 private data class CoachEnvelope(val items:List<CoachMember>)
}
class ApiException(message:String):Exception(message)
