import Ionicons from '@expo/vector-icons/Ionicons'
import {
  experimental_streamTranscribe as streamTranscribe,
  TranscriptionModel,
} from 'ai'
import { SymbolView } from 'expo-symbols'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native'
import {
  AudioContext,
  AudioManager,
  AudioRecorder,
  RecorderAdapterNode,
} from 'react-native-audio-api'

import { colors } from '../../theme/colors'
import { AdaptiveGlass } from '../AdaptiveGlass'

const SAMPLE_RATE = 16000
const STOP_DELAY_MS = 500

export interface RecordButtonUIBaseProps {
  // The text heard so far while recording, and an empty string once done
  onTranscriptionUpdate?: (text: string) => void
  onTranscriptionComplete: (text: string) => void
  disabled?: boolean
  transcriptionModel?: TranscriptionModel
}

const join = (...texts: string[]) => texts.filter(Boolean).join(' ')

export function RecordButtonUIBase({
  onTranscriptionUpdate,
  onTranscriptionComplete,
  disabled = false,
  transcriptionModel,
}: RecordButtonUIBaseProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)

  const recorderRef = useRef<AudioRecorder | null>(null)
  const aCtxRef = useRef<AudioContext | null>(null)
  const recorderAdapterRef = useRef<RecorderAdapterNode | null>(null)
  // The recorder's audio, transcribed while it records
  const audioRef = useRef<ReadableStreamDefaultController<Uint8Array> | null>(
    null
  )
  const transcriptionRef = useRef<Promise<void> | null>(null)

  const initializeRecorder = () => {
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'voiceChat',
      iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
    })

    // Always create a fresh recorder to avoid accumulating listeners
    recorderRef.current = new AudioRecorder()
  }

  const requestPermissionIfNeeded = async (): Promise<boolean> => {
    if (hasPermission === true) {
      return true
    }

    const status = await AudioManager.requestRecordingPermissions()
    const granted = status === 'Granted'
    setHasPermission(granted)
    return granted
  }

  const transcribe = async (
    model: TranscriptionModel,
    audio: ReadableStream<Uint8Array>
  ) => {
    try {
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
          onTranscriptionUpdate?.(finalText)
        } else if (part.type === 'transcript-partial') {
          onTranscriptionUpdate?.(join(finalText, part.text.trim()))
        } else if (part.type === 'error') {
          throw part.error
        }
      }

      const text = (await result.text).trim()
      if (text) {
        onTranscriptionComplete(text)
      }
    } catch (error) {
      Alert.alert(
        'Transcription Error',
        error instanceof Error ? error.message : 'Failed to transcribe audio'
      )
    } finally {
      onTranscriptionUpdate?.('')
    }
  }

  const startRecording = async () => {
    const granted = await requestPermissionIfNeeded()
    if (!granted) {
      Alert.alert(
        'Microphone Permission Required',
        'Please enable microphone access in Settings to use voice recording.'
      )
      return
    }

    if (!transcriptionModel) {
      console.error('transcriptionModel is not provided')
      return
    }

    initializeRecorder()

    if (!recorderRef.current) {
      console.error('AudioRecorder is not initialized')
      return
    }

    const audio = new ReadableStream<Uint8Array>({
      start: (controller) => {
        audioRef.current = controller
      },
      // A failed transcription cancels the audio, which then takes no more
      cancel: () => {
        audioRef.current = null
      },
    })
    transcriptionRef.current = transcribe(transcriptionModel, audio)

    // Small chunks, so the text keeps up with the speech
    recorderRef.current.onAudioReady(
      {
        sampleRate: SAMPLE_RATE,
        bufferLength: SAMPLE_RATE / 10,
        channelCount: 1,
      },
      ({ buffer }) => {
        // Copies the samples, as the recorder reuses its buffers
        const samples = buffer.getChannelData(0).slice()
        audioRef.current?.enqueue(new Uint8Array(samples.buffer))
      }
    )

    aCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
    recorderAdapterRef.current = aCtxRef.current.createRecorderAdapter()
    recorderAdapterRef.current.connect(aCtxRef.current.destination)
    recorderRef.current.connect(recorderAdapterRef.current)

    try {
      await recorderRef.current.start()
    } catch (error) {
      // Ends the transcription, which would otherwise wait for audio
      audioRef.current?.close()
      audioRef.current = null
      throw error
    }
    setIsRecording(true)

    if (aCtxRef.current.state === 'suspended') {
      aCtxRef.current.resume()
    }
  }

  const stopRecording = async () => {
    if (!recorderRef.current) {
      console.error('AudioRecorder is not initialized')
      return
    }

    // Immediately update UI to feel snappy
    setIsRecording(false)
    setIsStopping(true)

    // Add a small delay to capture the end of speech
    await new Promise((resolve) => setTimeout(resolve, STOP_DELAY_MS))

    await recorderRef.current.stop()
    setIsStopping(false)

    // Ending the audio finalizes the transcription
    audioRef.current?.close()
    audioRef.current = null
    setIsTranscribing(true)
    await transcriptionRef.current
    transcriptionRef.current = null
    setIsTranscribing(false)

    aCtxRef.current = null
    recorderAdapterRef.current = null
  }

  const handlePress = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const isProcessing = isStopping || isTranscribing

  if (isRecording) {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled || !transcriptionModel}
        style={styles.recordingButton}
      >
        <ActivityIndicator size="small" color="#fff" />
      </Pressable>
    )
  }

  const uiDisabled = disabled || isProcessing || !transcriptionModel

  return (
    <AdaptiveGlass isInteractive style={styles.glassButton}>
      <Pressable
        onPress={handlePress}
        disabled={uiDisabled}
        style={styles.pressable}
      >
        {isProcessing ? (
          <ActivityIndicator
            size="small"
            color={colors.secondaryLabel as any}
          />
        ) : (
          <SymbolView
            name="mic.fill"
            size={20}
            tintColor={uiDisabled ? colors.label : colors.placeholderText}
            resizeMode="scaleAspectFit"
            fallback={
              <Ionicons
                name="mic"
                size={20}
                color={uiDisabled ? '#666' : colors.label}
              />
            }
          />
        )}
      </Pressable>
    </AdaptiveGlass>
  )
}

const styles = StyleSheet.create({
  glassButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  pressable: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
