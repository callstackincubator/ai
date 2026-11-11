# Changelog

Changes to `@react-native-ai/dev-tools`. For 0.12.0 and earlier, see the [GitHub releases](https://github.com/callstackincubator/ai/releases).

## Unreleased

### Breaking changes

- AI SDK 7 removed `tracer` from per-call telemetry options, so `experimental_telemetry: { tracer }` no longer sends spans. Register the dev tools tracer once instead ([#233](https://github.com/callstackincubator/ai/pull/233)):

  ```ts
  registerTelemetry(
    new OpenTelemetry({ tracer: getAiSdkTracer({ serviceName: 'my-app' }) })
  )
  ```

### Fixes

- `dist/` is included in the npm package, so the Rozenite plugin loads. ([#209](https://github.com/callstackincubator/ai/pull/209))
