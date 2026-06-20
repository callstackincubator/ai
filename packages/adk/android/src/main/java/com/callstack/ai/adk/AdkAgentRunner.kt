package com.callstack.ai.adk

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
import com.google.adk.kt.types.Content
import com.google.adk.kt.types.GenerateContentConfig
import com.google.adk.kt.types.Role
import com.google.adk.kt.utils.mlkit.GenerativeModelHelpers
import com.google.mlkit.genai.prompt.GenerativeModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.toList
import java.util.UUID

data class AdkRunResult(
  val content: String,
  val finishReason: String?,
)

class AdkAgentRunner(
  private val onToolCall: (
    toolCallId: String,
    toolId: String,
    arguments: String,
    streamId: String?,
  ) -> Unit,
) {
  private var generativeModel: GenerativeModel? = null

  suspend fun prepareNano() {
    generativeModel = GenerativeModelHelpers.initGenerativeModel()
  }

  suspend fun isNanoAvailable(): Boolean {
    return try {
      val model = generativeModel ?: GenerativeModelHelpers.initGenerativeModel().also {
        generativeModel = it
      }
      model.checkStatus().name != "UNAVAILABLE"
    } catch (_: Exception) {
      false
    }
  }

  suspend fun generateText(
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
    tools: ReadableArray?,
  ): AdkRunResult {
    val events = runAgent(messages, config, options, tools, stream = false).toList()
    val text = events
      .flatMap { event -> event.content?.parts?.mapNotNull { it.text } ?: emptyList() }
      .joinToString("")

    val finishReason = events.lastOrNull()?.finishReason?.name
    return AdkRunResult(content = text, finishReason = finishReason)
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
  ): Flow<Event> {
    val parsedMessages = parseMessages(messages)
    val agentConfig = parseAgentConfig(config)
    val agentTools = parseTools(tools, streamId)
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
        content = Content.fromText(message.role, message.content),
      )
      sessionService.appendEvent(session, event)
    }

    return runner.runAsync(
      userId = userId,
      sessionId = sessionId,
      newMessage = Content.fromText(lastMessage.role, lastMessage.content),
      runConfig = com.google.adk.kt.agents.RunConfig(streamingMode = if (stream) {
        com.google.adk.kt.agents.StreamingMode.SSE
      } else {
        com.google.adk.kt.agents.StreamingMode.NONE
      }),
    )
  }

  private fun createModel(config: AgentConfig): Model {
    return when (config.modelType) {
      "genai-nano" -> {
        val model = generativeModel
          ?: throw IllegalStateException("Call prepareNano() before using Gemini Nano")
        GenaiPrompt.create(model, config.modelName)
      }
      else -> Gemini(name = config.modelName, apiKey = config.apiKey)
    }
  }

  private fun parseAgentConfig(config: ReadableMap): AgentConfig {
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

  private fun parseGenerationConfig(options: ReadableMap?): GenerateContentConfig? {
    if (options == null) return null

    return GenerateContentConfig(
      temperature = options.takeIf { it.hasKey("temperature") }?.getDouble("temperature")?.toFloat(),
      maxOutputTokens = options.takeIf { it.hasKey("maxTokens") }?.getInt("maxTokens"),
      topP = options.takeIf { it.hasKey("topP") }?.getDouble("topP")?.toFloat(),
      topK = options.takeIf { it.hasKey("topK") }?.getDouble("topK")?.toFloat()?.toInt(),
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
        else -> Role.USER
      }
      val content = message.getString("content") ?: ""
      parsed.add(ParsedMessage(role = role, content = content))
    }
    return parsed
  }

  private fun parseTools(tools: ReadableArray?, streamId: String?): List<ReactNativeFunctionTool> {
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
          streamId = streamId,
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
}

data class AgentConfig(
  val name: String,
  val description: String,
  val instruction: String?,
  val modelType: String,
  val modelName: String,
  val apiKey: String?,
)

data class ParsedMessage(
  val role: String,
  val content: String,
)
