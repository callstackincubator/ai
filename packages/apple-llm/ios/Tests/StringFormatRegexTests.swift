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
        
        // Valid cases
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
        
        // Invalid cases
        let invalidCases = [
            "2023-12-25T10:30:00",      // Missing timezone
            "2023-12-25 10:30:00Z",     // Space instead of T
            "23-12-25T10:30:00Z",       // Short year
            "2023-13-25T10:30:00Z",     // Invalid month
            "2023-12-32T10:30:00Z",     // Invalid day
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
        
        // Valid cases
        let validCases = [
            "10:30:00",
            "10:30:00Z",
            "10:30:00+05:00",
            "10:30:00.123",
            "10:30:00.123456789Z"
        ]
        
        for testCase in validCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNotNil(match, "Should match: \(testCase)")
        }
        
        // Invalid cases
        let invalidCases = [
            "25:30:00",     // Invalid hour
            "10:60:00",     // Invalid minute
            "10:30:60",     // Invalid second
            "10:30",        // Missing seconds
            "10:30:00.Z"    // Invalid fractional seconds
        ]
        
        for testCase in invalidCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNil(match, "Should NOT match: \(testCase)")
        }
    }
    
    func testDateRegex() throws {
        let regex = try Regex(StringFormatRegex.date)
        
        // Valid cases
        let validCases = [
            "2023-12-25",
            "2000-01-01",
            "9999-12-31"
        ]
        
        for testCase in validCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNotNil(match, "Should match: \(testCase)")
        }
        
        // Invalid cases
        let invalidCases = [
            "23-12-25",         // Short year
            "2023-13-25",       // Invalid month
            "2023-12-32",       // Invalid day
            "2023/12/25",       // Wrong separators
            "2023-12-25T10:30:00Z"  // Has time component
        ]
        
        for testCase in invalidCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNil(match, "Should NOT match: \(testCase)")
        }
    }
    
    func testDurationRegex() throws {
        let regex = try Regex(StringFormatRegex.duration)
        
        // Valid cases
        let validCases = [
            "P1Y2M3DT4H5M6S",
            "PT30M",
            "P1Y",
            "P1M",
            "P1D",
            "PT1H",
            "PT1M",
            "PT1S",
            "PT1.5S",
            "P1Y2M3D",
            "PT4H5M6S"
        ]
        
        for testCase in validCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNotNil(match, "Should match: \(testCase)")
        }
        
        // Invalid cases
        let invalidCases = [
            "1Y2M3D",       // Missing P
            "P",            // Empty duration
            "P1Y2M3D4H5M6S", // Missing T before time
            "PT",           // Empty time duration
            "P1.5Y"         // Fractional year not allowed
        ]
        
        for testCase in invalidCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNil(match, "Should NOT match: \(testCase)")
        }
    }
    
    // MARK: - Network Format Tests
    
    func testEmailRegex() throws {
        let regex = try Regex(StringFormatRegex.email)
        
        // Valid cases
        let validCases = [
            "user@example.com",
            "test.email@domain.co.uk",
            "user+tag@example.org",
            "user_name@example-domain.com",
            "123@456.co"
        ]
        
        for testCase in validCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNotNil(match, "Should match: \(testCase)")
        }
        
        // Invalid cases
        let invalidCases = [
            "user@",            // Missing domain
            "@example.com",     // Missing user
            "user.example.com", // Missing @
            "user@domain",      // Missing TLD
            "user@domain.c",    // TLD too short
            "user name@example.com", // Space in user
            "user@ex ample.com"      // Space in domain
        ]
        
        for testCase in invalidCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNil(match, "Should NOT match: \(testCase)")
        }
    }
    
    func testIPv4Regex() throws {
        let regex = try Regex(StringFormatRegex.ipv4)
        
        // Valid cases
        let validCases = [
            "192.168.1.1",
            "0.0.0.0",
            "255.255.255.255",
            "127.0.0.1",
            "10.0.0.1"
        ]
        
        for testCase in validCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNotNil(match, "Should match: \(testCase)")
        }
        
        // Invalid cases
        let invalidCases = [
            "256.1.1.1",        // Out of range
            "192.168.1",        // Missing octet
            "192.168.1.1.1",    // Extra octet
            "192.168.01.1",     // Leading zero
            "192.168.-1.1",     // Negative number
            "192.168.1.1a"      // Letter at end
        ]
        
        for testCase in invalidCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNil(match, "Should NOT match: \(testCase)")
        }
    }
    
    func testIPv6Regex() throws {
        let regex = try Regex(StringFormatRegex.ipv6)
        
        // Valid cases
        let validCases = [
            "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
            "2001:db8:85a3:0:0:8a2e:370:7334",
            "2001:db8:85a3::8a2e:370:7334",
            "::1",
            "::",
            "2001:db8::1"
        ]
        
        for testCase in validCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNotNil(match, "Should match: \(testCase)")
        }
        
        // Invalid cases
        let invalidCases = [
            "2001:0db8:85a3::8a2e::7334",  // Multiple ::
            "2001:0db8:85a3:0000:0000:8a2e:0370:7334:extra", // Too many groups
            "gggg::1",                      // Invalid hex
            "2001:db8:85a3:0000:0000:8a2e:0370", // Too few groups
        ]
        
        for testCase in invalidCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNil(match, "Should NOT match: \(testCase)")
        }
    }
    
    func testUUIDRegex() throws {
        let regex = try Regex(StringFormatRegex.uuid)
        
        // Valid cases
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
        
        // Invalid cases
        let invalidCases = [
            "123e4567-e89b-12d3-a456-42661417400",   // Too short
            "123e4567-e89b-12d3-a456-4266141740000", // Too long
            "123e4567-e89b-12d3-a456_426614174000",  // Wrong separator
            "123e4567-e89b-12d3-a456-42661417400g",  // Invalid hex
            "123e4567e89b12d3a456426614174000"       // Missing dashes
        ]
        
        for testCase in invalidCases {
            let match = try regex.wholeMatch(in: testCase)
            XCTAssertNil(match, "Should NOT match: \(testCase)")
        }
    }
}
