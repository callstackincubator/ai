import { apple, AppleTranscription, AppleUtils } from '@react-native-ai/apple'
import { Picker } from '@react-native-picker/picker'
import { experimental_transcribe } from 'ai'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  AudioBuffer,
  AudioContext,
  AudioManager,
  AudioRecorder,
  RecorderAdapterNode,
} from 'react-native-audio-api'

import {
  float32ArrayToWAV,
  mergeBuffersToFloat32Array,
} from '../utils/audioUtils'

const DEMO_FILE =
  'https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav'

const SAMPLE_RATE = 16000

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  sampleRateText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 12,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 2,
    borderColor: '#d1d5db',
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  availableStatus: {
    color: '#10b981',
    fontWeight: '600',
  },
  unavailableStatus: {
    color: '#ef4444',
    fontWeight: '600',
  },
  pickerContainer: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#f9fafb',
  },
  demoDescription: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  transcriptionText: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
  },
  transcriptionScrollView: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 16,
    marginTop: 12,
    backgroundColor: '#f9fafb',
    maxHeight: 200,
  },
  timeText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  bufferInfo: {
    fontSize: 14,
    color: '#10b981',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '500',
  },
})

export default function TranscribeScreen() {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcription, setTranscription] = useState<{
    text: string
    time: number
  } | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [wavBuffer, setWavBuffer] = useState<ArrayBuffer | null>(null)
  const [isLoadingDemo, setIsLoadingDemo] = useState(false)

  const recorderRef = useRef<AudioRecorder | null>(null)
  const aCtxRef = useRef<AudioContext | null>(null)
  const recorderAdapterRef = useRef<RecorderAdapterNode | null>(null)
  const audioBuffersRef = useRef<AudioBuffer[]>([])

  const currentLanguage = 'en-US'
  const isAvailable = AppleTranscription.isAvailable(currentLanguage)

  useEffect(() => {
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'voiceChat',
      iosOptions: ['defaultToSpeaker', 'allowBluetooth'],
    })

    AudioManager.requestRecordingPermissions()

    recorderRef.current = new AudioRecorder({
      sampleRate: SAMPLE_RATE,
      bufferLengthInSamples: SAMPLE_RATE,
    })
  }, [])

  const prepareAssets = async () => {
    if (isPreparing) return

    setIsPreparing(true)
    try {
      await AppleTranscription.prepare(currentLanguage)
      Alert.alert('Success', `Assets prepared for ${currentLanguage}`)
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to prepare assets'
      )
    } finally {
      setIsPreparing(false)
    }
  }

  const transcribe = async (audioBuffer: ArrayBuffer) => {
    setIsTranscribing(true)
    setTranscription(null)

    const startTime = Date.now()

    try {
      const result = await experimental_transcribe({
        model: apple.transcriptionModel(),
        audio: audioBuffer,
        providerOptions: {
          apple: {
            language: currentLanguage,
          },
        },
      })

      const endTime = Date.now()
      const duration = endTime - startTime

      setTranscription({
        text: result.text,
        time: duration,
      })
    } catch (error) {
      Alert.alert(
        'Transcription Error',
        error instanceof Error ? error.message : 'Failed to transcribe audio'
      )
    } finally {
      setIsTranscribing(false)
    }
  }

  const loadDemoFile = async () => {
    setIsLoadingDemo(true)
    try {
      const response = await fetch(DEMO_FILE)
      const audioBuffer = await response.arrayBuffer()
      setWavBuffer(audioBuffer)
    } catch (error) {
      Alert.alert(
        'Load Error',
        error instanceof Error ? error.message : 'Failed to load demo file'
      )
    } finally {
      setIsLoadingDemo(false)
    }
  }

  const startRecording = () => {
    if (!recorderRef.current) {
      console.error('AudioRecorder is not initialized')
      return
    }

    audioBuffersRef.current = []

    recorderRef.current.onAudioReady((event) => {
      const { buffer, numFrames, when } = event
      console.log(
        'Audio recorder buffer ready:',
        buffer.duration,
        numFrames,
        when
      )
      audioBuffersRef.current.push(buffer)
    })

    aCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
    recorderAdapterRef.current = aCtxRef.current.createRecorderAdapter()
    recorderAdapterRef.current.connect(aCtxRef.current.destination)
    recorderRef.current.connect(recorderAdapterRef.current)

    recorderRef.current.start()
    setIsRecording(true)
    console.log('Recording started')

    if (aCtxRef.current.state === 'suspended') {
      aCtxRef.current.resume()
    }
  }

  const stopRecording = async () => {
    if (!recorderRef.current) {
      console.error('AudioRecorder is not initialized')
      return
    }

    recorderRef.current.stop()
    setIsRecording(false)

    // Merge all recorded PCM data
    const mergedPCM = mergeBuffersToFloat32Array(audioBuffersRef.current)
    if (mergedPCM.length > 0) {
      const duration = mergedPCM.length / SAMPLE_RATE
      console.log(
        `Merged ${audioBuffersRef.current.length} buffers: ${duration.toFixed(1)}s, ${mergedPCM.length} samples`
      )

      // Convert to WAV and store in state
      const recordedWavBuffer = float32ArrayToWAV(mergedPCM, SAMPLE_RATE)
      setWavBuffer(recordedWavBuffer)
    }

    aCtxRef.current = null
    recorderAdapterRef.current = null
    console.log('Recording stopped')
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={styles.container}
    >
      <View style={styles.scrollView}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Audio Recording</Text>
          {/* <Text style={styles.sampleRateText}>Sample rate: {SAMPLE_RATE}</Text> */}

          <TouchableOpacity
            style={[
              styles.button,
              isRecording ? styles.disabledButton : styles.primaryButton,
            ]}
            onPress={startRecording}
            disabled={isRecording}
          >
            <Text style={styles.buttonText}>
              {isRecording ? 'Recording...' : 'Start Recording'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              !isRecording ? styles.disabledButton : styles.primaryButton,
            ]}
            onPress={stopRecording}
            disabled={!isRecording}
          >
            <Text style={styles.buttonText}>Stop Recording</Text>
          </TouchableOpacity>

          {audioBuffersRef.current.length > 0 && (
            <Text style={styles.bufferInfo}>
              Recorded {audioBuffersRef.current.length} audio buffers
            </Text>
          )}
        </View>

        {/* <View style={styles.card}>
          <Text style={styles.sectionTitle}>Status</Text>
          <Text style={styles.statusText}>
            Transcription for {currentLanguage}:{' '}
            <Text
              style={
                isAvailable ? styles.availableStatus : styles.unavailableStatus
              }
            >
              {isAvailable ? 'Available' : 'Not Available'}
            </Text>
          </Text>
          {!isAvailable && (
            <TouchableOpacity
              style={[
                styles.button,
                styles.secondaryButton,
                isPreparing && styles.disabledButton,
              ]}
              onPress={prepareAssets}
              disabled={isPreparing}
            >
              {isPreparing ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator
                    style={{ marginRight: 8 }}
                    size="small"
                    color="#374151"
                  />
                  <Text style={styles.secondaryButtonText}>
                    Preparing Assets...
                  </Text>
                </View>
              ) : (
                <Text style={styles.secondaryButtonText}>Prepare Assets</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Demo File</Text>
          <TouchableOpacity
            style={[
              styles.button,
              styles.secondaryButton,
              isLoadingDemo && styles.disabledButton,
            ]}
            onPress={loadDemoFile}
            disabled={isLoadingDemo}
          >
            <Text style={styles.secondaryButtonText}>
              {isLoadingDemo ? 'Loading...' : 'Load Demo File'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.demoDescription}>
            Demo contains a Harvard sentence for testing
          </Text>
        </View> */}

        {wavBuffer && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Loaded Audio</Text>
            <TouchableOpacity
              style={[
                styles.button,
                styles.primaryButton,
                isTranscribing && styles.disabledButton,
              ]}
              onPress={() => transcribe(wavBuffer)}
              disabled={isTranscribing}
            >
              <Text style={styles.buttonText}>
                {isTranscribing ? 'Transcribing...' : 'Transcribe Loaded Audio'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {transcription && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Transcription</Text>
            <Text style={styles.timeText}>
              Completed in {transcription.time}ms
            </Text>

            <ScrollView style={styles.transcriptionScrollView}>
              <Text style={styles.transcriptionText}>{transcription.text}</Text>
            </ScrollView>
          </View>
        )}
      </View>
    </ScrollView>
  )
}
