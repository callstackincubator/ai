import { apple } from '@react-native-ai/apple'
import { useMemo } from 'react'

import { float32ArrayToWAV } from '../../utils/appleAudioUtils'
import {
  RecordButtonUIBase,
  type RecordButtonUIBaseProps,
} from './RecordButtonUIBase'

export type RecordButtonProps = Omit<
  RecordButtonUIBaseProps,
  'transcriptionModel' | 'float32ArrayToWAV'
>

export function RecordButton(props: RecordButtonProps) {
  const transcriptionModel = useMemo(() => apple.transcriptionModel(), [])

  return (
    <RecordButtonUIBase
      transcriptionModel={transcriptionModel}
      float32ArrayToWAV={float32ArrayToWAV}
      {...props}
    />
  )
}
