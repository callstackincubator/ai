import { benchmarkExecuTorch } from './executorch'

// Qwen3 0.6B with 8-bit dynamic activations and 4-bit weights (8da4w) for
// ExecuTorch's XNNPACK backend, on the CPU
benchmarkExecuTorch('executorch-xnnpack', {
  file: '0_6b/xnnpack/qwen_3_0_6b_xnnpack_8da4w.pte',
  contextLength: 2048,
})
