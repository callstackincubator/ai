// @ts-nocheck
import { Platform } from 'react-native';
import structuredClone from '@ungap/structured-clone';
import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions';

if (Platform.OS !== 'web') {
  const setupPolyfills = async () => {
    const { TextDecoderStream, TextEncoderStream } = await import(
      '@stardazed/streams-text-encoding'
    );

    const webStreamPolyfills = require('web-streams-polyfill/ponyfill/es6');

    if (!('structuredClone' in global)) {
      polyfillGlobal('structuredClone', () => structuredClone);
    }

    polyfillGlobal('ReadableStream', () => webStreamPolyfills.ReadableStream);
    polyfillGlobal('TransformStream', () => webStreamPolyfills.TransformStream);
    polyfillGlobal('WritableStream', () => webStreamPolyfills.WritableStream);

    polyfillGlobal('TextDecoderStream', () => TextDecoderStream);
    polyfillGlobal('TextEncoderStream', () => TextEncoderStream);
  };

  setupPolyfills();
}
