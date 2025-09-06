import { apple } from '@react-native-ai/apple'
import { experimental_generateSpeech } from 'ai'
import React, { useState } from 'react'
import { Alert, Text, TextProps, TouchableOpacity } from 'react-native'
import { AudioContext } from 'react-native-audio-api'

interface SpeechTextProps extends TextProps {
  children: string
}

const playAudio = async (arrayBuffer: ArrayBufferLike) => {
  const context = new AudioContext()
  const source = context.createBufferSource()
  source.buffer = await context.decodeAudioData(arrayBuffer as ArrayBuffer)
  source.connect(context.destination)
  source.start()
}

export default function SpeechText({
  children,
  style,
  ...props
}: SpeechTextProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  const handleLongPress = async () => {
    if (isGenerating || !children) return

    setIsGenerating(true)

    try {
      const result = await experimental_generateSpeech({
        model: apple.speechModel(),
        text: children,
      })

      await playAudio(result.audio.uint8Array.buffer)
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
    <TouchableOpacity
      onLongPress={handleLongPress}
      disabled={isGenerating}
      activeOpacity={0.7}
    >
      <Text {...props} style={[style, isGenerating && { opacity: 0.5 }]}>
        {children}
      </Text>
    </TouchableOpacity>
  )
}
