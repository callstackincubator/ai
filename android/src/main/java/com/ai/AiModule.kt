package com.ai

import ai.mlc.mlcllm.MLCEngine
import ai.mlc.mlcllm.OpenAIProtocol
import ai.mlc.mlcllm.OpenAIProtocol.ChatCompletionMessage
import android.graphics.ColorSpace.Model
import android.os.Environment
import android.util.Log
import android.widget.Toast
import androidx.compose.runtime.mutableIntStateOf
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.TurboModule
import org.json.JSONObject
import java.io.File
import com.google.gson.annotations.SerializedName
import com.google.gson.Gson
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.io.FileOutputStream
import java.net.URL
import java.nio.channels.Channels
import java.util.UUID
import java.util.concurrent.Executors
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.toMutableStateList
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.channels.toList
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.withContext
import kotlin.concurrent.thread


@ReactModule(name = AiModule.NAME)
class AiModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  TurboModule {

  override fun getName(): String = NAME

  companion object {
    const val NAME = "Ai"

    const val AppConfigFilename = "mlc-app-config.json"
    const val ModelConfigFilename = "mlc-chat-config.json"
    const val ParamsConfigFilename = "ndarray-cache.json"
    const val ModelUrlSuffix = "/resolve/main/"
  }

  private var appConfig = AppConfig(
    emptyList<String>().toMutableList(),
    emptyList<ModelRecord>().toMutableList()
  )
  private val gson = Gson()
  private lateinit var chat: Chat

  private fun getAppConfig(): AppConfig {
    val appConfigFile = File(reactApplicationContext.applicationContext.getExternalFilesDir(""), AppConfigFilename)

    val jsonString: String = if (appConfigFile.exists()) {
      appConfigFile.readText()
    } else {
      reactApplicationContext.applicationContext.assets.open(AppConfigFilename).bufferedReader().use { it.readText() }
    }

    return gson.fromJson(jsonString, AppConfig::class.java)
  }

  private fun getModelConfig(modelRecord: ModelRecord): ModelConfig {
    val modelDirFile = File(reactApplicationContext.getExternalFilesDir(""), modelRecord.modelId)
    val modelConfigFile = File(modelDirFile, ModelConfigFilename)

    val jsonString: String = if (modelConfigFile.exists()) {
      modelConfigFile.readText()
    } else {
      throw Error("Requested model config not found")
    }

    return gson.fromJson(jsonString, ModelConfig::class.java)
  }

  @ReactMethod
  fun getModel(name: String, promise: Promise) {
    appConfig = getAppConfig()

    val modelConfig = appConfig.modelList.find { modelRecord -> modelRecord.modelId == name }

    if (modelConfig == null) {
      promise.reject("Model not found", "Didn't find the model")
      return
    }

    // Return a JSON object with details
    val modelConfigInstance = Arguments.createMap().apply {
      putString("modelId", modelConfig.modelId)
      putString("modelLib", modelConfig.modelLib) // Add more fields if needed
    }

    promise.resolve(modelConfigInstance)
  }

  @ReactMethod
  fun getModels(promise: Promise) {
    try {
      appConfig = getAppConfig()
      appConfig.modelLibs = emptyList<String>().toMutableList()

      val modelsArray = Arguments.createArray().apply {
        for (modelRecord in appConfig.modelList) {
          pushMap(Arguments.createMap().apply { putString("model_id", modelRecord.modelId) })
        }
      }

      promise.resolve(modelsArray)
    } catch (e: Exception) {
      promise.reject("JSON_ERROR", "Error creating JSON array", e)
    }
  }

  @ReactMethod
  fun doGenerate(instanceId: String, messages: ReadableArray, promise: Promise) {
    val messageList = mutableListOf<ChatCompletionMessage>()

    for (i in 0 until messages.size()) {
      val messageMap = messages.getMap(i) // Extract ReadableMap


      val role = if (messageMap.getString("role") == "user") OpenAIProtocol.ChatCompletionRole.user else OpenAIProtocol.ChatCompletionRole.assistant
      val content = messageMap.getString("content") ?: ""

      messageList.add(ChatCompletionMessage(role, content))
    }

    CoroutineScope(Dispatchers.Main).launch {
      try {
          chat.generateResponse(messageList, callback = object :Chat.ChatStateCallback{
            override fun onMessageReceived(message: String) {
              promise.resolve(message)
            }
          })
      } catch (e: Exception) {
        Log.e("AI", "Error generating response", e)
      }
    }
  }

