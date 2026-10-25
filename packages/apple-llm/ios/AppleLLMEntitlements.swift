//
//  AppleLLMEntitlements.swift
//  AppleLLM
//

import Foundation
import MachO

/// Reads the app's entitlements from the code signature of its executable, since
/// iOS has no public API to query them at runtime
enum AppleLLMEntitlements {
  static let hasPrivateCloudCompute: Bool = {
    // Without a readable signature (e.g. a future format), Foundation Models decides
    guard let entitlements = readEntitlements() else {
      return true
    }
    return entitlements["com.apple.developer.private-cloud-compute"] != nil
  }()

  private static let codeSignatureMagic: UInt32 = 0xfade0cc0
  private static let entitlementsMagic: UInt32 = 0xfade7171
  private static let entitlementsSlot: UInt32 = 5

  private static func readEntitlements() -> [String: Any]? {
    guard let url = Bundle.main.executableURL,
          let data = try? Data(contentsOf: url, options: .alwaysMapped) else {
      return nil
    }

    var header = 0
    if data.load(UInt32.self, at: 0, bigEndian: true) == FAT_MAGIC {
      // Universal binary, so the slice for this process is read
      let count = Int(data.load(UInt32.self, at: 4, bigEndian: true))
      let slices = (0..<count).map { 8 + $0 * 20 }
      guard let slice = slices.first(where: {
        cpu_type_t(data.load(UInt32.self, at: $0, bigEndian: true)) == CPU_TYPE_ARM64
      }) else {
        return nil
      }
      header = Int(data.load(UInt32.self, at: slice + 8, bigEndian: true))
    }

    guard data.load(UInt32.self, at: header, bigEndian: false) == MH_MAGIC_64 else {
      return nil
    }

    let commandCount = Int(data.load(UInt32.self, at: header + 16, bigEndian: false))
    var command = header + MemoryLayout<mach_header_64>.size
    for _ in 0..<commandCount {
      let type = data.load(UInt32.self, at: command, bigEndian: false)
      if type == UInt32(LC_CODE_SIGNATURE) {
        let offset = header + Int(data.load(UInt32.self, at: command + 8, bigEndian: false))
        return entitlements(inSignatureAt: offset, of: data)
      }
      command += Int(data.load(UInt32.self, at: command + 4, bigEndian: false))
    }
    return nil
  }

  private static func entitlements(inSignatureAt offset: Int, of data: Data) -> [String: Any]? {
    guard data.load(UInt32.self, at: offset, bigEndian: true) == codeSignatureMagic else {
      return nil
    }

    let count = Int(data.load(UInt32.self, at: offset + 8, bigEndian: true))
    for index in 0..<count {
      let entry = offset + 12 + index * 8
      guard data.load(UInt32.self, at: entry, bigEndian: true) == entitlementsSlot else {
        continue
      }

      let blob = offset + Int(data.load(UInt32.self, at: entry + 4, bigEndian: true))
      guard data.load(UInt32.self, at: blob, bigEndian: true) == entitlementsMagic else {
        return nil
      }

      let length = Int(data.load(UInt32.self, at: blob + 4, bigEndian: true))
      guard length > 8, blob + length <= data.count else {
        return nil
      }
      let plist = data.subdata(in: (blob + 8)..<(blob + length))
      return try? PropertyListSerialization.propertyList(from: plist, format: nil) as? [String: Any]
    }

    // Signed without entitlements
    return [:]
  }
}

private extension Data {
  func load(_ type: UInt32.Type, at offset: Int, bigEndian: Bool) -> UInt32 {
    guard offset >= 0, offset + 4 <= count else {
      return 0
    }
    let value = subdata(in: offset..<(offset + 4)).withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }
    return bigEndian ? UInt32(bigEndian: value) : UInt32(littleEndian: value)
  }
}
