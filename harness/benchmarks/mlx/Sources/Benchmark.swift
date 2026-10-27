import Darwin
import Foundation
import HuggingFace
import MLX
import MLXLLM
import MLXLMCommon
import Tokenizers

// The MLX counterpart of harness/benchmarks/measure.ts: the same prompts,
// output length, runs and metrics, measured the same way
enum Benchmark {
  static let maxOutputTokens = 256
  static let runs = 3
  static let loadRuns = 3
  static let runtime = "mlx-swift"

  struct Prompts: Decodable {
    let short: String
    let long: String
  }

  struct Run: Encodable {
    let promptTokens: Int
    let outputTokens: Int
    let ttftMs: Double
    let prefillTokensPerSecond: Double
    let decodeTokensPerSecond: Double
    let totalMs: Double
  }

  static func run() async throws {
    // Launch with `-model <repo>` to benchmark another model
    let modelId =
      UserDefaults.standard.string(forKey: "model") ?? "mlx-community/Qwen3-0.6B-4bit"
    let promptsURL = Bundle.main.url(forResource: "prompts", withExtension: "json")!
    let prompts = try JSONDecoder().decode(Prompts.self, from: Data(contentsOf: promptsURL))

    // As in mlx-swift-examples on iOS: keep at most 20 MB of freed GPU buffers
    // for reuse, so the footprint reflects what the model holds
    MLX.GPU.set(cacheLimit: 20 * 1024 * 1024)

    let directory = try await HubDownloader().download(
      id: modelId, revision: nil, matching: ["*.json", "*.safetensors", "*.jinja", "*.txt"],
      useLatest: false, progressHandler: { _ in })
    let tokenizerLoader = TransformersTokenizerLoader()
    let load = {
      try await LLMModelFactory.shared.loadContainer(from: directory, using: tokenizerLoader)
    }

    await waitForCooldown()
    let baselineMB = Memory.footprintMB()
    let sampler = Memory.Sampler()
    sampler.start()
    var start = ContinuousClock.now
    var container: ModelContainer? = try await load()
    let coldLoadMs = milliseconds(ContinuousClock.now - start)
    let loadPeakMemoryMB = sampler.stop()
    let loadedMB = Memory.footprintMB()
    container = nil
    MLX.GPU.clearCache()

    var warmLoadMs: [Double] = []
    for i in 0..<loadRuns {
      start = .now
      container = try await load()
      warmLoadMs.append(milliseconds(ContinuousClock.now - start))
      if i < loadRuns - 1 {
        container = nil
        MLX.GPU.clearCache()
      }
    }
    report([
      "stage": "load", "model": modelId, "baselineMB": baselineMB, "loadedMB": loadedMB,
      "loadPeakMemoryMB": loadPeakMemoryMB, "coldLoadMs": coldLoadMs,
      "warmLoadMs": median(warmLoadMs),
    ])

    for (name, prompt) in [("short", prompts.short), ("long", prompts.long)] {
      // The warmup run is reported as `first`, and the peak covers all runs
      await waitForCooldown()
      let before = deviceState()
      sampler.start()
      let first = try await generate(container!, prompt: prompt)
      var results: [Run] = []
      for _ in 0..<runs {
        results.append(try await generate(container!, prompt: prompt))
      }
      let peakMemoryMB = sampler.stop()
      let pick = { (key: KeyPath<Run, Double>) in median(results.map { $0[keyPath: key] }) }
      report([
        "stage": "generate", "model": modelId, "prompt": name,
        "promptTokens": median(results.map { Double($0.promptTokens) }),
        "outputTokens": median(results.map { Double($0.outputTokens) }),
        "ttftMs": pick(\.ttftMs),
        "prefillTokensPerSecond": pick(\.prefillTokensPerSecond),
        "decodeTokensPerSecond": pick(\.decodeTokensPerSecond),
        "totalMs": pick(\.totalMs),
        "peakMemoryMB": peakMemoryMB,
        "first": [
          "ttftMs": first.ttftMs, "decodeTokensPerSecond": first.decodeTokensPerSecond,
        ],
        "before": before,
        "after": deviceState(),
      ])
    }
  }

