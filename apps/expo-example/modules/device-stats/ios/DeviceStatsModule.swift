import Darwin
import ExpoModulesCore

// What the runtime benchmarks record next to their results: the process
// memory footprint, the number iOS compares against the app's memory limit
// (jetsam) and Xcode shows in the memory gauge, which counts Metal and Neural
// Engine buffers the process owns, and whether the device is throttled
public class DeviceStatsModule: Module {
  private let queue = DispatchQueue(label: "com.callstack.ai.device-stats")
  private var timer: DispatchSourceTimer?
  private var peak: UInt64 = 0

  public func definition() -> ModuleDefinition {
    Name("DeviceStats")

    // nominal, fair, serious or critical. iOS throttles from serious on
    Function("getThermalState") { () -> String in
      switch ProcessInfo.processInfo.thermalState {
      case .nominal: return "nominal"
      case .fair: return "fair"
      case .serious: return "serious"
      case .critical: return "critical"
      @unknown default: return "unknown"
      }
    }

    Function("isLowPowerModeEnabled") { () -> Bool in
      ProcessInfo.processInfo.isLowPowerModeEnabled
    }

    Function("getFootprint") { () -> Double in
      Double(readVMInfo()?.phys_footprint ?? 0)
    }

    // Highest footprint since the process started, tracked by the kernel
    Function("getLifetimePeakFootprint") { () -> Double in
      Double(readVMInfo()?.ledger_phys_footprint_peak ?? 0)
    }

    // Samples the footprint on a background queue until stopSampling, which
    // returns the highest sample
    Function("startSampling") { (intervalMs: Int) in
      self.queue.sync {
        self.timer?.cancel()
        self.peak = readVMInfo()?.phys_footprint ?? 0
        let timer = DispatchSource.makeTimerSource(queue: self.queue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(intervalMs))
        timer.setEventHandler { [weak self] in
          guard let self, let footprint = readVMInfo()?.phys_footprint else { return }
          self.peak = max(self.peak, footprint)
        }
        timer.resume()
        self.timer = timer
      }
    }

    Function("stopSampling") { () -> Double in
      self.queue.sync {
        self.timer?.cancel()
        self.timer = nil
        self.peak = max(self.peak, readVMInfo()?.phys_footprint ?? 0)
        return Double(self.peak)
      }
    }
  }
}

private func readVMInfo() -> task_vm_info_data_t? {
  var info = task_vm_info_data_t()
  var count = mach_msg_type_number_t(
    MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
  let result = withUnsafeMutablePointer(to: &info) {
    $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
      task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
    }
  }
  return result == KERN_SUCCESS ? info : nil
}
