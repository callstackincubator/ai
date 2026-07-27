import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'
import type {
  EventEmitter,
  UnsafeObject,
} from 'react-native/Libraries/Types/CodegenTypesNamespace'

export interface AppleMessage {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string
}

/**
 * Availability of Apple Intelligence, mirroring `SystemLanguageModel.Availability`.
 *
 * - `available` - the model is ready to use
 * - `deviceNotEligible` - the hardware does not support Apple Intelligence
 * - `appleIntelligenceNotEnabled` - the user has not turned Apple Intelligence
 *   on, so they can be pointed at Settings
 * - `modelNotReady` - Apple Intelligence is on but the model is not downloaded
 *   yet, so it is worth retrying later
 * - `unsupportedOS` - the device runs an OS older than iOS 26
 * - `unknown` - Apple reported a reason this version of the library does not
 *   know about yet
 */
export type AppleAvailability =
  | 'available'
  | 'deviceNotEligible'
  | 'appleIntelligenceNotEnabled'
  | 'modelNotReady'
  | 'unsupportedOS'
  | 'unknown'

export interface AppleGenerationOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  schema?: UnsafeObject
  tools?: UnsafeObject
}

export type StreamUpdateEvent = {
  streamId: string
  content: string
}

export type StreamCompleteEvent = {
  streamId: string
}

export type StreamErrorEvent = {
  streamId: string
  code?: string
  error: string
}

export interface Spec extends TurboModule {
  isAvailable(): boolean
  getAvailability(): AppleAvailability
  countTokens(text: string): Promise<number>
  generateText(
    messages: AppleMessage[],
    options: AppleGenerationOptions
  ): Promise<
    (
      | { type: 'text'; text: string }
      | {
          type: 'tool-call'
          toolName: string
          input: string
        }
      | {
          type: 'tool-result'
          toolName: string
          output: string
        }
    )[]
  >
  generateStream(
    streamId: string,
    messages: AppleMessage[],
    options: AppleGenerationOptions
  ): void
  cancelStream(streamId: string): void

  onStreamUpdate: EventEmitter<StreamUpdateEvent>
  onStreamComplete: EventEmitter<StreamCompleteEvent>
  onStreamError: EventEmitter<StreamErrorEvent>
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeAppleLLM')
