import { OpenTelemetry } from '@ai-sdk/otel'
import { getAiSdkTracer } from '@react-native-ai/dev-tools'
import { registerTelemetry } from 'ai'

registerTelemetry(
  new OpenTelemetry({
    tracer: getAiSdkTracer({
      serviceName: 'react-native-ai-example',
    }),
  })
)

export function getAiSdkTelemetry(functionId: string) {
  return { functionId }
}
