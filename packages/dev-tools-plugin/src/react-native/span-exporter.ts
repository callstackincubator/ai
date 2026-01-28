import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { AiSdkTelemetryRecorder } from './telemetry-recorder';

export class AiSdkDevToolsSpanExporter implements SpanExporter {
  private recorder: AiSdkTelemetryRecorder;
  private isShutdown = false;

  constructor(recorder: AiSdkTelemetryRecorder) {
    this.recorder = recorder;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    if (this.isShutdown) {
      resultCallback({ code: ExportResultCode.FAILED });
      return;
    }

    spans.forEach((span) => this.recorder.record(span));
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    this.isShutdown = true;
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
