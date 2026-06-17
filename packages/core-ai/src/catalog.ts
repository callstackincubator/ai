import type { CoreAIModelTask, CoreAIPlatform } from './types'

export interface CoreAIModelCatalogEntry {
  id: string
  hfId: string
  family: string
  task: CoreAIModelTask
  platforms: CoreAIPlatform[]
  exportScript?: string
  exportCommand: string
  notes?: string
}

const ENTRIES: CoreAIModelCatalogEntry[] = [
  {
    id: 'qwen3-0.6b',
    hfId: 'Qwen/Qwen3-0.6B',
    family: 'qwen3',
    task: 'language',
    platforms: ['iOS', 'macOS'],
    exportCommand: 'uv run coreai.llm.export Qwen/Qwen3-0.6B --platform iOS',
    notes: 'Recommended first iOS language-session example.',
  },
  {
    id: 'qwen2.5-1.5b-instruct',
    hfId: 'Qwen/Qwen2.5-1.5B-Instruct',
    family: 'qwen2.5',
    task: 'language',
    platforms: ['iOS', 'macOS'],
    exportCommand:
      'uv run coreai.llm.export Qwen/Qwen2.5-1.5B-Instruct --platform iOS',
  },
  {
    id: 'qwen3-4b',
    hfId: 'Qwen/Qwen3-4B',
    family: 'qwen3',
    task: 'language',
    platforms: ['iOS', 'macOS'],
    exportCommand: 'uv run coreai.llm.export Qwen/Qwen3-4B --platform iOS',
  },
  {
    id: 'gpt-oss-20b',
    hfId: 'openai/gpt-oss-20b',
    family: 'gpt-oss',
    task: 'language',
    platforms: ['macOS'],
    exportCommand: 'uv run coreai.llm.export openai/gpt-oss-20b',
    notes: 'macOS-only in the current Apple registry.',
  },
  {
    id: 'gemma3-4b-it',
    hfId: 'google/gemma-3-4b-it',
    family: 'gemma3',
    task: 'language',
    platforms: ['macOS'],
    exportCommand: 'uv run coreai.llm.export google/gemma-3-4b-it',
    notes: 'macOS-only in the current Apple registry.',
  },
  {
    id: 'clip-vit-b32',
    hfId: 'openai/clip-vit-base-patch32',
    family: 'clip',
    task: 'embedding',
    platforms: ['iOS', 'macOS'],
    exportScript: 'models/clip/export.py',
    exportCommand:
      'uv run models/clip/export.py --model openai/clip-vit-base-patch32',
  },
  {
    id: 'clap-htsat',
    hfId: 'laion/clap-htsat-unfused',
    family: 'clap',
    task: 'embedding',
    platforms: ['iOS', 'macOS'],
    exportScript: 'models/clap/export.py',
    exportCommand:
      'uv run models/clap/export.py --model laion/clap-htsat-unfused',
  },
  {
    id: 'sd-1.5',
    hfId: 'runwayml/stable-diffusion-v1-5',
    family: 'stable-diffusion',
    task: 'diffusion',
    platforms: ['iOS', 'macOS'],
    exportCommand:
      'uv run coreai.diffusion.export runwayml/stable-diffusion-v1-5',
  },
  {
    id: 'flux2-klein-4b',
    hfId: 'black-forest-labs/FLUX.2-klein-4B',
    family: 'flux2',
    task: 'diffusion',
    platforms: ['iOS', 'macOS'],
    exportCommand:
      'uv run coreai.diffusion.export flux2-klein-4b --platform iOS',
  },
  {
    id: 'wav2vec2-base',
    hfId: 'wav2vec2_asr_base_960h',
    family: 'wav2vec2',
    task: 'asr',
    platforms: ['iOS', 'macOS'],
    exportScript: 'models/wav2vec2/export.py',
    exportCommand:
      'uv run models/wav2vec2/export.py --model wav2vec2_asr_base_960h',
  },
  {
    id: 'whisper-large-v3-turbo',
    hfId: 'openai/whisper-large-v3-turbo',
    family: 'whisper',
    task: 'asr',
    platforms: ['iOS', 'macOS'],
    exportScript: 'models/whisper/export.py',
    exportCommand:
      'uv run models/whisper/export.py --model openai/whisper-large-v3-turbo',
  },
  {
    id: 'efficient-sam-vitt',
    hfId: 'efficient_sam_vitt',
    family: 'efficient-sam',
    task: 'segmentation',
    platforms: ['iOS', 'macOS'],
    exportScript: 'models/efficient-sam/export.py',
    exportCommand:
      'uv run models/efficient-sam/export.py --model efficient_sam_vitt',
  },
  {
    id: 'sam3',
    hfId: 'facebook/sam3',
    family: 'sam3',
    task: 'segmentation',
    platforms: ['iOS', 'macOS'],
    exportScript: 'models/sam3/export.py',
    exportCommand: 'uv run models/sam3/export.py --model facebook/sam3',
    notes: 'Gated on Hugging Face.',
  },
  {
    id: 'yolos-tiny',
    hfId: 'hustvl/yolos-tiny',
    family: 'yolo',
    task: 'object-detection',
    platforms: ['iOS', 'macOS'],
    exportScript: 'models/yolo/export.py',
    exportCommand: 'uv run models/yolo/export.py --model hustvl/yolos-tiny',
  },
  {
    id: 'yolos-base',
    hfId: 'hustvl/yolos-base',
    family: 'yolo',
    task: 'object-detection',
    platforms: ['iOS', 'macOS'],
    exportScript: 'models/yolo/export.py',
    exportCommand: 'uv run models/yolo/export.py --model hustvl/yolos-base',
  },
  {
    id: 'depth-anything-3-small',
    hfId: 'depth-anything/da3-small',
    family: 'depth-anything',
    task: 'depth',
    platforms: ['macOS'],
    exportScript: 'models/depth-anything/export.py',
    exportCommand:
      'uv run models/depth-anything/export.py --model depth-anything/da3-small',
    notes: 'macOS-only in the current Apple registry.',
  },
  {
    id: 'edsr-x2',
    hfId: 'edsr_r16f64_x2',
    family: 'edsr',
    task: 'super-resolution',
    platforms: ['iOS', 'macOS'],
    exportScript: 'models/edsr/export.py',
    exportCommand: 'uv run models/edsr/export.py --model edsr_r16f64_x2',
  },
  {
    id: 'pvt-v2-b0',
    hfId: 'pvt_v2_b0',
    family: 'pvt',
    task: 'classification',
    platforms: ['iOS', 'macOS'],
    exportScript: 'models/pvt/export.py',
    exportCommand: 'uv run models/pvt/export.py --model pvt_v2_b0',
  },
]

export const catalog = {
  list({
    task,
    platform,
  }: { task?: CoreAIModelTask; platform?: CoreAIPlatform } = {}) {
    return ENTRIES.filter((entry) => {
      if (task && entry.task !== task) {
        return false
      }
      if (platform && !entry.platforms.includes(platform)) {
        return false
      }
      return true
    })
  },

  get(id: string) {
    return ENTRIES.find((entry) => entry.id === id)
  },

  getExportCommand(id: string, options: { platform?: CoreAIPlatform } = {}) {
    const entry = catalog.get(id)
    if (!entry) {
      return undefined
    }
    if (options.platform === 'iOS' && !entry.platforms.includes('iOS')) {
      return undefined
    }
    return entry.exportCommand
  },
}
