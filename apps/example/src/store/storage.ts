import AsyncStorage from '@react-native-async-storage/async-storage'
import { atom, type SetStateAction } from 'jotai'

// Everything stored, read once before the first screen renders
const snapshot = new Map<string, string | null>()

export async function loadPersistedState() {
  const keys = await AsyncStorage.getAllKeys()
  for (const [key, value] of await AsyncStorage.multiGet(keys)) {
    snapshot.set(key, value)
  }
}

const unset = Symbol('unset')

// An atom saved to AsyncStorage. Reads and writes stay synchronous because the
// stored value is loaded up front by loadPersistedState
export function atomWithPersistence<T>(key: string, initialValue: T) {
  const valueAtom = atom<T | typeof unset>(unset)

  const readValue = (value: T | typeof unset): T => {
    if (value !== unset) return value
    const stored = snapshot.get(key)
    return stored == null ? initialValue : (JSON.parse(stored) as T)
  }

  return atom(
    (get) => readValue(get(valueAtom)),
    (get, set, update: SetStateAction<T>) => {
      const prev = readValue(get(valueAtom))
      const next =
        typeof update === 'function' ? (update as (prev: T) => T)(prev) : update
      set(valueAtom, next)
      AsyncStorage.setItem(key, JSON.stringify(next))
    }
  )
}
