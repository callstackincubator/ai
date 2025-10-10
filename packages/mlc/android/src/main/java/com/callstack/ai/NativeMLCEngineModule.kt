package com.callstack.ai

import ai.mlc.mlcllm.OpenAIProtocol
import ai.mlc.mlcllm.OpenAIProtocol.ChatCompletionMessage
import android.os.Environment
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.bridge.ReactContext.RCTDeviceEventEmitter
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.json.Json
import kotlinx.serialization.decodeFromString
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.nio.channels.Channels
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
    const val MODEL_CONFIG_FILENAME = "mlc-chat-config.json"
    const val PARAMS_CONFIG_FILENAME = "ndarray-cache.json"
    const val MODEL_URL_SUFFIX = "/resolve/main/"
  }

  private val json = Json { ignoreUnknownKeys = true }
  private lateinit var chat: Chat

  private val appConfig by lazy {
    val jsonString = reactApplicationContext.applicationContext.assets.open(APP_CONFIG_FILENAME).bufferedReader().use { it.readText() }
    json.decodeFromString<AppConfig>(jsonString)
  }

  private suspend fun getModelConfig(modelRecord: ModelRecord): ModelConfig {
    downloadModelConfig(modelRecord)

    val modelDirFile = File(reactApplicationContext.getExternalFilesDir(""), modelRecord.model_id)
    val modelConfigFile = File(modelDirFile, MODEL_CONFIG_FILENAME)

    val jsonString: String = if (modelConfigFile.exists()) {
      modelConfigFile.readText()
    } else {
      throw Error("Requested model config not found")
    }

    return json.decodeFromString<ModelConfig>(jsonString)
  }

  override fun getModel(name: String, promise: Promise) {
    val modelConfig = appConfig.model_list.find { modelRecord -> modelRecord.model_id == name }

    if (modelConfig == null) {
      promise.reject("Model not found", "Didn't find the model")
      return
    }

    val modelConfigInstance = Arguments.createMap().apply {
      putString("model_id", modelConfig.model_id)
    }

    promise.resolve(modelConfigInstance)
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
        val modelRecord = appConfig.model_list.find { modelRecord -> modelRecord.model_id == instanceId }
        if (modelRecord == null) {
          throw Error("There's no record for requested model")
        }

        val modelConfig = getModelConfig(modelRecord)

        val modelDir = File(reactApplicationContext.getExternalFilesDir(""), modelRecord.model_id)

        val modelState = ModelState(modelConfig, modelDir)

        modelState.initialize()

        sendEvent("onDownloadStart", null)

        CoroutineScope(Dispatchers.IO).launch {
          modelState.progress.collect { newValue ->
            val event: WritableMap = Arguments.createMap().apply {
              putDouble("percentage", (newValue.toDouble() / modelState.total.value) * 100)
            }
            sendEvent("onDownloadProgress", event)
          }
        }

        modelState.download()

        sendEvent("onDownloadComplete", null)

        withContext(Dispatchers.Main) { promise.resolve("Model downloaded: $instanceId") }
      } catch (e: Exception) {
        sendEvent("onDownloadError", e.message ?: "Unknown error")
        withContext(Dispatchers.Main) { promise.reject("MODEL_ERROR", "Error downloading model", e) }
      }
    }
  }

  override fun removeModel(modelId: String?, promise: Promise?) {
    TODO("Not yet implemented")
  }

  // tbd
  private fun sendEvent(eventName: String, data: Any?) {
    reactApplicationContext.getJSModule(RCTDeviceEventEmitter::class.java)?.emit(eventName, data)
  }

  override fun prepareModel(instanceId: String, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val modelRecord = appConfig.model_list.find { modelRecord -> modelRecord.model_id == instanceId }

        if (modelRecord == null) {
          throw Error("There's no record for requested model")
        }
        val modelConfig = getModelConfig(modelRecord)

        val modelDir = File(reactApplicationContext.getExternalFilesDir(""), modelRecord.model_id)

        val modelState = ModelState(modelConfig, modelDir)
        modelState.initialize()
        modelState.download()

        chat = Chat(modelConfig, modelDir)

        withContext(Dispatchers.Main) { promise.resolve("Model prepared: $instanceId") }
      } catch (e: Exception) {
        withContext(Dispatchers.Main) { promise.reject("MODEL_ERROR", "Error preparing model", e) }
      }
    }
  }

  override fun unloadModel(promise: Promise?) {
    TODO("Not yet implemented")
  }

  private suspend fun downloadModelConfig(modelRecord: ModelRecord) {
    withContext(Dispatchers.IO) {
      // Don't download if config is downloaded already
      val modelFile = File(reactApplicationContext.getExternalFilesDir(""), modelRecord.model_id)
      if (modelFile.exists()) {
        return@withContext
      }

      // Prepare temp file for streaming
      val url = URL("${modelRecord.model_url}${MODEL_URL_SUFFIX}$MODEL_CONFIG_FILENAME")
      val tempId = UUID.randomUUID().toString()
      val tempFile = File(
        reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
        tempId
      )

      // Download
      url.openStream().use {
        Channels.newChannel(it).use { src ->
          FileOutputStream(tempFile).use { fileOutputStream ->
            fileOutputStream.channel.transferFrom(src, 0, Long.MAX_VALUE)
          }
        }
      }
      require(tempFile.exists())

      // Copy to config location and remove temp file
      val modelDirFile = File(reactApplicationContext.getExternalFilesDir(""), modelRecord.model_id)
      val modelConfigFile = File(modelDirFile, MODEL_CONFIG_FILENAME)
      tempFile.copyTo(modelConfigFile, overwrite = true)
      tempFile.delete()

      return@withContext
    }
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
data class ModelConfig(
  val tokenizer_files: List<String>,
  val context_window_size: Int,
  val prefill_chunk_size: Int
)

@Serializable
data class AppConfig(val model_list: List<ModelRecord>)

@Serializable
data class ModelRecord(
  val model_url: String,
  val model_id: String,
  val estimated_vram_bytes: Long?,
  val model_lib: String
)

data class DownloadTask(val url: URL, val file: File)

@Serializable
data class ParamsConfig(val records: List<ParamsRecord>)

@Serializable
data class ParamsRecord(val dataPath: String)
