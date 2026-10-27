---
title: "Models & Availability"
---

`apple()` uses the on-device model, `SystemLanguageModel.default`. On iOS 27
you can also use Apple's Private Cloud Compute model, and tune the on-device
model with guardrail and use-case options.

## Availability And Model Info

`apple.isAvailable()` is a quick synchronous check that Apple Intelligence can
run on the device:

```typescript
import { apple } from '@react-native-ai/apple'

if (!apple.isAvailable()) {
  // Show fallback UI or use another provider.
}
```

For details, ask native for the model's metadata:

```typescript
const info = await apple.getModelInfo({ locale: 'en-US' })
```

It returns `availability`, locale support (`supportsLocale`,
`supportedLanguages`), `contextSize` when Apple exposes it, the Private Cloud
Compute `quota`, and feature flags: `supportsTokenCounting`,
`supportsImagePrompts`, `supportsReasoning`, `supportsVisionTools`, and
`supportsSpotlightTool`. Prefer these flags over comparing iOS versions.

When the model is unavailable, `availability` tells you why, so you can show
something more useful than a generic error:

| `availability`                | Model                   | Meaning                                                              |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `available`                   | both                    | The model is ready to use                                            |
| `deviceNotEligible`           | both                    | The device does not support this model                               |
| `appleIntelligenceNotEnabled` | `system`                | Apple Intelligence is turned off, ask the user to enable it          |
| `modelNotReady`               | `system`                | The model is still downloading, try again later                      |
| `systemNotReady`              | `private-cloud-compute` | Private Cloud Compute is not ready yet, try again later              |
| `missingEntitlement`          | `private-cloud-compute` | The app does not set `AppleLLMPrivateCloudCompute` in its Info.plist |
| `unknown`                     | both                    | A reason this version of the library does not know about yet         |

```typescript
const { availability } = await apple.getModelInfo()

if (availability === 'appleIntelligenceNotEnabled') {
  // Ask the user to turn on Apple Intelligence in Settings.
}
```

## Private Cloud Compute

On iOS 27, pass `'private-cloud-compute'` to use Apple's server model. It
supports [reasoning](/docs/apple/generating#reasoning) and does not run in the iOS
Simulator:

```typescript
const result = await generateText({
  model: apple('private-cloud-compute'),
  prompt: 'Analyze this longer task with more reasoning.',
})
```

### Enabling It

Private Cloud Compute needs the managed
`com.apple.developer.private-cloud-compute` entitlement, which Apple grants on
request. Once your team has it, enable it with the package's Expo config
plugin, which adds the entitlement and the `AppleLLMPrivateCloudCompute`
Info.plist key:

```json title="app.json"
{
  "expo": {
    "plugins": [["@react-native-ai/apple", { "privateCloudCompute": true }]]
  }
}
```

Without Expo, add the entitlement to your app's `.entitlements` file and set
the Info.plist key yourself:

```xml title="Info.plist"
<key>AppleLLMPrivateCloudCompute</key>
<true/>
```

:::caution
Foundation Models stops the app with a fatal error, which cannot be caught,
when it uses Private Cloud Compute without the entitlement, and iOS has no API
to check for it. Until the Info.plist key is set, the model reports
`missingEntitlement` and generation fails with `MODEL_UNAVAILABLE`, so only set
it in builds signed with the entitlement.
:::

### Checking Availability

Check `apple.getModelInfo({ model: 'private-cloud-compute' })` before offering
it. While it is unavailable, `contextSize` is omitted, `supportsLocale` is
`false`, and `supportedLanguages` is empty.

### Making It the Default

`apple({ model: 'private-cloud-compute' })` is the same as
`apple('private-cloud-compute')`. To use it for every call, create the provider
with `createAppleProvider({ model: 'private-cloud-compute' })`.

### Quota

When the user's quota is reached, generation fails with `RATE_LIMITED`. Check
it ahead of time to warn the user, and offer Apple's way to raise it, such as
iCloud+:

```typescript
const { quota } = await apple.getModelInfo({ model: 'private-cloud-compute' })

if (
  (quota?.isApproachingLimit || quota?.isLimitReached) &&
  quota.canIncreaseLimit
) {
  await apple.showQuotaLimitIncreaseSuggestion()
}
```

`quota` is set once Private Cloud Compute is available, and `resetDate` tells
when a reached limit resets.

## Guardrails

Apple applies content guardrails to prompts and responses. Apps that transform
legitimate but sensitive content, such as health data, can hit guardrail
violations with the default mode. Opt into Apple's permissive mode for those
use cases:

```typescript
const model = apple({ guardrails: 'permissiveContentTransformations' })
```

Pass it to `createAppleProvider` to set it for every model. It applies to the
on-device model only. See
[Improving the safety of generative model output](https://developer.apple.com/documentation/foundationmodels/improving-the-safety-of-generative-model-output#Use-permissive-guardrail-mode-for-sensitive-content)
for when this mode is appropriate.

A flagged prompt or response does not throw. It ends the response with
`finishReason: 'content-filter'`, see [Error Handling](/docs/apple/errors).

## Content Tagging

Apple ships a version of the on-device model tuned for tagging, entity
extraction, and topic detection. Use it with `useCase: 'contentTagging'`,
usually with structured output:

```typescript
import { apple } from '@react-native-ai/apple'
import { generateText, Output } from 'ai'
import { z } from 'zod'

const result = await generateText({
  model: apple({ useCase: 'contentTagging' }),
  prompt:
    'Lionel Messi scored twice as Inter Miami beat Orlando City 3-1 in Florida.',
  output: Output.object({
    schema: z.object({ topics: z.array(z.string()) }),
  }),
})
```

Pass it to `createAppleProvider` to set it for every model. Like guardrails, it
applies to the on-device model only.
