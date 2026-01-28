import { useEffect } from 'react';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { AiSdkProfilerEventMap } from '../shared/client';
import { AI_SDK_PROFILER_PLUGIN_ID } from '../shared/constants';
import { getAiSdkTelemetryRecorder } from './telemetry-recorder';

export const useAiSdkDevTools = () => {
  const client = useRozeniteDevToolsClient<AiSdkProfilerEventMap>({
    pluginId: AI_SDK_PROFILER_PLUGIN_ID,
  });

  useEffect(() => {
    if (!client) {
      return;
    }

    const recorder = getAiSdkTelemetryRecorder();
    recorder.setSender((span) => {
      client.send('ai-sdk-span', { span });
    });

    const subscriptions = [
      client.onMessage('ai-sdk-enable', () => {
        recorder.enable();
      }),
      client.onMessage('ai-sdk-disable', () => {
        recorder.disable();
      }),
    ];

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      recorder.setSender(undefined);
      client.send('ai-sdk-disable', {});
    };
  }, [client]);

  return client;
};
