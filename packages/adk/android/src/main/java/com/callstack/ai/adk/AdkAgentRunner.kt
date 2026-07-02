package com.callstack.ai.adk

import android.util.Base64
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.google.adk.kt.agents.Instruction
import com.google.adk.kt.agents.LlmAgent
import com.google.adk.kt.events.Event
import com.google.adk.kt.models.Gemini
import com.google.adk.kt.models.Model
import com.google.adk.kt.models.mlkit.GenaiPrompt
import com.google.adk.kt.runners.InMemoryRunner
import com.google.adk.kt.sessions.InMemorySessionService
import com.google.adk.kt.sessions.SessionKey
import com.google.adk.kt.types.Blob
import com.google.adk.kt.types.Content
import com.google.adk.kt.types.GenerateContentConfig
import com.google.adk.kt.types.Part
import com.google.adk.kt.types.Role
import com.google.adk.kt.types.UsageMetadata
import com.google.adk.kt.utils.mlkit.GenerativeModelHelpers
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

data class AdkRunResult(
  val content: String,
  val finishReason: String?,
  val usage: UsageMetadata?,
)

class AdkAgentRunner(
  private val onToolCall: (
    toolCallId: String,
    toolId: String,
    arguments: String,
    scope: ToolCallScope?,
  ) -> Unit,
) {
  private var generativeModel: GenerativeModel? = null
  private val nanoPrepareMutex = Mutex()

  suspend fun prepareNano() {
    if (!isNanoSupported()) {
      throw IllegalStateException(
        "Gemini Nano is not supported on this device or device hasn't fetched the latest configuration to support it",
      )
    }
    nanoPrepareMutex.withLock {
      generativeModel = GenerativeModelHelpers.initGenerativeModel()
    }
  }

  private suspend fun ensureNanoPrepared() {
    if (generativeModel != null) {
      return
    }
    prepareNano()
  }

  /**
   * Whether this device supports on-device Gemini Nano at all (ML Kit checkStatus != 0).
   * Does not download models or run full initialization.
   */
  suspend fun isNanoSupported(): Boolean {
    return try {
      when (Generation.getClient().checkStatus()) {
        0 -> false
        else -> true
      }
    } catch (_: Exception) {
      false
    }
  }

  /**
   * Whether Gemini Nano is ready to use now (downloaded or ready to download).
   * Returns false when [isNanoSupported] is false.
   */
  suspend fun isNanoAvailable(): Boolean {
    if (!isNanoSupported()) {
      return false
    }

    return try {
      when (Generation.getClient().checkStatus()) {
        1, 3 -> true
        else -> false
      }
    } catch (_: Exception) {
      false
    }
  }

  suspend fun generateText(
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
    tools: ReadableArray?,
    runId: String,
  ): AdkRunResult {
    val events = runAgent(messages, config, options, tools, stream = false, runId = runId).toList()
    val text =
      events
        .lastOrNull { it.isFinalResponse && !it.partial }
        ?.content
        ?.parts
        ?.mapNotNull { it.text }
        ?.joinToString("")
        ?.takeIf { it.isNotEmpty() }
        ?: events
          .flatMap { event -> event.content?.parts?.mapNotNull { it.text } ?: emptyList() }
          .joinToString("")

    val finishReason = events.lastOrNull()?.finishReason?.name
    val usage = AdkUsage.latestFromEvents(events)
    return AdkRunResult(content = text, finishReason = finishReason, usage = usage)
  }

  suspend fun streamText(
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
    tools: ReadableArray?,
    streamId: String,
  ): Flow<Event> {
    return runAgent(messages, config, options, tools, stream = true, streamId = streamId)
  }

  private suspend fun runAgent(
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
    tools: ReadableArray?,
    stream: Boolean,
    streamId: String? = null,
    runId: String? = null,
  ): Flow<Event> {
    val parsedMessages = parseMessages(messages)
    val agentConfig = parseAgentConfig(config)
    val toolCallScope = when {
      stream && streamId != null -> ToolCallScope(streamId = streamId)
      !stream && runId != null -> ToolCallScope(runId = runId)
      else -> null
    }
    val agentTools = parseTools(tools, toolCallScope)
    val model = createModel(agentConfig)
    val generateContentConfig = parseGenerationConfig(options)

    val agent = LlmAgent(
      name = agentConfig.name,
      description = agentConfig.description,
      model = model,
      instruction = agentConfig.instruction?.let { Instruction(it) },
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
      runConfig = com.google.adk.kt.agents.RunConfig(streamingMode = if (stream) {
        com.google.adk.kt.agents.StreamingMode.SSE
      } else {
        com.google.adk.kt.agents.StreamingMode.NONE
      }),
    )
  }

  private suspend fun createModel(config: AgentConfig): Model {
    return when (config.modelType) {
      "genai-nano" -> {
        ensureNanoPrepared()
        val model = generativeModel
          ?: throw IllegalStateException("Failed to initialize Gemini Nano")
        GenaiPrompt.create(model, config.modelName)
      }
      else -> Gemini(name = config.modelName, apiKey = config.apiKey)
    }
  }

  private fun parseAgentConfig(config: ReadableMap): AgentConfig =
    parseAgentConfigStatic(config)

  private fun parseGenerationConfig(options: ReadableMap?): GenerateContentConfig? {
    if (options == null) return null

    val responseFormat = options.getMap("responseFormat")
    if (responseFormat?.hasKey("schema") == true) {
      throw IllegalArgumentException(
        "ADK GenerateContentConfig does not support responseFormat.schema yet",
      )
    }

    val responseMimeType = when {
      responseFormat?.hasKey("mimeType") == true -> responseFormat.getString("mimeType")
      responseFormat?.getString("type") == "json" -> "application/json"
      else -> null
    }
    return GenerateContentConfig(
      temperature = options.takeIf { it.hasKey("temperature") }?.getDouble("temperature")?.toFloat(),
      maxOutputTokens = options.takeIf { it.hasKey("maxTokens") }?.getInt("maxTokens"),
      topP = options.takeIf { it.hasKey("topP") }?.getDouble("topP")?.toFloat(),
      topK = options.takeIf { it.hasKey("topK") }?.getDouble("topK")?.toFloat()?.toInt(),
      responseMimeType = responseMimeType,
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
        "system" -> Role.SYSTEM
        "user", "tool" -> Role.USER
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
          val data = part.getString("data") ?: continue
          val mimeType = part.getString("mimeType") ?: "application/octet-stream"
          val bytes = Base64.decode(data, Base64.DEFAULT)
          parts.add(Part(inlineData = Blob(mimeType = mimeType, data = bytes)))
        }
      }
    }

    if (parts.isEmpty()) {
      return Content.fromText(role, "")
    }

    return Content(role = role, parts = parts)
  }

  private fun parseTools(tools: ReadableArray?, toolCallScope: ToolCallScope?): List<ReactNativeFunctionTool> {
    if (tools == null) return emptyList()

    val parsed = mutableListOf<ReactNativeFunctionTool>()
    for (index in 0 until tools.size()) {
      val tool = tools.getMap(index) ?: continue
      val parametersArray = tool.getArray("parameters")
      val parameters = mutableListOf<ToolParameterSpec>()

      if (parametersArray != null) {
        for (paramIndex in 0 until parametersArray.size()) {
          val parameter = parametersArray.getMap(paramIndex) ?: continue
          parameters.add(
            ToolParameterSpec(
              name = parameter.getString("name") ?: continue,
              description = parameter.getString("description"),
              type = parseParameterType(parameter.getString("type")),
              required = parameter.hasKey("required") && parameter.getBoolean("required"),
            )
          )
        }
      }

      parsed.add(
        ReactNativeFunctionTool(
          toolId = tool.getString("id") ?: UUID.randomUUID().toString(),
          name = tool.getString("name") ?: continue,
          description = tool.getString("description") ?: "",
          parameters = parameters,
          toolCallScope = toolCallScope,
          onToolCall = onToolCall,
        )
      )
    }

    return parsed
  }

  private fun parseParameterType(type: String?): com.google.adk.kt.types.Type {
    return when (type) {
      "number", "integer" -> com.google.adk.kt.types.Type.NUMBER
      "boolean" -> com.google.adk.kt.types.Type.BOOLEAN
      "array" -> com.google.adk.kt.types.Type.ARRAY
      "object" -> com.google.adk.kt.types.Type.OBJECT
      else -> com.google.adk.kt.types.Type.STRING
    }
  }

  companion object {
    fun parseAgentConfig(config: ReadableMap): AgentConfig = parseAgentConfigStatic(config)

    private fun parseAgentConfigStatic(config: ReadableMap): AgentConfig {
      val model = config.getMap("model")
        ?: throw IllegalArgumentException("Agent config requires a model")

      return AgentConfig(
        name = config.getString("name") ?: "react_native_adk_agent",
        description = config.getString("description") ?: "",
        instruction = config.getString("instruction"),
        modelType = model.getString("type") ?: "gemini",
        modelName = model.getString("name") ?: "gemini-2.5-flash",
        apiKey = model.getString("apiKey"),
      )
    }
  }
}

data class AgentConfig(
  val name: String,
  val description: String,
  val instruction: String?,
  val modelType: String,
  val modelName: String,
  val apiKey: String?,
)

/** ADK content role — one of [Role.USER], [Role.MODEL], or [Role.SYSTEM]. */
private typealias ContentRole = String

data class ParsedMessage(
  val role: ContentRole,
  val content: Content,
)

data class ToolCallScope(
  val streamId: String? = null,
  val runId: String? = null,
)
