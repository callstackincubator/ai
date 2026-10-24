package com.callstack.ai.adk

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.google.adk.kt.events.Event
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
  private val runner = AdkAgentRunner(
    context = reactContext,
    onToolCall = { toolCallId, toolId, arguments, toolCallScope ->
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
    },
    onDownloadProgress = { phase, bytesDownloaded, bytesToDownload ->
      emitOnNanoDownloadProgress(
        Arguments.createMap().apply {
          putString("phase", phase)
          bytesDownloaded?.let { putDouble("bytesDownloaded", it.toDouble()) }
          bytesToDownload?.let { putDouble("bytesToDownload", it.toDouble()) }
        },
      )
    },
  )

  // Streams and generateText runs, by id, so both can be cancelled
  private val activeRuns = ConcurrentHashMap<String, Job>()

  private fun Promise.rejectWithCode(error: Exception) {
    reject(AdkErrors.codeFor(error), error.message ?: "Unknown ADK error", error)
  }

  override fun isAvailable(modelType: String, nano: ReadableMap?, promise: Promise) {
    scope.launch {
      try {
        val available = when (modelType) {
          "genai-nano" -> runner.isNanoAvailable(NanoConfig.from(nano))
          else -> true
        }
        promise.resolve(available)
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  override fun isNanoSupported(nano: ReadableMap?, promise: Promise) {
    scope.launch {
      try {
        promise.resolve(runner.isNanoSupported(NanoConfig.from(nano)))
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  override fun getModelInfo(modelType: String, nano: ReadableMap?, promise: Promise) {
    scope.launch {
      try {
        val info = runner.getModelInfo(modelType, NanoConfig.from(nano))
        promise.resolve(
          Arguments.createMap().apply {
            putString("availability", info.availability)
            info.baseModelName?.let { putString("baseModelName", it) }
            info.contextSize?.let { putInt("contextSize", it) }
          },
        )
      } catch (error: Exception) {
        promise.rejectWithCode(error)
      }
    }
  }

  override fun prepareNano(nano: ReadableMap?, promise: Promise) {
    scope.launch {
      try {
        runner.prepareNano(NanoConfig.from(nano))
        promise.resolve(null)
      } catch (error: Exception) {
        promise.rejectWithCode(error)
      }
    }
  }

  override fun countTokens(text: String, nano: ReadableMap?, promise: Promise) {
    scope.launch {
      try {
        promise.resolve(runner.countTokens(text, NanoConfig.from(nano)).toDouble())
      } catch (error: Exception) {
        promise.rejectWithCode(error)
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
    val job = scope.launch {
      try {
        val result = runner.generateText(messages, config, options, tools, runId)
        val response = Arguments.createMap().apply {
          putString("role", "assistant")
          putString("content", result.content)
          result.reasoning?.let { putString("reasoning", it) }
          putArray(
            "toolCalls",
            Arguments.createArray().apply {
              result.toolCalls.forEach { call ->
                pushMap(
                  Arguments.createMap().apply {
                    putString("toolCallId", call.toolCallId)
                    putString("toolName", call.toolName)
                    putString("input", call.input)
                  },
                )
              }
            },
          )
          putArray(
            "toolResults",
            Arguments.createArray().apply {
              result.toolResults.forEach { toolResult ->
                pushMap(
                  Arguments.createMap().apply {
                    putString("toolCallId", toolResult.toolCallId)
                    putString("toolName", toolResult.toolName)
                    putString("output", toolResult.output)
                  },
                )
              }
            },
          )
          result.finishReason?.let { putString("finishReason", it) }
          AdkUsage.toWritableMap(result.usage)?.let { putMap("usage", it) }
        }
        promise.resolve(response)
      } catch (error: Exception) {
        promise.rejectWithCode(error)
      } finally {
        activeRuns.remove(runId)
        AdkToolBridge.cancelForStream(runId)
      }
    }
    activeRuns[runId] = job
  }

  override fun streamText(
    streamId: String,
    messages: ReadableArray,
    config: ReadableMap,
    options: ReadableMap?,
    tools: ReadableArray?,
    promise: Promise,
  ) {
    if (activeRuns.containsKey(streamId)) {
      promise.reject(AdkErrors.GENERATION_ERROR, "Stream ID already in use: $streamId")
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
        //   currentTurnReasoning / emittedReasoning: the same for thought parts
        var currentTurnText = ""
        var emittedText = ""
        var suppressCurrentTurn = false
        var currentTurnReasoning = ""
        var emittedReasoning = ""
        val toolCallEmitter = AdkStreamToolCallEmitter(streamId) { args ->
          emitOnStreamToolCall(args)
        }

        runner.streamText(messages, config, options, tools, streamId).collect { event ->
          if (!isActive) return@collect

          event.usageMetadata?.let { latestUsage = it }
          toolCallEmitter.handleEvent(event)
          toolCallEmitter.handleResults(event)

          val reasoning = event.textParts(thoughts = true)
          if (reasoning.isNotEmpty()) {
            currentTurnReasoning =
              if (reasoning.startsWith(currentTurnReasoning)) reasoning
              else currentTurnReasoning + reasoning
            if (currentTurnReasoning.length > emittedReasoning.length &&
              currentTurnReasoning.startsWith(emittedReasoning)
            ) {
              emitDelta(streamId, currentTurnReasoning.substring(emittedReasoning.length), "reasoning")
              emittedReasoning = currentTurnReasoning
            }
          }

          val text = event.textParts(thoughts = false)

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
            currentTurnReasoning = ""
            emittedReasoning = ""
          }

          if (!suppressCurrentTurn && !(event.isFinalResponse && !event.partial)) {
            // Hold back any trailing substring that could be the beginning of the marker,
            // so we never emit a partial "```", "```tool", etc. that later completes.
            val safeEnd = currentTurnText.length - pendingMarkerPrefixLength(currentTurnText)
            if (safeEnd > emittedText.length) {
              emitDelta(streamId, currentTurnText.substring(emittedText.length, safeEnd), "text")
              emittedText = currentTurnText.substring(0, safeEnd)
            }
          }

          if (event.isFinalResponse && !event.partial) {
            // Flush any held-back text for a normal turn (e.g. a response legitimately
            // ending in backticks that turned out not to be a tool-code marker).
            if (!suppressCurrentTurn && currentTurnText.length > emittedText.length) {
              emitDelta(streamId, currentTurnText.substring(emittedText.length), "text")
              emittedText = currentTurnText
            }

            emitComplete(streamId, event, latestUsage)
          }
        }
      } catch (error: Exception) {
        val errorArgs = Arguments.createMap().apply {
          putString("streamId", streamId)
          putString("error", error.message ?: "Unknown ADK stream error")
          putString("code", AdkErrors.codeFor(error))
        }
        emitOnStreamError(errorArgs)
      } finally {
        activeRuns.remove(streamId)
      }
    }

    activeRuns[streamId] = job
    promise.resolve(null)
  }

  private fun emitDelta(streamId: String, delta: String, kind: String) {
    emitOnStreamUpdate(
      Arguments.createMap().apply {
        putString("streamId", streamId)
        putString("delta", delta)
        putString("kind", kind)
      },
    )
  }

  private fun emitComplete(streamId: String, event: Event, latestUsage: UsageMetadata?) {
    emitOnStreamComplete(
      Arguments.createMap().apply {
        putString("streamId", streamId)
        event.finishReason?.name?.let { putString("finishReason", it) }
        AdkUsage.toWritableMap(latestUsage ?: event.usageMetadata)?.let {
          putMap("usage", it)
        }
      },
    )
  }

  override fun cancelStream(streamId: String, promise: Promise) {
    activeRuns.remove(streamId)?.cancel()
    AdkToolBridge.cancelForStream(streamId)
    promise.resolve(null)
  }

  override fun submitToolResult(toolCallId: String, result: String) {
    AdkToolBridge.submitResult(toolCallId, result)
  }

  override fun invalidate() {
    activeRuns.values.forEach { it.cancel() }
    activeRuns.clear()
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
