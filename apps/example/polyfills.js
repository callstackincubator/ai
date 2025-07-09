import 'react-native-get-random-values';

// @ts-ignore
import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions';
import structuredClone from '@ungap/structured-clone';

const webStreamPolyfills = require('web-streams-polyfill/ponyfill/es6');

polyfillGlobal('TextEncoder', () => require('text-encoding').TextEncoder);
polyfillGlobal('TextDecoder', () => require('text-encoding').TextDecoder);
polyfillGlobal('ReadableStream', () => webStreamPolyfills.ReadableStream);
polyfillGlobal('TransformStream', () => webStreamPolyfills.TransformStream);
polyfillGlobal('WritableStream', () => webStreamPolyfills.WritableStream);
polyfillGlobal('TextEncoderStream', () => webStreamPolyfills.TextEncoderStream);
polyfillGlobal('structuredClone', () => structuredClone);
