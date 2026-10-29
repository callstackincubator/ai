package com.callstack.ai.android

import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.embedding.Content
import com.google.mlkit.genai.embedding.EmbeddingGeneration
import com.google.mlkit.genai.embedding.EmbeddingModel
import com.google.mlkit.genai.embedding.EmbeddingOptions
import com.google.mlkit.genai.embedding.EmbeddingRequest
import com.google.mlkit.genai.embedding.TaskConfig
import com.google.mlkit.genai.embedding.TextPart
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class EmbeddingModelInfo(
  val availability: String,
  val dimension: Int? = null,
  val modelSignature: String? = null,
)

/** Embeds text with ML Kit's on-device embedding model. */
class Embeddings(private val downloads: Downloads) {
  private val mutex = Mutex()
  private var model: EmbeddingModel? = null
  private var prepared = false

  /** The device's default embedding model, or null when it has none. */
  private suspend fun model(): EmbeddingModel? =
    mutex.withLock {
      model ?: EmbeddingGeneration.getEmbeddingModels(EmbeddingOptions()).firstOrNull()?.also { model = it }
    }

  suspend fun getModelInfo(): EmbeddingModelInfo {
    val model = model() ?: return EmbeddingModelInfo(availability = "unavailable")
    val status = model.checkStatus()
    if (status != FeatureStatus.AVAILABLE) {
      return EmbeddingModelInfo(availability = availabilityOf(status))
    }
    return EmbeddingModelInfo(
      availability = "available",
      dimension = runCatching { model.getMetadata()?.dimension }.getOrNull(),
      modelSignature = runCatching { model.getModelSignature() }.getOrNull(),
    )
  }

  /** Downloads the embedding model when needed, reporting progress, then warms it up. */
  suspend fun prepare(): EmbeddingModel {
    val model = model()
      ?: throw AndroidAIErrors.CodedException(
        AndroidAIErrors.MODEL_UNAVAILABLE,
        "This device has no on-device embedding model",
      )
    if (prepared) return model

    when (val status = model.checkStatus()) {
      FeatureStatus.UNAVAILABLE ->
        throw AndroidAIErrors.CodedException(
          AndroidAIErrors.MODEL_UNAVAILABLE,
          "The embedding model is not available on this device",
        )
      FeatureStatus.DOWNLOADABLE, FeatureStatus.DOWNLOADING ->
        downloads.collect("embedding", "The embedding model", status, model.download())
    }
    model.warmup()
    prepared = true
    return model
  }

  suspend fun embed(values: List<String>, taskType: String?): List<FloatArray> {
    val model = prepare()
    val taskConfig = taskConfig(taskType)
    return values.map { value ->
      val content = Content(listOf(TextPart(value)))
      val request = taskConfig?.let { EmbeddingRequest(content, it) } ?: EmbeddingRequest(content)
      model.generateEmbedding(request).embedding.vector
    }
  }

  private fun taskConfig(taskType: String?): TaskConfig? =
    when (taskType) {
      null -> null
      "retrievalQuery" -> TaskConfig.RetrievalQuery()
      "retrievalDocument" -> TaskConfig.RetrievalDocument()
      "semanticSimilarity" -> TaskConfig.SemanticSimilarity()
      "classification" -> TaskConfig.Classification()
      "clustering" -> TaskConfig.Clustering()
      "questionAnswering" -> TaskConfig.QuestionAnswering()
      "factVerification" -> TaskConfig.FactVerification()
      "codeRetrieval" -> TaskConfig.CodeRetrieval()
      else ->
        throw AndroidAIErrors.CodedException(AndroidAIErrors.INVALID_MESSAGE, "Unknown embedding task type: $taskType")
    }
}
