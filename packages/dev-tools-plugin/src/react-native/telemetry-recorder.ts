import { ReadableSpan } from '@opentelemetry/sdk-trace-base'

import { DEFAULT_DEVTOOLS_CONFIG } from './config'

type RecorderConfig = {
  isEnabled: boolean
  maxQueueSize: number
}

type SendSpan = (span: ReadableSpan) => void

const defaultConfig: RecorderConfig = {
  isEnabled: DEFAULT_DEVTOOLS_CONFIG.isEnabled,
  maxQueueSize: DEFAULT_DEVTOOLS_CONFIG.maxQueueSize,
}

export class AiSdkTelemetryRecorder {
  private config: RecorderConfig = { ...defaultConfig }
  private queue: ReadableSpan[] = []
  private sender?: SendSpan

  setSender(sender?: SendSpan) {
    this.sender = sender
    this.flush()
  }

  updateConfig(partial: Partial<RecorderConfig>) {
    this.config = { ...this.config, ...partial }
  }

  enable() {
    this.config.isEnabled = true
  }

  disable() {
    this.config.isEnabled = false
  }

  record(span: ReadableSpan) {
    if (!this.config.isEnabled) {
      return
    }

    if (!isAiSdkSpan(span)) {
      console.warn(
        '[ai-sdk-dev-tools] Ignoring non-AI SDK span. This recorder only supports AI SDK spans.',
        {
          name: span.name,
          attributes: span.attributes,
        }
      )
      return
    }

    if (!this.sender) {
      if (this.queue.length >= this.config.maxQueueSize) {
        this.queue.shift()
      }
      this.queue.push(span)
      return
    }

    this.sender(span)
  }

  private flush() {
    if (!this.sender || this.queue.length === 0) {
      return
    }

    const queued = [...this.queue]
    this.queue = []
    queued.forEach((span) => this.sender?.(span))
  }
}

let recorderInstance: AiSdkTelemetryRecorder | null = null

export const getAiSdkTelemetryRecorder = () => {
  if (!recorderInstance) {
    recorderInstance = new AiSdkTelemetryRecorder()
  }
  return recorderInstance
}

const isAiSdkSpan = (span: ReadableSpan) => {
  if (span.name.startsWith('ai.')) {
    return true
  }
  return (
    typeof span.attributes['ai.operationId'] === 'string' ||
    Object.keys(span.attributes).some((key) => key.startsWith('gen_ai.'))
  )
}
