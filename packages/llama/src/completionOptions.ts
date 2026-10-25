import {
  type LanguageModelV4CallOptions,
  type LanguageModelV4Prompt,
  type SharedV4Warning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider'
import {
  convertToBase64,
  getTopLevelMediaType,
  isCustomReasoning,
  isFullMediaType,
  mapReasoningToProviderBudget,
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

/**
 * Maps the provider-agnostic `reasoning` call option to llama.rn thinking
 * params. Levels become a thinking token budget, sized from
 * `maxOutputTokens` or, when that is not set, the context size.
 */
function getReasoningOptions(
  options: LanguageModelV4CallOptions,
  contextSize: number | undefined,
  warnings: SharedV4Warning[]
): Partial<CompletionParams> {
  const { reasoning } = options

  if (reasoning === 'none') {
    return { enable_thinking: false }
  }

  // llama.rn crashes natively when a response format grammar is combined with
  // thinking, which most reasoning templates enable by default
  if (options.responseFormat?.type === 'json') {
    if (isCustomReasoning(reasoning)) {
      warnings.push({
        type: 'unsupported',
        feature: 'reasoning',
        details: 'Reasoning is turned off for structured output.',
      })
    }
    return { enable_thinking: false }
  }

  if (!isCustomReasoning(reasoning)) {
    // 'provider-default' keeps the chat template's default
    return {}
  }

  const maxOutputTokens = options.maxOutputTokens ?? contextSize
  if (!maxOutputTokens) {
    return { enable_thinking: true }
  }

  return {
    enable_thinking: true,
    thinking_budget_tokens: mapReasoningToProviderBudget({
      reasoning,
      maxOutputTokens,
      maxReasoningBudget: maxOutputTokens,
      warnings,
    }),
  }
}

export interface LlamaCompletionSettings {
  /**
   * Context size of the loaded model, used to size the thinking budget when
   * `maxOutputTokens` is not set
   */
  contextSize?: number
  /**
   * Collects call warnings
   */
  warnings?: SharedV4Warning[]
}

export function buildLlamaCompletionOptions(
  options: LanguageModelV4CallOptions,
  messages: LLMMessage[],
  { contextSize, warnings = [] }: LlamaCompletionSettings = {}
): Partial<CompletionParams> {
  const completionOptions: Partial<CompletionParams> = {
    messages,
    temperature: options.temperature,
    // llama.rn keeps the previous value when it is left out, so the limit of one
    // call would apply to every later call on the same context
    n_predict: options.maxOutputTokens ?? -1,
    top_p: options.topP,
    top_k: options.topK,
    penalty_present: options.presencePenalty,
    penalty_freq: options.frequencyPenalty,
    stop: options.stopSequences,
    seed: options.seed,
    reasoning_format: 'auto',
    ...getReasoningOptions(options, contextSize, warnings),
    // providerOptions.llama takes precedence over the `reasoning` call option
    ...(options.providerOptions?.llama ?? {}),
  }

  if (options.tools) {
    const { toolChoice } = options
    // llama.cpp reads OpenAI-style tools, with the schema under `parameters`
    completionOptions.tools = options.tools.flatMap((tool) => {
      if (tool.type !== 'function') {
        warnings.push({
          type: 'unsupported',
          feature: `provider tool ${tool.id}`,
        })
        return []
      }
      if (toolChoice?.type === 'tool' && toolChoice.toolName !== tool.name) {
        return []
      }
      return [
        {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        },
      ]
    })
    // llama.cpp has no named tool choice, so offer only that tool and require it
    completionOptions.tool_choice =
      toolChoice?.type === 'tool' ? 'required' : (toolChoice?.type ?? 'auto')
  }

  if (options.responseFormat?.type === 'json') {
    completionOptions.response_format = {
      type: 'json_object',
      schema: options.responseFormat.schema,
    }
  }

  return completionOptions
}
