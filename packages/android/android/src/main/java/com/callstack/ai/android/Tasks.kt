package com.callstack.ai.android

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.ReadableMap
import com.google.common.util.concurrent.ListenableFuture
import com.google.mlkit.genai.common.DownloadCallback
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.StreamingCallback
import com.google.mlkit.genai.imagedescription.ImageDescriberOptions
import com.google.mlkit.genai.imagedescription.ImageDescription
import com.google.mlkit.genai.imagedescription.ImageDescriptionRequest
import com.google.mlkit.genai.proofreading.ProofreaderOptions
import com.google.mlkit.genai.proofreading.Proofreading
import com.google.mlkit.genai.proofreading.ProofreadingRequest
import com.google.mlkit.genai.rewriting.RewriterOptions
import com.google.mlkit.genai.rewriting.Rewriting
import com.google.mlkit.genai.rewriting.RewritingRequest
import com.google.mlkit.genai.summarization.Summarization
import com.google.mlkit.genai.summarization.SummarizationRequest
import com.google.mlkit.genai.summarization.SummarizerOptions
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap

/** A task and its options, which pick the ML Kit client and its LoRA adapter. */
data class TaskConfig(
  val task: String,
  val inputType: String?,
  val outputType: String?,
  val language: String?,
  val autoTruncate: Boolean,
) {
  companion object {
    fun from(task: String, map: ReadableMap?): TaskConfig =
      TaskConfig(
        task = task,
        inputType = map?.optString("inputType"),
        outputType = map?.optString("outputType"),
        language = map?.optString("language"),
        autoTruncate = map?.takeIf { it.isSet("autoTruncate") }?.getBoolean("autoTruncate") ?: false,
      )
  }
}

/** The calls the ML Kit task clients share, which have no common interface. */
private class TaskClient(
  val checkFeatureStatus: () -> ListenableFuture<Int>,
  val downloadFeature: (DownloadCallback) -> ListenableFuture<Void>,
  val prepareInferenceEngine: () -> ListenableFuture<Void>,
  /** Runs the task on its input and returns its results, best first. */
  val run: suspend (input: String, callback: StreamingCallback?) -> List<String>,
)

/**
 * Summarization, proofreading, rewriting and image description, ML Kit's task APIs. Each runs
 * Gemini Nano with a LoRA adapter for the task, downloaded on first use.
 */
