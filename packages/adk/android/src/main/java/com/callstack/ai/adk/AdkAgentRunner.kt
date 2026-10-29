package com.callstack.ai.adk

import android.content.Context
import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.google.adk.kt.agents.Instruction
import com.google.adk.kt.agents.LlmAgent
import com.google.adk.kt.agents.RunConfig
import com.google.adk.kt.agents.StreamingMode
import com.google.adk.kt.events.Event
import com.google.adk.kt.mlkit.GenaiPrompt
import com.google.adk.kt.models.Gemini
import com.google.adk.kt.models.Model
import com.google.adk.kt.runners.InMemoryRunner
import com.google.adk.kt.sessions.InMemorySessionService
import com.google.adk.kt.sessions.SessionKey
import com.google.adk.kt.types.Blob
import com.google.adk.kt.types.Content
import com.google.adk.kt.types.GenerateContentConfig
import com.google.adk.kt.types.Part
import com.google.adk.kt.types.Role
import com.google.adk.kt.types.ThinkingConfig
import com.google.adk.kt.types.UsageMetadata
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.ModelPreference
import com.google.mlkit.genai.prompt.ModelReleaseStage
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import com.google.mlkit.genai.prompt.generationConfig
import com.google.mlkit.genai.prompt.modelConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class AdkToolCallRecord(val toolCallId: String, val toolName: String, val input: String)

data class AdkToolResultRecord(val toolCallId: String, val toolName: String, val output: String)

data class AdkRunResult(
  val content: String,
  val reasoning: String?,
  val toolCalls: List<AdkToolCallRecord>,
  val toolResults: List<AdkToolResultRecord>,
  val finishReason: String?,
  val usage: UsageMetadata?,
)

data class AdkModelInfo(
  val availability: String,
  val baseModelName: String? = null,
  val contextSize: Int? = null,
)

/** Gemini Nano model selection, see ML Kit `ModelConfig`. */
data class NanoConfig(
  val releaseStage: String? = null,
  val preference: String? = null,
) {
  companion object {
    fun from(map: ReadableMap?): NanoConfig =
      NanoConfig(
        releaseStage = map?.getString("releaseStage"),
        preference = map?.getString("preference"),
      )
  }
}

fun Part.isThought(): Boolean = thought == true

fun Event.textParts(thoughts: Boolean): String =
  content?.parts?.filter { it.isThought() == thoughts }?.mapNotNull { it.text }?.joinToString("")
    ?: ""

