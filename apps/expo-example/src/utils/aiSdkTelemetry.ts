import { getAiSdkTracer } from '@react-native-ai/dev-tools'

const tracer = getAiSdkTracer({
  serviceName: 'react-native-ai-example',
})

export function getAiSdkTelemetry(functionId: string) {
  return {
    isEnabled: true,
    tracer,
    functionId,
  }
}
