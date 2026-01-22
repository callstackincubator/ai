import type { SpeechModelV3 } from '@ai-sdk/provider'
import { apple, AppleSpeech, VoiceInfo } from '@react-native-ai/apple'
import { Picker } from '@react-native-picker/picker'
import { experimental_generateSpeech } from 'ai'
import React, { useEffect, useState } from 'react'
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

import ProviderSelector from '../../../components/ProviderSelector'
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
  const [provider, setProvider] = useState<'apple' | 'llama'>('apple')
  const [speechModel, setSpeechModel] = useState<SpeechModelV3 | null>(null)
  const [inputText, setInputText] = useState(
    'On-device text to speech is awesome'
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedSpeech, setGeneratedSpeech] = useState<{
    arrayBuffer: ArrayBufferLike
    time: number
  } | null>(null)
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null)

  useEffect(() => {
    const loadVoices = async () => {
      try {
        const voiceList = await AppleSpeech.getVoices()
        setVoices(voiceList)
      } catch (error) {
        console.error('Failed to load voices:', error)
      }
    }

    loadVoices()
  }, [])

  const generateSpeech = async () => {
    if (!inputText.trim() || isGenerating) return

    const currentModel =
      provider === 'apple' ? apple.speechModel() : speechModel

    if (!currentModel) {
      Alert.alert('Error', 'Please initialize the speech model first')
      return
    }

    setIsGenerating(true)
    setGeneratedSpeech(null)

    const startTime = Date.now()

    try {
      const result = await experimental_generateSpeech({
        model: currentModel,
        text: inputText,
        voice: selectedVoice ?? undefined,
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

  // For Llama provider with speech support
  if (provider === 'llama' && !speechModel) {
    return (
      <SpeechProviderSetup
        models={SPEECH_LLAMA_MODELS}
        onReady={(llamaSpeechModel) => setSpeechModel(llamaSpeechModel)}
        onBack={() => setProvider('apple')}
      />
    )
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-gray-50"
    >
      <ProviderSelector
        provider={provider}
        onProviderChange={(newProvider) => {
          setProvider(newProvider)
          setSpeechModel(null)
        }}
        disabled={isGenerating}
      />

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

        {provider === 'apple' && voices.length > 0 && (
          <View className="bg-white rounded-xl p-4 mt-4">
            <Text className="text-lg font-semibold mb-3">Voice Selection</Text>
            <View className="border border-gray-200 rounded-lg bg-gray-50">
              <Picker
                selectedValue={selectedVoice}
                onValueChange={setSelectedVoice}
              >
                <Picker.Item label="System Default Voice" value={null} />
                {voices.map((voice) => (
                  <Picker.Item
                    key={voice.identifier}
                    label={`${voice.name} (${voice.language})`}
                    value={voice.identifier}
                  />
                ))}
              </Picker>
            </View>
          </View>
        )}

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
