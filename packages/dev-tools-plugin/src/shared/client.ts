import { RozeniteDevToolsClient } from '@rozenite/plugin-bridge'

import { AiSdkSpan } from './types'
export type AiSdkProfilerEventMap = {
  'ai-sdk-enable': unknown
  'ai-sdk-disable': unknown
  'ai-sdk-span': {
    span: AiSdkSpan
  }
}

export type AiSdkProfilerDevToolsClient =
  RozeniteDevToolsClient<AiSdkProfilerEventMap>
