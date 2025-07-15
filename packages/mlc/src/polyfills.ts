// @ts-nocheck
import {
  TextDecoderStream,
  TextEncoderStream,
} from '@stardazed/streams-text-encoding'
import structuredClone from '@ungap/structured-clone'
import { Platform } from 'react-native'
import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions'

if (Platform.OS !== 'web') {
  const setupPolyfills = async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webStreamPolyfills = require('web-streams-polyfill/ponyfill/es6')

    if (!('structuredClone' in global)) {
      polyfillGlobal('structuredClone', () => structuredClone)
    }

    polyfillGlobal('ReadableStream', () => webStreamPolyfills.ReadableStream)
    polyfillGlobal('TransformStream', () => webStreamPolyfills.TransformStream)
    polyfillGlobal('WritableStream', () => webStreamPolyfills.WritableStream)

    polyfillGlobal('TextDecoderStream', () => TextDecoderStream)
    polyfillGlobal('TextEncoderStream', () => TextEncoderStream)
  }

  setupPolyfills()
}
