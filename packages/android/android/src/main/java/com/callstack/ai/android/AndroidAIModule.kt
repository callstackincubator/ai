package com.callstack.ai.android

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.google.mlkit.genai.common.FunctionCall
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

class AndroidAIModule(reactContext: ReactApplicationContext) : NativeAndroidAISpec(reactContext) {

  override fun getName(): String = NAME

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val downloads = Downloads { model, phase, bytesDownloaded, bytesToDownload ->
    emitOnDownloadProgress(
      Arguments.createMap().apply {
        putString("model", model)
        putString("phase", phase)
        bytesDownloaded?.let { putDouble("bytesDownloaded", it.toDouble()) }
        bytesToDownload?.let { putDouble("bytesToDownload", it.toDouble()) }
      },
    )
  }
  private val nano = GeminiNano(reactContext, downloads)
  private val transcription = Transcription(reactContext, downloads)
  private val embeddings = Embeddings(downloads)

  // Generations and transcriptions, by id, so they can be cancelled
  private val activeRuns = ConcurrentHashMap<String, Job>()

  private fun Promise.rejectWithCode(error: Exception) {
    reject(AndroidAIErrors.codeFor(error), error.message ?: "Unknown ML Kit error", error)
  }

  /** Resolves [promise] with what [block] returns, or rejects it with an error code. */
  private fun launch(promise: Promise, block: suspend () -> Any?) {
    scope.launch {
      try {
        promise.resolve(block().takeUnless { it is Unit })
      } catch (error: Exception) {
        promise.rejectWithCode(error)
      }
    }
  }

  /** Like [launch], tracked by [runId] so [cancel] can stop it. */
  private fun launchRun(runId: String, onError: (Exception) -> Unit, block: suspend () -> Unit) {
    // Started after it is tracked, so a run that ends at once is still removed
    val job = scope.launch(start = CoroutineStart.LAZY) {
      try {
        block()
      } catch (error: Exception) {
        onError(error)
      } finally {
        activeRuns.remove(runId)
      }
    }
    activeRuns[runId] = job
    job.start()
  }

  private fun ModelInfo.toWritableMap(): WritableMap =
    Arguments.createMap().apply {
      putString("availability", availability)
      baseModelName?.let { putString("baseModelName", it) }
      contextSize?.let { putInt("contextSize", it) }
      features?.let { putArray("features", Arguments.fromList(it)) }
    }

  private fun FunctionCall.toWritableMap(): WritableMap =
    Arguments.createMap().apply {
      putString("id", id)
      putString("name", name)
      putString("arguments", FunctionJson.argumentsToJson(arguments).toString())
    }

  override fun isAvailable(model: ReadableMap?): Boolean = nano.isAvailable(NanoConfig.from(model))

  override fun getModelInfo(model: ReadableMap?, promise: Promise) =
    launch(promise) { nano.getModelInfo(NanoConfig.from(model)).toWritableMap() }

  override fun prepare(model: ReadableMap?, promise: Promise) =
    launch(promise) { nano.prepare(NanoConfig.from(model)) }

  override fun countTokens(text: String, model: ReadableMap?, promise: Promise) =
    launch(promise) { nano.countTokens(text, NanoConfig.from(model)).toDouble() }

  override fun generateText(runId: String, request: ReadableMap, promise: Promise) =
    launchRun(runId, { promise.rejectWithCode(it) }) {
      val result = nano.generate(request)
      promise.resolve(
        Arguments.createMap().apply {
          putString("text", result.text)
          result.reasoning?.let { putString("reasoning", it) }
          putArray(
            "functionCalls",
            Arguments.createArray().apply { result.functionCalls.forEach { pushMap(it.toWritableMap()) } },
          )
          result.finishReason?.let { putString("finishReason", it) }
        },
      )
    }

  override fun streamText(streamId: String, request: ReadableMap, promise: Promise) {
    if (activeRuns.containsKey(streamId)) {
      promise.reject(AndroidAIErrors.GENERATION_ERROR, "Stream ID already in use: $streamId")
      return
    }

    val listener = object : StreamListener {
      override fun onText(delta: String) = emitStreamEvent(streamId, "text") { putString("delta", delta) }

      override fun onReasoning(delta: String) = emitStreamEvent(streamId, "reasoning") { putString("delta", delta) }

      override fun onFunctionCall(call: FunctionCall) =
        emitStreamEvent(streamId, "functionCall") { putMap("functionCall", call.toWritableMap()) }
    }

    launchRun(
      streamId,
      onError = { error ->
        emitStreamEvent(streamId, "error") {
          putString("error", error.message ?: "Unknown ML Kit stream error")
          putString("code", AndroidAIErrors.codeFor(error))
        }
      },
    ) {
      val result = nano.stream(request, listener)
      emitStreamEvent(streamId, "finish") { result.finishReason?.let { putString("finishReason", it) } }
    }
    promise.resolve(null)
  }

  private fun emitStreamEvent(streamId: String, type: String, fill: WritableMap.() -> Unit) {
    emitOnStreamEvent(
      Arguments.createMap().apply {
        putString("streamId", streamId)
        putString("type", type)
        fill()
      },
    )
  }

  override fun cancel(runId: String) {
    activeRuns.remove(runId)?.cancel()
  }

  override fun getTranscriptionModelInfo(options: ReadableMap, promise: Promise) =
    launch(promise) { transcription.getModelInfo(TranscriptionConfig.from(options)).toWritableMap() }

  override fun prepareTranscription(options: ReadableMap, promise: Promise) =
    launch(promise) { transcription.prepare(TranscriptionConfig.from(options)) }

  override fun transcribe(runId: String, audio: String, options: ReadableMap, promise: Promise) =
    launchRun(runId, { promise.rejectWithCode(it) }) {
      promise.resolve(transcription.transcribe(audio, TranscriptionConfig.from(options)))
    }

  override fun getEmbeddingModelInfo(promise: Promise) =
    launch(promise) {
      val info = embeddings.getModelInfo()
      Arguments.createMap().apply {
        putString("availability", info.availability)
        info.dimension?.let { putInt("dimension", it) }
        info.modelSignature?.let { putString("modelSignature", it) }
      }
    }

  override fun prepareEmbedding(promise: Promise) = launch(promise) { embeddings.prepare(); null }

  override fun embed(values: ReadableArray, taskType: String?, promise: Promise) =
    launch(promise) {
      val vectors = embeddings.embed(List(values.size()) { values.getString(it)!! }, taskType)
      Arguments.createArray().apply {
        vectors.forEach { vector ->
          pushArray(Arguments.createArray().apply { vector.forEach { pushDouble(it.toDouble()) } })
        }
      }
    }

  override fun invalidate() {
    activeRuns.values.forEach { it.cancel() }
    activeRuns.clear()
    scope.cancel()
    super.invalidate()
  }

  companion object {
    const val NAME = "AndroidAI"
  }
}
