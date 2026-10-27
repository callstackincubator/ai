import {
  experimental_streamTranscribe as streamTranscribe,
  type TranscriptionModel,
} from 'ai'
import { useEffect, useRef, useState } from 'react'
import {
  AudioContext,
  AudioManager,
  AudioRecorder,
  type RecorderAdapterNode,
} from 'react-native-audio-api'
import { useSharedValue, withTiming } from 'react-native-reanimated'

import { isSimulator } from '../simulator'

const SAMPLE_RATE = 16000
const STOP_DELAY_MS = 500

const join = (...texts: string[]) => texts.filter(Boolean).join(' ')

// What the Simulator "hears", as it has no speech recognition
const simulatedQuestions = [
  'What should I pack for a weekend hike?',
  'Give me a quick idea for dinner tonight.',
  'How do I keep a sourdough starter alive?',
]
let simulatedIndex = 0

// Records the microphone and transcribes it while it records
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
  const simulationRef = useRef<{
    timer: ReturnType<typeof setInterval>
    text: string
  } | null>(null)

  // Stops the microphone and timers when the screen goes away mid-recording
  useEffect(
    () => () => {
      if (simulationRef.current) clearInterval(simulationRef.current.timer)
      // stop() may be closing the same resources, so failures are ignored
      recorderRef.current?.stop().catch(() => {})
      audioRef.current?.close()
      audioContextRef.current?.close().catch(() => {})
    },
    []
  )

  // Reveals a scripted question word by word, with a moving level
  const startSimulation = () => {
    const text =
      simulatedQuestions[simulatedIndex++ % simulatedQuestions.length]
    const words = text.split(' ')
    let count = 0
    setTranscript('')
    const timer = setInterval(() => {
      count = Math.min(words.length, count + 1)
      setTranscript(words.slice(0, count).join(' '))
      level.value = withTiming(0.3 + Math.random() * 0.5, { duration: 150 })
    }, 300)
    simulationRef.current = { timer, text }
    setStatus('recording')
    return true
  }

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
    if (isSimulator) {
      return startSimulation()
    }
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
    const transcription = transcribe(audio)
    transcriptionRef.current = transcription

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
      transcription.catch(() => {})
      audioContext.close()
      transcriptionRef.current = null
      recorderRef.current = null
      recorderAdapterRef.current = null
      audioContextRef.current = null
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
    const simulation = simulationRef.current
    if (simulation) {
      clearInterval(simulation.timer)
      simulationRef.current = null
      level.value = withTiming(0)
      setTranscript(simulation.text)
      setStatus('idle')
      return simulation.text
    }
    const recorder = recorderRef.current
    if (!recorder) return ''

    setStatus('finishing')
    level.value = withTiming(0)
    // Releases everything even when stopping the recorder fails
    try {
      // Captures the end of the last word
      await new Promise((resolve) => setTimeout(resolve, STOP_DELAY_MS))
      await recorder.stop()

      // Ending the audio finalizes the transcription
      audioRef.current?.close()
      audioRef.current = null
      return (await transcriptionRef.current) ?? ''
    } finally {
      audioRef.current?.close()
      audioRef.current = null
      transcriptionRef.current = null
      recorderRef.current = null
      recorderAdapterRef.current = null
      audioContextRef.current?.close().catch(() => {})
      audioContextRef.current = null
      setStatus('idle')
    }
  }

  return { status, transcript, level, start, stop }
}
