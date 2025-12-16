import {
  type DownloadProgress,
  type LlamaContext,
  llamaRn,
  LlamaRnEngine,
} from '@react-native-ai/llama-rn'
import { Picker } from '@react-native-picker/picker'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useBottomTabBarHeight } from 'react-native-bottom-tabs'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import Animated, { useDerivedValue } from 'react-native-reanimated'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ModelOption {
  name: string
  modelId: string
  size: string
}

const MODELS: ModelOption[] = [
  {
    name: 'SmolLM3 3B (Q4_K_M)',
    modelId: 'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf',
    size: '1.78GB',
  },
  {
    name: 'Qwen 3 4B (Q3_K_M)',
    modelId: 'Qwen/Qwen2.5-3B-Instruct-GGUF/qwen2.5-3b-instruct-q3_k_m.gguf',
    size: '1.93GB',
  },
  {
    name: 'Gemma 2 2B IT (Q3_K_M)',
    modelId: 'lmstudio-community/gemma-2-2b-it-GGUF/gemma-2-2b-it-Q3_K_M.gguf',
    size: '2.31GB',
  },
]

const getFilenameFromModelId = (modelId: string) => {
  const parts = modelId.split('/')
  return parts[parts.length - 1]
}

export default function LlamaRNScreen() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(MODELS[0])
  const [downloadedModels, setDownloadedModels] = useState<Set<string>>(
    new Set()
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [isInitializing, setIsInitializing] = useState(false)
  const [context, setContext] = useState<LlamaContext | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const scrollViewRef = useRef<ScrollView>(null)

  const isModelReady = downloadedModels.has(
    getFilenameFromModelId(selectedModel.modelId)
  )

  const hasLoadedModels = useRef(false)

  if (!hasLoadedModels.current) {
    hasLoadedModels.current = true
    LlamaRnEngine.getModels().then((models) => {
      const downloadedFilenames = new Set(models.map((m) => m.filename))
      setDownloadedModels(downloadedFilenames)

      const firstDownloadedModel = MODELS.find((m) =>
        downloadedFilenames.has(getFilenameFromModelId(m.modelId))
      )

      if (firstDownloadedModel) {
        setSelectedModel(firstDownloadedModel)
      }

      setIsLoading(false)
    })
  }

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      () => {
        scrollViewRef.current?.scrollToEnd({ animated: true })
      }
    )
    return () => {
      keyboardWillShowListener.remove()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (context) {
        context.release()
      }
    }
  }, [context])

  useEffect(() => {
    if (context) {
      context.release()
      setContext(null)
      setMessages([])
    }
  }, [selectedModel])

  const initializeModelById = async (modelId: string) => {
    setIsInitializing(true)
    try {
      const model = llamaRn.languageModel(modelId, {
        n_ctx: 2048,
        n_gpu_layers: 99,
      })
      await model.prepare()
      setContext(model.getContext())
    } catch (error) {
      console.error('Model initialization failed:', error)
      alert('Failed to initialize model. Please try again.')
    } finally {
      setIsInitializing(false)
    }
  }

  const downloadModel = async () => {
    setIsDownloading(true)
    setDownloadProgress(0)

    try {
      const model = llamaRn.languageModel(selectedModel.modelId)
      await model.download((progress: DownloadProgress) => {
        setDownloadProgress(progress.percentage)
      })

      // Update downloaded models set
      setDownloadedModels((prev) => {
        const next = new Set(prev)
        next.add(getFilenameFromModelId(selectedModel.modelId))
        return next
      })
    } catch (error) {
      console.error('Download failed:', error)
      alert('Download failed. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  const initializeModel = async () => {
    await initializeModelById(selectedModel.modelId)
  }

  const deleteModel = async () => {
    try {
      // Release context first if loaded
      if (context) {
        await context.release()
        setContext(null)
      }

      const model = llamaRn.languageModel(selectedModel.modelId)
      await model.remove()

      // Update downloaded models set
      setDownloadedModels((prev) => {
        const next = new Set(prev)
        next.delete(getFilenameFromModelId(selectedModel.modelId))
        return next
      })
      setMessages([])
    } catch (error) {
      console.error('Delete failed:', error)
      alert('Failed to delete model. Please try again.')
    }
  }

  const sendMessage = async () => {
    if (!inputText.trim() || isGenerating || !context) return

    const userMessage: Message = {
      role: 'user',
      content: inputText.trim(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInputText('')
    setIsGenerating(true)

    const messageIdx = updatedMessages.length

    setMessages([
      ...updatedMessages,
      {
        role: 'assistant',
        content: '...',
      },
    ])

    let accumulatedContent = ''

    try {
      const conversationMessages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        ...updatedMessages.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        })),
      ]

      await context.completion(
        {
          messages: conversationMessages,
          n_predict: 400,
          temperature: 0.7,
        },
        (data: { token: string }) => {
          accumulatedContent += data.token
          setMessages((prev) => {
            const newMessages = [...prev]
            newMessages[messageIdx] = {
              role: 'assistant',
              content: accumulatedContent,
            }
            return newMessages
          })
        }
      )
    } catch (error) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`
      setMessages((prev) => {
        const newMessages = [...prev]
        newMessages[messageIdx] = {
          role: 'assistant',
          content: errorMessage,
        }
        return newMessages
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const bottomTabBarHeight = useBottomTabBarHeight()
  const keyboardAnimation = useReanimatedKeyboardAnimation()

  const height = useDerivedValue(() =>
    keyboardAnimation.progress.value === 0
      ? -bottomTabBarHeight
      : keyboardAnimation.height.value
  )

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="mt-4 text-gray-600">Loading models...</Text>
      </View>
    )
  }

  return (
    <Animated.View
      className="flex-1"
      style={{
        transform: [{ translateY: height }],
        marginTop: bottomTabBarHeight,
      }}
    >
      <View className="flex-1">
        <View className="bg-white border-b border-gray-200 p-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">
            Select Model
          </Text>
          <View className="border border-gray-300 rounded-lg overflow-hidden">
            <Picker
              selectedValue={selectedModel.modelId}
              onValueChange={(itemValue) => {
                const model = MODELS.find((m) => m.modelId === itemValue)
                if (model) setSelectedModel(model)
              }}
              enabled={!isDownloading && !isGenerating && !isInitializing}
            >
              {MODELS.map((model) => {
                const isDownloaded = downloadedModels.has(
                  getFilenameFromModelId(model.modelId)
                )
                return (
                  <Picker.Item
                    key={model.modelId}
                    label={`${isDownloaded ? '✓ ' : ''}${model.name} - ${model.size}`}
                    value={model.modelId}
                  />
                )
              })}
            </Picker>
          </View>

          {!isModelReady && !isDownloading && (
            <TouchableOpacity
              className="bg-blue-500 rounded-lg py-3 mt-3"
              onPress={downloadModel}
            >
              <Text className="text-white text-center font-semibold">
                Download Model
              </Text>
            </TouchableOpacity>
          )}

          {isDownloading && (
            <View className="mt-3">
              <View className="flex-row justify-between mb-1">
                <Text className="text-sm text-gray-600">Downloading...</Text>
                <Text className="text-sm text-gray-600">
                  {downloadProgress}%
                </Text>
              </View>
              <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <View
                  className="h-full bg-blue-500"
                  style={{ width: `${downloadProgress}%` }}
                />
              </View>
            </View>
          )}

          {isModelReady && !context && !isInitializing && (
            <View className="flex-row mt-3 gap-2">
              <TouchableOpacity
                className="flex-1 bg-green-500 rounded-lg py-3"
                onPress={initializeModel}
              >
                <Text className="text-white text-center font-semibold">
                  Initialize Model
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-red-500 rounded-lg py-3 px-4"
                onPress={deleteModel}
              >
                <Text className="text-white text-center font-semibold">
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {isInitializing && (
            <View className="mt-3 flex-row items-center justify-center py-3">
              <ActivityIndicator size="small" color="#22C55E" />
              <Text className="ml-2 text-gray-600">Initializing model...</Text>
            </View>
          )}

          {context && (
            <View className="flex-row mt-3 gap-2">
              <View className="flex-1 bg-green-50 rounded-lg p-3">
                <Text className="text-green-700 text-center font-semibold">
                  Model Ready
                </Text>
              </View>
              <TouchableOpacity
                className="bg-red-500 rounded-lg py-3 px-4"
                onPress={deleteModel}
              >
                <Text className="text-white text-center font-semibold">
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <ScrollView
          ref={scrollViewRef}
          className="flex-1 p-4"
          onContentSizeChange={() => {
            scrollViewRef.current?.scrollToEnd({ animated: true })
          }}
        >
          {messages.length === 0 && context && (
            <View className="items-center justify-center py-8">
              <Text className="text-gray-400 text-center">
                Model is ready. Start chatting!
              </Text>
            </View>
          )}
          {messages.map((message, index) => (
            <View
              key={index}
              className={`flex-row mb-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <View
                className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                  message.role === 'user' ? 'bg-blue-500' : 'bg-gray-100'
                }`}
              >
                <Text
                  className={
                    message.role === 'user' ? 'text-white' : 'text-gray-900'
                  }
                >
                  {message.content}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View className="flex-row items-center p-4 border-t border-gray-200">
          <TextInput
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 mr-2"
            value={inputText}
            onChangeText={setInputText}
            placeholder={
              context ? 'Type a message...' : 'Initialize model first'
            }
            placeholderTextColor="#9CA3AF"
            onSubmitEditing={sendMessage}
            editable={!isGenerating && !!context}
          />
          <TouchableOpacity
            className={`w-10 h-10 rounded-full justify-center items-center ${
              inputText.trim() && !isGenerating && context
                ? 'bg-blue-500'
                : 'bg-gray-300'
            }`}
            onPress={sendMessage}
            disabled={!inputText.trim() || isGenerating || !context}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text
                className={
                  inputText.trim() && context
                    ? 'text-white font-bold'
                    : 'text-gray-500 font-bold'
                }
              >
                ↑
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  )
}
