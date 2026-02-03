import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'

export type AiSdkDevToolsConfig = {
  /**
   * Whether profiling is enabled.
   * @default true
   */
  isEnabled?: boolean
  /**
   * Maximum queued spans before DevTools connects.
   * @default 200
   */
  maxQueueSize?: number
  /**
   * Optional service name for OTEL resource.
   */
  serviceName?: string
  /**
   * Optional tracer provider to reuse instead of creating one.
   * Must be provided on the first call to getAiSdkTracer.
   */
  tracerProvider?: BasicTracerProvider
}

export const DEFAULT_DEVTOOLS_CONFIG: Required<
  Pick<AiSdkDevToolsConfig, 'isEnabled' | 'maxQueueSize'>
> = {
  isEnabled: true,
  maxQueueSize: 200,
}
