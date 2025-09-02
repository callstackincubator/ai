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

const play = async (arrayBuffer: ArrayBufferLike) => {
  const context = new AudioContext()

  const source = context.createBufferSource()
  source.buffer = await context.decodeAudioData(arrayBuffer as ArrayBuffer)
  source.connect(context.destination)

  source.start()
}

export default function SpeechScreen() {
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

    setIsGenerating(true)
    setGeneratedSpeech(null)

    const startTime = Date.now()

    try {
      const result = await experimental_generateSpeech({
        model: apple.speechModel(),
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

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <View className="flex-1 p-4">
        <View className="border border-gray-300 p-4 mb-4">
          <Text className="mb-3">Text Input</Text>
          <TextInput
            className="border border-gray-300 p-3 mb-4"
            value={inputText}
            onChangeText={setInputText}
            placeholder="Enter text to convert to speech"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <TouchableOpacity onPress={generateSpeech} disabled={isGenerating}>
            {isGenerating ? (
              <View className="flex-row justify-center items-center">
                <ActivityIndicator className="mr-2" />
                <Text>Generating Speech...</Text>
              </View>
            ) : (
              <Text className="text-center">Generate Speech</Text>
            )}
          </TouchableOpacity>
        </View>

        {voices.length > 0 && (
          <View className="border border-gray-300 p-4 mb-4">
            <Text className="mb-3">Voice Selection</Text>
            <View className="border border-gray-300">
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
          <View className="border border-gray-300 p-4">
            <Text className="mb-3">Generated Speech</Text>
            <Text className="mb-3">Completed in {generatedSpeech.time}ms</Text>

            <TouchableOpacity
              className="border border-gray-600 p-3"
              onPress={() => play(generatedSpeech.arrayBuffer)}
            >
              <Text className="text-center">Play</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  )
}
