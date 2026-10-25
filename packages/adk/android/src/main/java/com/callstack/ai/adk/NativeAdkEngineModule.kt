package com.callstack.ai.adk

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.google.adk.kt.events.Event
import com.google.adk.kt.types.UsageMetadata
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
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
    onToolCall = { runId, toolCallId, toolName, arguments ->
      emitOnToolCall(
        Arguments.createMap().apply {
          putString("runId", runId)
          putString("toolCallId", toolCallId)
          putString("toolName", toolName)
          putString("arguments", arguments)
        },
      )
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
    // Started after it is tracked, so a run that ends at once is still removed
    val job = scope.launch(start = CoroutineStart.LAZY) {
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
        AdkToolBridge.cancel(runId)
      }
    }
    activeRuns[runId] = job
    job.start()
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

    val job = scope.launch(start = CoroutineStart.LAZY) {
      try {
        // Summed over complete events, with the latest partial usage as a fallback
        var totalUsage: UsageMetadata? = null
        var partialUsage: UsageMetadata? = null
        // ADK may deliver text cumulatively (each event repeats the turn so far) or as
        // deltas, so the turn text is rebuilt here and only the new part is sent to JS.
        // JS hides Gemini Nano tool_code blocks. Reasoning is tracked the same way.
        var currentTurnText = ""
        var emittedText = ""
        var currentTurnReasoning = ""
        var emittedReasoning = ""
        val toolCallEmitter = AdkStreamToolCallEmitter(streamId) { args ->
          emitOnStreamToolCall(args)
        }

        runner.streamText(messages, config, options, tools, streamId).collect { event ->
          if (!isActive) return@collect

          totalUsage = AdkUsage.add(totalUsage, event)
          if (event.partial) event.usageMetadata?.let { partialUsage = it }
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
            currentTurnText =
              if (text.startsWith(currentTurnText)) text else currentTurnText + text
          }

          if (!event.partial && event.functionCalls().isNotEmpty()) {
            // A tool call ends the turn, and the next turn starts with new text
            currentTurnText = ""
            emittedText = ""
            currentTurnReasoning = ""
            emittedReasoning = ""
          } else if (currentTurnText.length > emittedText.length &&
            currentTurnText.startsWith(emittedText)
          ) {
            emitDelta(streamId, currentTurnText.substring(emittedText.length), "text")
            emittedText = currentTurnText
          }

          if (event.isFinalResponse && !event.partial) {
            emitComplete(streamId, event, totalUsage ?: partialUsage)
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
        AdkToolBridge.cancel(streamId)
      }
    }

    activeRuns[streamId] = job
    job.start()
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

  private fun emitComplete(streamId: String, event: Event, usage: UsageMetadata?) {
    emitOnStreamComplete(
      Arguments.createMap().apply {
        putString("streamId", streamId)
        event.finishReason?.name?.let { putString("finishReason", it) }
        AdkUsage.toWritableMap(usage)?.let {
          putMap("usage", it)
        }
      },
    )
  }

  override fun cancelStream(streamId: String, promise: Promise) {
    activeRuns.remove(streamId)?.cancel()
    AdkToolBridge.cancel(streamId)
    promise.resolve(null)
  }

  override fun submitToolResult(runId: String, toolCallId: String, result: String) {
    AdkToolBridge.submitResult(runId, toolCallId, result)
  }

  override fun invalidate() {
    activeRuns.values.forEach { it.cancel() }
    activeRuns.clear()
    AdkToolBridge.cancelAll()
    scope.cancel()
    super.invalidate()
  }

  companion object {
    const val NAME = "AdkEngine"
  }
}
