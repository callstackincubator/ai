import '@azure/core-asynciterator-polyfill'

import structuredClone from '@ungap/structured-clone'

globalThis.structuredClone = structuredClone
