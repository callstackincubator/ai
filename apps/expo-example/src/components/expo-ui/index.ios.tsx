import { Slider as SwiftUISlider } from '@expo/ui/swift-ui'
import React from 'react'

export { Host } from '@expo/ui/swift-ui'

type SliderProps = {
  value: number
  min: number
  max: number
  /** Number of discrete steps between min and max, matching Jetpack Compose */
  steps?: number
  onValueChange: (value: number) => void
}

export function Slider({ steps, ...props }: SliderProps) {
  return (
    <SwiftUISlider
      {...props}
      step={steps ? (props.max - props.min) / steps : undefined}
    />
  )
}
