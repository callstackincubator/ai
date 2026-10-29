import { benchmarkExecuTorch } from './executorch'
import { MODEL } from './models'

// int4 weights for ExecuTorch's MLX backend, on the GPU
benchmarkExecuTorch('executorch-mlx', {
  file: MODEL.executorch.mlx,
  contextLength: MODEL.executorch.contextLength,
})
