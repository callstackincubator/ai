package com.callstack.ai.adk

import com.google.adk.kt.tools.BaseTool
import com.google.adk.kt.tools.FunctionTool
import com.google.adk.kt.tools.ToolContext
import com.google.adk.kt.types.FunctionDeclaration
import com.google.adk.kt.types.Schema
import com.google.adk.kt.types.Type
import java.util.UUID

/** An ADK tool whose `execute` runs in JavaScript. */
class ReactNativeFunctionTool(
  name: String,
  description: String,
  private val parameterSchema: Schema?,
  private val runId: String,
  private val onToolCall: (
    runId: String,
    toolCallId: String,
    toolName: String,
    arguments: String,
  ) -> Unit,
) : FunctionTool(name = name, description = description) {

  override fun declaration(): FunctionDeclaration =
    FunctionDeclaration(
      name = name,
      description = description,
      parameters = parameterSchema ?: Schema(type = Type.OBJECT),
    )

  /** Describes the tool for models without native function calling. */
  fun promptDescription(): String {
    val parameters = declaration().parameters
    val parameterLines =
      parameters?.properties?.entries?.joinToString("\n") { (paramName, paramSchema) ->
        val paramType = paramSchema.type?.name?.lowercase() ?: "string"
        val paramDescription = paramSchema.description?.let { " — $it" } ?: ""
        val required = parameters.required?.contains(paramName) == true
        "    - $paramName ($paramType, required=$required)$paramDescription"
      } ?: ""

    return buildString {
      append("- $name")
      if (description.isNotBlank()) {
        append(": $description")
      }
      if (parameterLines.isNotBlank()) {
        append("\n  Parameters:\n$parameterLines")
      }
    }
  }

  override suspend fun execute(context: ToolContext, args: Map<String, Any?>): Any {
    // Use ADK's id so JS sees the same id as the reported tool call
    val toolCallId = context.functionCallId ?: UUID.randomUUID().toString()
    val result = AdkToolBridge.call(runId, toolCallId) {
      onToolCall(runId, toolCallId, name, AdkJson.encode(args))
    }
    // ADK wraps values that are not maps under `result`
    return AdkJson.decodeResult(result) ?: mapOf(BaseTool.RESULT_KEY to null)
  }
}
