import { createAppleProvider } from '@react-native-ai/apple'
import { generateText, ModelMessage, tool } from 'ai'
import * as DocumentPicker from 'expo-document-picker'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { z } from 'zod'

import {
  createEmbeddings,
  searchRelevantChunks,
} from '../services/embeddings-memory'

const systemPrompt = {
  role: 'system' as const,
  content: `
    You are a helpful AI assistant that answers questions based on uploaded document content. 

    Instructions:
    - Use the search tool to find relevant information from the uploaded documents
    - Provide accurate, helpful answers based on the retrieved content
    - If no relevant information is found, clearly state that
    - Be concise but comprehensive
    - Always cite or reference the information from the documents
    - If the question cannot be answered from the document content, explain that clearly

    Important:
    - Only answer based on the information available in the uploaded documents
    - Do not make up information or use knowledge not present in the documents`,
}

const searchTool = tool({
  description: 'Search through the documents to find relevant information',
  inputSchema: z.object({
    query: z.string().describe('The search query to find relevant content'),
    topK: z
      .number()
      .optional()
      .default(3)
      .describe('Number of top results to return'),
  }),
  execute: async ({ query, topK }) => {
    const relevantChunks = await searchRelevantChunks(query, topK)
    if (relevantChunks.length === 0) {
      return {
        results: [],
        message: 'No relevant content found in the uploaded documents.',
      }
    }
    return {
      results: relevantChunks.map((chunk) => ({
        content: chunk.text,
        similarity: chunk.similarity,
        chunkIndex: chunk.chunkIndex,
      })),
      message: `Found ${relevantChunks.length} relevant chunks`,
    }
  },
})

const apple = createAppleProvider({
  availableTools: {
    searchTool,
  },
})

const askQuestion = async (messages: ModelMessage[]) => {
  const result = await generateText({
    model: apple(),
    messages,
    tools: {
      searchTool,
    },
  })
  return result
}

export default function RAG() {
  const [messages, setMessages] = useState<ModelMessage[]>([systemPrompt])
  const [queryText, setQueryText] = useState('')
  const [isQuerying, setIsQuerying] = useState(false)

  useEffect(() => {
    ;(async () => {
      if (messages[messages.length - 1].role === 'user') {
        const result = await askQuestion(messages)
        setMessages((prev) => [...prev, ...result.response.messages])
        setIsQuerying(false)
      }
    })()
  }, [messages])

  const pickDocument = async () => {
    setIsQuerying(true)

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/plain',
        copyToCacheDirectory: true,
      })

      let file = result.assets?.[0]
      if (file) {
        const response = await fetch(file.uri)
        const text = await response.text()

        await createEmbeddings(text)

        setMessages((prev) => [
          ...prev,
          {
            content: `Processed file "${file.name}"`,
            role: 'assistant',
          },
        ])
      }
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : String(error)
      )
    } finally {
      setIsQuerying(false)
    }
  }

  const sendMessage = async () => {
    if (!queryText.trim() || isQuerying) {
      return
    }
    setMessages((messages) => [
      ...messages,
      {
        content: queryText,
        role: 'user',
      },
    ])
    setQueryText('')
    setIsQuerying(true)
  }

  const [, ...displayMessages] = messages

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {displayMessages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Welcome! Upload a document using 📎 to get started.
            </Text>
          </View>
        ) : (
          displayMessages.map((message, index) => (
            <View
              key={index}
              style={[
                styles.messageContainer,
                message.role === 'user'
                  ? styles.userMessage
                  : styles.botMessage,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  message.role === 'user'
                    ? styles.userMessageText
                    : styles.botMessageText,
                ]}
              >
                {Array.isArray(message.content)
                  ? message.content.map((part) => part.text).join('')
                  : message.content}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={pickDocument}
          disabled={isQuerying}
        >
          <Text style={styles.attachIcon}>📎</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.textInput}
          value={queryText}
          onChangeText={setQueryText}
          placeholder="Ask a question..."
          multiline
          maxLength={500}
          onSubmitEditing={sendMessage}
          editable={!isQuerying}
        />

        <TouchableOpacity
          style={[styles.sendButton, isQuerying && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={isQuerying}
        >
          {isQuerying ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendIcon}>➤</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  messagesContent: {
    paddingBottom: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  messageContainer: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
    maxWidth: '80%',
  },
  userMessage: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  botMessage: {
    backgroundColor: '#E5E5EA',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#fff',
  },
  botMessageText: {
    color: '#000',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  attachButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  attachIcon: {
    fontSize: 20,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    backgroundColor: '#007AFF',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  sendIcon: {
    fontSize: 16,
    color: '#fff',
  },
})
