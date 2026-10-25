package com.callstack.ai.adk

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.ParcelFileDescriptor
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
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.takeWhile
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
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

data class TranscriptionResult(val text: String, val durationInSeconds: Double)

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

  suspend fun transcribe(audio: ByteArray, config: TranscriptionConfig): TranscriptionResult =
    withContext(Dispatchers.IO) {
      val pcm = decodeToPcm(audio)

      client(config).use { recognizer ->
        prepare(recognizer)

        val (readSide, writeSide) = ParcelFileDescriptor.createPipe()
        val request = speechRecognizerRequest {
          audioSource = AudioSource.fromPfd(readSide, AudioSource.Mode.STREAMING, PCM_FORMAT)
        }
        val finalTexts = mutableListOf<String>()
        var partialText = ""

        coroutineScope {
          val writer = launch { writePcm(writeSide, pcm) }
          // Recognition only ends on its own when ML Kit detects the end of the input
          val stopper = launch {
            writer.join()
            delay(STOP_GRACE_MS)
            recognizer.stopRecognition()
          }

          try {
            recognizer.startRecognition(request)
              .takeWhile { it !is SpeechRecognizerResponse.CompletedResponse }
              .collect { response ->
                when (response) {
                  is SpeechRecognizerResponse.FinalTextResponse -> {
                    finalTexts += response.text
                    partialText = ""
                  }
                  is SpeechRecognizerResponse.PartialTextResponse -> partialText = response.text
                  is SpeechRecognizerResponse.ErrorResponse -> throw response.e
                  else -> Unit
                }
              }
          } finally {
            writer.cancel()
            stopper.cancel()
            // Unblocks a writer stuck on a full pipe
            runCatching { readSide.close() }
          }
        }

        TranscriptionResult(
          text = (finalTexts + partialText).map { it.trim() }.filter { it.isNotEmpty() }
            .joinToString(" "),
          durationInSeconds = pcm.size / 2.0 / SAMPLE_RATE,
        )
      }
    }

  /**
   * ML Kit reads raw PCM from the descriptor at real-time pace, so the audio is written in
   * chunks spaced by their duration rather than all at once.
   */
  private suspend fun writePcm(writeSide: ParcelFileDescriptor, pcm: ByteArray) {
    ParcelFileDescriptor.AutoCloseOutputStream(writeSide).use { output ->
      val startedAt = System.nanoTime()
      var offset = 0
      var chunk = 0
      while (offset < pcm.size) {
        val waitMs = (startedAt + chunk * CHUNK_MS * 1_000_000L - System.nanoTime()) / 1_000_000L
        if (waitMs > 0) delay(waitMs)
        val length = minOf(CHUNK_BYTES, pcm.size - offset)
        try {
          output.write(pcm, offset, length)
        } catch (_: IOException) {
          // Recognition finished and closed the read side
          return
        }
        offset += length
        chunk++
      }
    }
  }

  /** Decodes any audio container Android supports into 16 kHz mono 16-bit PCM. */
  private fun decodeToPcm(audio: ByteArray): ByteArray {
    val file = File.createTempFile("adk-transcription", null, context.cacheDir)
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      file.writeBytes(audio)
      try {
        extractor.setDataSource(file.path)
      } catch (error: IOException) {
        throw AdkErrors.AdkException(
          AdkErrors.INVALID_MESSAGE,
          "Could not read the audio. Use a format Android can decode, such as WAV, MP3, AAC or Ogg",
          error,
        )
      }

      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: throw AdkErrors.AdkException(AdkErrors.INVALID_MESSAGE, "The audio has no audio track")
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)

      val decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec = decoder
      decoder.configure(format, null, null, 0)
      decoder.start()

      val samples = FloatSamples()
      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      val info = MediaCodec.BufferInfo()
      var inputDone = false

      while (true) {
        if (!inputDone) {
          val inputIndex = decoder.dequeueInputBuffer(CODEC_TIMEOUT_US)
          if (inputIndex >= 0) {
            val size = extractor.readSampleData(decoder.getInputBuffer(inputIndex)!!, 0)
            if (size < 0) {
              decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              decoder.queueInputBuffer(inputIndex, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }

        val outputIndex = decoder.dequeueOutputBuffer(info, CODEC_TIMEOUT_US)
        if (outputIndex < 0) continue

        val outputFormat = decoder.getOutputFormat(outputIndex)
        sampleRate = outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val buffer = decoder.getOutputBuffer(outputIndex)!!
        buffer.position(info.offset)
        buffer.limit(info.offset + info.size)
        samples.appendMono(
          buffer.order(ByteOrder.LITTLE_ENDIAN),
          channels = outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT),
          encoding =
            if (outputFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
              outputFormat.getInteger(MediaFormat.KEY_PCM_ENCODING)
            } else {
              AudioFormat.ENCODING_PCM_16BIT
            },
        )
        decoder.releaseOutputBuffer(outputIndex, false)

        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
      }

      return samples.toPcm16(sampleRate)
    } finally {
      codec?.let {
        runCatching { it.stop() }
        it.release()
      }
      extractor.release()
      file.delete()
    }
  }

  /** Growable buffer of mono samples in [-1, 1]. */
  private class FloatSamples {
    private var data = FloatArray(SAMPLE_RATE)
    private var size = 0

    fun appendMono(buffer: ByteBuffer, channels: Int, encoding: Int) {
      when (encoding) {
        AudioFormat.ENCODING_PCM_16BIT -> {
          val shorts = buffer.asShortBuffer()
          while (shorts.remaining() >= channels) {
            var sum = 0f
            repeat(channels) { sum += shorts.get() / 32768f }
            add(sum / channels)
          }
        }
        AudioFormat.ENCODING_PCM_FLOAT -> {
          val floats = buffer.asFloatBuffer()
          while (floats.remaining() >= channels) {
            var sum = 0f
            repeat(channels) { sum += floats.get() }
            add(sum / channels)
          }
        }
        else ->
          throw AdkErrors.AdkException(
            AdkErrors.INVALID_MESSAGE,
            "Unsupported PCM encoding $encoding. Use 16-bit or float audio",
          )
      }
    }

    private fun add(sample: Float) {
      if (size == data.size) data = data.copyOf(data.size * 2)
      data[size++] = sample
    }

    /** Linearly resamples to [SAMPLE_RATE] and converts to little-endian 16-bit PCM. */
    fun toPcm16(sourceRate: Int): ByteArray {
      val outputSize = (size.toLong() * SAMPLE_RATE / sourceRate).toInt()
      val output = ByteBuffer.allocate(outputSize * 2).order(ByteOrder.LITTLE_ENDIAN)
      val step = sourceRate.toDouble() / SAMPLE_RATE
      for (index in 0 until outputSize) {
        val position = index * step
        val left = position.toInt().coerceAtMost(size - 1)
        val right = (left + 1).coerceAtMost(size - 1)
        val fraction = (position - left).toFloat()
        val sample = data[left] + (data[right] - data[left]) * fraction
        output.putShort((sample.coerceIn(-1f, 1f) * Short.MAX_VALUE).toInt().toShort())
      }
      return output.array()
    }
  }

  companion object {
    private const val SAMPLE_RATE = 16_000
    private const val CHUNK_MS = 100
    private const val CHUNK_BYTES = SAMPLE_RATE * 2 * CHUNK_MS / 1000
    private const val STOP_GRACE_MS = 1_500L
    private const val CODEC_TIMEOUT_US = 10_000L

    private val PCM_FORMAT: AudioFormat =
      AudioFormat.Builder()
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setSampleRate(SAMPLE_RATE)
        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
        .build()
  }
}
