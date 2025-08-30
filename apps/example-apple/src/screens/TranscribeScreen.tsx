import { apple, AppleTranscription, AppleUtils } from '@react-native-ai/apple'
import { Picker } from '@react-native-picker/picker'
import { experimental_transcribe } from 'ai'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
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

export default function TranscribeScreen() {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcription, setTranscription] = useState<{
    text: string
    time: number
  } | null>(null)
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  const recorderRef = useRef<AudioRecorder | null>(null)
  const aCtxRef = useRef<AudioContext | null>(null)
  const recorderAdapterRef = useRef<RecorderAdapterNode | null>(null)
  const audioBuffersRef = useRef<AudioBuffer[]>([])

  const currentLanguage = selectedLanguage || AppleUtils.getCurrentLocale()
  const isAvailable = AppleTranscription.isAvailable(currentLanguage)

  useEffect(() => {
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'spokenAudio',
      iosOptions: ['defaultToSpeaker', 'allowBluetoothA2DP'],
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

  const transcribe = async (fileUri: string) => {
    setIsTranscribing(true)
    setTranscription(null)

    const startTime = Date.now()

    try {
      const response = await fetch(fileUri)
      const audioBuffer = await response.arrayBuffer()

      const result = await experimental_transcribe({
        model: apple.transcriptionModel(),
        audio: audioBuffer,
        providerOptions: {
          apple: {
            language: selectedLanguage,
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

      // Convert to WAV and transcribe
      const wavBuffer = float32ArrayToWAV(mergedPCM, SAMPLE_RATE)
      await transcribe(
        'data:audio/wav;base64,' +
          btoa(String.fromCharCode(...new Uint8Array(wavBuffer)))
      )
    }

    aCtxRef.current = null
    recorderAdapterRef.current = null
    console.log('Recording stopped')
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <View className="flex-1 p-4">
        <View className="border border-gray-300 p-4 mb-4">
          <Text className="mb-3">Audio Recording</Text>
          <Text className="text-center mb-2">Sample rate: {SAMPLE_RATE}</Text>

          <TouchableOpacity
            className={`border p-3 mb-3 ${
              !isRecording ? 'border-gray-600' : 'border-gray-300'
            }`}
            onPress={startRecording}
            disabled={isRecording}
          >
            <Text className="text-center">
              {isRecording ? 'Recording...' : 'Start Recording'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`border p-3 ${
              isRecording ? 'border-gray-600' : 'border-gray-300'
            }`}
            onPress={stopRecording}
            disabled={!isRecording}
          >
            <Text className="text-center">Stop Recording</Text>
          </TouchableOpacity>

          {audioBuffersRef.current.length > 0 && (
            <Text className="text-center mt-2">
              Recorded {audioBuffersRef.current.length} audio buffers
            </Text>
          )}
        </View>
        <Text className="text-center mb-6">Speech to text transcription</Text>

        <View className="border border-gray-300 p-4 mb-4">
          <Text className="mb-3">Status</Text>
          <Text className="text-center mb-2">
            Transcription for {currentLanguage}:
            {isAvailable ? 'Available' : 'Not Available'}
          </Text>
          {!isAvailable && (
            <TouchableOpacity
              className="border border-gray-600 p-3"
              onPress={prepareAssets}
              disabled={isPreparing}
            >
              {isPreparing ? (
                <View className="flex-row justify-center items-center">
                  <ActivityIndicator className="mr-2" size="small" />
                  <Text>Preparing Assets...</Text>
                </View>
              ) : (
                <Text className="text-center">Prepare Assets</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View className="border border-gray-300 p-4 mb-4">
          <Text className="mb-3">Language</Text>
          <View className="border border-gray-300 mb-4">
            <Picker
              selectedValue={selectedLanguage}
              onValueChange={(value) => setSelectedLanguage(value)}
            >
              <Picker.Item
                label={`Default (${AppleUtils.getCurrentLocale()})`}
                value={undefined}
              />
              <Picker.Item label="English" value="en-US" />
              <Picker.Item label="Spanish" value="es-ES" />
              <Picker.Item label="French" value="fr-FR" />
              <Picker.Item label="German" value="de-DE" />
              <Picker.Item label="Italian" value="it-IT" />
              <Picker.Item label="Japanese" value="ja-JP" />
              <Picker.Item label="Korean" value="ko-KR" />
              <Picker.Item label="Chinese" value="zh-CN" />
            </Picker>
          </View>
        </View>

        <View className="border border-gray-300 p-4 mb-4">
          <Text className="mb-3">Demo File</Text>
          <TouchableOpacity
            className="border border-gray-400 p-3 mb-2"
            onPress={() => transcribe(DEMO_FILE)}
            disabled={isTranscribing}
          >
            <Text className="text-center">
              {isTranscribing ? 'Transcribing...' : 'Transcribe Demo File'}
            </Text>
          </TouchableOpacity>
          <Text className="text-center">
            Demo contains a Harvard sentence for testing
          </Text>
        </View>

        {transcription && (
          <View className="flex-1 border border-gray-300 p-4">
            <Text className="mb-3">Transcription</Text>
            <Text className="mb-3">Completed in {transcription.time}ms</Text>

            <ScrollView className="flex-1 border border-gray-200 p-3">
              <Text>{transcription.text}</Text>
            </ScrollView>
          </View>
        )}
      </View>
    </ScrollView>
  )
}
