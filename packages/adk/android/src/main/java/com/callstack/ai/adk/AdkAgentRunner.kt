package com.callstack.ai.adk

import android.content.Context
import android.content.pm.PackageManager
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

private const val AICORE_PACKAGE = "com.google.android.aicore"

data class AdkRunResult(
  val content: String,
  val reasoning: String?,
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
  private val onDownloadProgress: (
    phase: String,
    bytesDownloaded: Long?,
    bytesToDownload: Long?,
  ) -> Unit,
) {
  private val nanoModels = ConcurrentHashMap<NanoConfig, GenerativeModel>()
  private val nanoPrepareMutex = Mutex()
  // The last Gemini Nano status seen per model selection, for the synchronous check
  private val nanoStatuses = ConcurrentHashMap<NanoConfig, Int>()

  /**
   * Whether Gemini Nano is available or downloadable, answered without async work: from the last
   * status this process saw, or else from whether AICore is installed.
   */
  fun isNanoAvailable(config: NanoConfig): Boolean {
    // The latest status wins over a model prepared earlier, which may have gone away since
    nanoStatuses[config]?.let {
      return it == FeatureStatus.AVAILABLE || it == FeatureStatus.DOWNLOADABLE
    }
    if (nanoModels.containsKey(config)) return true
    return try {
      context.packageManager.getPackageInfo(AICORE_PACKAGE, 0)
      true
    } catch (_: PackageManager.NameNotFoundException) {
      false
    }
  }

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
      val status = model.checkStatus()
      nanoStatuses[config] = status
      when (status) {
        FeatureStatus.UNAVAILABLE ->
          throw AdkErrors.AdkException(
            AdkErrors.MODEL_UNAVAILABLE,
            "Gemini Nano is not supported on this device or the device has not fetched the latest configuration to support it",
          )
        FeatureStatus.DOWNLOADABLE, FeatureStatus.DOWNLOADING -> download(model, status)
      }
      model.warmup()
      nanoModels[config] = model
      nanoStatuses[config] = FeatureStatus.AVAILABLE
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

  suspend fun getModelInfo(config: NanoConfig): AdkModelInfo {
    val model = nanoClient(config)
    val status =
      try {
        model.checkStatus()
      } catch (_: Exception) {
        return AdkModelInfo(availability = "unknown")
      }
    nanoStatuses[config] = status

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
  ): AdkRunResult {
    val events = runAgent(messages, config, options, stream = false).toList()
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

    return AdkRunResult(
      content = text,
      reasoning = reasoning,
      finishReason = events.lastOrNull()?.finishReason?.name,
      usage = AdkUsage.fromEvents(events),
    )
  }

  suspend fun streamText(
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
  ): Flow<Event> {
    return runAgent(messages, config, options, stream = true)
  }

  private suspend fun runAgent(
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
    stream: Boolean,
  ): Flow<Event> {
    val parsedMessages = parseMessages(messages)
    val agentConfig = parseAgentConfig(config)
    val agent = LlmAgent(
      name = agentConfig.name,
      description = agentConfig.description,
      model = GenaiPrompt.create(NanoSingleTextPrompt(preparedNano(agentConfig.nano))),
      instruction = agentConfig.instruction?.let { Instruction(it) },
      generateContentConfig = parseGenerationConfig(options),
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

  /** ADK's ML Kit model passes on temperature, topK, maxOutputTokens and thinking. */
  private fun parseGenerationConfig(options: ReadableMap?): GenerateContentConfig? {
    if (options == null) return null

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
      topK = options.takeIf { it.hasKey("topK") }?.getDouble("topK")?.toFloat()?.toInt(),
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

  // JS always sends the name, with defaults applied
  private fun parseAgentConfig(config: ReadableMap): AgentConfig =
    AgentConfig(
      name = config.getString("name")
        ?: throw IllegalArgumentException("Agent config requires a name"),
      description = config.getString("description") ?: "",
      instruction = config.getString("instruction"),
      nano = NanoConfig.from(config.getMap("nano")),
    )
}

data class AgentConfig(
  val name: String,
  val description: String,
  val instruction: String?,
  val nano: NanoConfig,
)

/** ADK content role, [Role.USER] or [Role.MODEL]. */
private typealias ContentRole = String

data class ParsedMessage(
  val role: ContentRole,
  val content: Content,
)
