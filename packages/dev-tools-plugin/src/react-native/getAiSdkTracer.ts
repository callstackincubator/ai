import { trace, Tracer } from '@opentelemetry/api'
import { Resource } from '@opentelemetry/resources'
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'

import { AiSdkDevToolsConfig, DEFAULT_DEVTOOLS_CONFIG } from './config'
import { AiSdkDevToolsSpanExporter } from './span-exporter'
import { getAiSdkTelemetryRecorder } from './telemetry-recorder'

let tracerProviderInstance: BasicTracerProvider | null = null
let tracerInstance: Tracer | null = null

export const getAiSdkTracer = (config: AiSdkDevToolsConfig = {}) => {
  const recorder = getAiSdkTelemetryRecorder()
  const mergedConfig = {
    ...DEFAULT_DEVTOOLS_CONFIG,
    ...config,
  }

  recorder.updateConfig({
    isEnabled: mergedConfig.isEnabled,
    maxQueueSize: mergedConfig.maxQueueSize,
  })

  if (!tracerProviderInstance) {
    tracerProviderInstance =
      config.tracerProvider ??
      new BasicTracerProvider({
        resource: mergedConfig.serviceName
          ? new Resource({ 'service.name': mergedConfig.serviceName })
          : undefined,
      })

    tracerProviderInstance.addSpanProcessor(
      new SimpleSpanProcessor(new AiSdkDevToolsSpanExporter(recorder))
    )
    trace.setGlobalTracerProvider(tracerProviderInstance)
  }

  if (!tracerInstance) {
    tracerInstance = tracerProviderInstance.getTracer(
      'rozenite-ai-sdk-profiler'
    )
  }

  return tracerInstance
}
