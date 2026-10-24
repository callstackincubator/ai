package com.callstack.ai.adk

import com.google.adk.kt.models.LlmRequest
import com.google.adk.kt.models.LlmResponse
import com.google.adk.kt.models.Model
import com.google.adk.kt.models.mlkit.GenaiPrompt
import com.google.adk.kt.types.Content
import com.google.adk.kt.types.FunctionCall
import com.google.adk.kt.types.Part
import com.google.adk.kt.types.Role
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.json.JSONException
import org.json.JSONObject
import java.util.UUID

/**
 * Wraps [GenaiPrompt] (Gemini Nano via ML Kit) to bridge text-based tool calling with ADK.
 *
 * Gemini Nano responds with ```tool_code ...``` blocks with tool calls. This wrapper:
 *
 * 1. Before each request: converts any [FunctionCall]/[FunctionResponse] parts (produced by
 *    previous turns) to plain text so that ML Kit can understand the multi-turn context.
 *
 * 2. After the final (non-partial) response: detects ```tool_code blocks in the text and converts
 *    each invocation to a proper [FunctionCall] part, allowing ADK's agent loop to execute the
 *    tools and continue the conversation.
 */
internal class NanoFunctionCallingModel(private val delegate: GenaiPrompt) : Model {

  override val name: String get() = delegate.name

  override fun generateContent(request: LlmRequest, stream: Boolean): Flow<LlmResponse> =
    delegate.generateContent(prepareRequest(request), stream).map { response ->
      if (response.partial) response else parseToolCodeBlocks(response)
    }

  /**
   * Request preparation: convert FunctionCall/FunctionResponse parts to text
   */
  private fun prepareRequest(request: LlmRequest): LlmRequest {
    val newContents =
      request.contents.map { content ->
        val newParts =
          content.parts.flatMap { part ->
            when {
              part.functionCall != null -> {
                val fc = part.functionCall!!
                val argsText =
                  if (fc.args.isEmpty()) "" else runCatching { AdkJson.encode(fc.args) }.getOrElse { fc.args.toString() }
                listOf(Part(text = "[Tool call: ${fc.name}($argsText)]"))
              }
              part.functionResponse != null -> {
                val fr = part.functionResponse!!
                val responseMap =
                  fr.response
                    .filterValues { it != null }
                    .mapValues { (_, v) -> v as Any }
                val resultText =
                  if (responseMap.isEmpty()) "{}"
                  else runCatching { AdkJson.encode(responseMap) }.getOrElse { responseMap.toString() }
                listOf(Part(text = "[Tool result for ${fr.name}: $resultText]"))
              }
              else -> listOf(part)
            }
          }
        content.copy(parts = newParts)
      }
    return request.copy(contents = newContents)
  }

  /**
   * Response post-processing: convert ```tool_code blocks to FunctionCall parts
   */
  private fun parseToolCodeBlocks(response: LlmResponse): LlmResponse {
    val content = response.content ?: return response
    val newParts = mutableListOf<Part>()
    var hasToolCalls = false

    for (part in content.parts) {
      val text = part.text
      if (text == null) {
        newParts.add(part)
        continue
      }

      val calls = extractToolCalls(text)
      if (calls.isEmpty()) {
        newParts.add(part)
        continue
      }

      hasToolCalls = true
      val surrounding = removeToolCodeBlocks(text).trim()
      if (surrounding.isNotEmpty()) {
        newParts.add(Part(text = surrounding))
      }
      for (call in calls) {
        newParts.add(Part(functionCall = call))
      }
    }

    if (!hasToolCalls) return response
    return response.copy(content = Content(role = Role.MODEL, parts = newParts))
  }

  private fun extractToolCalls(text: String): List<FunctionCall> {
    val calls = mutableListOf<FunctionCall>()
    val blockRegex = Regex("```tool_code\\s*\\n([\\s\\S]*?)\\n?```")
    for (block in blockRegex.findAll(text)) {
      val code = block.groupValues[1]
      for (line in code.lines()) {
        val trimmed = line.trim()
        if (trimmed.isNotEmpty()) {
          parseFunctionCall(trimmed)?.let { calls.add(it) }
        }
      }
    }
    return calls
  }

  private fun removeToolCodeBlocks(text: String): String =
    Regex("```tool_code\\s*\\n[\\s\\S]*?\\n?```").replace(text, "")

  /**
   * Parses a single call line such as:
   *   - `functionName()`
   *   - `functionName({"key": "value"})`
   *   - `print(functionName(...))` (some models wrap in print)
   */
  private fun parseFunctionCall(code: String): FunctionCall? {
    // Regex: outer function name + everything between the outermost parens (greedy)
    val callRegex = Regex("""^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)\s*$""")
    val outer = callRegex.find(code) ?: return null
    val outerName = outer.groupValues[1]
    val outerArgs = outer.groupValues[2]

    val (name, argsStr) =
      if (outerName == "print") {
        val inner = callRegex.find(outerArgs.trim()) ?: return null
        inner.groupValues[1] to inner.groupValues[2]
      } else {
        outerName to outerArgs
      }

    if (name.isBlank()) return null

    val args: Map<String, Any> =
      if (argsStr.isBlank()) {
        emptyMap()
      } else {
        val jsonStr = argsStr.trim().let { if (it.startsWith("{")) it else "{$it}" }
        try {
          val jsonObj = JSONObject(jsonStr)
          jsonObj.keys().asSequence().associateWith { key -> jsonObj.get(key) as Any }
        } catch (_: JSONException) {
          emptyMap()
        }
      }

    return FunctionCall(name = name, args = args, id = UUID.randomUUID().toString())
  }
}
