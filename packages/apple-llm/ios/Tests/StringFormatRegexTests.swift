//
//  StringFormatRegexTests.swift
//  AppleLLMTests
//
//  Created by Mike Grabowski on 11/07/2025.
//

import XCTest

@available(iOS 26, *)
class StringFormatRegexTests: XCTestCase {
  
  // MARK: - Date Time Tests
  
  func testDateTimeRegex() throws {
    let regex = try Regex(StringFormatRegex.dateTime)
    
    let validCases = [
      "2023-12-25T10:30:00Z",
      "2023-12-25T10:30:00+05:00",
      "2023-12-25T10:30:00-08:00",
      "2023-12-25T10:30:00.123Z",
      "2023-12-25T10:30:00.123456789+02:00"
    ]
    
    for testCase in validCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNotNil(match, "Should match: \(testCase)")
    }
    
    let invalidCases = [
      "2023-12-25T10:30:00",      // Missing timezone
      "2023-12-25 10:30:00Z",     // Space instead of T
      "2023-12-25T25:30:00Z",     // Invalid hour
      "2023-12-25T10:60:00Z"      // Invalid minute
    ]
    
    for testCase in invalidCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNil(match, "Should NOT match: \(testCase)")
    }
  }
  
  func testTimeRegex() throws {
    let regex = try Regex(StringFormatRegex.time)
    
    let validCases = [
      "10:30",              // HH:MM (seconds optional)
      "10:30:00",           // HH:MM:SS
      "10:30:00.123",       // HH:MM:SS.sss
      "10:30:00.123456789", // HH:MM:SS.nnnnnnnnn
      "23:59:59.999",       // Max valid time
      "00:00:00"            // Min valid time
    ]
    
    for testCase in validCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNotNil(match, "Should match: \(testCase)")
    }
    
    let invalidCases = [
      "25:30:00",         // Invalid hour
      "10:60:00",         // Invalid minute
      "10:30:00Z",        // Has timezone (not supported in time regex)
      "10:30:00.Z"        // Invalid fractional seconds
    ]
    
    for testCase in invalidCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNil(match, "Should NOT match: \(testCase)")
    }
  }
  
  func testDateRegex() throws {
    let regex = try Regex(StringFormatRegex.date)
    
    let validCases = [
      "2023-12-25",       // Regular date
      "2000-01-01",       // Year 2000 (leap year)
      "2024-02-29",       // Leap year Feb 29
      "2023-02-28",       // Non-leap year Feb 28
      "2023-01-31",       // 31-day month
      "2023-04-30",       // 30-day month
      "9999-12-31"        // Max year
    ]
    
    for testCase in validCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNotNil(match, "Should match: \(testCase)")
    }
    
    let invalidCases = [
      "23-12-25",             // Short year
      "2023-13-25",           // Invalid month
      "2023-12-32",           // Invalid day
      "2023-02-29",           // Feb 29 in non-leap year
      "2023/12/25"            // Wrong separators
    ]
    
    for testCase in invalidCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNil(match, "Should NOT match: \(testCase)")
    }
  }
  
  func testDurationRegex() throws {
    let regex = try Regex(StringFormatRegex.duration)
    
    let validCases = [
      "P1Y2M3DT4H5M6S",   // Full duration
      "PT30M",            // Time only
      "P1Y",              // Year only
      "P1M",              // Month only
      "P1D",              // Day only
      "PT1H",             // Hour only
      "PT1M",             // Minute only
      "PT1S",             // Second only
      "PT1.5S",           // Fractional seconds (using .)
      "PT1,5S",           // Fractional seconds (using ,)
      "P1Y2M3D",          // Date only
      "PT4H5M6S",         // Time only
      "P1W",              // Week only
      "P2W"               // Multiple weeks
    ]
    
    for testCase in validCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNotNil(match, "Should match: \(testCase)")
    }
    
    let invalidCases = [
      "1Y2M3D",           // Missing P
      "P",                // Empty duration
      "P1Y2M3D4H5M6S",    // Missing T before time components
      "P1Y1W"             // Cannot mix weeks with other units
    ]
    
    for testCase in invalidCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNil(match, "Should NOT match: \(testCase)")
    }
  }
  
  // MARK: - Network Format Tests
  
  func testEmailRegex() throws {
    let regex = try Regex(StringFormatRegex.email)
    
    let validCases = [
      "user@example.com",
      "test.email@domain.co.uk",
      "user+tag@example.org",
      "user_name@example-domain.com",
      "user'name@example.com",        // Single quote allowed
      "user-name@example.com",        // Hyphen allowed
      "123@456.co"
    ]
    
    for testCase in validCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNotNil(match, "Should match: \(testCase)")
    }
    
    let invalidCases = [
      "user@",                    // Missing domain
      "@example.com",             // Missing user
      "user.example.com",         // Missing @
      "user@domain.c",            // TLD too short
      "user name@example.com",    // Space in user
      ".user@example.com",        // Leading dot
      "user..name@example.com"    // Consecutive dots
    ]
    
    for testCase in invalidCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNil(match, "Should NOT match: \(testCase)")
    }
  }
  
  func testIPv4Regex() throws {
    let regex = try Regex(StringFormatRegex.ipv4)
    
    let validCases = [
      "192.168.1.1",
      "0.0.0.0",
      "255.255.255.255",
      "127.0.0.1",
      "10.0.0.1",
      "1.2.3.4"
    ]
    
    for testCase in validCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNotNil(match, "Should match: \(testCase)")
    }
    
    let invalidCases = [
      "256.1.1.1",        // Out of range
      "192.168.1",        // Missing octet
      "192.168.1.1.1",    // Extra octet
      "192.168.1.1a"      // Letter at end
    ]
    
    for testCase in invalidCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNil(match, "Should NOT match: \(testCase)")
    }
  }
  
  func testIPv6Regex() throws {
    let regex = try Regex(StringFormatRegex.ipv6)
    
    let validCases = [
      "2001:0db8:85a3:0000:0000:8a2e:0370:7334",   // Full format (8 groups)
      "2001:db8:85a3:0:0:8a2e:370:7334",           // Mixed format
      "::",                                        // All zeros
      "::1",                                       // Loopback (no prefix, 1 suffix group)
      "a::b"                                       // Simple compression (1 prefix, 1 suffix)
    ]
    
    for testCase in validCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNotNil(match, "Should match: \(testCase)")
    }
    
    let invalidCases = [
      "2001:0db8:85a3::8a2e::7334",  // Multiple ::
      "gggg::1",                     // Invalid hex
      "2001:db8::1"                  // Multiple prefix groups not supported
    ]
    
    for testCase in invalidCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNil(match, "Should NOT match: \(testCase)")
    }
  }
  
  func testUUIDRegex() throws {
    let regex = try Regex(StringFormatRegex.uuid)
    
    let validCases = [
      "123e4567-e89b-12d3-a456-426614174000",
      "550e8400-e29b-41d4-a716-446655440000",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "00000000-0000-0000-0000-000000000000"
    ]
    
    for testCase in validCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNotNil(match, "Should match: \(testCase)")
    }
    
    let invalidCases = [
      "123e4567-e89b-12d3-a456-42661417400",   // Too short
      "123e4567-e89b-12d3-a456_426614174000",  // Wrong separator
      "123e4567e89b12d3a456426614174000"       // Missing dashes
    ]
    
    for testCase in invalidCases {
      let match = try regex.wholeMatch(in: testCase)
      XCTAssertNil(match, "Should NOT match: \(testCase)")
    }
  }
}
