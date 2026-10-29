package com.callstack.ai.adk

import android.util.Base64
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

  private val transcriber = AdkTranscriber(
    context = reactContext,
    onDownloadProgress = { phase, bytesDownloaded, bytesToDownload ->
      emitOnTranscriptionDownloadProgress(
        Arguments.createMap().apply {
          putString("phase", phase)
          bytesDownloaded?.let { putDouble("bytesDownloaded", it.toDouble()) }
          bytesToDownload?.let { putDouble("bytesToDownload", it.toDouble()) }
        },
      )
    },
  )

  // Streams, generateText runs and transcriptions, by id, so all can be cancelled
  private val activeRuns = ConcurrentHashMap<String, Job>()

  private fun Promise.rejectWithCode(error: Exception) {
    reject(AdkErrors.codeFor(error), error.message ?: "Unknown ADK error", error)
  }

  override fun getModelInfo(nano: ReadableMap?, promise: Promise) {
    scope.launch {
      try {
        val info = runner.getModelInfo(NanoConfig.from(nano))
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
    promise: Promise,
  ) {
    // Started after it is tracked, so a run that ends at once is still removed
    val job = scope.launch(start = CoroutineStart.LAZY) {
      try {
        val result = runner.generateText(messages, config, options)
        val response = Arguments.createMap().apply {
          putString("role", "assistant")
          putString("content", result.content)
          result.reasoning?.let { putString("reasoning", it) }
          result.finishReason?.let { putString("finishReason", it) }
          AdkUsage.toWritableMap(result.usage)?.let { putMap("usage", it) }
        }
        promise.resolve(response)
      } catch (error: Exception) {
        promise.rejectWithCode(error)
      } finally {
        activeRuns.remove(runId)
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
        // Reasoning is tracked the same way.
        var currentTurnText = ""
        var emittedText = ""
        var currentTurnReasoning = ""
        var emittedReasoning = ""

        runner.streamText(messages, config, options).collect { event ->
          if (!isActive) return@collect

          totalUsage = AdkUsage.add(totalUsage, event)
          if (event.partial) event.usageMetadata?.let { partialUsage = it }

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

          if (currentTurnText.length > emittedText.length &&
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
      }
    }

    activeRuns[streamId] = job
    job.start()
    promise.resolve(null)
  }

  override fun getTranscriptionAvailability(config: ReadableMap?, promise: Promise) {
    scope.launch {
      try {
        promise.resolve(transcriber.getAvailability(TranscriptionConfig.from(config)))
      } catch (error: Exception) {
        promise.rejectWithCode(error)
      }
    }
  }

  override fun prepareTranscription(config: ReadableMap?, promise: Promise) {
    scope.launch {
      try {
        transcriber.prepare(TranscriptionConfig.from(config))
        promise.resolve(null)
      } catch (error: Exception) {
        promise.rejectWithCode(error)
      }
    }
  }

  override fun transcribe(
    requestId: String,
    audio: String,
    config: ReadableMap?,
    promise: Promise,
  ) {
    val job = scope.launch(start = CoroutineStart.LAZY) {
      try {
        val bytes =
          try {
            Base64.decode(audio, Base64.DEFAULT)
          } catch (error: IllegalArgumentException) {
            throw AdkErrors.AdkException(AdkErrors.INVALID_MESSAGE, "Audio is not valid base64", error)
          }
        val result = transcriber.transcribe(bytes, TranscriptionConfig.from(config))
        promise.resolve(
          Arguments.createMap().apply {
            putString("text", result.text)
          },
        )
      } catch (error: Exception) {
        promise.rejectWithCode(error)
      } finally {
        activeRuns.remove(requestId)
      }
    }
    activeRuns[requestId] = job
    job.start()
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
    promise.resolve(null)
  }

  override fun invalidate() {
    activeRuns.values.forEach { it.cancel() }
    activeRuns.clear()
    scope.cancel()
    super.invalidate()
  }

  companion object {
    const val NAME = "AdkEngine"
  }
}
