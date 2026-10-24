import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider'
import type { CompletionParams } from 'llama.rn'

interface LLMMessagePart {
  type: 'text' | 'image_url' | 'input_audio'
  text?: string
  image_url?: { url: string }
  input_audio?:
    | { format: string; data: string }
    | { format: string; url: string }
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | LLMMessagePart[]
  reasoning_content?: string
  tool_call_id?: string
  tool_calls?: any[]
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function prepareMessagesWithMedia(
  prompt: LanguageModelV3Prompt
): LLMMessage[] {
  const messages: LLMMessage[] = []

  type PromptPart = Extract<
    LanguageModelV3Prompt[number],
    { content: unknown[] }
  >['content'][number]

  const convertFilePartToMedia = (
    part: Extract<PromptPart, { type: 'file' }>
  ): LLMMessagePart => {
    const mediaType = part.mediaType.toLowerCase()
    const data = part.data as unknown

    const url =
      data instanceof Uint8Array
        ? `data:${part.mediaType};base64,${uint8ArrayToBase64(data)}`
        : data instanceof URL
          ? data.toString()
          : typeof data === 'string'
            ? data
            : null

    if (!url) {
      return { type: 'text', text: '' }
    }

    if (mediaType.startsWith('image/')) {
      return { type: 'image_url', image_url: { url } }
    }

    if (mediaType.startsWith('audio/')) {
      const format = mediaType.includes('wav') ? 'wav' : 'mp3'
      if (url.startsWith('data:')) {
        return {
          type: 'input_audio',
          input_audio: {
            format,
            data: url,
          },
        }
      }
      return {
        type: 'input_audio',
        input_audio: {
          format,
          url,
        },
      }
    }

    return { type: 'text', text: '' }
  }

  for (const message of prompt) {
    switch (message.role) {
      case 'system':
      case 'user':
        if (typeof message.content === 'string') {
          messages.push({ role: message.role, content: message.content })
        } else {
          for (const part of message.content) {
            switch (part.type) {
              case 'text':
                messages.push({ role: message.role, content: part.text })
                break
              case 'file':
                messages.push({
                  role: message.role,
                  content: [convertFilePartToMedia(part)],
                })
                break
              default:
                throw new Error(
                  `Unsupported message content type: ${JSON.stringify(part)}`
                )
            }
          }
        }
        break
      case 'assistant': {
        const reasoningContent = message.content.find(
          (part) => part.type === 'reasoning'
        )
        const toolCalls = message.content.filter(
          (part) => part.type === 'tool-call'
        )
        const content = message.content.filter((part) => part.type === 'text')
        messages.push({
          role: 'assistant',
          content,
          reasoning_content: reasoningContent?.text,
          tool_calls: toolCalls.map((toolCall) => ({
            type: 'function',
            id: toolCall.toolCallId,
            function: {
              name: toolCall.toolName,
              arguments: JSON.stringify(toolCall.input),
            },
          })),
        })
        const toolResults = message.content.filter(
          (part) => part.type === 'tool-result'
        )
        if (toolResults.length > 0) {
          console.warn(
            '[llama] Model executed tools are not supported. Skipping:',
            toolResults
          )
        }
        break
      }
      case 'tool': {
        const toolResults = message.content.filter(
          (part) => part.type === 'tool-result'
        )
        for (const toolResult of toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id: toolResult.toolCallId,
            content:
              toolResult.output.type === 'execution-denied'
                ? (toolResult.output.reason ?? 'Execution denied')
                : JSON.stringify(toolResult.output.value),
          })
        }
        break
      }
    }
  }

  return messages
}

export function buildLlamaCompletionOptions(
  options: LanguageModelV3CallOptions,
  messages: LLMMessage[]
): Partial<CompletionParams> {
  const completionOptions: Partial<CompletionParams> = {
    messages,
    temperature: options.temperature,
    n_predict: options.maxOutputTokens,
    top_p: options.topP,
    top_k: options.topK,
    penalty_present: options.presencePenalty,
    penalty_freq: options.frequencyPenalty,
    stop: options.stopSequences,
    seed: options.seed,
    reasoning_format: 'auto',
    ...(options.providerOptions?.llama ?? {}),
  }

  if (options.tools) {
    completionOptions.tools = options.tools.map(({ type, ...tool }) => ({
      type,
      function: tool,
    }))
    completionOptions.tool_choice = options.toolChoice?.type ?? 'auto'
  }

  if (options.responseFormat?.type === 'json') {
    completionOptions.response_format = {
      type: 'json_object',
      schema: options.responseFormat.schema,
    }
  }

  return completionOptions
}
