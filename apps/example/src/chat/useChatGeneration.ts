import { generateId, type ModelMessage, streamText } from 'ai'
import * as Haptics from 'expo-haptics'
import { atom, useAtom } from 'jotai'

import { type Message, useChats, useSetStreamingReply } from '../store/chats'
import { useModels } from '../store/models'
import {
  getAttachmentUri,
  type ImageAttachment,
} from '../utils/imageAttachments'

const SYSTEM_PROMPT =
  "You are a helpful assistant running entirely on the user's iPhone. Be concise and use Markdown when it helps."

// Images go to the model as file URLs
function toModelMessage({ role, content, attachments }: Message): ModelMessage {
  if (role !== 'user' || !attachments?.length) {
    return { role, content }
  }
  return {
    role,
    content: [
      ...(content ? [{ type: 'text' as const, text: content }] : []),
      ...attachments.map((attachment) => ({
        type: 'image' as const,
        image: new URL(getAttachmentUri(attachment)),
        mediaType: attachment.mediaType,
      })),
    ],
  }
}

// Shared, so other screens (Search's "Ask in Chat") can start a chat too
const isGeneratingAtom = atom(false)
let abortController: AbortController | null = null

export function useChatGeneration() {
  const { currentChat, selectChat, addMessage, addReply, truncateAfter } =
    useChats()
  const { selectedModel } = useModels()
  const setStreamingReply = useSetStreamingReply()
  const [isGenerating, setIsGenerating] = useAtom(isGeneratingAtom)

  const generate = async (chatId: string, history: Message[]) => {
    if (!selectedModel) return

    const controller = new AbortController()
    abortController = controller
    const reply = { chatId, id: generateId(), content: '', reasoning: '' }
    setStreamingReply(reply)
    setIsGenerating(true)

    try {
      const result = streamText({
        model: selectedModel.model,
        system: SYSTEM_PROMPT,
        messages: history.map(toModelMessage),
        // A short think keeps small models from spending the reply on it
        reasoning: selectedModel.capabilities.includes('reasoning')
          ? 'low'
          : undefined,
        abortSignal: controller.signal,
      })
      // Reasoning models think out loud before the answer
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          reply.content += part.text
        } else if (part.type === 'reasoning-delta') {
          reply.reasoning += part.text
        } else if (part.type === 'error') {
          throw part.error
        } else {
          continue
        }
        setStreamingReply({ ...reply })
      }
      if (!reply.content.trim()) {
        reply.content = reply.reasoning
          ? 'I ran out of room before answering. Try a shorter question.'
          : 'No answer this time. Try again.'
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (error) {
      if (!controller.signal.aborted && !reply.content) {
        reply.content = `Something went wrong: ${error instanceof Error ? error.message : String(error)}`
      }
    } finally {
      // The finished reply is saved once
      if (reply.content) {
        addReply(chatId, {
          id: reply.id,
          role: 'assistant',
          content: reply.content,
          reasoning: reply.reasoning || undefined,
        })
      }
      setStreamingReply(null)
      setIsGenerating(false)
    }
  }

  const send = (
    content: string,
    attachments: ImageAttachment[],
    // A new chat can be titled, otherwise it takes the message's start
    { newChat = false, title }: { newChat?: boolean; title?: string } = {}
  ) => {
    // Without a model the message would never get a reply
    if (isGenerating || !selectedModel) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const message: Message = {
      id: generateId(),
      role: 'user',
      content,
      attachments,
    }
    const chat = newChat ? null : currentChat
    const history = [...(chat?.messages ?? []), message]
    const chatId = addMessage(chat?.id ?? null, message, title)
    selectChat(chatId)
    generate(chatId, history)
    return message.id
  }

  // Answers the user message before the given reply again
  const regenerate = (replyId: string) => {
    if (isGenerating || !currentChat) return
    const index = currentChat.messages.findIndex((m) => m.id === replyId)
    const question = currentChat.messages[index - 1]
    if (!question) return
    truncateAfter(currentChat.id, question.id)
    generate(currentChat.id, currentChat.messages.slice(0, index))
  }

  const stop = () => abortController?.abort()

  return { isGenerating, send, regenerate, stop }
}
