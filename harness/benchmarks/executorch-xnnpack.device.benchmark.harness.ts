import { benchmarkExecuTorch } from './executorch'
import { MODEL } from './models'

// 8-bit dynamic activations and 4-bit weights for ExecuTorch's XNNPACK
// backend, on the CPU
benchmarkExecuTorch('executorch-xnnpack', {
  file: MODEL.executorch.xnnpack,
  contextLength: MODEL.executorch.contextLength,
})
