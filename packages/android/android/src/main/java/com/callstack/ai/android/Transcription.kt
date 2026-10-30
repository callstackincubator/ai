package com.callstack.ai.android

import android.content.Context
import android.util.Base64
import com.facebook.react.bridge.ReadableMap
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.audio.AudioSource
import com.google.mlkit.genai.speechrecognition.SpeechRecognition
import com.google.mlkit.genai.speechrecognition.SpeechRecognizer
import com.google.mlkit.genai.speechrecognition.SpeechRecognizerOptions
import com.google.mlkit.genai.speechrecognition.SpeechRecognizerResponse
import com.google.mlkit.genai.speechrecognition.speechRecognizerOptions
import com.google.mlkit.genai.speechrecognition.speechRecognizerRequest
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

data class TranscriptionConfig(val locale: String?, val mode: String?) {
  companion object {
    fun from(map: ReadableMap?): TranscriptionConfig =
      TranscriptionConfig(map?.optString("locale"), map?.optString("mode"))
  }
}

/** Transcribes audio files with ML Kit's speech recognition. */
class Transcription(
  private val context: Context,
  private val downloads: Downloads,
) {
  private val clients = ConcurrentHashMap<TranscriptionConfig, SpeechRecognizer>()
  private val prepared = ConcurrentHashMap.newKeySet<TranscriptionConfig>()
  private val prepareMutex = Mutex()

  private fun client(config: TranscriptionConfig): SpeechRecognizer =
    clients.computeIfAbsent(config) {
      SpeechRecognition.getClient(
        speechRecognizerOptions {
          locale = config.locale?.let(Locale::forLanguageTag) ?: Locale.getDefault()
          when (config.mode) {
            "basic" -> preferredMode = SpeechRecognizerOptions.Mode.MODE_BASIC
            "advanced" -> preferredMode = SpeechRecognizerOptions.Mode.MODE_ADVANCED
          }
        },
      )
    }

  suspend fun getModelInfo(config: TranscriptionConfig): ModelInfo =
    ModelInfo(availability = availabilityOf(client(config).checkStatus()))

  /** Downloads the recognizer's model when needed, reporting progress, then warms it up. */
  suspend fun prepare(config: TranscriptionConfig) {
    prepareMutex.withLock {
      if (config in prepared) return

      val recognizer = client(config)
      when (val status = recognizer.checkStatus()) {
        FeatureStatus.UNAVAILABLE ->
          throw AndroidAIErrors.CodedException(
            AndroidAIErrors.MODEL_UNAVAILABLE,
            "Speech recognition is not available for ${config.locale ?: Locale.getDefault().toLanguageTag()} on this device",
          )
        FeatureStatus.DOWNLOADABLE, FeatureStatus.DOWNLOADING ->
          downloads.collect("transcription", "The speech recognition model", status, recognizer.download())
      }
      recognizer.warmup()
      prepared.add(config)
    }
  }

  /** Transcribes a whole audio file, which ML Kit decodes (MP3, WAV, FLAC, M4A or OGG). */
  suspend fun transcribe(audio: String, config: TranscriptionConfig): String {
    prepare(config)
    val file = File.createTempFile("transcription", null, context.cacheDir)
    try {
      file.writeBytes(Base64.decode(audio, Base64.DEFAULT))
      AudioSource.fromFile(file).use { source ->
        val text = StringBuilder()
        client(config).startRecognition(speechRecognizerRequest { audioSource = source }).collect { response ->
          when (response) {
            is SpeechRecognizerResponse.FinalTextResponse -> {
              if (text.isNotEmpty() && response.text.isNotEmpty()) text.append(' ')
              text.append(response.text)
            }
            is SpeechRecognizerResponse.ErrorResponse -> throw response.e
            else -> {}
          }
        }
        return text.toString()
      }
    } finally {
      file.delete()
    }
  }
}
