// @ts-nocheck
import { Platform } from 'react-native';
import structuredClone from '@ungap/structured-clone';
import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions';

if (Platform.OS !== 'web') {
  const setupPolyfills = async () => {
    const { TextDecoderStream, TextEncoderStream } = await import(
      '@stardazed/streams-text-encoding'
    );

    if (!('structuredClone' in global)) {
      polyfillGlobal('structuredClone', () => structuredClone);
    }

    polyfillGlobal('TextDecoderStream', () => TextDecoderStream);
    polyfillGlobal('TextEncoderStream', () => TextEncoderStream);
  };

  setupPolyfills();
}
