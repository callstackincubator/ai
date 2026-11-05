import { describe, expect, it } from 'bun:test'

import {
  parseHuggingFaceId,
  parseTree,
  resolveUrl,
  selectKeptFile,
  selectRepoFile,
} from '../huggingFace'

describe('parseHuggingFaceId', () => {
  it('reads hf:// ids', () => {
    expect(parseHuggingFaceId('hf://org/repo')).toEqual({
      repo: 'org/repo',
      revision: 'main',
      path: undefined,
    })
    expect(parseHuggingFaceId('hf://org/repo@abc/dir/file.litertlm')).toEqual({
      repo: 'org/repo',
      revision: 'abc',
      path: 'dir/file.litertlm',
    })
  })

  it('reads a bare repo', () => {
    expect(parseHuggingFaceId('org/repo')?.repo).toBe('org/repo')
  })

  it('leaves paths and URLs alone', () => {
    expect(parseHuggingFaceId('/data/model.litertlm')).toBeUndefined()
    expect(
      parseHuggingFaceId('https://example.com/a/b.litertlm')
    ).toBeUndefined()
    expect(parseHuggingFaceId('models/gemma.litertlm')).toBeUndefined()
  })

  it('rejects a repo without a name', () => {
    expect(parseHuggingFaceId('hf://org')).toBeUndefined()
  })
})

const gemma = [
  'gemma-4-E2B-it-gpu.litertlm',
  'gemma-4-E2B-it-web.litertlm',
  'gemma-4-E2B-it.litertlm',
  'gemma-4-E2B-it_Google_Tensor_G5.litertlm',
  'gemma-4-E2B-it_NPU_Uncompiled.litertlm',
  'gemma-4-E2B-it_Qualcomm_QCS8275.litertlm',
  'gemma-4-E2B-it_intel_LNL.litertlm',
  'README.md',
].map((path) => ({ path }))

const REPO = 'org/repo'

describe('selectKeptFile', () => {
  it('goes by the start of the name, however the separators differ', () => {
    const kept = [
      'qwen3_0_6b_mixed_int4.litertlm',
      'gemma-4-E2B-it.litertlm',
      'other.litertlm',
    ]
    expect(
      selectKeptFile(
        kept,
        'litert-community/gemma-4-E2B-it-litert-lm',
        undefined,
        'android'
      )?.path
    ).toBe('gemma-4-E2B-it.litertlm')
    expect(
      selectKeptFile(kept, 'litert-community/Qwen3-0.6B', undefined, 'android')
        ?.path
    ).toBe('qwen3_0_6b_mixed_int4.litertlm')
    expect(
      selectKeptFile(kept, 'litert-community/SmolLM3-3B', undefined, 'android')
    ).toBeUndefined()
  })

  it('leaves out a file that may be another model', () => {
    const kept = [
      'Qwen3-8B_mixed_int4.litertlm',
      'Phi-4-mini_multi-prefill-seq_q8.litertlm',
    ]
    expect(
      selectKeptFile(kept, 'org/Qwen3', undefined, 'android')
    ).toBeUndefined()
    expect(
      selectKeptFile(kept, 'org/phi-4', undefined, 'android')
    ).toBeUndefined()
    expect(
      selectKeptFile(kept, 'org/Qwen3-8B', undefined, 'android')?.path
    ).toBe(kept[0])
    expect(
      selectKeptFile(kept, 'org/Phi-4-mini', undefined, 'android')?.path
    ).toBe(kept[1])
  })

  it('takes the platform order among the kept files', () => {
    const kept = ['gemma-4-E2B-it-gpu.litertlm', 'gemma-4-E2B-it.litertlm']
    const repo = 'litert-community/gemma-4-E2B-it-litert-lm'
    expect(selectKeptFile(kept, repo, undefined, 'ios')?.path).toBe(
      'gemma-4-E2B-it-gpu.litertlm'
    )
    expect(selectKeptFile(kept, repo, undefined, 'android')?.path).toBe(
      'gemma-4-E2B-it.litertlm'
    )
    expect(
      selectKeptFile(['gemma-4-E2B-it-gpu.litertlm'], repo, 'cpu', 'android')
    ).toBeUndefined()
  })
})

