import {
  type LanguageModelV4CallOptions,
  type LanguageModelV4Prompt,
  type LanguageModelV4ToolResultOutput,
  type SharedV4Warning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider'

/** A tool the model may call. */
export interface ToolSpec {
  name: string
  description?: string
  /** JSON Schema of the tool's arguments. */
  parameters: unknown
}

export interface ToolCallSpec {
  name: string
  arguments: unknown
}

export interface ToolResultSpec {
  name: string
  /** The tool's result, as a JSON value. */
  value: unknown
}

/** One turn of a conversation, in a form both runtimes can be given. */
export type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCallSpec[] }
  | { role: 'tool'; results: ToolResultSpec[] }

/** The last turn: what the model answers now. */
export type FinalTurn = Extract<Turn, { role: 'user' | 'tool' }>

/** A prompt split the way a conversation holds it. */
export interface Conversation {
  system: string | undefined
  /** Every turn before the final one. */
  history: Turn[]
  final: FinalTurn
}

function toolOutputValue(output: LanguageModelV4ToolResultOutput): unknown {
  switch (output.type) {
    case 'text':
    case 'json':
      return output.value
    case 'error-text':
    case 'error-json':
      return { error: output.value }
    case 'execution-denied':
      return { error: output.reason ?? 'The tool call was denied.' }
    case 'content':
      return output.value
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('')
  }
}

function fileParts(): UnsupportedFunctionalityError {
  return new UnsupportedFunctionalityError({
    functionality: 'file parts (images and audio) in the prompt',
    message:
      'ai-sdk-litert-lm supports text prompts only. Remove the file part from the prompt.',
  })
}

/** Split a prompt into system text, the turns before the last one, and the last turn. */
export function toConversation(prompt: LanguageModelV4Prompt): Conversation {
  const system: string[] = []
  const turns: Turn[] = []

  for (const message of prompt) {
    switch (message.role) {
      case 'system':
        system.push(message.content)
        break
      case 'user': {
        let text = ''
        for (const part of message.content) {
          if (part.type === 'file') throw fileParts()
          text += part.text
        }
        turns.push({ role: 'user', text })
        break
      }
      case 'assistant': {
        let text = ''
        const toolCalls: ToolCallSpec[] = []
        for (const part of message.content) {
          // Reasoning is not replayed: the chat templates drop it from history too.
          if (part.type === 'text') text += part.text
          else if (part.type === 'tool-call') {
            toolCalls.push({ name: part.toolName, arguments: part.input })
          } else if (part.type === 'file') throw fileParts()
        }
        turns.push({ role: 'assistant', text, toolCalls })
        break
      }
      case 'tool': {
        const results: ToolResultSpec[] = []
        for (const part of message.content) {
          if (part.type !== 'tool-result') continue
          results.push({
            name: part.toolName,
            value: toolOutputValue(part.output),
          })
        }
        if (results.length > 0) turns.push({ role: 'tool', results })
        break
      }
    }
  }

  const final = turns.pop()
  if (final === undefined || final.role === 'assistant') {
    throw new UnsupportedFunctionalityError({
      functionality: 'a prompt that does not end with a user or tool message',
      message:
        'The last message of the prompt must be a user message or a tool result.',
    })
  }
  return {
    system: system.length > 0 ? system.join('\n\n') : undefined,
    history: turns,
    final,
  }
}

/** The tools for this call, after `toolChoice`. Adds a warning for what the engine can't do. */
export function selectTools(
  options: Pick<LanguageModelV4CallOptions, 'tools' | 'toolChoice'>,
  warnings: SharedV4Warning[]
): ToolSpec[] {
  const choice = options.toolChoice
  if (choice?.type === 'none') return []

  const tools: ToolSpec[] = []
  for (const tool of options.tools ?? []) {
    if (tool.type !== 'function') {
      warnings.push({
        type: 'unsupported',
        feature: `provider tool ${tool.name}`,
        details: 'Only function tools run on the device.',
      })
      continue
    }
    tools.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })
  }

  if (choice?.type === 'required') {
    warnings.push({
      type: 'unsupported',
      feature: 'toolChoice: required',
      details: 'The engine cannot force a tool call. The model decides.',
    })
  }
  if (choice?.type === 'tool') {
    warnings.push({
      type: 'unsupported',
      feature: 'toolChoice: tool',
      details: `The engine cannot force a tool call. Only ${choice.toolName} is offered, and the model decides.`,
    })
    return tools.filter((tool) => tool.name === choice.toolName)
  }
  return tools
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort())
      result[key] = sorted(source[key])
    return result
  }
  return value
}

/** JSON with sorted object keys: the same value always gives the same text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sorted(value)) ?? 'null'
}

function normalizeTurn(turn: Turn): unknown {
  switch (turn.role) {
    case 'user':
      return { role: 'user', text: turn.text }
    case 'assistant':
      // Apps may trim a reply before sending it back.
      return {
        role: 'assistant',
        text: turn.text.trim(),
        toolCalls: turn.toolCalls,
      }
    case 'tool':
      return turn
  }
}

/** Identifies a list of turns, to tell whether the engine already holds them. */
export function transcriptKey(
  system: string | undefined,
  turns: Turn[]
): string {
  return canonicalJson({
    system: system ?? null,
    turns: turns.map(normalizeTurn),
  })
}

/** Ask for JSON in the system text, where the engine can't constrain the output to it. */
export function withJsonInstruction(
  system: string | undefined,
  schema: string
): string {
  const instruction =
    schema === ''
      ? 'Answer with one JSON value only, with no other text and no code fences.'
      : `Answer with one JSON value only, with no other text and no code fences. It must follow this JSON Schema: ${schema}`
  return system !== undefined ? `${system}\n\n${instruction}` : instruction
}
