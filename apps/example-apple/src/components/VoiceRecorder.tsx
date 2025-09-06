import { apple } from '@react-native-ai/apple'
import { Ionicons } from '@react-native-vector-icons/ionicons'
import { experimental_transcribe } from 'ai'
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, TouchableOpacity, View } from 'react-native'
import {
  AudioBuffer,
  AudioContext,
  AudioManager,
  AudioRecorder,
  RecorderAdapterNode,
} from 'react-native-audio-api'

import { float32ArrayToWAV, mergeBuffersToFloat32Array } from '../utils/audio'

const SAMPLE_RATE = 16000

interface VoiceRecorderProps {
  onTranscription: (text: string) => void
}

export default function VoiceRecorder({ onTranscription }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)

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

    return () => {
      if (recorderRef.current) {
        recorderRef.current.stop()
      }
    }
  }, [])

  const transcribe = async (audioBuffer: ArrayBuffer) => {
    setIsTranscribing(true)

    try {
      const result = await experimental_transcribe({
        model: apple.transcriptionModel(),
        audio: audioBuffer,
      })

      onTranscription(result.text)
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

    recorderRef.current.stop()
    setIsRecording(false)

    const mergedPCM = mergeBuffersToFloat32Array(audioBuffersRef.current)
    if (mergedPCM.length > 0) {
      const recordedWavBuffer = float32ArrayToWAV(mergedPCM, SAMPLE_RATE)
      await transcribe(recordedWavBuffer)
    }

    aCtxRef.current = null
    recorderAdapterRef.current = null
  }

  const handlePress = () => {
    if (isTranscribing) return
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  return (
    <TouchableOpacity
      className={`w-10 h-10 rounded-full justify-center items-center mr-1 ${
        isTranscribing
          ? 'bg-gray-400'
          : isRecording
            ? 'bg-red-500'
            : 'bg-blue-500'
      }`}
      onPress={handlePress}
      disabled={isTranscribing}
    >
      {isTranscribing ? (
        <ActivityIndicator color="white" size="small" />
      ) : isRecording ? (
        <Ionicons name="stop" size={20} color="white" />
      ) : (
        <Ionicons name="mic" size={20} color="white" />
      )}
    </TouchableOpacity>
  )
}
