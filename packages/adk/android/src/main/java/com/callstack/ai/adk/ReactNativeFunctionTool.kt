package com.callstack.ai.adk

import com.google.adk.kt.tools.FunctionTool
import com.google.adk.kt.tools.ToolContext
import com.google.adk.kt.types.FunctionDeclaration
import com.google.adk.kt.types.Schema
import com.google.adk.kt.types.Type
import java.util.UUID

class ReactNativeFunctionTool(
  private val toolId: String,
  name: String,
  description: String,
  private val parameters: List<ToolParameterSpec>,
  private val streamId: String?,
  private val onToolCall: (
    toolCallId: String,
    toolId: String,
    arguments: String,
    streamId: String?,
  ) -> Unit,
) : FunctionTool(name = name, description = description) {

  override fun declaration(): FunctionDeclaration {
    val properties = parameters.associate { parameter ->
      parameter.name to Schema(
        type = parameter.type,
        description = parameter.description,
      )
    }

    val required = parameters.filter { it.required }.map { it.name }

    return FunctionDeclaration(
      name = name,
      description = description,
      parameters = Schema(
        type = Type.OBJECT,
        properties = properties,
        required = required.ifEmpty { null },
      ),
    )
  }

  override suspend fun execute(context: ToolContext, args: Map<String, Any>): Any {
    val toolCallId = UUID.randomUUID().toString()
    val argumentsJson = AdkJson.encode(args)
    onToolCall(toolCallId, toolId, argumentsJson, streamId)
    val result = AdkToolBridge.awaitResult(toolCallId)
    return AdkJson.decodeResult(result)
  }
}

data class ToolParameterSpec(
  val name: String,
  val description: String?,
  val type: Type,
  val required: Boolean,
)
