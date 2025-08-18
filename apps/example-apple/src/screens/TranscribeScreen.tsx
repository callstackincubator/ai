import { apple, AppleUtils } from '@react-native-ai/apple'
import { Picker } from '@react-native-picker/picker'
import { experimental_transcribe } from 'ai'
import * as DocumentPicker from 'expo-document-picker'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

const DEMO_FILE =
  'https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav'

export default function TranscribeScreen() {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [selectedFile, setSelectedFile] = useState<{
    name: string
    uri: string
  } | null>(null)
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null)

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

  const transcribe = async (fileUri: string) => {
    setIsTranscribing(true)
    setTranscription('')

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

      setTranscription(result.text)
    } catch (error) {
      Alert.alert(
        'Transcription Error',
        error instanceof Error ? error.message : 'Failed to transcribe audio'
      )
    } finally {
      setIsTranscribing(false)
    }
  }

  return (
    <View className="flex-1 p-4">
      <Text className="text-2xl font-bold text-center mb-2">Transcribe</Text>
      <Text className="text-base text-center mb-6">
        Speech to text transcription
      </Text>

      <View className="border border-gray-300 p-4 mb-4">
        <Text className="text-lg font-medium mb-3">Language</Text>
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
            onPress={() => transcribe(DEMO_FILE)}
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
        onPress={() => selectedFile && transcribe(selectedFile.uri)}
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
          <Text className="text-lg font-medium mb-3">Transcription</Text>

          <ScrollView className="flex-1 border border-gray-200 p-3">
            <Text className="text-base">{transcription}</Text>
          </ScrollView>
        </View>
      )}
    </View>
  )
}
