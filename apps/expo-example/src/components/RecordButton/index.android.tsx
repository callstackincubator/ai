import {
  RecordButtonUIBase,
  type RecordButtonUIBaseProps,
} from './RecordButtonUIBase'

export type RecordButtonProps = Omit<
  RecordButtonUIBaseProps,
  'transcriptionModel'
>

export function RecordButton(props: RecordButtonProps) {
  return (
    <RecordButtonUIBase
      transcriptionModel={undefined}
      float32ArrayToWAV={undefined}
      {...props}
    />
  )
}
