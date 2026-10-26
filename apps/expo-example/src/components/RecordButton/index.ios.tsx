import { apple } from '@react-native-ai/apple'
import { useMemo } from 'react'

import {
  RecordButtonUIBase,
  type RecordButtonUIBaseProps,
} from './RecordButtonUIBase'

export type RecordButtonProps = Omit<
  RecordButtonUIBaseProps,
  'transcriptionModel'
>

export function RecordButton(props: RecordButtonProps) {
  const transcriptionModel = useMemo(() => apple.transcriptionModel(), [])

  return (
    <RecordButtonUIBase transcriptionModel={transcriptionModel} {...props} />
  )
}
