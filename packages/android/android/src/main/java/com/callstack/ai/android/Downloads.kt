package com.callstack.ai.android

import com.google.common.util.concurrent.ListenableFuture
import com.google.mlkit.genai.common.DownloadCallback
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.guava.await

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

  /** Like [collect], for ML Kit's task APIs, which report downloads to a [DownloadCallback]. */
  suspend fun collect(
    model: String,
    displayName: String,
    status: Int,
    download: (DownloadCallback) -> ListenableFuture<Void>,
  ) {
    val callback = object : DownloadCallback {
      override fun onDownloadStarted(bytesToDownload: Long) = onProgress(model, "started", 0, bytesToDownload)

      override fun onDownloadProgress(totalBytesDownloaded: Long) =
        onProgress(model, "progress", totalBytesDownloaded, null)

      override fun onDownloadCompleted() = onProgress(model, "completed", null, null)
    }
    try {
      download(callback).await()
    } catch (error: GenAiException) {
      if (status == FeatureStatus.DOWNLOADING) {
        throw AndroidAIErrors.CodedException(
          AndroidAIErrors.MODEL_DOWNLOADING,
          "$displayName is still downloading",
          error,
        )
      }
      // Its error code, such as not enough disk space, picks the error JS gets
      throw error
    }
  }
}
