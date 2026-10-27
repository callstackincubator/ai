import SwiftUI

// Runs the benchmark on launch, prints the results and exits, so run.sh can
// read them from the console of `devicectl device process launch`
@main
struct MLXBenchmarkApp: App {
  @State private var status = "Running the MLX benchmark"

  var body: some Scene {
    WindowGroup {
      Text(status)
        .padding()
        .task {
          // A locked device suspends the app
          UIApplication.shared.isIdleTimerDisabled = true
          do {
            try await Benchmark.run()
            status = "Done"
          } catch {
            print("BENCHMARK_ERROR \(error)")
            status = "\(error)"
          }
          exit(0)
        }
    }
  }
}
