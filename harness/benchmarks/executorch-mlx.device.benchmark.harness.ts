import { benchmarkExecuTorch } from './executorch'

// Qwen3 0.6B with int4 weights for ExecuTorch's MLX backend, on the GPU
benchmarkExecuTorch('executorch-mlx', {
  file: '0_6b/mlx/qwen_3_0_6b_mlx_int4.pte',
  contextLength: 2048,
})
