package com.callstack.ai.adk

import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.GenerateContentResponse
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.ImagePart
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.content
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow

/**
 * Wraps ML Kit's [GenerativeModel] so Gemini Nano sees the whole prompt.
 *
 * Gemini Nano reads only the first text part of a request. ADK's `GenaiPrompt` sends one content
 * per turn, and a system instruction where the device has no system prompt support, so Nano
 * answers the instruction and never sees the user's message. This merges the text of every turn
 * into one part, after the system instruction when the device does not support one. Images stay
 * as their own parts, before the text.
 */
internal class NanoSingleTextPrompt(
  private val delegate: GenerativeModel,
) : GenerativeModel by delegate {

  @Volatile private var systemPromptAvailable: Boolean? = null

  override suspend fun generateContent(request: GenerateContentRequest): GenerateContentResponse =
    delegate.generateContent(merge(request))

  override fun generateContentStream(request: GenerateContentRequest): Flow<GenerateContentResponse> =
    flow { emitAll(delegate.generateContentStream(merge(request))) }

  private suspend fun merge(request: GenerateContentRequest): GenerateContentRequest {
    val parts = request.contents.flatMap { it.parts }
    val systemInstruction = request.systemInstruction?.takeUnless { supportsSystemPrompt() }
    if (parts.size <= 1 && systemInstruction == null) {
      return request
    }

    val text = parts.filterIsInstance<TextPart>().joinToString("\n") { it.textString }
    val images = parts.filterIsInstance<ImagePart>()
    val merged = TextPart(systemInstruction?.let { "${it.textString}\n\n$text" } ?: text)
    return GenerateContentRequest.Builder(content { parts(*images.toTypedArray(), merged) })
      .apply {
        if (systemInstruction == null) this.systemInstruction = request.systemInstruction
        temperature = request.temperature
        seed = request.seed
        topK = request.topK
        candidateCount = request.candidateCount
        maxOutputTokens = request.maxOutputTokens
        enableThinking = request.enableThinking
        promptPrefix = request.promptPrefix
        cachedContextName = request.cachedContextName
      }
      .build()
  }

  private suspend fun supportsSystemPrompt(): Boolean =
    systemPromptAvailable
      ?: runCatching { delegate.isSystemPromptAvailable() }
        .getOrDefault(false)
        .also { systemPromptAvailable = it }
}