describe('selectRepoFile', () => {
  it('takes the full bundle on Android', () => {
    expect(selectRepoFile(gemma, REPO, undefined, 'android')?.path).toBe(
      'gemma-4-E2B-it.litertlm'
    )
    expect(selectRepoFile(gemma, REPO, 'gpu', 'android')?.path).toBe(
      'gemma-4-E2B-it.litertlm'
    )
  })

  it('takes the GPU file on iOS', () => {
    expect(selectRepoFile(gemma, REPO, undefined, 'ios')?.path).toBe(
      'gemma-4-E2B-it-gpu.litertlm'
    )
    expect(selectRepoFile(gemma, REPO, 'gpu', 'ios')?.path).toBe(
      'gemma-4-E2B-it-gpu.litertlm'
    )
  })

  it('skips the GPU file when the CPU was asked for', () => {
    expect(selectRepoFile(gemma, REPO, 'cpu', 'ios')?.path).toBe(
      'gemma-4-E2B-it.litertlm'
    )
    expect(selectRepoFile(gemma, REPO, 'cpu', 'android')?.path).toBe(
      'gemma-4-E2B-it.litertlm'
    )
  })

  it('takes the only file there is on either platform', () => {
    const gpuOnly = [{ path: 'model-gpu.litertlm' }]
    const fullOnly = [{ path: 'model.litertlm' }]
    expect(selectRepoFile(gpuOnly, REPO, undefined, 'android')?.path).toBe(
      'model-gpu.litertlm'
    )
    expect(selectRepoFile(fullOnly, REPO, undefined, 'ios')?.path).toBe(
      'model.litertlm'
    )
    expect(selectRepoFile(gpuOnly, REPO, 'cpu', 'android')).toBeUndefined()
  })

  it('skips chip-specific bundles', () => {
    const gemma3 = [
      'Gemma3-1B-IT_q4_ekv1280_mt6989.litertlm',
      'Gemma3-1B-IT_q4_ekv1280_sm8850.litertlm',
      'gemma3-1b-it-int4.litertlm',
    ].map((path) => ({ path }))
    expect(selectRepoFile(gemma3, REPO, undefined, 'android')?.path).toBe(
      'gemma3-1b-it-int4.litertlm'
    )
  })

  it('prefers the file named after the repo, as the browser does', () => {
    const qwen = [
      'Qwen3-0.6B.litertlm',
      'Qwen3-0.6B.mediatek.mt6993.litertlm',
      'Qwen3-0.6B_dynamic_wi4b32_afp32.litertlm',
      'qwen3_0_6b_mixed_int4.litertlm',
    ].map((path) => ({ path }))
    expect(
      selectRepoFile(qwen, 'litert-community/Qwen3-0.6B', undefined, 'android')
        ?.path
    ).toBe('Qwen3-0.6B.litertlm')
    expect(
      selectRepoFile(
        gemma,
        'litert-community/gemma-4-E2B-it-litert-lm',
        undefined,
        'ios'
      )?.path
    ).toBe('gemma-4-E2B-it-gpu.litertlm')
  })

  it('prefers a file called model next', () => {
    const files = ['a-int4.litertlm', 'model.litertlm'].map((path) => ({
      path,
    }))
    expect(selectRepoFile(files, REPO, undefined, 'android')?.path).toBe(
      'model.litertlm'
    )
  })

  it('prefers int4 over a shorter name when no file is named after the repo', () => {
    const files = [
      'qwen3_4b_channelwise_int8_float32kv.litertlm',
      'a.litertlm',
      'qwen3_4b_mixed_int4.litertlm',
    ].map((path) => ({ path }))
    expect(
      selectRepoFile(files, 'litert-community/Qwen3-4B', undefined, 'android')
        ?.path
    ).toBe('qwen3_4b_mixed_int4.litertlm')
  })

  it('finds nothing in a repo without a usable file', () => {
    expect(
      selectRepoFile([{ path: 'README.md' }], REPO, undefined, 'android')
    ).toBeUndefined()
    expect(
      selectRepoFile([{ path: 'x_NPU_y.litertlm' }], REPO, undefined, 'android')
    ).toBeUndefined()
  })
})

describe('Hub helpers', () => {
  it('builds a download URL', () => {
    expect(
      resolveUrl({ repo: 'org/repo', revision: 'main' }, 'a b.litertlm')
    ).toBe('https://huggingface.co/org/repo/resolve/main/a%20b.litertlm')
  })

  it('reads a tree listing', () => {
    expect(
      parseTree([
        { type: 'file', path: 'a.litertlm', size: 5, lfs: { oid: 'abc' } },
        { type: 'directory', path: 'dir' },
        { type: 'file', path: 'b.txt', size: 1 },
      ])
    ).toEqual([
      { path: 'a.litertlm', size: 5, sha256: 'abc' },
      { path: 'b.txt', size: 1, sha256: undefined },
    ])
    expect(parseTree({ error: 'x' })).toEqual([])
  })
})
