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
        var emittedText = ""
        var latestUsage: UsageMetadata? = null
        val toolCallEmitter = AdkStreamToolCallEmitter(streamId) { args ->
          emitOnStreamToolCall(args)
        }

        runner.streamText(messages, config, options, tools, streamId).collect { event ->
          if (!isActive) return@collect

          event.usageMetadata?.let { latestUsage = it }
          toolCallEmitter.handleEvent(event)

          val text = event.content?.parts?.mapNotNull { it.text }?.joinToString("") ?: ""
          // Partial events carry new text; final events repeat the full response.
          if (text.isNotEmpty() && !(event.isFinalResponse && !event.partial)) {
            val delta =
              if (text.startsWith(emittedText)) {
                text.substring(emittedText.length)
              } else {
                text
              }
            if (delta.isNotEmpty()) {
              emittedText = if (text.startsWith(emittedText)) text else emittedText + delta

              val updateArgs = Arguments.createMap().apply {
                putString("streamId", streamId)
                putString("delta", delta)
              }
              emitOnStreamUpdate(updateArgs)
            }
          }

          if (event.isFinalResponse && !event.partial) {
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

  companion object {
    const val NAME = "AdkEngine"
  }
}
