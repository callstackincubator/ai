export type Availability = 'yes' | 'no' | 'availableForDownload'

// Where a model runs. Core AI can join llama.cpp as a download runtime later
export type Runtime = 'apple' | 'llama'

export type Capability = 'vision' | 'reasoning' | 'tools'

// Adapter for setting up and managing AI models with lifecycle methods.
export interface SetupAdapter<TModel> {
  // The underlying AI model instance
  model: TModel
  // Unique identifier for the model
  modelId: string
  // Human-readable name
  label: string
  // One line on what the model is good at
  description: string
  runtime: Runtime
  capabilities: Capability[]
  // Total download size, omitted for built-in models
  sizeBytes?: number
  // Whether the model ships with the OS (true) or is downloaded (false)
  builtIn: boolean
  // Whether the model accepts images, omitted means text only
  imageInput?: boolean
  // Check if model is ready, unavailable, or downloadable
  isAvailable: () => Availability
  // Download the model with progress callback
  download: (onProgress: (percentage: number) => void) => Promise<void>
  // Remove the downloaded model from storage
  delete: () => Promise<void>
  // Load and prepare the model for inference
  prepare: () => Promise<void>
}
