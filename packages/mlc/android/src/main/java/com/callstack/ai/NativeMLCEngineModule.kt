package com.callstack.ai

import ai.mlc.mlcllm.MLCEngine
import ai.mlc.mlcllm.OpenAIProtocol
import ai.mlc.mlcllm.OpenAIProtocol.ChatCompletionMessage
import com.facebook.react.bridge.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.channels.toList
import java.util.concurrent.Executors

class NativeMLCEngineModule(reactContext: ReactApplicationContext) : NativeMLCEngineSpec(reactContext) {
  override fun getName(): String = NAME

  companion object {
    const val NAME = "MLCEngine"
    const val APP_CONFIG_FILENAME = "mlc-app-config.json"
  }

  private val json = Json { ignoreUnknownKeys = true }
  private val engine by lazy { MLCEngine() }
  private val executorService = Executors.newSingleThreadExecutor()
  private val engineScope = CoroutineScope(Dispatchers.Main + Job())

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
    val modelsList = Arguments.createArray()
    appConfig.model_list.forEach { modelRecord ->
      val modelMap = Arguments.createMap().apply {
        putString("model_id", modelRecord.model_id)
        putString("model_url", modelRecord.model_url)
        putString("model_lib", modelRecord.model_lib)
        modelRecord.estimated_vram_bytes?.let { putDouble("estimated_vram_bytes", it.toDouble()) }
      }
      modelsList.pushMap(modelMap)
    }
    promise.resolve(modelsList)
  }

  override fun generateText(
    messages: ReadableArray,
    options: ReadableMap?,
    promise: Promise
  ) {
    executorService.submit {
      engineScope.launch {
        try {
          val messageList = mutableListOf<ChatCompletionMessage>()

          for (i in 0 until messages.size()) {
            val messageMap = messages.getMap(i)
            val role = if (messageMap?.getString("role") == "user") OpenAIProtocol.ChatCompletionRole.user else OpenAIProtocol.ChatCompletionRole.assistant
            val content = messageMap?.getString("content") ?: ""
            messageList.add(ChatCompletionMessage(role, content))
          }

          val responseFormat = options?.getMap("responseFormat")?.let { formatMap ->
            val type = formatMap.getString("type") ?: "text"
            val schema = formatMap.getString("schema")
            OpenAIProtocol.ResponseFormat(type, schema)
          }

          val chatResponse = engine.chat.completions.create(
            messages = messageList,
            temperature = options?.getDouble("temperature")?.toFloat(),
            max_tokens = options?.getInt("maxTokens"),
            top_p = options?.getDouble("topP")?.toFloat(),
            frequency_penalty = options?.getDouble("topK")?.toFloat(),
            response_format = responseFormat
          )

          val response = chatResponse.toList().joinToString("") {
            it.choices.joinToString("") { choice ->
              choice.delta.content?.text ?: ""
            }
          }

          promise.resolve(response)
        } catch (e: Exception) {
          promise.reject("GENERATION_ERROR", e.message)
        }
      }
    }
  }

  override fun streamText(
    messages: ReadableArray,
    options: ReadableMap?,
    promise: Promise
  ) {
//    executorService.submit {
//      engineScope.launch {
//        try {
//          val messageList = mutableListOf<ChatCompletionMessage>()
//
//          for (i in 0 until messages.size()) {
//            val messageMap = messages.getMap(i)
//            val role = if (messageMap?.getString("role") == "user") OpenAIProtocol.ChatCompletionRole.user else OpenAIProtocol.ChatCompletionRole.assistant
//            val content = messageMap?.getString("content") ?: ""
//            messageList.add(ChatCompletionMessage(role, content))
//          }
//
//          val chatResponse = engine.chat.completions.create(
//            messages = messageList,
//            stream_options = OpenAIProtocol.StreamOptions(include_usage = true)
//          )
//          var finishReasonLength = false
//          var streamingText = ""
//
//          for (res in chatResponse) {
//            for (choice in res.choices) {
//              choice.delta.content?.let { content ->
//                streamingText = content.asText()
//              }
//              choice.finish_reason?.let { finishReason ->
//                if (finishReason == "length") {
//                  finishReasonLength = true
//                }
//              }
//            }
//
//            val event: WritableMap = Arguments.createMap().apply {
//              putString("content", streamingText)
//            }
//            sendEvent("onChatUpdate", event)
//
//            if (finishReasonLength) {
//              streamingText = " [output truncated due to context length limit...]"
//              val truncatedEvent: WritableMap = Arguments.createMap().apply {
//                putString("content", streamingText)
//              }
//              sendEvent("onChatUpdate", truncatedEvent)
//            }
//          }
//
//          val finalEvent: WritableMap = Arguments.createMap().apply {
//            putString("content", streamingText)
//          }
//          sendEvent("onChatComplete", finalEvent)
//
//          promise.resolve(null)
//        } catch (e: Exception) {
//          promise.reject("STREAMING_ERROR", "Error streaming text", e)
//        }
//      }
//    }
  }

  override fun cancelStream(streamId: String, promise: Promise) {
    TODO("Not yet implemented")
  }

  override fun downloadModel(instanceId: String, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val (modelRecord, modelDir) = getModelConfig(instanceId) ?: run {
          promise.reject("Model not found", "There's no record for requested model")
          return@launch
        }

        val modelDownloader = ModelDownloader(modelRecord.model_url, modelDir)
        modelDownloader.downloadModel { current, total ->
          val args: WritableMap = Arguments.createMap().apply {
            putDouble("percentage", kotlin.math.round(current.toDouble() / total * 100))
          }
          emitOnDownloadProgress(args)
        }

        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("MODEL_ERROR", e.message)
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
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("MODEL_ERROR", e.message)
    }
  }

  override fun prepareModel(instanceId: String, promise: Promise) {
    val (modelRecord, modelDir) = getModelConfig(instanceId) ?: run {
      promise.reject("Model not found", "Didn't find the model")
      return
    }

    engine.reload(modelDir.path, modelRecord.model_lib)
    promise.resolve(null)
  }

  override fun unloadModel(promise: Promise) {
    engine.unload()
    promise.resolve(null)
  }

  private fun getModelConfig(modelId: String): Pair<ModelRecord, File>? {
    val modelRecord = appConfig.model_list.find { it.model_id == modelId } ?: return null
    val modelDir = File(reactApplicationContext.getExternalFilesDir(""), modelRecord.model_id)
    return Pair(modelRecord, modelDir)
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
