package com.callstack.ai.android

import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.FunctionCall
import com.google.mlkit.genai.common.StreamingCallback
import com.google.mlkit.genai.prompt.Candidate
import com.google.mlkit.genai.prompt.Content
import com.google.mlkit.genai.prompt.Feature
import com.google.mlkit.genai.prompt.FunctionCallPart
import com.google.mlkit.genai.prompt.FunctionResponsePart
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.GenerateContentResponse
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.ImagePart
import com.google.mlkit.genai.prompt.ModelPreference
import com.google.mlkit.genai.prompt.ModelReleaseStage
import com.google.mlkit.genai.prompt.SystemInstruction
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import com.google.mlkit.genai.prompt.generationConfig
import com.google.mlkit.genai.prompt.modelConfig
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

private const val AICORE_PACKAGE = "com.google.android.aicore"

/** Gemini Nano model selection, see ML Kit `ModelConfig`. */
data class NanoConfig(
  val releaseStage: String? = null,
  val preference: String? = null,
) {
  companion object {
    fun from(map: ReadableMap?): NanoConfig =
      NanoConfig(
        releaseStage = map?.optString("releaseStage"),
        preference = map?.optString("preference"),
      )
  }
}

data class ModelInfo(
  val availability: String,
  val baseModelName: String? = null,
  val contextSize: Int? = null,
  val features: List<String>? = null,
)

data class GenerateResult(
  val text: String,
  val reasoning: String?,
  val functionCalls: List<FunctionCall>,
  val finishReason: String?,
)

/** Receives a streamed response as it is generated. */
interface StreamListener {
  fun onText(delta: String)
  fun onReasoning(delta: String)
  fun onFunctionCall(call: FunctionCall)
}

fun ReadableMap.optString(key: String): String? = if (hasKey(key) && !isNull(key)) getString(key) else null

fun availabilityOf(status: Int): String =
  when (status) {
    FeatureStatus.UNAVAILABLE -> "unavailable"
    FeatureStatus.DOWNLOADABLE -> "downloadable"
    FeatureStatus.DOWNLOADING -> "downloading"
    FeatureStatus.AVAILABLE -> "available"
    else -> "unknown"
  }

