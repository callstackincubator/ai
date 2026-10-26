import { generateId } from '@ai-sdk/provider-utils'
import type { CodegenTypes, TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

// A type rather than an interface, so it fits JSON provider metadata
export type TranscriptionSegment = {
  text: string
  startSecond: number
  endSecond: number
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[]
  // Each word with its own timing
  words: TranscriptionSegment[]
  duration: number
}

export type LiveTranscriptionResultEvent = {
  sessionId: string
  text: string
  // Volatile results are quick guesses that a later result replaces, final
  // results are settled
  isFinal: boolean
  startSecond: number
  endSecond: number
}

export type LiveTranscriptionErrorEvent = {
  sessionId: string
  error: string
}

export interface AppleTranscriptionModelInfo {
  // Whether the device can transcribe at all
  isAvailable: boolean
  // Whether the language resolves to a locale the transcriber supports
  supportsLocale: boolean
  // The supported locale the language resolves to, e.g. en-US for en
  locale?: string
  // Whether the locale's assets are on the device. prepare() installs them
  assets?: 'installed' | 'downloading' | 'supported' | 'unsupported'
  supportedLocales: string[]
}

export interface Spec extends TurboModule {
  isAvailable(language: string): boolean
  getModelInfo(language: string): Promise<CodegenTypes.UnsafeObject>
  prepare(language: string): Promise<void>
  startLiveTranscription(sessionId: string, language: string): Promise<void>
  startStreamTranscription(
    sessionId: string,
    language: string,
    sampleRate: number,
    encoding: string
  ): Promise<void>
  stopLiveTranscription(sessionId: string): Promise<void>

  onLiveTranscriptionResult: CodegenTypes.EventEmitter<LiveTranscriptionResultEvent>
  onLiveTranscriptionError: CodegenTypes.EventEmitter<LiveTranscriptionErrorEvent>
}

export type LiveTranscriptionResult = Omit<
  LiveTranscriptionResultEvent,
  'sessionId'
>

export interface LiveTranscriptionOptions {
  language: string
  onResult: (result: LiveTranscriptionResult) => void
  onError?: (error: Error) => void
}

export interface LiveTranscription {
  // Stops recording and resolves once the last results were delivered
  stop: () => Promise<void>
}

// Raw mono PCM samples, little endian
export type StreamTranscriptionEncoding = 'int16' | 'float32'

export interface StreamTranscriptionOptions extends LiveTranscriptionOptions {
  sampleRate: number
  // Defaults to int16
  encoding?: StreamTranscriptionEncoding
}

export interface StreamTranscription extends LiveTranscription {
  // Chunks can be any size, also splitting a sample
  append: (audio: ArrayBufferLike | ArrayBufferView) => void
}

declare global {
  function __apple__llm__transcribe__(
    data: ArrayBufferLike,
    language: string
  ): Promise<TranscriptionResult>
  function __apple__llm__append_transcription_audio__(
    sessionId: string,
    audio: ArrayBufferLike
  ): void
}

const NativeAppleTranscription = TurboModuleRegistry.getEnforcing<Spec>(
  'NativeAppleTranscription'
)

// Delivers a live session's events until it stops
async function startSession(
  sessionId: string,
  { onResult, onError }: Omit<LiveTranscriptionOptions, 'language'>,
  start: () => Promise<void>
): Promise<LiveTranscription> {
  const listeners = [
    NativeAppleTranscription.onLiveTranscriptionResult(
      ({ sessionId: id, ...result }) => {
        if (id === sessionId) {
          onResult(result)
        }
      }
    ),
    NativeAppleTranscription.onLiveTranscriptionError((event) => {
      if (event.sessionId === sessionId) {
        onError?.(new Error(event.error))
      }
    }),
  ]
  const removeListeners = () =>
    listeners.forEach((listener) => listener.remove())

  try {
    await start()
  } catch (error) {
    removeListeners()
    throw error
  }

  // Calls while a stop is in flight wait for it, instead of resolving before
  // the last results arrive
  let stopping: Promise<void> | undefined
  return {
    stop: () =>
      (stopping ??= NativeAppleTranscription.stopLiveTranscription(sessionId)
        // Native resolves with null, but stop() resolves with nothing
        .then(() => {})
        .finally(removeListeners)),
  }
}

export default {
  transcribe: (data: ArrayBufferLike, language: string) =>
    globalThis.__apple__llm__transcribe__(data, language),
  prepare: NativeAppleTranscription.prepare,
  /**
   * Transcribes the microphone as it records (iOS 27). Asks for microphone
   * access, so the app needs NSMicrophoneUsageDescription
   */
  transcribeLive: ({
    language,
    ...callbacks
  }: LiveTranscriptionOptions): Promise<LiveTranscription> => {
    const sessionId = generateId()
    return startSession(sessionId, callbacks, () =>
      NativeAppleTranscription.startLiveTranscription(sessionId, language)
    )
  },
  /**
   * Transcribes audio as the app appends it, e.g. from its own recorder
   */
  transcribeStream: async ({
    language,
    sampleRate,
    encoding = 'int16',
    ...callbacks
  }: StreamTranscriptionOptions): Promise<StreamTranscription> => {
    const sessionId = generateId()
    const session = await startSession(sessionId, callbacks, () =>
      NativeAppleTranscription.startStreamTranscription(
        sessionId,
        language,
        sampleRate,
        encoding
      )
    )
    let stopped = false
    return {
      append: (audio) => {
        if (stopped) {
          throw new Error('The transcription session is stopped')
        }
        // A typed array can be a view into a larger buffer, so only its bytes are sent
        globalThis.__apple__llm__append_transcription_audio__(
          sessionId,
          ArrayBuffer.isView(audio)
            ? audio.buffer.slice(
                audio.byteOffset,
                audio.byteOffset + audio.byteLength
              )
            : audio
        )
      },
      stop: () => {
        stopped = true
        return session.stop()
      },
    }
  },
  // Whether the device can transcribe. getModelInfo reports locale support
  isAvailable: NativeAppleTranscription.isAvailable,
  getModelInfo: (language: string) =>
    NativeAppleTranscription.getModelInfo(
      language
    ) as Promise<AppleTranscriptionModelInfo>,
}
