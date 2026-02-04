import { View } from 'react-native'

export { Button, ContextMenu, Slider } from '@expo/ui/jetpack-compose'

export function Host({ children }: { children: React.ReactNode } & any) {
  return <View style={{ flex: 1, backgroundColor: '#fff' }}>{children}</View>
}
