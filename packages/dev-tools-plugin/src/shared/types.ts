export type AiSdkSpanEvent = {
  name: string;
  time: number;
  attributes?: Record<string, unknown>;
};

export type AiSdkSpan = {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind?: number;
  status?: {
    code: number;
    message?: string;
  };
  startTime: number;
  endTime: number;
  durationMs: number;
  attributes: Record<string, unknown>;
  resource?: Record<string, unknown>;
  events?: AiSdkSpanEvent[];
};

