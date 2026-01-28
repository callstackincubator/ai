import { HrTime } from '@opentelemetry/api'
import { ReadableSpan } from '@opentelemetry/sdk-trace-base'

import { AiSdkSpan } from '../shared/types'
import { DEFAULT_DEVTOOLS_CONFIG } from './config'

type RecorderConfig = {
  isEnabled: boolean
  maxQueueSize: number
}

type SendSpan = (span: AiSdkSpan) => void

const defaultConfig: RecorderConfig = {
  isEnabled: DEFAULT_DEVTOOLS_CONFIG.isEnabled,
  maxQueueSize: DEFAULT_DEVTOOLS_CONFIG.maxQueueSize,
}

export class AiSdkTelemetryRecorder {
  private config: RecorderConfig = { ...defaultConfig }
  private queue: AiSdkSpan[] = []
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

    const payload = toAiSdkSpan(span)

    if (!this.sender) {
      if (this.queue.length >= this.config.maxQueueSize) {
        this.queue.shift()
      }
      this.queue.push(payload)
      return
    }

    this.sender(payload)
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

const hrTimeToMs = (time: HrTime) =>
  Math.round(time[0] * 1000 + time[1] / 1_000_000)

const toAiSdkSpan = (span: ReadableSpan): AiSdkSpan => {
  return {
    spanId: span.spanContext().spanId,
    traceId: span.spanContext().traceId,
    name: span.name,
    startTime: hrTimeToMs(span.startTime),
    duration: hrTimeToMs(span.duration),
    attributes: span.attributes,
    resource: span.resource.attributes,
    events: span.events.map((event) => ({
      name: event.name,
      time: hrTimeToMs(event.time),
      attributes: event.attributes ?? {},
    })),
  }
}