class AdkAgentRunner(
  private val context: Context,
  private val onToolCall: (
    runId: String,
    toolCallId: String,
    toolName: String,
    arguments: String,
  ) -> Unit,
  private val onDownloadProgress: (
    phase: String,
    bytesDownloaded: Long?,
    bytesToDownload: Long?,
  ) -> Unit,
) {
  private val nanoModels = ConcurrentHashMap<NanoConfig, GenerativeModel>()
  private val nanoPrepareMutex = Mutex()

  private fun nanoClient(config: NanoConfig): GenerativeModel {
    if (config.releaseStage == null && config.preference == null) {
      return Generation.getClient()
    }

    return Generation.getClient(
      generationConfig {
        modelConfig = modelConfig {
          config.releaseStage?.let {
            releaseStage =
              if (it == "preview") ModelReleaseStage.PREVIEW else ModelReleaseStage.STABLE
          }
          config.preference?.let {
            preference = if (it == "fast") ModelPreference.FAST else ModelPreference.FULL
          }
        }
      },
    )
  }

  /** Downloads Gemini Nano when needed, reporting progress, then warms it up. */
  suspend fun prepareNano(config: NanoConfig) {
    nanoPrepareMutex.withLock {
      if (nanoModels.containsKey(config)) return

      val model = nanoClient(config)
      when (val status = model.checkStatus()) {
        FeatureStatus.UNAVAILABLE ->
          throw AdkErrors.AdkException(
            AdkErrors.MODEL_UNAVAILABLE,
            "Gemini Nano is not supported on this device or the device has not fetched the latest configuration to support it",
          )
        FeatureStatus.DOWNLOADABLE, FeatureStatus.DOWNLOADING -> download(model, status)
      }
      model.warmup()
      nanoModels[config] = model
    }
  }

  private suspend fun download(model: GenerativeModel, status: Int) {
    try {
      model.download().collect { downloadStatus ->
        when (downloadStatus) {
          is DownloadStatus.DownloadStarted ->
            onDownloadProgress("started", 0, downloadStatus.bytesToDownload)
          is DownloadStatus.DownloadProgress ->
            onDownloadProgress("progress", downloadStatus.totalBytesDownloaded, null)
          is DownloadStatus.DownloadCompleted -> onDownloadProgress("completed", null, null)
          is DownloadStatus.DownloadFailed ->
            throw AdkErrors.AdkException(
              AdkErrors.DOWNLOAD_FAILED,
              "Gemini Nano download failed: ${downloadStatus.e.message}",
              downloadStatus.e,
            )
        }
      }
    } catch (error: GenAiException) {
      if (status == FeatureStatus.DOWNLOADING) {
        throw AdkErrors.AdkException(
          AdkErrors.MODEL_DOWNLOADING,
          "Gemini Nano is still downloading",
          error,
        )
      }
      throw error
    }
  }

  private suspend fun preparedNano(config: NanoConfig): GenerativeModel {
    nanoModels[config]?.let { return it }
    prepareNano(config)
    return nanoModels.getValue(config)
  }

  suspend fun getModelInfo(modelType: String, config: NanoConfig): AdkModelInfo {
    if (modelType != "genai-nano") {
      return AdkModelInfo(availability = "available")
    }

    val model = nanoClient(config)
    val status =
      try {
        model.checkStatus()
      } catch (_: Exception) {
        return AdkModelInfo(availability = "unknown")
      }

    return when (status) {
      FeatureStatus.UNAVAILABLE -> AdkModelInfo(availability = "unavailable")
      FeatureStatus.DOWNLOADABLE -> AdkModelInfo(availability = "downloadable")
      FeatureStatus.DOWNLOADING -> AdkModelInfo(availability = "downloading")
      FeatureStatus.AVAILABLE ->
        AdkModelInfo(
          availability = "available",
          baseModelName = runCatching { model.getBaseModelName() }.getOrNull(),
          contextSize = runCatching { model.getTokenLimit() }.getOrNull(),
        )
      else -> AdkModelInfo(availability = "unknown")
    }
  }

  suspend fun countTokens(text: String, config: NanoConfig): Int =
    preparedNano(config).countTokens(generateContentRequest(TextPart(text)) {}).totalTokens

  suspend fun generateText(
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
    tools: ReadableArray?,
    runId: String,
  ): AdkRunResult {
    val events = runAgent(messages, config, options, tools, stream = false, runId = runId).toList()
    val completeEvents = events.filterNot { it.partial }
    val text =
      completeEvents
        .lastOrNull { it.isFinalResponse }
        ?.textParts(thoughts = false)
        ?.takeIf { it.isNotEmpty() }
        ?: completeEvents.joinToString("") { it.textParts(thoughts = false) }
    val reasoning =
      completeEvents
        .map { it.textParts(thoughts = true) }
        .filter { it.isNotEmpty() }
        .joinToString("\n\n")
        .ifEmpty { null }

    val toolCalls =
      completeEvents.flatMap { event ->
        event.functionCalls().map { call ->
          AdkToolCallRecord(
            toolCallId = call.id ?: UUID.randomUUID().toString(),
            toolName = call.name,
            input = AdkJson.encode(call.args),
          )
        }
      }
    val toolResults =
      completeEvents.flatMap { event ->
        event.functionResponses().map { response ->
          AdkToolResultRecord(
            toolCallId = response.id ?: "",
            toolName = response.name,
            output = AdkJson.encode(response.response),
          )
        }
      }

    return AdkRunResult(
      content = text,
      reasoning = reasoning,
      toolCalls = toolCalls,
      toolResults = toolResults,
      finishReason = events.lastOrNull()?.finishReason?.name,
      usage = AdkUsage.fromEvents(events),
    )
  }

  suspend fun streamText(
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
    tools: ReadableArray?,
    runId: String,
  ): Flow<Event> {
    return runAgent(messages, config, options, tools, stream = true, runId = runId)
  }

  private suspend fun runAgent(
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
    tools: ReadableArray?,
    stream: Boolean,
    runId: String,
  ): Flow<Event> {
    val parsedMessages = parseMessages(messages)
    val agentConfig = parseAgentConfig(config)
    val agentTools = parseTools(tools, runId)
    val model = createModel(agentConfig)
    val generateContentConfig = parseGenerationConfig(options)
    val instructionText =
      if (agentConfig.modelType == "genai-nano") {
        buildInstruction(agentConfig.instruction, agentTools)
      } else {
        agentConfig.instruction
      }

    val agent = LlmAgent(
      name = agentConfig.name,
      description = agentConfig.description,
      model = model,
      instruction = instructionText?.let { Instruction(it) },
      tools = agentTools,
      generateContentConfig = generateContentConfig,
    )

    val sessionService = InMemorySessionService()
    val runner = InMemoryRunner(
      agent = agent,
      appName = "react-native-ai-adk",
      sessionService = sessionService,
    )

    val userId = "react-native-ai"
    val sessionId = UUID.randomUUID().toString()
    val sessionKey = SessionKey("react-native-ai-adk", userId, sessionId)
    sessionService.createSession(sessionKey)

    val history = parsedMessages.dropLast(1)
    val lastMessage = parsedMessages.last()

    val session = sessionService.getSession(sessionKey)
      ?: throw IllegalStateException("Failed to create ADK session")

    for (message in history) {
      val author = if (message.role == Role.USER) Role.USER else agent.name
      val event = Event(
        author = author,
        content = message.content,
      )
      sessionService.appendEvent(session, event)
    }

    return runner.runAsync(
      userId = userId,
      sessionId = sessionId,
      newMessage = lastMessage.content,
      runConfig = RunConfig(streamingMode = if (stream) StreamingMode.SSE else StreamingMode.NONE),
    )
  }

  private suspend fun createModel(config: AgentConfig): Model {
    return when (config.modelType) {
      "genai-nano" ->
        NanoFunctionCallingModel(
          GenaiPrompt.create(NanoSingleTextPrompt(preparedNano(config.nano)), config.modelName),
        )
      else -> Gemini(name = config.modelName, apiKey = config.apiKey)
    }
  }

  private fun parseGenerationConfig(options: ReadableMap?): GenerateContentConfig? {
    if (options == null) return null

    val responseFormat = options.getMap("responseFormat")
    val responseSchema =
      responseFormat?.getMap("schema")?.let { schema ->
        try {
          AdkSchema.fromReadableMap(schema)
        } catch (error: Exception) {
          throw AdkErrors.AdkException(
            AdkErrors.INVALID_SCHEMA,
            "Unsupported response schema: ${error.message}",
            error,
          )
        }
      }

    val responseMimeType = when {
      responseFormat?.hasKey("mimeType") == true -> responseFormat.getString("mimeType")
      responseFormat?.getString("type") == "json" -> "application/json"
      else -> null
    }

    val thinkingConfig =
      options.getMap("thinking")?.let { thinking ->
        ThinkingConfig(
          includeThoughts = thinking.hasKey("includeThoughts") && thinking.getBoolean("includeThoughts"),
          thinkingBudget = thinking.takeIf { it.hasKey("budget") }?.getDouble("budget")?.toInt(),
        )
      }

    return GenerateContentConfig(
      temperature = options.takeIf { it.hasKey("temperature") }?.getDouble("temperature")?.toFloat(),
      maxOutputTokens = options.takeIf { it.hasKey("maxTokens") }?.getInt("maxTokens"),
      topP = options.takeIf { it.hasKey("topP") }?.getDouble("topP")?.toFloat(),
      topK = options.takeIf { it.hasKey("topK") }?.getDouble("topK")?.toFloat()?.toInt(),
      seed = options.takeIf { it.hasKey("seed") }?.getDouble("seed")?.toInt(),
      stopSequences =
        options.getArray("stopSequences")?.let { array ->
          (0 until array.size()).mapNotNull { index -> array.getString(index) }
        },
      presencePenalty =
        options.takeIf { it.hasKey("presencePenalty") }?.getDouble("presencePenalty")?.toFloat(),
      frequencyPenalty =
        options.takeIf { it.hasKey("frequencyPenalty") }?.getDouble("frequencyPenalty")?.toFloat(),
      responseMimeType = responseMimeType,
      responseSchema = responseSchema,
      thinkingConfig = thinkingConfig,
    )
  }

  private fun parseMessages(messages: ReadableArray): List<ParsedMessage> {
    if (messages.size() == 0) {
      throw IllegalArgumentException("At least one message is required")
    }

    val parsed = mutableListOf<ParsedMessage>()
    for (index in 0 until messages.size()) {
      val message = messages.getMap(index) ?: continue
      val role = when (message.getString("role")) {
        "assistant" -> Role.MODEL
        "user" -> Role.USER
        else -> throw IllegalArgumentException(
          "Unsupported message role: ${message.getString("role")}",
        )
      }

      val partsArray = message.getArray("parts")
      val content = if (partsArray != null) {
        parseContentParts(role, partsArray)
      } else {
        Content.fromText(role, message.getString("content") ?: "")
      }

      parsed.add(ParsedMessage(role = role, content = content))
    }
    return parsed
  }

  private fun parseContentParts(role: ContentRole, partsArray: ReadableArray): Content {
    val parts = mutableListOf<Part>()
    for (index in 0 until partsArray.size()) {
      val part = partsArray.getMap(index) ?: continue
      when (part.getString("type")) {
        "text" -> part.getString("text")?.let { parts.add(Part(text = it)) }
        "file" -> {
          val mimeType = part.getString("mimeType") ?: "application/octet-stream"
          val bytes = part.getString("data")?.let { Base64.decode(it, Base64.DEFAULT) }
            ?: part.getString("uri")?.let { readUri(it) }
            ?: continue
          parts.add(Part(inlineData = Blob(mimeType = mimeType, data = bytes)))
        }
      }
    }

    if (parts.isEmpty()) {
      return Content.fromText(role, "")
    }

    return Content(role = role, parts = parts)
  }

  private fun readUri(uri: String): ByteArray =
    context.contentResolver.openInputStream(Uri.parse(uri))?.use { it.readBytes() }
      ?: throw IllegalArgumentException("Cannot read file: $uri")

  private fun parseTools(tools: ReadableArray?, runId: String): List<ReactNativeFunctionTool> {
    if (tools == null) return emptyList()

    val parsed = mutableListOf<ReactNativeFunctionTool>()
    for (index in 0 until tools.size()) {
      val tool = tools.getMap(index) ?: continue
      val name = tool.getString("name") ?: continue
      val parameterSchema =
        tool.getMap("inputSchema")?.let { schemaMap ->
          try {
            AdkSchema.fromReadableMap(schemaMap)
          } catch (error: Exception) {
            throw AdkErrors.AdkException(
              AdkErrors.INVALID_SCHEMA,
              "Unsupported input schema for tool $name: ${error.message}",
              error,
            )
          }
        }

      parsed.add(
        ReactNativeFunctionTool(
          name = name,
          description = tool.getString("description") ?: "",
          parameterSchema = parameterSchema,
          runId = runId,
          onToolCall = onToolCall,
        )
      )
    }

    return parsed
  }

  /** Gemini Nano has no native function calling, so its tools are described in the instruction. */
  private fun buildInstruction(
    baseInstruction: String?,
    tools: List<ReactNativeFunctionTool>,
  ): String? {
    if (tools.isEmpty()) {
      return baseInstruction
    }

    val toolGuidance =
      "You have access to the following tools. Use them when they help answer the user:\n" +
        tools.joinToString("\n") { it.promptDescription() } +
        "\n\nTo call a tool, reply with only a tool_code block with one call per line. " +
        "Pass the arguments as a JSON object, and call a tool without parameters with " +
        "empty parentheses. For example:\n" +
        "```tool_code\ntool_name({\"parameter\": \"value\"})\n```"

    return if (baseInstruction.isNullOrBlank()) {
      toolGuidance
    } else {
      "$baseInstruction\n\n$toolGuidance"
    }
  }

  // JS always sends the name and model, with defaults applied
  private fun parseAgentConfig(config: ReadableMap): AgentConfig {
    fun ReadableMap.require(key: String) =
      getString(key) ?: throw IllegalArgumentException("Agent config requires $key")

    val model = config.getMap("model")
      ?: throw IllegalArgumentException("Agent config requires a model")

    return AgentConfig(
      name = config.require("name"),
      description = config.getString("description") ?: "",
      instruction = config.getString("instruction"),
      modelType = model.require("type"),
      modelName = model.require("name"),
      apiKey = model.getString("apiKey"),
      nano = NanoConfig.from(model.getMap("nano")),
    )
  }
}

data class AgentConfig(
  val name: String,
  val description: String,
  val instruction: String?,
  val modelType: String,
  val modelName: String,
  val apiKey: String?,
  val nano: NanoConfig,
)

/** ADK content role, [Role.USER] or [Role.MODEL]. */
private typealias ContentRole = String

data class ParsedMessage(
  val role: ContentRole,
  val content: Content,
)
