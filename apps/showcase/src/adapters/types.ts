export type Availability = 'yes' | 'no' | 'availableForDownload'

// Adapter for setting up and managing AI models with lifecycle methods.
export interface SetupAdapter<TModel> {
  // The underlying AI model instance
  model: TModel
  // Unique identifier for the model
  modelId: string
  // Human-readable name
  label: string
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
