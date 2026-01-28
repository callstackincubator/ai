export type AiSdkSpanEvent = {
  name: string
  time: number
  attributes: Record<string, unknown>
}

export type AiSdkSpan = {
  spanId: string
  traceId: string
  name: string
  startTime: number
  duration: number
  attributes: Record<string, unknown>
  resource: Record<string, unknown>
  events: AiSdkSpanEvent[]
}
