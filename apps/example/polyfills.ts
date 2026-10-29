import '@azure/core-asynciterator-polyfill'

import structuredClone from '@ungap/structured-clone'

if (!('structuredClone' in globalThis)) {
  globalThis.structuredClone =
    structuredClone as typeof globalThis.structuredClone
}

globalThis.DOMException = Error as any
