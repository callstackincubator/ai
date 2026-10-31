package com.callstack.ai.android

import android.content.Context
import android.os.Build
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
  // The last status seen per language and mode, for the synchronous check
  private val statuses = ConcurrentHashMap<TranscriptionConfig, Int>()
  // One lock per language and mode, so one download does not hold up another
  private val prepareMutexes = ConcurrentHashMap<TranscriptionConfig, Mutex>()

  private fun client(config: TranscriptionConfig): SpeechRecognizer =
    clients.computeIfAbsent(config) {
      SpeechRecognition.getClient(
        speechRecognizerOptions {
          locale = config.locale?.let(::locale) ?: Locale.getDefault()
          when (config.mode) {
            "basic" -> preferredMode = SpeechRecognizerOptions.Mode.MODE_BASIC
            "advanced" -> preferredMode = SpeechRecognizerOptions.Mode.MODE_ADVANCED
          }
        },
      )
    }

  // forLanguageTag returns an undefined locale for a tag it can't parse, such as en_US
  private fun locale(tag: String): Locale =
    Locale.forLanguageTag(tag).takeIf { it.language.isNotEmpty() }
      ?: throw AndroidAIErrors.CodedException(
        AndroidAIErrors.INVALID_MESSAGE,
        "Not a BCP 47 language tag: $tag. Use a tag such as en-US",
      )

  /**
   * Whether the recognizer is available, downloadable or downloading, answered without async work: from the last
   * status this process saw, or else from what the mode needs (Android 12 for basic, AICore for advanced).
   */
  fun isAvailable(config: TranscriptionConfig): Boolean {
    statuses[config]?.let {
      return it == FeatureStatus.AVAILABLE || it == FeatureStatus.DOWNLOADABLE || it == FeatureStatus.DOWNLOADING
    }
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      (config.mode != "advanced" || isAICoreInstalled(context))
  }

  suspend fun getModelInfo(config: TranscriptionConfig): ModelInfo {
    val status = client(config).checkStatus()
    statuses[config] = status
    return ModelInfo(availability = availabilityOf(status))
  }

  /** Downloads the recognizer's model when needed, reporting progress, then warms it up. */
  suspend fun prepare(config: TranscriptionConfig) {
    if (config in prepared) return
    prepareMutexes.computeIfAbsent(config) { Mutex() }.withLock {
      if (config in prepared) return

      val recognizer = client(config)
      val status = recognizer.checkStatus()
      statuses[config] = status
      when (status) {
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
      statuses[config] = FeatureStatus.AVAILABLE
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
