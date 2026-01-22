import type { SpeechModelV3 } from '@ai-sdk/provider'
import { experimental_generateSpeech } from 'ai'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { AudioContext } from 'react-native-audio-api'

import SpeechProviderSetup from '../../../components/SpeechProviderSetup'
import { SPEECH_LLAMA_MODELS } from '../../../config/models'

const play = async (arrayBuffer: ArrayBufferLike) => {
  const context = new AudioContext()

  const source = context.createBufferSource()
  source.buffer = await context.decodeAudioData(arrayBuffer as ArrayBuffer)
  source.connect(context.destination)

  source.start()
}

export default function SpeechScreen() {
  const [speechModel, setSpeechModel] = useState<SpeechModelV3 | null>(null)
  const [inputText, setInputText] = useState(
    'On-device text to speech is awesome'
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedSpeech, setGeneratedSpeech] = useState<{
    arrayBuffer: ArrayBufferLike
    time: number
  } | null>(null)

  const generateSpeech = async () => {
    if (!inputText.trim() || isGenerating || !speechModel) return

    setIsGenerating(true)
    setGeneratedSpeech(null)

    const startTime = Date.now()

    try {
      const result = await experimental_generateSpeech({
        model: speechModel,
        text: inputText,
      })

      const endTime = Date.now()
      const duration = endTime - startTime

      setGeneratedSpeech({
        arrayBuffer: result.audio.uint8Array.buffer,
        time: duration,
      })
    } catch (error) {
      Alert.alert(
        'Speech Generation Error',
        error instanceof Error ? error.message : 'Failed to generate speech'
      )
    } finally {
      setIsGenerating(false)
    }
  }

  // Llama provider needs setup
  if (!speechModel) {
    return (
      <View className="flex-1">
        <View className="bg-white border-b border-gray-200 p-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">
            Provider: Llama (Android)
          </Text>
          <Text className="text-xs text-gray-500">
            Apple Intelligence is only available on iOS. Llama speech works on
            Android.
          </Text>
        </View>
        <SpeechProviderSetup
          models={SPEECH_LLAMA_MODELS}
          onReady={(llamaSpeechModel) => setSpeechModel(llamaSpeechModel)}
        />
      </View>
    )
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-gray-50"
    >
      <View className="bg-white border-b border-gray-200 p-4">
        <Text className="text-sm font-semibold text-gray-700 mb-2">
          Provider: Llama
        </Text>
        <Text className="text-xs text-gray-500">Speech model is ready</Text>
      </View>

      <View className="p-4">
        <View className="bg-white rounded-xl p-4">
          <Text className="text-lg font-semibold mb-4">Enter Your Text</Text>
          <TextInput
            className="border border-gray-200 rounded-lg p-3 text-gray-900 bg-gray-50 mb-4 min-h-[100px]"
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type something to convert to speech..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <TouchableOpacity
            className={`rounded-lg py-3 ${
              isGenerating ? 'bg-gray-400' : 'bg-blue-500'
            }`}
            onPress={generateSpeech}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <View className="flex-row justify-center items-center">
                <ActivityIndicator color="#FFFFFF" />
                <Text className="text-white font-semibold ml-2">
                  Generating...
                </Text>
              </View>
            ) : (
              <Text className="text-white font-semibold text-center">
                Generate Speech
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {generatedSpeech && (
          <View className="bg-white rounded-xl p-4 mt-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-semibold">Generated Speech</Text>
              <Text className="text-green-600 text-sm">Ready</Text>
            </View>

            <Text className="text-gray-500 text-sm mb-3">
              Generated in {generatedSpeech.time}ms
            </Text>

            <TouchableOpacity
              className="bg-green-500 rounded-lg py-3"
              onPress={() => play(generatedSpeech.arrayBuffer)}
            >
              <Text className="text-white font-semibold text-center">
                ▶️ Play Audio
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  )
}
