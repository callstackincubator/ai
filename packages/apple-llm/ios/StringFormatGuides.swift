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

public struct StringFormatRegex {
    
    // MARK: - Regex Patterns (Unit Testable)
    
    /// ISO 8601 date-time: 2023-12-25T10:30:00Z or 2023-12-25T10:30:00+05:00
    public static let dateTime = #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$"#
    
    /// ISO 8601 time: 10:30:00 or 10:30:00.123Z
    public static let time = #"^\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})?$"#
    
    /// ISO 8601 date: 2023-12-25
    public static let date = #"^\d{4}-\d{2}-\d{2}$"#
    
    /// ISO 8601 duration: P1Y2M3DT4H5M6S or PT30M
    public static let duration = #"^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$"#
    
    /// RFC 5322 compliant email: user@example.com
    public static let email = #"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"#
    
    /// RFC 1123 hostname: example.com or sub.example.com
    public static let hostname = #"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$"#
    
    /// IPv4 address: 192.168.1.1
    public static let ipv4 = #"^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"#
    
    /// IPv6 address with support for compressed forms
    public static let ipv6 = #"^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$|^(?:[0-9a-fA-F]{1,4}:)*::(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$"#
    
    /// UUID v4: 123e4567-e89b-12d3-a456-426614174000
    public static let uuid = #"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"#
    
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
