import { apple } from '@react-native-ai/apple'
import { experimental_transcribe } from 'ai'
import React, { useEffect, useRef, useState } from 'react'
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
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
} from '../../../utils/audioUtils'

const SAMPLE_RATE = 16000

export default function TranscribeScreen() {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcription, setTranscription] = useState<{
    text: string
    time: number
  } | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [wavBuffer, setWavBuffer] = useState<ArrayBuffer | null>(null)

  const recorderRef = useRef<AudioRecorder | null>(null)
  const aCtxRef = useRef<AudioContext | null>(null)
  const recorderAdapterRef = useRef<RecorderAdapterNode | null>(null)
  const audioBuffersRef = useRef<AudioBuffer[]>([])

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

  const transcribe = async (audioBuffer: ArrayBuffer) => {
    setIsTranscribing(true)
    setTranscription(null)

    const startTime = Date.now()

    try {
      const result = await experimental_transcribe({
        model: apple.transcriptionModel(),
        audio: audioBuffer,
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
      className="flex-1 bg-gray-50"
    >
      <View className="p-4">
        <View className="bg-white rounded-xl p-4 mb-4">
          <Text className="text-lg font-semibold mb-4">Audio Recording</Text>

          <TouchableOpacity
            className={`rounded-lg py-3 mb-2 ${
              isRecording ? 'bg-gray-400' : 'bg-blue-500'
            }`}
            onPress={startRecording}
            disabled={isRecording}
          >
            <Text className="text-white font-semibold text-center">
              {isRecording ? 'Recording...' : 'Start Recording'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`rounded-lg py-3 ${
              !isRecording ? 'bg-gray-400' : 'bg-blue-500'
            }`}
            onPress={stopRecording}
            disabled={!isRecording}
          >
            <Text className="text-white font-semibold text-center">
              Stop Recording
            </Text>
          </TouchableOpacity>

          {audioBuffersRef.current.length > 0 && (
            <Text className="text-sm text-green-600 text-center mt-2">
              Recorded {audioBuffersRef.current.length} audio buffers
            </Text>
          )}
        </View>

        {wavBuffer && (
          <View className="bg-white rounded-xl p-4 mb-4">
            <Text className="text-lg font-semibold mb-4">Loaded Audio</Text>
            <TouchableOpacity
              className={`rounded-lg py-3 ${
                isTranscribing ? 'bg-gray-400' : 'bg-blue-500'
              }`}
              onPress={() => transcribe(wavBuffer)}
              disabled={isTranscribing}
            >
              <Text className="text-white font-semibold text-center">
                {isTranscribing ? 'Transcribing...' : 'Transcribe Audio'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {transcription && (
          <View className="bg-white rounded-xl p-4">
            <Text className="text-lg font-semibold mb-2">Transcription</Text>
            <Text className="text-sm text-gray-500 mb-3">
              Completed in {transcription.time}ms
            </Text>
            <View className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <Text className="text-gray-900">{transcription.text}</Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  )
}
