import { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { RozeniteDevToolsClient } from '@rozenite/plugin-bridge'

export type AiSdkProfilerEventMap = {
  'ai-sdk-enable': unknown
  'ai-sdk-disable': unknown
  'ai-sdk-span': {
    span: ReadableSpan
  }
}

export type AiSdkProfilerDevToolsClient =
  RozeniteDevToolsClient<AiSdkProfilerEventMap>
