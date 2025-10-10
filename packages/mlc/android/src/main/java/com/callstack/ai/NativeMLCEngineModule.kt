package com.callstack.ai

import ai.mlc.mlcllm.MLCEngine
import com.facebook.react.bridge.*
import com.facebook.react.bridge.ReactContext.RCTDeviceEventEmitter
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class NativeMLCEngineModule(reactContext: ReactApplicationContext) : NativeMLCEngineSpec(reactContext) {
  override fun getName(): String = NAME

  companion object {
    const val NAME = "NativeMLCEngine"
    const val APP_CONFIG_FILENAME = "mlc-app-config.json"
  }

  private val json = Json { ignoreUnknownKeys = true }
  private val engine by lazy { MLCEngine() }

  private val appConfig by lazy {
    val jsonString = reactApplicationContext.applicationContext.assets.open(APP_CONFIG_FILENAME).bufferedReader().use { it.readText() }
    json.decodeFromString<AppConfig>(jsonString)
  }

  override fun getModel(name: String, promise: Promise) {
    val (modelRecord, _) = getModelConfig(name) ?: run {
      promise.reject("Model not found", "Didn't find the model")
      return
    }

    val modelRecordMap = Arguments.createMap().apply {
      putString("model_id", modelRecord.model_id)
    }

    promise.resolve(modelRecordMap)
  }

  override fun getModels(promise: Promise) {
    promise.resolve(Arguments.fromList(appConfig.model_list))
  }

  override fun generateText(
    messages: ReadableArray?,
    options: ReadableMap?,
    promise: Promise?
  ) {
    TODO("Not yet implemented")
  }

  override fun streamText(
    messages: ReadableArray?,
    options: ReadableMap?,
    promise: Promise?
  ) {
    TODO("Not yet implemented")
  }

  override fun cancelStream(streamId: String?, promise: Promise?) {
    TODO("Not yet implemented")
  }

//  @ReactMethod
//  fun doGenerate(instanceId: String, messages: ReadableArray, promise: Promise) {
//    val messageList = mutableListOf<ChatCompletionMessage>()
//
//    for (i in 0 until messages.size()) {
//      val messageMap = messages.getMap(i) // Extract ReadableMap
//
//      val role = if (messageMap.getString("role") == "user") OpenAIProtocol.ChatCompletionRole.user else OpenAIProtocol.ChatCompletionRole.assistant
//      val content = messageMap.getString("content") ?: ""
//
//      messageList.add(ChatCompletionMessage(role, content))
//    }
//
//    CoroutineScope(Dispatchers.Main).launch {
//      try {
//        chat.generateResponse(
//          messageList,
//          callback = object : Chat.GenerateCallback {
//            override fun onMessageReceived(message: String) {
//              promise.resolve(message)
//            }
//          }
//        )
//      } catch (e: Exception) {
//        Log.e("AI", "Error generating response", e)
//      }
//    }
//  }

//  @ReactMethod
//  fun doStream(instanceId: String, messages: ReadableArray, promise: Promise) {
//    val messageList = mutableListOf<ChatCompletionMessage>()
//
//    for (i in 0 until messages.size()) {
//      val messageMap = messages.getMap(i) // Extract ReadableMap
//
//      val role = if (messageMap.getString("role") == "user") OpenAIProtocol.ChatCompletionRole.user else OpenAIProtocol.ChatCompletionRole.assistant
//      val content = messageMap.getString("content") ?: ""
//
//      messageList.add(ChatCompletionMessage(role, content))
//    }
//    CoroutineScope(Dispatchers.Main).launch {
//      chat.streamResponse(
//        messageList,
//        callback = object : Chat.StreamCallback {
//          override fun onUpdate(message: String) {
//            val event: WritableMap = Arguments.createMap().apply {
//              putString("content", message)
//            }
//            sendEvent("onChatUpdate", event)
//          }
//
//          override fun onFinished(message: String) {
//            val event: WritableMap = Arguments.createMap().apply {
//              putString("content", message)
//            }
//            sendEvent("onChatComplete", event)
//          }
//        }
//      )
//    }
//    promise.resolve(null)
//  }

  override fun downloadModel(instanceId: String, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val (modelRecord, modelDir) = getModelConfig(instanceId) ?: run {
          promise.reject("Model not found", "There's no record for requested model")
          return@launch
        }

        val modelDownloader = ModelDownloader(modelRecord.model_url, modelDir)
        modelDownloader.downloadModel { current, total ->
          val event: WritableMap = Arguments.createMap().apply {
            putDouble("percentage", current.toDouble() / total)
          }
          sendEvent("onDownloadProgress", event)
        }

        promise.resolve(Unit)
      } catch (e: Exception) {
        promise.reject("MODEL_ERROR", "Error downloading model", e)
      }
    }
  }

  override fun removeModel(modelId: String, promise: Promise) {
    val (_, modelDir) = getModelConfig(modelId) ?: run {
      promise.reject("Model not found", "Didn't find the model")
      return
    }

    try {
      if (modelDir.exists()) {
        modelDir.deleteRecursively()
      }
      promise.resolve(Unit)
    } catch (e: Exception) {
      promise.reject("MODEL_ERROR", "Error removing model", e)
    }
  }

  override fun prepareModel(instanceId: String, promise: Promise) {
    val (modelRecord, modelDir) = getModelConfig(instanceId) ?: run {
      promise.reject("Model not found", "Didn't find the model")
      return
    }

    engine.reload(modelDir.path, modelRecord.model_lib)
    promise.resolve(Unit)
  }

  override fun unloadModel(promise: Promise?) {
    engine.unload()
    promise?.resolve(Unit)
  }

  private fun getModelConfig(modelId: String): Pair<ModelRecord, File>? {
    val modelRecord = appConfig.model_list.find { it.model_id == modelId } ?: return null
    val modelDir = File(reactApplicationContext.getExternalFilesDir(""), modelRecord.model_id)
    return Pair(modelRecord, modelDir)
  }

  private fun sendEvent(eventName: String, data: Any?) {
    reactApplicationContext.getJSModule(RCTDeviceEventEmitter::class.java)?.emit(eventName, data)
  }
}

enum class ModelChatState {
  Generating,
  Resetting,
  Reloading,
  Terminating,
  Ready,
  Failed
}

data class MessageData(val role: String, val text: String, val id: UUID = UUID.randomUUID())

@Serializable
data class AppConfig(val model_list: List<ModelRecord>)

@Serializable
data class ModelRecord(
  val model_url: String,
  val model_id: String,
  val estimated_vram_bytes: Long?,
  val model_lib: String
)
