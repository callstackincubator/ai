package com.callstack.ai

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.net.URL
import java.util.concurrent.atomic.AtomicInteger

/**
 * ModelDownloader handles downloading and managing MLC model files.
 *
 * This class is responsible for:
 * - Downloading model tokenizer files and parameter files from remote URLs
 * - Managing concurrent downloads with controlled parallelism (max 3 simultaneous downloads)
 * - Tracking download progress and providing real-time updates
 */
class ModelDownloader(
  private val modelUrl: String,
  private val modelDir: File
) {
  private var paramsConfig: ParamsConfig = ParamsConfig(emptyList())

  companion object {
    const val PARAMS_CONFIG_FILENAME = "ndarray-cache.json"
    const val MODEL_CONFIG_FILENAME = "mlc-chat-config.json"
    private val json = Json { ignoreUnknownKeys = true }
  }

  /**
   * Downloads all required model files including tokenizer files and parameter files.
   *
   * @param onProgress Optional callback for progress updates (current, total)
   */
  suspend fun downloadModel(onProgress: (current: Int, total: Int) -> Unit = { _, _ -> }) {
    val progressCounter = AtomicInteger(0)

    // First download model config and params config
    coroutineScope {
      listOf(
        async {
          downloadSingleFile(MODEL_CONFIG_FILENAME)
        },
        async {
          downloadSingleFile(PARAMS_CONFIG_FILENAME)
        }
      ).awaitAll()
    }

    // Load model config to get tokenizer files
    val modelConfigFile = File(modelDir, MODEL_CONFIG_FILENAME)
    require(modelConfigFile.exists()) { "Model config file not found: ${modelConfigFile.path}" }
    val modelConfig = json.decodeFromString<ModelConfig>(modelConfigFile.readText())

    // Load params config to get parameter files
    val paramsConfigFile = File(modelDir, PARAMS_CONFIG_FILENAME)
    require(paramsConfigFile.exists()) { "Params config file not found: ${paramsConfigFile.path}" }
    paramsConfig = json.decodeFromString<ParamsConfig>(paramsConfigFile.readText())

    // Now download tokenizer files and parameter files
    val allFiles = modelConfig.tokenizer_files + paramsConfig.records.map { it.dataPath }
    val remainingFiles = allFiles.filter { !File(modelDir, it).exists() }

    if (remainingFiles.isNotEmpty()) {
      coroutineScope {
        remainingFiles.chunked(3).forEach { chunk ->
          chunk.map { filename ->
            async {
              downloadSingleFile(filename)
              onProgress(progressCounter.incrementAndGet(), allFiles.size)
            }
          }.awaitAll()
        }
      }
    }

    // Final progress update
    onProgress(progressCounter.get(), allFiles.size)
  }


  /**
   * Downloads a single file from the remote URL.
   * Returns early if the file already exists.
   */
  private suspend fun downloadSingleFile(filename: String): Unit = withContext(Dispatchers.IO) {
    val targetFile = File(modelDir, filename)

    // Skip if file already exists
    if (targetFile.exists()) {
      return@withContext
    }

    val url = URL("$modelUrl/resolve/main/$filename")

    // Ensure parent directory exists
    targetFile.parentFile?.mkdirs()

    // Download to temporary file first, then rename to avoid partial files
    val tempFile = File(modelDir, "$filename.tmp")

    url.openStream().use { input ->
      tempFile.outputStream().use { output ->
        input.copyTo(output)
      }
    }

    require(tempFile.exists()) { "Failed to download file: $filename" }
    require(tempFile.renameTo(targetFile)) { "Failed to rename temp file: $filename" }
  }
}

@Serializable
data class ParamsConfig(val records: List<ParamsRecord>)

@Serializable
data class ParamsRecord(val dataPath: String)

@Serializable
data class ModelConfig(
  val tokenizer_files: List<String>,
  val context_window_size: Int,
  val prefill_chunk_size: Int
)
