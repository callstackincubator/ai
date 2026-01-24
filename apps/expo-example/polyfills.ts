import '@azure/core-asynciterator-polyfill'

import structuredClone from '@ungap/structured-clone'

if (!('structuredClone' in globalThis)) {
  globalThis.structuredClone = structuredClone
}

globalThis.DOMException = Error as any