class Tasks(
  private val context: Context,
  private val downloads: Downloads,
) {
  private val clients = ConcurrentHashMap<TaskConfig, TaskClient>()
  private val prepared = ConcurrentHashMap.newKeySet<TaskConfig>()
  private val prepareMutexes = ConcurrentHashMap<TaskConfig, Mutex>()

  private fun client(config: TaskConfig): TaskClient = clients.computeIfAbsent(config, ::createClient)

  private fun createClient(config: TaskConfig): TaskClient =
    when (config.task) {
      "summarization" -> {
        val client = Summarization.getClient(
          SummarizerOptions.builder(context)
            .setInputType(
              option(config.inputType, "inputType", SummarizerOptions.InputType.ARTICLE) {
                when (it) {
                  "article" -> SummarizerOptions.InputType.ARTICLE
                  "conversation" -> SummarizerOptions.InputType.CONVERSATION
                  else -> null
                }
              },
            )
            .setOutputType(
              option(config.outputType, "outputType", SummarizerOptions.OutputType.ONE_BULLET) {
                when (it) {
                  "oneBullet" -> SummarizerOptions.OutputType.ONE_BULLET
                  "twoBullets" -> SummarizerOptions.OutputType.TWO_BULLETS
                  "threeBullets" -> SummarizerOptions.OutputType.THREE_BULLETS
                  else -> null
                }
              },
            )
            .setLanguage(
              option(config.language, "language", SummarizerOptions.Language.ENGLISH) {
                when (it) {
                  "en" -> SummarizerOptions.Language.ENGLISH
                  "ja" -> SummarizerOptions.Language.JAPANESE
                  "ko" -> SummarizerOptions.Language.KOREAN
                  else -> null
                }
              },
            )
            .setLongInputAutoTruncationEnabled(config.autoTruncate)
            .build(),
        )
        TaskClient(client::checkFeatureStatus, client::downloadFeature, client::prepareInferenceEngine) { input, callback ->
          val request = SummarizationRequest.builder(input).build()
          val result = if (callback == null) client.runInference(request) else client.runInference(request, callback)
          listOf(result.await().summary)
        }
      }
      "proofreading" -> {
        val client = Proofreading.getClient(
          ProofreaderOptions.builder(context)
            .setInputType(
              option(config.inputType, "inputType", ProofreaderOptions.InputType.KEYBOARD) {
                when (it) {
                  "keyboard" -> ProofreaderOptions.InputType.KEYBOARD
                  "voice" -> ProofreaderOptions.InputType.VOICE
                  else -> null
                }
              },
            )
            .setLanguage(option(config.language, "language", ProofreaderOptions.Language.ENGLISH, ::proofreaderLanguage))
            .build(),
        )
        TaskClient(client::checkFeatureStatus, client::downloadFeature, client::prepareInferenceEngine) { input, callback ->
          val request = ProofreadingRequest.builder(input).build()
          val result = if (callback == null) client.runInference(request) else client.runInference(request, callback)
          result.await().results.map { it.text }
        }
      }
      "rewriting" -> {
        val client = Rewriting.getClient(
          RewriterOptions.builder(context)
            .setOutputType(
              option(config.outputType, "outputType", RewriterOptions.OutputType.REPHRASE) {
                when (it) {
                  "elaborate" -> RewriterOptions.OutputType.ELABORATE
                  "emojify" -> RewriterOptions.OutputType.EMOJIFY
                  "shorten" -> RewriterOptions.OutputType.SHORTEN
                  "friendly" -> RewriterOptions.OutputType.FRIENDLY
                  "professional" -> RewriterOptions.OutputType.PROFESSIONAL
                  "rephrase" -> RewriterOptions.OutputType.REPHRASE
                  else -> null
                }
              },
            )
            .setLanguage(option(config.language, "language", RewriterOptions.Language.ENGLISH, ::rewriterLanguage))
            .build(),
        )
        TaskClient(client::checkFeatureStatus, client::downloadFeature, client::prepareInferenceEngine) { input, callback ->
          val request = RewritingRequest.builder(input).build()
          val result = if (callback == null) client.runInference(request) else client.runInference(request, callback)
          result.await().results.map { it.text }
        }
      }
      "imageDescription" -> {
        val client = ImageDescription.getClient(ImageDescriberOptions.builder(context).build())
        TaskClient(client::checkFeatureStatus, client::downloadFeature, client::prepareInferenceEngine) { input, callback ->
          val request = ImageDescriptionRequest.builder(bitmap(input)).build()
          val result = if (callback == null) client.runInference(request) else client.runInference(request, callback)
          listOf(result.await().description)
        }
      }
      else -> throw AndroidAIErrors.CodedException(AndroidAIErrors.INVALID_MESSAGE, "Unknown task: ${config.task}")
    }

  // Proofreading and rewriting take the same languages, as constants of their own options
  private fun proofreaderLanguage(code: String): Int? =
    when (code) {
      "en" -> ProofreaderOptions.Language.ENGLISH
      "ja" -> ProofreaderOptions.Language.JAPANESE
      "de" -> ProofreaderOptions.Language.GERMAN
      "fr" -> ProofreaderOptions.Language.FRENCH
      "it" -> ProofreaderOptions.Language.ITALIAN
      "es" -> ProofreaderOptions.Language.SPANISH
      "ko" -> ProofreaderOptions.Language.KOREAN
      else -> null
    }

  private fun rewriterLanguage(code: String): Int? =
    when (code) {
      "en" -> RewriterOptions.Language.ENGLISH
      "ja" -> RewriterOptions.Language.JAPANESE
      "de" -> RewriterOptions.Language.GERMAN
      "fr" -> RewriterOptions.Language.FRENCH
      "it" -> RewriterOptions.Language.ITALIAN
      "es" -> RewriterOptions.Language.SPANISH
      "ko" -> RewriterOptions.Language.KOREAN
      else -> null
    }

  private fun option(value: String?, name: String, default: Int, parse: (String) -> Int?): Int =
    if (value == null) {
      default
    } else {
      parse(value) ?: throw AndroidAIErrors.CodedException(AndroidAIErrors.INVALID_MESSAGE, "Unsupported $name: $value")
    }

  // A file://, content:// URI or base64 image
  private fun bitmap(image: String): Bitmap {
    val bytes =
      try {
        if (image.startsWith("file:") || image.startsWith("content:")) {
          context.contentResolver.openInputStream(Uri.parse(image))?.use { it.readBytes() }
        } else {
          Base64.decode(image, Base64.DEFAULT)
        }
      } catch (error: Exception) {
        null
      }
    return bytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
      ?: throw AndroidAIErrors.CodedException(AndroidAIErrors.INVALID_MESSAGE, "Cannot read image: ${image.take(64)}")
  }

  suspend fun getModelInfo(config: TaskConfig): ModelInfo =
    ModelInfo(availability = availabilityOf(client(config).checkFeatureStatus().await()))

  /** Downloads the task's model when needed, reporting progress, then loads it. */
  suspend fun prepare(config: TaskConfig) {
    if (config in prepared) return
    prepareMutexes.computeIfAbsent(config) { Mutex() }.withLock {
      if (config in prepared) return

      val client = client(config)
      when (val status = client.checkFeatureStatus().await()) {
        FeatureStatus.UNAVAILABLE ->
          throw AndroidAIErrors.CodedException(
            AndroidAIErrors.MODEL_UNAVAILABLE,
            "${config.task} is not available on this device",
          )
        FeatureStatus.DOWNLOADABLE, FeatureStatus.DOWNLOADING ->
          downloads.collect(config.task, "The ${config.task} model", status, client.downloadFeature)
      }
      client.prepareInferenceEngine().await()
      prepared.add(config)
    }
  }

  /** Runs the task, streaming its text to [onText] when given, and returns its results. */
  suspend fun run(config: TaskConfig, input: String, onText: ((String) -> Unit)?): List<String> {
    prepare(config)
    val callback = onText?.let { StreamingCallback { text -> it(text) } }
    return client(config).run(input, callback)
  }
}
