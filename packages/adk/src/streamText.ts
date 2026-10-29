// Gemini Nano writes tool calls as text, which ADK turns into function calls
const toolCodeMarker = '```tool_code'

// Gemini Nano often wraps JSON in a Markdown code fence
const jsonFencePrefix = /^\s*```(?:json)?\s*\n?/
// Text that could still grow into the opening fence
const partialJsonFence = /^\s*`{0,3}(j(s(o(n)?)?)?)?$/

export const stripJsonFences = (text: string) =>
  text.replace(jsonFencePrefix, '').replace(/\s*```\s*$/, '')

// ADK labels the turns of Gemini Nano's history with role markers. Nano can
// start its reply with one, or go on to write the user's next turn
const modelMarkerPrefix = /^\s*\[model\]:\s*/
// Text that could still grow into the model marker
const partialModelMarker = /^\s*(\[(m(o(d(e(l(\](:)?)?)?)?)?)?)?)?$/
const userMarker = '\n[user]:'

export const stripRoleMarkers = (text: string) => {
  const userIndex = text.indexOf(userMarker)
  return (userIndex === -1 ? text : text.slice(0, userIndex)).replace(
    modelMarkerPrefix,
    ''
  )
}

// Length of the end of `text` that could be the start of `marker`
function pendingPrefixLength(text: string, marker: string) {
  for (
    let length = Math.min(text.length, marker.length - 1);
    length > 0;
    length--
  ) {
    if (marker.startsWith(text.slice(-length))) {
      return length
    }
  }
  return 0
}

/**
 * Filters streamed model text. It hides Gemini Nano `tool_code` blocks and
 * role markers and, in JSON mode, Markdown code fences, holding back text
 * until it cannot become one.
 */
export class StreamTextFilter {
  private turnText = ''
  private emitted = ''

  constructor(
    private readonly options: {
      json: boolean
      toolCode: boolean
      roleMarkers?: boolean
    }
  ) {}

  /** Adds a text delta and returns the text that is now safe to show */
  push(delta: string) {
    this.turnText += delta
    return this.take(false)
  }

  /** Returns the rest of the text at the end of the stream */
  flush() {
    return this.take(true)
  }

  /** A tool call ended the model turn, so the next turn starts empty */
  endTurn() {
    this.turnText = ''
    this.emitted = ''
  }

  private take(final: boolean) {
    const visible = this.visibleText(final)
    if (visible === undefined || !visible.startsWith(this.emitted)) {
      return ''
    }
    const delta = visible.slice(this.emitted.length)
    this.emitted = visible
    return delta
  }

  private visibleText(final: boolean): string | undefined {
    let text = this.turnText
    const markerIndex = this.options.toolCode
      ? text.indexOf(toolCodeMarker)
      : -1
    if (markerIndex !== -1) {
      text = text.slice(0, markerIndex)
    }

    const userIndex = this.options.roleMarkers ? text.indexOf(userMarker) : -1
    if (this.options.roleMarkers) {
      if (!final && partialModelMarker.test(text)) {
        return undefined
      }
      text = stripRoleMarkers(text)
    }

    if (this.options.json) {
      if (final) {
        return stripJsonFences(text)
      }
      if (partialJsonFence.test(text)) {
        return undefined
      }
      // Hold back trailing backticks that could start a closing fence
      text = text.replace(jsonFencePrefix, '').replace(/\s*`{1,3}$/, '')
    }

    // Hold back the end of the text while it could still become the marker
    if (this.options.toolCode && markerIndex === -1 && !final) {
      text = text.slice(
        0,
        text.length - pendingPrefixLength(text, toolCodeMarker)
      )
    }
    if (
      this.options.roleMarkers &&
      markerIndex === -1 &&
      userIndex === -1 &&
      !final
    ) {
      text = text.slice(0, text.length - pendingPrefixLength(text, userMarker))
    }
    return text
  }
}
