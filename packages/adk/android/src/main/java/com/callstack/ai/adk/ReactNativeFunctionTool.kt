package com.callstack.ai.adk

import com.google.adk.kt.models.LlmRequest
import com.google.adk.kt.tools.FunctionTool
import com.google.adk.kt.tools.ToolContext
import com.google.adk.kt.types.Content
import com.google.adk.kt.types.FunctionDeclaration
import com.google.adk.kt.types.Part
import com.google.adk.kt.types.Schema
import com.google.adk.kt.types.Type
import java.util.UUID

class ReactNativeFunctionTool(
  private val toolId: String,
  name: String,
  description: String,
  private val parameterSchema: Schema?,
  private val parameters: List<ToolParameterSpec>,
  private val injectPromptDescription: Boolean,
  private val toolCallScope: ToolCallScope?,
  private val onToolCall: (
    toolCallId: String,
    toolId: String,
    arguments: String,
    scope: ToolCallScope?,
  ) -> Unit,
) : FunctionTool(name = name, description = description) {

  override fun declaration(): FunctionDeclaration {
    val schema =
      parameterSchema
        ?: Schema(
          type = Type.OBJECT,
          properties =
            parameters.associate { parameter ->
              parameter.name to
                Schema(
                  type = parameter.type,
                  description = parameter.description,
                )
            },
          required = parameters.filter { it.required }.map { it.name }.ifEmpty { null },
        )

    return FunctionDeclaration(
      name = name,
      description = description,
      parameters = schema,
    )
  }

  override suspend fun processLlmRequest(
    toolContext: ToolContext,
    llmRequest: LlmRequest,
  ): LlmRequest {
    val requestWithTool = super.processLlmRequest(toolContext, llmRequest)

    if (!injectPromptDescription) {
      return requestWithTool
    }

    val declaration = declaration()
    val parameterLines =
      declaration.parameters?.properties?.entries?.joinToString("\n") { (paramName, paramSchema) ->
        val paramType = paramSchema.type?.name?.lowercase() ?: "string"
        val paramDescription = paramSchema.description?.let { " — $it" } ?: ""
        val required =
          declaration.parameters?.required?.contains(paramName) == true
        "    - $paramName ($paramType, required=$required)$paramDescription"
      } ?: ""

    val toolDescription =
      buildString {
        append("Tool: ${declaration.name}")
        if (declaration.description.isNotBlank()) {
          append(" — ${declaration.description}")
        }
        if (parameterLines.isNotBlank()) {
          append("\n  Parameters:\n$parameterLines")
        }
      }

    return requestWithTool.appendInstructions(
      Content(parts = listOf(Part(text = toolDescription))),
    )
  }

  override suspend fun execute(context: ToolContext, args: Map<String, Any>): Any {
    val toolCallId = UUID.randomUUID().toString()
    val argumentsJson = AdkJson.encode(args)
    onToolCall(toolCallId, toolId, argumentsJson, toolCallScope)
    val result = AdkToolBridge.awaitResult(toolCallId)
    return AdkJson.decodeResult(result)
      ?: throw IllegalArgumentException("Failed to decode result in ReactNativeFunctionTool::execute")
  }
}

data class ToolParameterSpec(
  val name: String,
  val description: String?,
  val type: Type,
  val required: Boolean,
)