  // Times from before the chat template is applied, as the AI SDK runtimes do.
  // The first token is the first text chunk
  static func generate(_ container: ModelContainer, prompt: String) async throws -> Run {
    try await container.perform { context in
      let start = ContinuousClock.now
      let input = try await context.processor.prepare(
        input: UserInput(
          chat: [.user(prompt)], additionalContext: ["enable_thinking": false]))
      let parameters = GenerateParameters(maxTokens: maxOutputTokens, temperature: 0)
      var firstToken: ContinuousClock.Instant?
      var outputTokens = 0
      for await event in try MLXLMCommon.generate(
        input: input, parameters: parameters, context: context)
      {
        switch event {
        case .chunk:
          if firstToken == nil { firstToken = .now }
        case .info(let info):
          outputTokens = info.generationTokenCount
        default:
          break
        }
      }
      let end = ContinuousClock.now
      let promptTokens = input.text.tokens.size
      let ttftMs = milliseconds(firstToken! - start)
      return Run(
        promptTokens: promptTokens,
        outputTokens: outputTokens,
        ttftMs: ttftMs,
        prefillTokensPerSecond: Double(promptTokens) / ttftMs * 1000,
        decodeTokensPerSecond: Double(outputTokens - 1) / milliseconds(end - firstToken!) * 1000,
        totalMs: milliseconds(end - start))
    }
  }

  // Waits until the device is no longer throttled, at most 5 minutes, as
  // waitForCooldown in measure.ts
  static func waitForCooldown() async {
    let start = ContinuousClock.now
    while ProcessInfo.processInfo.thermalState != .nominal,
      ContinuousClock.now - start < .seconds(300)
    {
      try? await Task.sleep(for: .seconds(5))
    }
  }

  static func deviceState() -> [String: Any] {
    let thermalState =
      switch ProcessInfo.processInfo.thermalState {
      case .nominal: "nominal"
      case .fair: "fair"
      case .serious: "serious"
      case .critical: "critical"
      @unknown default: "unknown"
      }
    return [
      "thermalState": thermalState,
      "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
    ]
  }

  static func report(_ result: [String: Any]) {
    var result = result
    result["runtime"] = runtime
    let data = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    print("BENCHMARK \(String(decoding: data, as: UTF8.self))")
  }

  static func milliseconds(_ duration: Duration) -> Double {
    let (seconds, attoseconds) = duration.components
    return Double(seconds) * 1000 + Double(attoseconds) / 1e15
  }

  static func median(_ values: [Double]) -> Double {
    let sorted = values.sorted()
    let middle = sorted.count / 2
    return sorted.count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  }
}

// The process footprint, as in apps/expo-example/modules/device-stats
enum Memory {
  static func footprint() -> UInt64 {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(
      MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    return result == KERN_SUCCESS ? info.phys_footprint : 0
  }

  static func footprintMB() -> Double {
    Double(footprint()) / 1_048_576
  }

  final class Sampler: @unchecked Sendable {
    private let queue = DispatchQueue(label: "com.callstack.ai.mlxbenchmark.memory")
    private var timer: DispatchSourceTimer?
    private var peak: UInt64 = 0

    func start() {
      queue.sync {
        peak = footprint()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(10))
        timer.setEventHandler { [weak self] in
          guard let self else { return }
          self.peak = max(self.peak, footprint())
        }
        timer.resume()
        self.timer = timer
      }
    }

    // The highest footprint since start, in MB
    func stop() -> Double {
      queue.sync {
        timer?.cancel()
        timer = nil
        peak = max(peak, footprint())
        return Double(peak) / 1_048_576
      }
    }
  }
}
