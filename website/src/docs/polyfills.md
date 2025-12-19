# Polyfills

Several functions that are internally used by the AI SDK might not be available in the React Native runtime depending on your configuration and the target platform.

## Expo

First, install the following packages:

```bash
npm install @ungap/structured-clone @stardazed/streams-text-encoding
```

Then create a new file in the root of your project with the following polyfills:

```js title="polyfills.js"
import { Platform } from 'react-native'
import structuredClone from '@ungap/structured-clone'

if (Platform.OS !== 'web') {
  const setupPolyfills = async () => {
    const { polyfillGlobal } = await import(
      'react-native/Libraries/Utilities/PolyfillFunctions'
    )

    const { TextEncoderStream, TextDecoderStream } = await import(
      '@stardazed/streams-text-encoding'
    )

    if (!('structuredClone' in global)) {
      polyfillGlobal('structuredClone', () => structuredClone)
    }

    polyfillGlobal('TextEncoderStream', () => TextEncoderStream)
    polyfillGlobal('TextDecoderStream', () => TextDecoderStream)
  }

  setupPolyfills()
}

export {}
```

Make sure to import this file early in your app's entry point (e.g., at the top of your `App.tsx` or `index.js`):

```js
import './polyfills'
```

## Bare React Native

For projects not using Expo, you'll need additional stream polyfills since Expo provides some of these out of the box.

First, install the following packages:

```bash
npm install @ungap/structured-clone @stardazed/streams-text-encoding web-streams-polyfill
```

Then create a new file in the root of your project with the following polyfills:

```js title="polyfills.js"
import { Platform } from 'react-native'
import structuredClone from '@ungap/structured-clone'
import {
  TransformStream,
  ReadableStream,
  WritableStream,
} from 'web-streams-polyfill'

if (Platform.OS !== 'web') {
  const setupPolyfills = async () => {
    const { polyfillGlobal } = await import(
      'react-native/Libraries/Utilities/PolyfillFunctions'
    )

    const { TextEncoderStream, TextDecoderStream } = await import(
      '@stardazed/streams-text-encoding'
    )

    if (!('structuredClone' in global)) {
      polyfillGlobal('structuredClone', () => structuredClone)
    }

    if (!('TransformStream' in global)) {
      polyfillGlobal('TransformStream', () => TransformStream)
    }

    if (!('ReadableStream' in global)) {
      polyfillGlobal('ReadableStream', () => ReadableStream)
    }

    if (!('WritableStream' in global)) {
      polyfillGlobal('WritableStream', () => WritableStream)
    }

    polyfillGlobal('TextEncoderStream', () => TextEncoderStream)
    polyfillGlobal('TextDecoderStream', () => TextDecoderStream)
  }

  setupPolyfills()
}

export {}
```

Make sure to import this file early in your app's entry point (e.g., at the top of your `App.tsx` or `index.js`):

```js
import './polyfills'
```
