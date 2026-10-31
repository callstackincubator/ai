package com.callstack.ai.android

import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import kotlinx.coroutines.flow.Flow

/** Collects ML Kit model downloads and reports their progress. */
class Downloads(
  private val onProgress: (model: String, phase: String, bytesDownloaded: Long?, bytesToDownload: Long?) -> Unit,
) {
  suspend fun collect(model: String, displayName: String, status: Int, download: Flow<DownloadStatus>) {
    try {
      download.collect { downloadStatus ->
        when (downloadStatus) {
          is DownloadStatus.DownloadStarted ->
            onProgress(model, "started", 0, downloadStatus.bytesToDownload)
          is DownloadStatus.DownloadProgress ->
            onProgress(model, "progress", downloadStatus.totalBytesDownloaded, null)
          is DownloadStatus.DownloadCompleted -> onProgress(model, "completed", null, null)
          is DownloadStatus.DownloadFailed ->
            throw AndroidAIErrors.CodedException(
              AndroidAIErrors.DOWNLOAD_FAILED,
              "$displayName download failed: ${downloadStatus.e.message}",
              downloadStatus.e,
            )
        }
      }
    } catch (error: GenAiException) {
      if (status == FeatureStatus.DOWNLOADING) {
        throw AndroidAIErrors.CodedException(
          AndroidAIErrors.MODEL_DOWNLOADING,
          "$displayName is still downloading",
          error,
        )
      }
      throw error
    }
  }
}
