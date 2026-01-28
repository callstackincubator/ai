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
      return
    }

    const payload = toAiSdkSpan(span)
    if (!payload) {
      return
    }

    if (!this.sender) {
      this.queue.push(payload)
      if (this.queue.length > this.config.maxQueueSize) {
        this.queue.shift()
      }
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

const hrTimeToMs = (time: HrTime) =>
  Math.round(time[0] * 1000 + time[1] / 1_000_000)

const toAiSdkSpan = (span: ReadableSpan): AiSdkSpan | null => {
  const spanContext = span.spanContext()
  if (!spanContext?.spanId || !spanContext?.traceId) {
    return null
  }

  const startTime = hrTimeToMs(span.startTime)
  const endTime = hrTimeToMs(span.endTime)

  const attributes = span.attributes as Record<string, unknown>

  const events = span.events?.map((event) => ({
    name: event.name,
    time: hrTimeToMs(event.time),
    attributes: event.attributes as Record<string, unknown> | undefined,
  }))

  const payload: AiSdkSpan = {
    spanId: spanContext.spanId,
    traceId: spanContext.traceId,
    parentSpanId: span.parentSpanId || undefined,
    name: span.name,
    kind: span.kind,
    status: span.status ? { ...span.status } : undefined,
    startTime,
    endTime,
    durationMs: Math.max(0, endTime - startTime),
    attributes,
    resource: span.resource?.attributes as Record<string, unknown> | undefined,
    events,
  }

  return payload
}

const isAiSdkSpan = (span: ReadableSpan) => {
  if (span.name.startsWith('ai.')) {
    return true
  }

  const attributes = span.attributes as Record<string, unknown>
  return (
    typeof attributes['ai.operationId'] === 'string' ||
    Object.keys(attributes).some((key) => key.startsWith('gen_ai.'))
  )
}
