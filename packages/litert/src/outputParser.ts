import type { OutputChunk } from './backend'

/**
 * Turn the JSON text inside a `<tool_call>` marker into a tool call. Text that
 * doesn't parse still becomes a call, so `ai` reports it as a tool error the
 * model can recover from, instead of showing the marker to the user.
 */
export function toolCallFromBody(
  body: string
): Extract<OutputChunk, { type: 'tool-call' }> {
  try {
    const parsed = JSON.parse(body) as {
      name?: unknown
      arguments?: unknown
    } | null
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof parsed.name === 'string'
    ) {
      return {
        type: 'tool-call',
        name: parsed.name,
        argumentsJson: JSON.stringify(parsed.arguments ?? {}),
      }
    }
  } catch {
    // Handled below.
  }
  const name = /"name"\s*:\s*"([^"]*)"/.exec(body)?.[1] ?? ''
  return { type: 'tool-call', name, argumentsJson: body }
}

export interface Channel {
  type: 'reasoning' | 'tool-call'
  start: string
  end: string
  /** Only opens before any text. Later, the marker is text: an answer can be about the tag. */
  leading?: boolean
}

export const DEFAULT_CHANNELS: Channel[] = [
  { type: 'tool-call', start: '<tool_call>', end: '</tool_call>' },
  { type: 'reasoning', start: '<thinking>', end: '</thinking>', leading: true },
  // An older bundle's chat template leaves the model's own tags in the text.
  { type: 'reasoning', start: '<think>', end: '</think>', leading: true },
]

/**
 * Split a token stream at its channel markers. Works on partial tokens: text that
 * could be the start of a marker waits for the next one.
 */
export class OutputParser {
  private buffer = ''
  private active: Channel | undefined
  private toolBody = ''
  /** Drop the blank lines a model writes around its reasoning. */
  private trimNext = false
  private sawText = false

  constructor(
    private readonly channels: Channel[],
    private readonly emit: (chunk: OutputChunk) => void
  ) {}

  push(token: string): void {
    this.buffer += token
    this.drain(false)
  }

  /** The model stopped: flush what's left. An unterminated tool call still becomes a call. */
  finish(): void {
    this.drain(true)
    if (this.active?.type === 'tool-call') {
      this.emit(toolCallFromBody(this.toolBody))
      this.toolBody = ''
    }
    this.active = undefined
  }

  /** Whether a channel's marker at this offset in the buffer opens it. */
  private canOpen(channel: Channel, at: number): boolean {
    if (channel.leading !== true) return true
    return !this.sawText && this.buffer.slice(0, at).trim().length === 0
  }

  private drain(flush: boolean): void {
    for (;;) {
      if (this.active === undefined) {
        let next: Channel | undefined
        let at = -1
        for (const channel of this.channels) {
          const index = this.buffer.indexOf(channel.start)
          if (
            index !== -1 &&
            this.canOpen(channel, index) &&
            (at === -1 || index < at)
          ) {
            at = index
            next = channel
          }
        }
        if (next === undefined) break
        this.emitContent(this.buffer.slice(0, at))
        this.buffer = this.buffer.slice(at + next.start.length)
        this.active = next
        if (next.type === 'reasoning') this.trimNext = true
      } else {
        const index = this.buffer.indexOf(this.active.end)
        if (index === -1) break
        this.emitContent(this.buffer.slice(0, index))
        this.buffer = this.buffer.slice(index + this.active.end.length)
        if (this.active.type === 'tool-call') {
          this.emit(toolCallFromBody(this.toolBody))
          this.toolBody = ''
        } else {
          this.trimNext = true
        }
        this.active = undefined
      }
    }

    const hold = flush ? 0 : this.partialMarkerLength()
    const ready = this.buffer.slice(0, this.buffer.length - hold)
    this.buffer = this.buffer.slice(this.buffer.length - hold)
    this.emitContent(ready)
  }

  private emitContent(raw: string): void {
    if (this.active?.type === 'tool-call') {
      this.toolBody += raw
      return
    }
    const text = this.trimNext ? raw.trimStart() : raw
    if (text.length === 0) return
    this.trimNext = false
    if (this.active?.type === 'reasoning') {
      this.emit({ type: 'reasoning', text })
      return
    }
    if (text.trim().length > 0) this.sawText = true
    this.emit({ type: 'text', text })
  }

  /** Length of the buffer's tail that could still grow into a marker. */
  private partialMarkerLength(): number {
    const markers: { text: string; channel?: Channel }[] =
      this.active !== undefined
        ? [{ text: this.active.end }]
        : this.channels.map((channel) => ({ text: channel.start, channel }))
    let longest = 0
    for (const { text, channel } of markers) {
      const max = Math.min(this.buffer.length, text.length - 1)
      for (let length = max; length > longest; length--) {
        const opens =
          channel === undefined ||
          this.canOpen(channel, this.buffer.length - length)
        if (opens && this.buffer.endsWith(text.slice(0, length))) {
          longest = length
          break
        }
      }
    }
    return longest
  }
}
