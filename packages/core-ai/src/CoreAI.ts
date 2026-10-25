import NativeCoreAI, { type Spec } from './NativeCoreAI'

// Position of the trailing options argument of each native method
const OPTIONS_INDEX: Partial<Record<keyof Spec, number>> = {
  loadModel: 1,
  specializeModel: 1,
  createLanguageSession: 1,
  respondToLanguageSession: 2,
  streamLanguageSession: 3,
  generateText: 3,
  streamText: 3,
  embed: 2,
  transcribe: 3,
  generateImage: 2,
  runTask: 3,
  runRawFunction: 3,
}

/**
 * The native module, with a missing options argument filled in. Native
 * methods read every argument they declare, so a JS call that leaves out the
 * trailing options would crash the app
 */
export const CoreAI = new Proxy(NativeCoreAI, {
  get(target, property: keyof Spec) {
    const value = target[property]
    const index = OPTIONS_INDEX[property]
    if (index === undefined || typeof value !== 'function') {
      return value
    }
    return (...args: unknown[]) => {
      args[index] ??= {}
      return (value as (...args: unknown[]) => unknown).apply(target, args)
    }
  },
})
