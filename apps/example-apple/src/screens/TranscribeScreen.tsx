import { experimental_transcribe } from 'ai'
import * as DocumentPicker from 'expo-document-picker'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { apple } from '../schema-demos'

export default function TranscribeScreen() {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [selectedFile, setSelectedFile] = useState<{
    name: string
    uri: string
  } | null>(null)

  const pickAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      })

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0]
        setSelectedFile({ name: file.name, uri: file.uri })
      }
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to pick file'
      )
    }
  }

  const transcribeAudio = async (audioBuffer: ArrayBuffer) => {
    const response = await experimental_transcribe({
      model: apple.transcriptionModel(),
      audio: audioBuffer,
    })
    return response.text
  }

  const transcribeFile = async (isDemoFile: boolean = false) => {
    setIsTranscribing(true)
    setTranscription('')

    try {
      let audioBuffer: ArrayBuffer

      if (isDemoFile) {
        const file = await fetch(
          'https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav'
        )
        audioBuffer = await file.arrayBuffer()
      } else if (selectedFile) {
        const response = await fetch(selectedFile.uri)
        audioBuffer = await response.arrayBuffer()
      } else {
        throw new Error('No file selected')
      }

      const result = await transcribeAudio(audioBuffer)
      setTranscription(result)
    } catch (error) {
      Alert.alert(
        'Transcription Error',
        error instanceof Error ? error.message : 'Failed to transcribe audio'
      )
    } finally {
      setIsTranscribing(false)
    }
  }

  const clearResults = () => {
    setTranscription('')
    setSelectedFile(null)
  }

  return (
    <View className="flex-1 p-4">
      <Text className="text-2xl font-bold text-center mb-2">Transcribe</Text>
      <Text className="text-base text-center mb-6">
        Speech to text transcription
      </Text>

      <View className="border border-gray-300 p-4 mb-4">
        <Text className="text-lg font-medium mb-3">Select Audio File</Text>
        
        <TouchableOpacity
          className="border border-gray-400 p-3 mb-3"
          onPress={pickAudioFile}
          disabled={isTranscribing}
        >
          <Text className="text-center">Pick Audio File</Text>
        </TouchableOpacity>

        {selectedFile && (
          <Text className="text-sm text-center mb-2">
            Selected: {selectedFile.name}
          </Text>
        )}

        <View className="border-t border-gray-300 pt-3">
          <Text className="text-sm mb-2">Or use demo file:</Text>
          <TouchableOpacity
            className="border border-gray-400 p-3 mb-2"
            onPress={() => transcribeFile(true)}
            disabled={isTranscribing}
          >
            <Text className="text-center">Use Demo File</Text>
          </TouchableOpacity>
          <Text className="text-xs text-center">
            Demo contains a Harvard sentence for testing
          </Text>
        </View>
      </View>

      <TouchableOpacity
        className={`border p-4 mb-4 ${
          selectedFile && !isTranscribing 
            ? 'border-gray-600' 
            : 'border-gray-300'
        }`}
        onPress={() => transcribeFile(false)}
        disabled={!selectedFile || isTranscribing}
      >
        {isTranscribing ? (
          <View className="flex-row justify-center items-center">
            <ActivityIndicator className="mr-2" />
            <Text>Transcribing...</Text>
          </View>
        ) : (
          <Text className="text-center">Transcribe Selected File</Text>
        )}
      </TouchableOpacity>

      {transcription && (
        <View className="flex-1 border border-gray-300 p-4">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-lg font-medium">Transcription</Text>
            <TouchableOpacity
              className="border border-gray-400 px-3 py-1"
              onPress={clearResults}
            >
              <Text className="text-sm">Clear</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView className="flex-1 border border-gray-200 p-3">
            <Text className="text-base">
              {transcription}
            </Text>
          </ScrollView>
        </View>
      )}
    </View>
  )
}
