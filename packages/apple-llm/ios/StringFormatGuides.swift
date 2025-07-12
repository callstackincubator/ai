//
//  StringFormatGuides.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 11/07/2025.
//

import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

// All regexes borrwed from https://github.com/colinhacks/zod/blob/main/packages/zod/src/v4/core/regexes.ts
// for compatibility with JavaScript-side of schema

public struct StringFormatRegex {
  
  // MARK: - Regex Patterns (Unit Testable) - Based on Zod
  
  /// ISO 8601 date: 2023-12-25 (with leap year support)
  public static let date = #"^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))$"#
  
  /// ISO 8601 time: 10:30:00 or 10:30:00.123
  public static let time = #"^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$"#
  
  /// ISO 8601 date-time: 2023-12-25T10:30:00Z or 2023-12-25T10:30:00+05:00
  public static let dateTime = #"^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?)(?:Z|[+-]\d{2}:\d{2})$"#
  
  /// ISO 8601 duration: P1Y2M3DT4H5M6S or PT30M (basic format, no extensions)
  public static let duration = #"^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$"#
  
  /// Email validation (practical format)
  public static let email = #"^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$"#
  
  /// Hostname: example.com or sub.example.com
  public static let hostname = #"^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$"#
  
  /// IPv4 address: 192.168.1.1
  public static let ipv4 = #"^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$"#
  
  /// IPv6 address with support for compressed forms
  public static let ipv6 = #"^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})$"#
  
  /// UUID (any version): 123e4567-e89b-12d3-a456-426614174000 or nil UUID
  public static let uuid = #"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000)$"#
  
  public static func pattern(for format: String) -> String? {
    switch format {
    case "date-time": return dateTime
    case "time": return time
    case "date": return date
    case "duration": return duration
    case "email": return email
    case "hostname": return hostname
    case "ipv4": return ipv4
    case "ipv6": return ipv6
    case "uuid": return uuid
    default: return nil
    }
  }
}

@available(iOS 26, *)
public struct StringFormatGuides {
  
  // MARK: - GenerationGuides (For Apple FoundationModels)
  
  public static var dateTime: GenerationGuide<String> {
    get throws {
      let regex = try Regex(StringFormatRegex.dateTime)
      return GenerationGuide.pattern(regex)
    }
  }
  
  public static var time: GenerationGuide<String> {
    get throws {
      let regex = try Regex(StringFormatRegex.time)
      return GenerationGuide.pattern(regex)
    }
  }
  
  public static var date: GenerationGuide<String> {
    get throws {
      let regex = try Regex(StringFormatRegex.date)
      return GenerationGuide.pattern(regex)
    }
  }
  
  public static var duration: GenerationGuide<String> {
    get throws {
      let regex = try Regex(StringFormatRegex.duration)
      return GenerationGuide.pattern(regex)
    }
  }
  
  public static var email: GenerationGuide<String> {
    get throws {
      let regex = try Regex(StringFormatRegex.email)
      return GenerationGuide.pattern(regex)
    }
  }
  
  public static var hostname: GenerationGuide<String> {
    get throws {
      let regex = try Regex(StringFormatRegex.hostname)
      return GenerationGuide.pattern(regex)
    }
  }
  
  public static var ipv4: GenerationGuide<String> {
    get throws {
      let regex = try Regex(StringFormatRegex.ipv4)
      return GenerationGuide.pattern(regex)
    }
  }
  
  public static var ipv6: GenerationGuide<String> {
    get throws {
      let regex = try Regex(StringFormatRegex.ipv6)
      return GenerationGuide.pattern(regex)
    }
  }
  
  public static var uuid: GenerationGuide<String> {
    get throws {
      let regex = try Regex(StringFormatRegex.uuid)
      return GenerationGuide.pattern(regex)
    }
  }
  
  public static func guide(for format: String) throws -> GenerationGuide<String> {
    switch format {
    case "date-time": return try dateTime
    case "time": return try time
    case "date": return try date
    case "duration": return try duration
    case "email": return try email
    case "hostname": return try hostname
    case "ipv4": return try ipv4
    case "ipv6": return try ipv6
    case "uuid": return try uuid
    default:
      throw AppleLLMError.invalidSchema("Unsupported string format '\(format)'")
    }
  }
}
