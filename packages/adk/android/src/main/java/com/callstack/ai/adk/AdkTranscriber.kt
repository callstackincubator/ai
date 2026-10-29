package com.callstack.ai.adk

import android.content.Context
import com.facebook.react.bridge.ReadableMap
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.common.audio.AudioSource
import com.google.mlkit.genai.speechrecognition.SpeechRecognition
import com.google.mlkit.genai.speechrecognition.SpeechRecognizer
import com.google.mlkit.genai.speechrecognition.SpeechRecognizerOptions
import com.google.mlkit.genai.speechrecognition.SpeechRecognizerResponse
import com.google.mlkit.genai.speechrecognition.speechRecognizerOptions
import com.google.mlkit.genai.speechrecognition.speechRecognizerRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.takeWhile
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Locale

data class TranscriptionConfig(val language: String?, val mode: String?) {
  companion object {
    fun from(map: ReadableMap?): TranscriptionConfig =
      TranscriptionConfig(
        language = map?.takeIf { it.hasKey("language") }?.getString("language"),
        mode = map?.takeIf { it.hasKey("mode") }?.getString("mode"),
      )
  }
}

data class TranscriptionResult(val text: String)

/** On-device speech to text with ML Kit GenAI speech recognition. */
class AdkTranscriber(
  private val context: Context,
  private val onDownloadProgress: (
    phase: String,
    bytesDownloaded: Long?,
    bytesToDownload: Long?,
  ) -> Unit,
) {
  private fun client(config: TranscriptionConfig): SpeechRecognizer =
    SpeechRecognition.getClient(
      speechRecognizerOptions {
        locale = config.language?.let { Locale.forLanguageTag(it) } ?: Locale.getDefault()
        preferredMode =
          if (config.mode == "advanced") {
            SpeechRecognizerOptions.Mode.MODE_ADVANCED
          } else {
            SpeechRecognizerOptions.Mode.MODE_BASIC
          }
      },
    )

  suspend fun getAvailability(config: TranscriptionConfig): String =
    client(config).use { recognizer ->
      val status =
        try {
          recognizer.checkStatus()
        } catch (_: Exception) {
          return "unknown"
        }
      when (status) {
        FeatureStatus.UNAVAILABLE -> "unavailable"
        FeatureStatus.DOWNLOADABLE -> "downloadable"
        FeatureStatus.DOWNLOADING -> "downloading"
        FeatureStatus.AVAILABLE -> "available"
        else -> "unknown"
      }
    }

  /** Downloads the speech recognition model for the locale when needed. */
  suspend fun prepare(config: TranscriptionConfig) {
    client(config).use { prepare(it) }
  }

  private suspend fun prepare(recognizer: SpeechRecognizer) {
    val status = recognizer.checkStatus()
    when (status) {
      FeatureStatus.AVAILABLE -> return
      FeatureStatus.UNAVAILABLE ->
        throw AdkErrors.AdkException(
          AdkErrors.MODEL_UNAVAILABLE,
          "Speech recognition is not supported for this locale and mode on this device",
        )
    }

    try {
      recognizer.download().collect { downloadStatus ->
        when (downloadStatus) {
          is DownloadStatus.DownloadStarted ->
            onDownloadProgress("started", 0, downloadStatus.bytesToDownload)
          is DownloadStatus.DownloadProgress ->
            onDownloadProgress("progress", downloadStatus.totalBytesDownloaded, null)
          is DownloadStatus.DownloadCompleted -> onDownloadProgress("completed", null, null)
          is DownloadStatus.DownloadFailed ->
            throw AdkErrors.AdkException(
              AdkErrors.DOWNLOAD_FAILED,
              "Speech recognition model download failed: ${downloadStatus.e.message}",
              downloadStatus.e,
            )
        }
      }
    } catch (error: GenAiException) {
      if (status == FeatureStatus.DOWNLOADING) {
        throw AdkErrors.AdkException(
          AdkErrors.MODEL_DOWNLOADING,
          "The speech recognition model is still downloading",
          error,
        )
      }
      throw error
    }
  }

  /** Transcribes a whole audio file. ML Kit decodes formats such as WAV, MP3, M4A and Ogg. */
  suspend fun transcribe(audio: ByteArray, config: TranscriptionConfig): TranscriptionResult =
    withContext(Dispatchers.IO) {
      val file = File.createTempFile("adk-transcription", null, context.cacheDir)
      try {
        file.writeBytes(audio)
        client(config).use { recognizer ->
          prepare(recognizer)

          AudioSource.fromFile(file).use { source ->
            val request = speechRecognizerRequest { audioSource = source }
            val texts = mutableListOf<String>()
            recognizer.startRecognition(request)
              .takeWhile { it !is SpeechRecognizerResponse.CompletedResponse }
              .collect { response ->
                when (response) {
                  is SpeechRecognizerResponse.FinalTextResponse -> texts += response.text
                  is SpeechRecognizerResponse.ErrorResponse -> throw response.e
                  else -> Unit
                }
              }
            TranscriptionResult(
              text = texts.map { it.trim() }.filter { it.isNotEmpty() }.joinToString(" "),
            )
          }
        }
      } finally {
        file.delete()
      }
    }
}