  @ReactMethod
  fun doStream(instanceId: String, text: String, promise: Promise) {
    promise.resolve("Streaming text for $instanceId: $text")
  }

  @ReactMethod
  fun prepareModel(instanceId: String, promise: Promise) {
    val appConfig = getAppConfig()

    val modelRecord = appConfig.modelList.find { modelRecord -> modelRecord.modelId == instanceId }

    if(modelRecord == null) {
      throw Error("There's no config for requested model")
    }

    downloadModelConfig(modelRecord)

    val modelConfig = getModelConfig(modelRecord)

    modelConfig.modelId = modelRecord.modelId
    modelConfig.modelUrl = modelRecord.modelUrl
    modelConfig.modelLib = modelRecord.modelLib

    val modelDir = File(reactApplicationContext.getExternalFilesDir(""), modelConfig.modelId)

    try {
      chat = Chat(modelConfig, modelDir)
    } catch (e: Exception) {
      promise.reject("MODEL_INIT", "Couldn't initialize model", e)
    }

    promise.resolve("Preparing model: $instanceId")
  }

  private fun downloadModelConfig(
    modelRecord: ModelRecord,
  ) {
    CoroutineScope(Dispatchers.IO).launch {
      // Don't download if config is downloaded already
      val modelFile = File(reactApplicationContext.getExternalFilesDir(""), modelRecord.modelId)
      if (modelFile.exists()) {
        return@launch
      }

      // Prepare temp file for streaming
      val url = URL("${modelRecord.modelUrl}${ModelUrlSuffix}${ModelConfigFilename}")
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

      // Create object form config
      val modelConfigString = tempFile.readText()
      val modelConfig = gson.fromJson(modelConfigString, ModelConfig::class.java).apply {
        modelId = modelRecord.modelId
        modelLib = modelRecord.modelLib
        estimatedVramBytes = modelRecord.estimatedVramBytes
      }

      // Copy to config location and remove temp file
      val modelDirFile = File(reactApplicationContext.getExternalFilesDir(""), modelConfig.modelId)
      val modelConfigFile = File(modelDirFile, ModelConfigFilename)
      tempFile.copyTo(modelConfigFile, overwrite = true)
      tempFile.delete()

      return@launch
    }
  }

}

enum class ModelInitState {
  Initializing,
  Indexing,
  Paused,
  Downloading,
  Pausing,
  Clearing,
  Deleting,
  Finished
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


data class ModelConfig(
  @SerializedName("model_lib") var modelLib: String,
  @SerializedName("model_id") var modelId: String,
  @SerializedName("model_url") var modelUrl: String,
  @SerializedName("estimated_vram_bytes") var estimatedVramBytes: Long?,
  @SerializedName("tokenizer_files") val tokenizerFiles: List<String>,
  @SerializedName("context_window_size") val contextWindowSize: Int,
  @SerializedName("prefill_chunk_size") val prefillChunkSize: Int,
)

data class AppConfig(
  @SerializedName("model_libs") var modelLibs: MutableList<String>,
  @SerializedName("model_list") val modelList: MutableList<ModelRecord>,
)

data class ModelRecord(
  @SerializedName("model_url") val modelUrl: String,
  @SerializedName("model_id") val modelId: String,
  @SerializedName("estimated_vram_bytes") val estimatedVramBytes: Long?,
  @SerializedName("model_lib") val modelLib: String
)

data class DownloadTask(val url: URL, val file: File)

data class ParamsConfig(
  @SerializedName("records") val paramsRecords: List<ParamsRecord>
)

data class ParamsRecord(
  @SerializedName("dataPath") val dataPath: String
)
