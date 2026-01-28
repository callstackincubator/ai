import { trace } from '@opentelemetry/api';

export let useAiSdkDevTools: typeof import('./src/react-native/useAiSdkDevTools').useAiSdkDevTools;
export let getAiSdkTracer: typeof import('./src/react-native/getAiSdkTracer').getAiSdkTracer;

export type { AiSdkDevToolsConfig } from './src/react-native/config';

const isWeb =
  typeof window !== 'undefined' && window.navigator.product !== 'ReactNative';
const isDev = process.env.NODE_ENV !== 'production';
const isServer = typeof window === 'undefined';

if (isDev && !isWeb && !isServer) {
  useAiSdkDevTools =
    require('./src/react-native/useAiSdkDevTools').useAiSdkDevTools;
  getAiSdkTracer =
    require('./src/react-native/getAiSdkTracer').getAiSdkTracer;
} else {
  useAiSdkDevTools = () => null;
  getAiSdkTracer = () => trace.getTracer('rozenite-ai-sdk-profiler-noop');
}
