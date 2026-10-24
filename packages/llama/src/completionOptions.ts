import {
  type LanguageModelV4CallOptions,
  type LanguageModelV4Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider'
import {
  convertToBase64,
  getTopLevelMediaType,
  isFullMediaType,
} from '@ai-sdk/provider-utils'
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

type PromptPart = Extract<
  LanguageModelV4Prompt[number],
  { content: unknown[] }
>['content'][number]

function convertFilePartToMedia(
  part: Extract<PromptPart, { type: 'file' }>
): LLMMessagePart {
  if (part.data.type === 'text') {
    return { type: 'text', text: part.data.text }
  }

  const mediaType = part.mediaType.toLowerCase()
  const topLevelType = getTopLevelMediaType(mediaType)

  if (topLevelType !== 'image' && topLevelType !== 'audio') {
    throw new UnsupportedFunctionalityError({
      functionality: `file parts with media type ${part.mediaType}`,
    })
  }

  if (part.data.type === 'reference') {
    throw new UnsupportedFunctionalityError({
      functionality: 'file parts with provider references',
    })
  }

  // llama.rn only decodes base64 from data:image/... and data:audio/... URLs,
  // so a bare top-level media type (e.g. `image`) still needs a subtype
  const dataUrlMediaType = isFullMediaType(mediaType)
    ? mediaType
    : `${topLevelType}/*`
  const url =
    part.data.type === 'data'
      ? `data:${dataUrlMediaType};base64,${convertToBase64(part.data.data)}`
      : (part.data.originalUrl ?? part.data.url.href)

  if (topLevelType === 'image') {
    return { type: 'image_url', image_url: { url } }
  }

  const format =
    mediaType.includes('mpeg') || mediaType.includes('mp3') ? 'mp3' : 'wav'
  return {
    type: 'input_audio',
    input_audio: url.startsWith('data:')
      ? { format, data: url }
      : { format, url },
  }
}

export function prepareMessagesWithMedia(
  prompt: LanguageModelV4Prompt
): LLMMessage[] {
  const messages: LLMMessage[] = []

  for (const message of prompt) {
    switch (message.role) {
      case 'system':
        messages.push({ role: 'system', content: message.content })
        break
      case 'user': {
        // Keep text and media in one message, so the chat template places
        // the media markers next to the text they belong to
        const content = message.content.map((part): LLMMessagePart => {
          switch (part.type) {
            case 'text':
              return { type: 'text', text: part.text }
            case 'file':
              return convertFilePartToMedia(part)
            default:
              throw new Error(
                `Unsupported message content type: ${JSON.stringify(part)}`
              )
          }
        })
        messages.push({
          role: 'user',
          content:
            content.length === 1 && content[0]!.type === 'text'
              ? content[0]!.text!
              : content,
        })
        break
      }
      case 'assistant': {
        const reasoningContent = message.content
          .filter((part) => part.type === 'reasoning')
          .map((part) => part.text)
          .join('')
        const toolCalls = message.content.filter(
          (part) => part.type === 'tool-call'
        )
        const content = message.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('')
        messages.push({
          role: 'assistant',
          content,
          reasoning_content: reasoningContent || undefined,
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
  options: LanguageModelV4CallOptions,
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
