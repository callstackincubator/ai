import TextEmbeddingPipeline from './pipelines/text-embeding';
import { TextEmbedding } from './text-embedding';

export const Pipeline = { TextEmbedding: TextEmbeddingPipeline };
export const Model = { TextEmbedding };

export default { Pipeline, Model };

export type * from './ai-sdk';
export type { DownloadProgress, ModelInfo, ONNXLanguageModelOptions } from './ai-sdk';
export { ONNXLanguageModel, onnx } from './ai-sdk';
export { TextEmbedding } from './text-embedding';
export { default as TextEmbeddingPipeline } from './pipelines/text-embeding';