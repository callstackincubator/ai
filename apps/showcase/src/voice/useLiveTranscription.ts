import {
  experimental_streamTranscribe as streamTranscribe,
  type TranscriptionModel,
} from 'ai'
import { useRef, useState } from 'react'
import {
  AudioContext,
  AudioManager,
  AudioRecorder,
  type RecorderAdapterNode,
} from 'react-native-audio-api'
import { useSharedValue, withTiming } from 'react-native-reanimated'

const SAMPLE_RATE = 16000
const STOP_DELAY_MS = 500

const join = (...texts: string[]) => texts.filter(Boolean).join(' ')

// Records the microphone and transcribes it while it records. The flow
// follows the record button in apps/expo-example
export function useLiveTranscription(model: TranscriptionModel) {
  const [status, setStatus] = useState<'idle' | 'recording' | 'finishing'>(
    'idle'
  )
  const [transcript, setTranscript] = useState('')
  // Loudness of the microphone, 0 to 1
  const level = useSharedValue(0)

  const recorderRef = useRef<AudioRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const recorderAdapterRef = useRef<RecorderAdapterNode | null>(null)
  const audioRef = useRef<ReadableStreamDefaultController<Uint8Array> | null>(
    null
  )
  const transcriptionRef = useRef<Promise<string> | null>(null)

  const transcribe = async (audio: ReadableStream<Uint8Array>) => {
    const result = streamTranscribe({
      model,
      audio,
      inputAudioFormat: { type: 'audio/pcm', rate: SAMPLE_RATE },
      // The recorder delivers float samples
      providerOptions: { apple: { encoding: 'float32' } },
    })

    // Final text is settled, partial text is replaced by the next result
    let finalText = ''
    for await (const part of result.fullStream) {
      if (part.type === 'transcript-final') {
        finalText = join(finalText, part.text.trim())
        setTranscript(finalText)
      } else if (part.type === 'transcript-partial') {
        setTranscript(join(finalText, part.text.trim()))
      } else if (part.type === 'error') {
        throw part.error
      }
    }
    return (await result.text).trim()
  }

  // Resolves once recording has started, false when the microphone is denied
  const start = async () => {
    const permission = await AudioManager.requestRecordingPermissions()
    if (permission !== 'Granted') {
      return false
    }

    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'voiceChat',
      iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
    })
    // A fresh recorder each time avoids piling up listeners
    const recorder = new AudioRecorder()
    recorderRef.current = recorder

    setTranscript('')
    const audio = new ReadableStream<Uint8Array>({
      start: (controller) => {
        audioRef.current = controller
      },
      // A failed transcription cancels the audio, which then takes no more
      cancel: () => {
        audioRef.current = null
      },
    })
    transcriptionRef.current = transcribe(audio)

    // Small chunks, so the text keeps up with the speech
    recorder.onAudioReady(
      {
        sampleRate: SAMPLE_RATE,
        bufferLength: SAMPLE_RATE / 10,
        channelCount: 1,
      },
      ({ buffer }) => {
        // Copies the samples, as the recorder reuses its buffers
        const samples = buffer.getChannelData(0).slice()
        audioRef.current?.enqueue(new Uint8Array(samples.buffer))

        let sum = 0
        for (const sample of samples) sum += sample * sample
        const rms = Math.sqrt(sum / samples.length)
        level.value = withTiming(Math.min(1, rms * 8), { duration: 100 })
      }
    )

    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
    audioContextRef.current = audioContext
    recorderAdapterRef.current = audioContext.createRecorderAdapter()
    recorderAdapterRef.current.connect(audioContext.destination)
    recorder.connect(recorderAdapterRef.current)

    try {
      await recorder.start()
    } catch (error) {
      // Ends the transcription, which would otherwise wait for audio
      audioRef.current?.close()
      audioRef.current = null
      throw error
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }
    setStatus('recording')
    return true
  }

  // Resolves with the full transcript
  const stop = async () => {
    const recorder = recorderRef.current
    if (!recorder) return ''

    setStatus('finishing')
    level.value = withTiming(0)
    // Captures the end of the last word
    await new Promise((resolve) => setTimeout(resolve, STOP_DELAY_MS))
    await recorder.stop()

    // Ending the audio finalizes the transcription
    audioRef.current?.close()
    audioRef.current = null
    try {
      return (await transcriptionRef.current) ?? ''
    } finally {
      transcriptionRef.current = null
      recorderRef.current = null
      recorderAdapterRef.current = null
      audioContextRef.current = null
      setStatus('idle')
    }
  }

  return { status, transcript, level, start, stop }
}
