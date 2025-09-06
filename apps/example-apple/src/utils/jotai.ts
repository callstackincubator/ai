import AsyncStorage from '@react-native-async-storage/async-storage'
import { atom, PrimitiveAtom } from 'jotai'

export const atomWithSecureStorage = <T>(
  key: string,
  initialValue: any
): PrimitiveAtom<T> => {
  const baseAtom = atom(initialValue)

  baseAtom.onMount = (setValue) => {
    ;(async () => {
      const item = await AsyncStorage.getItem(key)
      setValue(item ? JSON.parse(item) : initialValue)
    })()
  }

  const derivedAtom = atom(
    (get) => get(baseAtom),
    (get, set, update) => {
      const nextValue =
        typeof update === 'function' ? update(get(baseAtom)) : update
      set(baseAtom, nextValue)
      AsyncStorage.setItem(key, JSON.stringify(nextValue))
    }
  )

  return derivedAtom
}
