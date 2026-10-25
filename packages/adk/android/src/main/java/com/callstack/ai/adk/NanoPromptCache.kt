package com.callstack.ai.adk

import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.GenerateContentResponse
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.ImagePart
import com.google.mlkit.genai.prompt.PromptPrefix
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import java.util.concurrent.ConcurrentHashMap

/** Prompt prefix state that outlives a single run, kept per Gemini Nano client. */
internal class NanoCacheState {
  /** Token counts of prefixes ML Kit has already processed in this app session */
  val prefixTokens = ConcurrentHashMap<String, Int>()

  /** Token counts of explicit caches created in this app session */
  val cacheTokens = ConcurrentHashMap<String, Int>()

  @Volatile var cachingAvailable: Boolean? = null
}

/**
 * Wraps ML Kit's [GenerativeModel] so Gemini Nano reuses an already processed prompt prefix.
 *
 * ADK's `GenaiPrompt` builds ML Kit requests without a prompt prefix or cache name, so this
 * rewrites each request before it reaches ML Kit:
 *
 * - [cachedContent] names an explicit cache created with `caches.create`.
 * - [cacheSystemPrompt] sends the system instruction as a [PromptPrefix], which ML Kit caches
 *   implicitly. Prefix caching only supports text, so requests with images stay unchanged.
 *
 * ML Kit does not report usage, so [cachedTokenCount] is an estimate: the prefix token count
 * when the prefix was processed before in this app session, or when this app session created
 * the explicit cache.
 */
internal class NanoPromptCache(
  private val delegate: GenerativeModel,
  private val state: NanoCacheState,
  private val cachedContent: String?,
  private val cacheSystemPrompt: Boolean,
) : GenerativeModel by delegate {

  /** Prompt tokens likely served from the cache in the latest request */
  @Volatile var cachedTokenCount: Int? = null
    private set

  override suspend fun generateContent(request: GenerateContentRequest): GenerateContentResponse =
    delegate.generateContent(prepareRequest(request))

  override fun generateContentStream(request: GenerateContentRequest): Flow<GenerateContentResponse> =
    flow { emitAll(delegate.generateContentStream(prepareRequest(request))) }

  private suspend fun prepareRequest(request: GenerateContentRequest): GenerateContentRequest {
    cachedTokenCount = null

    if (cachedContent != null) {
      cachedTokenCount = state.cacheTokens[cachedContent]
      return request.rebuild(keepSystemInstruction = true) { cachedContextName = cachedContent }
    }

    val prefix = request.systemInstruction?.textString
    if (
      !cacheSystemPrompt ||
        prefix.isNullOrEmpty() ||
        request.contents.any { content -> content.parts.any { it is ImagePart } } ||
        !isCachingAvailable()
    ) {
      return request
    }

    // The first request with a prefix is a cache miss
    cachedTokenCount = state.prefixTokens[prefix]
    if (cachedTokenCount == null) {
      runCatching { countTokens(prefix) }.getOrNull()?.let { state.prefixTokens[prefix] = it }
    }

    return request.rebuild(keepSystemInstruction = false) { promptPrefix = PromptPrefix(prefix) }
  }

  private suspend fun isCachingAvailable(): Boolean =
    state.cachingAvailable
      ?: runCatching { delegate.isCachingFeatureAvailable() }
        .getOrDefault(false)
        .also { state.cachingAvailable = it }

  private suspend fun countTokens(text: String): Int =
    delegate.countTokens(generateContentRequest(TextPart(text)) {}).totalTokens

  /** ML Kit requests have no copy builder, so copy every setting ADK may have set */
  private fun GenerateContentRequest.rebuild(
    keepSystemInstruction: Boolean,
    configure: GenerateContentRequest.Builder.() -> Unit,
  ): GenerateContentRequest {
    val source = this
    return GenerateContentRequest.Builder(source.contents)
      .apply {
        if (keepSystemInstruction) systemInstruction = source.systemInstruction
        temperature = source.temperature
        seed = source.seed
        topK = source.topK
        candidateCount = source.candidateCount
        maxOutputTokens = source.maxOutputTokens
        enableThinking = source.enableThinking
        configure()
      }
      .build()
  }
}
