package com.callstack.ai.adk

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.google.adk.kt.types.UsageMetadata
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

class NativeAdkEngineModule(reactContext: ReactApplicationContext) :
  NativeAdkEngineSpec(reactContext) {

  override fun getName(): String = NAME

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val runner = AdkAgentRunner { toolCallId, toolId, arguments, toolCallScope ->
    toolCallScope?.streamId?.let { AdkToolBridge.registerToolCall(it, toolCallId) }
    toolCallScope?.runId?.let { AdkToolBridge.registerToolCall(it, toolCallId) }
    val args = Arguments.createMap().apply {
      putString("toolCallId", toolCallId)
      putString("toolId", toolId)
      putString("arguments", arguments)
      toolCallScope?.streamId?.let { putString("streamId", it) }
      toolCallScope?.runId?.let { putString("runId", it) }
    }
    emitOnToolCall(args)
  }
  private val activeStreams = ConcurrentHashMap<String, Job>()

  override fun isAvailable(modelType: String, promise: Promise) {
    scope.launch {
      try {
        val available = when (modelType) {
          "genai-nano" -> runner.isNanoAvailable()
          else -> true
        }
        promise.resolve(available)
      } catch (error: Exception) {
        promise.resolve(false)
      }
    }
  }

  override fun isNanoSupported(promise: Promise) {
    scope.launch {
      try {
        promise.resolve(runner.isNanoSupported())
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  override fun prepareNano(promise: Promise) {
    scope.launch {
      try {
        runner.prepareNano()
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("ADK_PREPARE_ERROR", error.message, error)
      }
    }
  }

  override fun generateText(
    runId: String,
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
    tools: ReadableArray?,
    promise: Promise,
  ) {
    scope.launch {
      try {
        val result = runner.generateText(messages, config, options, tools, runId)
        val response = Arguments.createMap().apply {
          putString("role", "assistant")
          putString("content", result.content)
          result.finishReason?.let { putString("finishReason", it) }
          AdkUsage.toWritableMap(result.usage)?.let { putMap("usage", it) }
        }
        promise.resolve(response)
      } catch (error: Exception) {
        promise.reject("ADK_GENERATION_ERROR", error.message, error)
      } finally {
        AdkToolBridge.cancelForStream(runId)
      }
    }
  }

  override fun streamText(
    streamId: String,
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
    tools: ReadableArray?,
    promise: Promise,
  ) {
    if (activeStreams.containsKey(streamId)) {
      promise.reject("ADK_STREAM_ERROR", "Stream ID already in use: $streamId")
      return
    }

    val job = scope.launch {
      try {
        var latestUsage: UsageMetadata? = null
        // Per-turn state. Gemini Nano emits ```tool_code blocks (as streamed text) instead
        // of native function calls, and the marker can be split across stream chunks.
        //
        // ADK/GenaiPrompt may deliver text either cumulatively (each event repeats the full
        // text) or incrementally (each event carries only the new delta). We can't rely on
        // either, so we reconstruct the full turn text ourselves by appending the delta of
        // each event, then run marker detection and hold-back on that reconstruction.
        //
        //   currentTurnText: full reconstructed text of the current agent turn
        //   emittedText:     the prefix of currentTurnText already sent to JS
        //   suppressCurrentTurn: true once we confirm this turn is a tool-code turn
        var currentTurnText = ""
        var emittedText = ""
        var suppressCurrentTurn = false
        val toolCallEmitter = AdkStreamToolCallEmitter(streamId) { args ->
          emitOnStreamToolCall(args)
        }

        runner.streamText(messages, config, options, tools, streamId).collect { event ->
          if (!isActive) return@collect

          event.usageMetadata?.let { latestUsage = it }
          toolCallEmitter.handleEvent(event)

          val text = event.content?.parts?.mapNotNull { it.text }?.joinToString("") ?: ""

          if (text.isNotEmpty()) {
            // Reconstruct the full turn text. If the event repeats what we already have
            // (cumulative mode) take it as-is; otherwise treat it as an incremental delta
            // and append it. This keeps a split marker (e.g. "```tool_" + "code") intact.
            currentTurnText =
              if (text.startsWith(currentTurnText)) text else currentTurnText + text

            // Once the full tool-code marker appears, suppress the rest of this turn.
            if (currentTurnText.contains(TOOL_CODE_MARKER)) {
              suppressCurrentTurn = true
            }
          }

          // When a tool-calling turn ends, reset per-turn state so the next turn
          // (the actual answer) starts with a clean slate and streams normally.
          if (!event.partial && event.functionCalls().isNotEmpty()) {
            currentTurnText = ""
            emittedText = ""
            suppressCurrentTurn = false
          }

          if (!suppressCurrentTurn && !(event.isFinalResponse && !event.partial)) {
            // Hold back any trailing substring that could be the beginning of the marker,
            // so we never emit a partial "```", "```tool", etc. that later completes.
            val safeEnd = currentTurnText.length - pendingMarkerPrefixLength(currentTurnText)
            if (safeEnd > emittedText.length) {
              val delta = currentTurnText.substring(emittedText.length, safeEnd)
              emittedText = currentTurnText.substring(0, safeEnd)

              val updateArgs = Arguments.createMap().apply {
                putString("streamId", streamId)
                putString("delta", delta)
              }
              emitOnStreamUpdate(updateArgs)
            }
          }

          if (event.isFinalResponse && !event.partial) {
            // Flush any held-back text for a normal turn (e.g. a response legitimately
            // ending in backticks that turned out not to be a tool-code marker).
            if (!suppressCurrentTurn && currentTurnText.length > emittedText.length) {
              val delta = currentTurnText.substring(emittedText.length)
              emittedText = currentTurnText
              val updateArgs = Arguments.createMap().apply {
                putString("streamId", streamId)
                putString("delta", delta)
              }
              emitOnStreamUpdate(updateArgs)
            }

            val completeArgs = Arguments.createMap().apply {
              putString("streamId", streamId)
              putString("finishReason", event.finishReason?.name)
              AdkUsage.toWritableMap(latestUsage ?: event.usageMetadata)?.let {
                putMap("usage", it)
              }
            }
            emitOnStreamComplete(completeArgs)
          }
        }
      } catch (error: Exception) {
        val errorArgs = Arguments.createMap().apply {
          putString("streamId", streamId)
          putString("error", error.message ?: "Unknown ADK stream error")
        }
        emitOnStreamError(errorArgs)
      } finally {
        activeStreams.remove(streamId)
      }
    }

    activeStreams[streamId] = job
    promise.resolve(null)
  }

  override fun cancelStream(streamId: String, promise: Promise) {
    activeStreams.remove(streamId)?.cancel()
    AdkToolBridge.cancelForStream(streamId)
    promise.resolve(null)
  }

  override fun submitToolResult(toolCallId: String, result: String) {
    AdkToolBridge.submitResult(toolCallId, result)
  }

  override fun invalidate() {
    activeStreams.values.forEach { it.cancel() }
    activeStreams.clear()
    AdkToolBridge.cancelAll()
    scope.cancel()
    super.invalidate()
  }

  /**
   * Returns the length of the trailing suffix of [text] that is a proper prefix of
   * [TOOL_CODE_MARKER] (e.g. "`", "``", "```", "```tool"). This portion is held back
   * from streaming because a subsequent token could complete the marker, at which point
   * the whole turn is suppressed. If no suffix could begin the marker, returns 0.
   */
  private fun pendingMarkerPrefixLength(text: String): Int {
    val maxLen = minOf(text.length, TOOL_CODE_MARKER.length - 1)
    for (len in maxLen downTo 1) {
      val suffix = text.substring(text.length - len)
      if (TOOL_CODE_MARKER.startsWith(suffix)) {
        return len
      }
    }
    return 0
  }

  companion object {
    const val NAME = "AdkEngine"
    private const val TOOL_CODE_MARKER = "```tool_code"
  }
}
