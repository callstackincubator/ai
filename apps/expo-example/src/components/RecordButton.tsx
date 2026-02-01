import { apple } from '@react-native-ai/apple'
import { experimental_transcribe } from 'ai'
import { SymbolView } from 'expo-symbols'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native'
import {
  AudioBuffer,
  AudioContext,
  AudioManager,
  AudioRecorder,
  RecorderAdapterNode,
} from 'react-native-audio-api'

import { colors } from '../theme/colors'
import {
  float32ArrayToWAV,
  mergeBuffersToFloat32Array,
} from '../utils/audioUtils'
import { AdaptiveGlass } from './AdaptiveGlass'

const SAMPLE_RATE = 16000
const STOP_DELAY_MS = 500

interface RecordButtonProps {
  onTranscriptionComplete: (text: string) => void
  disabled?: boolean
}

export function RecordButton({
  onTranscriptionComplete,
  disabled = false,
}: RecordButtonProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)

  const recorderRef = useRef<AudioRecorder | null>(null)
  const aCtxRef = useRef<AudioContext | null>(null)
  const recorderAdapterRef = useRef<RecorderAdapterNode | null>(null)
  const audioBuffersRef = useRef<AudioBuffer[]>([])

  const initializeRecorder = () => {
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'voiceChat',
      iosOptions: ['defaultToSpeaker', 'allowBluetooth'],
    })

    // Always create a fresh recorder to avoid accumulating listeners
    recorderRef.current = new AudioRecorder({
      sampleRate: SAMPLE_RATE,
      bufferLengthInSamples: SAMPLE_RATE,
    })
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

  const transcribe = async (audioBuffer: ArrayBuffer) => {
    setIsTranscribing(true)

    try {
      const result = await experimental_transcribe({
        model: apple.transcriptionModel(),
        audio: audioBuffer,
      })

      if (result.text.trim()) {
        onTranscriptionComplete(result.text.trim())
      }
    } catch (error) {
      Alert.alert(
        'Transcription Error',
        error instanceof Error ? error.message : 'Failed to transcribe audio'
      )
    } finally {
      setIsTranscribing(false)
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

    initializeRecorder()

    if (!recorderRef.current) {
      console.error('AudioRecorder is not initialized')
      return
    }

    audioBuffersRef.current = []

    recorderRef.current.onAudioReady((event) => {
      const { buffer } = event
      audioBuffersRef.current.push(buffer)
    })

    aCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
    recorderAdapterRef.current = aCtxRef.current.createRecorderAdapter()
    recorderAdapterRef.current.connect(aCtxRef.current.destination)
    recorderRef.current.connect(recorderAdapterRef.current)

    recorderRef.current.start()
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

    recorderRef.current.stop()
    setIsStopping(false)

    // Merge all recorded PCM data
    const mergedPCM = mergeBuffersToFloat32Array(audioBuffersRef.current)
    if (mergedPCM.length > 0) {
      // Convert to WAV and transcribe
      const recordedWavBuffer = float32ArrayToWAV(mergedPCM, SAMPLE_RATE)
      await transcribe(recordedWavBuffer)
    }

    aCtxRef.current = null
    recorderAdapterRef.current = null
  }

  const handlePress = async () => {
    if (isRecording) {
      await stopRecording()
    } else {
      await startRecording()
    }
  }

  const isProcessing = isStopping || isTranscribing

  // Hide the button if transcription is not available
  if (!apple.transcriptionModel().isAvailable()) {
    return null
  }

  if (isRecording) {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={styles.recordingButton}
      >
        <ActivityIndicator size="small" color="#fff" />
      </Pressable>
    )
  }

  return (
    <AdaptiveGlass isInteractive style={styles.glassButton}>
      <Pressable
        onPress={handlePress}
        disabled={disabled || isProcessing}
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
            tintColor={colors.label}
            resizeMode="scaleAspectFit"
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