/** Runs Gemini Nano through ML Kit's Prompt API. */
class GeminiNano(
  private val context: Context,
  private val downloads: Downloads,
) {
  private val clients = ConcurrentHashMap<NanoConfig, GenerativeModel>()
  private val prepared = ConcurrentHashMap.newKeySet<NanoConfig>()
  private val prepareMutex = Mutex()
  // The last status seen per model selection, for the synchronous check
  private val statuses = ConcurrentHashMap<NanoConfig, Int>()

  private fun client(config: NanoConfig): GenerativeModel =
    clients.getOrPut(config) {
      if (config.releaseStage == null && config.preference == null) {
        Generation.getClient()
      } else {
        Generation.getClient(
          generationConfig {
            modelConfig = modelConfig {
              config.releaseStage?.let {
                releaseStage = if (it == "preview") ModelReleaseStage.PREVIEW else ModelReleaseStage.STABLE
              }
              config.preference?.let {
                preference = if (it == "fast") ModelPreference.FAST else ModelPreference.FULL
              }
            }
          },
        )
      }
    }

  /**
   * Whether Gemini Nano is available or downloadable, answered without async work: from the last
   * status this process saw, or else from whether AICore is installed.
   */
  fun isAvailable(config: NanoConfig): Boolean {
    statuses[config]?.let {
      return it == FeatureStatus.AVAILABLE || it == FeatureStatus.DOWNLOADABLE
    }
    return try {
      context.packageManager.getPackageInfo(AICORE_PACKAGE, 0)
      true
    } catch (_: PackageManager.NameNotFoundException) {
      false
    }
  }

  suspend fun getModelInfo(config: NanoConfig): ModelInfo {
    val model = client(config)
    val status =
      try {
        model.checkStatus()
      } catch (_: Exception) {
        return ModelInfo(availability = "unknown")
      }
    statuses[config] = status
    if (status != FeatureStatus.AVAILABLE) {
      return ModelInfo(availability = availabilityOf(status))
    }

    return ModelInfo(
      availability = "available",
      baseModelName = runCatching { model.getBaseModelName() }.getOrNull(),
      contextSize = runCatching { model.getTokenLimit() }.getOrNull(),
      features = runCatching { model.getAvailableFeatures().mapNotNull(::featureName) }.getOrNull(),
    )
  }

  private fun featureName(feature: Int): String? =
    when (feature) {
      Feature.SYSTEM_PROMPT -> "systemPrompt"
      Feature.THINKING_MODE -> "thinking"
      Feature.PREFIX_CACHING -> "prefixCaching"
      Feature.STRUCTURED_OUTPUT -> "structuredOutput"
      Feature.FUNCTION_CALLING -> "functionCalling"
      else -> null
    }

  /** Downloads Gemini Nano when needed, reporting progress, then warms it up. */
  suspend fun prepare(config: NanoConfig) {
    prepareMutex.withLock {
      if (config in prepared) return

      val model = client(config)
      val status = model.checkStatus()
      statuses[config] = status
      when (status) {
        FeatureStatus.UNAVAILABLE ->
          throw AndroidAIErrors.CodedException(
            AndroidAIErrors.MODEL_UNAVAILABLE,
            "Gemini Nano is not supported on this device or the device has not fetched the latest configuration to support it",
          )
        FeatureStatus.DOWNLOADABLE, FeatureStatus.DOWNLOADING ->
          downloads.collect("language", "Gemini Nano", status, model.download())
      }
      model.warmup()
      prepared.add(config)
      statuses[config] = FeatureStatus.AVAILABLE
    }
  }

  private suspend fun preparedClient(config: NanoConfig): GenerativeModel {
    prepare(config)
    return client(config)
  }

  suspend fun countTokens(text: String, config: NanoConfig): Int =
    preparedClient(config).countTokens(generateContentRequest(TextPart(text)) {}).totalTokens

  suspend fun generate(request: ReadableMap): GenerateResult {
    val config = NanoConfig.from(request.getMap("model"))
    val response = preparedClient(config).generateContent(buildRequest(request))
    return result(response, response.candidates.firstOrNull()?.functionCalls.orEmpty())
  }

  suspend fun stream(request: ReadableMap, listener: StreamListener): GenerateResult {
    val config = NanoConfig.from(request.getMap("model"))
    val streamedCalls = mutableListOf<FunctionCall>()
    val callback = object : StreamingCallback {
      override fun onNewText(text: String) = listener.onText(text)

      override fun onNewThought(thought: String) = listener.onReasoning(thought)

      override fun onNewFunctionCall(functionCall: FunctionCall) {
        streamedCalls.add(functionCall)
        listener.onFunctionCall(functionCall)
      }
    }
    val response = preparedClient(config).generateContent(buildRequest(request), callback)
    // Calls arrive through the callback or with the final response
    val finalCalls = response.candidates.firstOrNull()?.functionCalls.orEmpty()
      .filter { call -> streamedCalls.none { it.id == call.id && it.name == call.name } }
    finalCalls.forEach(listener::onFunctionCall)
    return result(response, streamedCalls + finalCalls)
  }

  private fun result(response: GenerateContentResponse, functionCalls: List<FunctionCall>): GenerateResult {
    val candidate = response.candidates.firstOrNull()
    return GenerateResult(
      text = candidate?.text.orEmpty(),
      reasoning = response.thoughtProcess.joinToString("") { it.text.orEmpty() }.takeIf { it.isNotEmpty() },
      functionCalls = functionCalls,
      finishReason = candidate?.finishReason?.let(::finishReasonName),
    )
  }

  private fun finishReasonName(reason: Int): String =
    when (reason) {
      Candidate.FinishReason.STOP -> "STOP"
      Candidate.FinishReason.MAX_TOKENS -> "MAX_TOKENS"
      else -> "OTHER"
    }

  private fun buildRequest(request: ReadableMap): GenerateContentRequest {
    val contents = request.getArray("messages")?.let(::contents).orEmpty()
    if (contents.isEmpty()) {
      throw AndroidAIErrors.CodedException(AndroidAIErrors.INVALID_MESSAGE, "The prompt has no messages")
    }
    val tools = request.getArray("tools")?.let { tools ->
      List(tools.size()) { index ->
        val tool = tools.getMap(index)!!
        FunctionJson.declaration(
          tool.getString("name")!!,
          tool.getString("description").orEmpty(),
          tool.getString("parameters")!!,
        )
      }
    }

    return GenerateContentRequest.Builder(contents)
      .apply {
        request.optString("systemInstruction")?.let { systemInstruction = SystemInstruction(it) }
        if (request.hasKey("temperature")) temperature = request.getDouble("temperature").toFloat()
        if (request.hasKey("topK")) topK = request.getInt("topK")
        if (request.hasKey("seed")) seed = request.getInt("seed")
        if (request.hasKey("maxOutputTokens")) maxOutputTokens = request.getInt("maxOutputTokens")
        if (request.hasKey("enableThinking")) enableThinking = request.getBoolean("enableThinking")
        if (!tools.isNullOrEmpty()) setTools(tools)
      }
      .build()
  }

  private fun contents(messages: ReadableArray): List<Content> =
    List(messages.size()) { index ->
      val message = messages.getMap(index)!!
      val parts = message.getArray("parts")!!
      Content.builder()
        .role(if (message.getString("role") == "model") Content.Role.MODEL else Content.Role.USER)
        .apply { for (part in 0 until parts.size()) addPart(part(parts.getMap(part)!!)) }
        .build()
    }

  private fun part(part: ReadableMap) =
    when (val type = part.getString("type")) {
      "text" -> TextPart(part.getString("text").orEmpty())
      "image" ->
        part.optString("uri")?.let { ImagePart(Uri.parse(it)) }
          ?: ImagePart(Base64.decode(part.getString("data"), Base64.DEFAULT))
      "functionCall" ->
        FunctionCallPart(
          FunctionCall(
            part.getString("name")!!,
            FunctionJson.argumentsFromJson(JSONObject(part.optString("json") ?: "{}")),
            part.optString("id").orEmpty(),
          ),
        )
      "functionResponse" ->
        FunctionResponsePart(
          part.optString("id").orEmpty(),
          part.getString("name")!!,
          FunctionJson.toMap(JSONObject(part.optString("json") ?: "{}")),
        )
      else -> throw AndroidAIErrors.CodedException(AndroidAIErrors.INVALID_MESSAGE, "Unknown message part: $type")
    }
}
