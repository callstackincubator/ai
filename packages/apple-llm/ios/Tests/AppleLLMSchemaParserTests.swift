import FoundationModels
import XCTest

final class AppleLLMSchemaParserTests: XCTestCase {
  /// Parses a JSON schema the way it arrives from JS and returns the encoded generation schema
  private func parse(_ json: String) throws -> [String: Any] {
    let schema = try JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any]
    let generationSchema = try AppleLLMImpl.AppleLLMSchemaParser.createGenerationSchema(from: schema)
    let encoded = try JSONEncoder().encode(generationSchema)
    return try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
  }

  func testNumberKeepsMinimumAndMaximum() throws {
    let schema = try parse(#"{"type":"number","minimum":1.5,"maximum":10.5}"#)

    XCTAssertEqual(schema["minimum"] as? Double, 1.5)
    XCTAssertEqual(schema["maximum"] as? Double, 10.5)
  }

  func testIntegerKeepsMinimumAndMaximum() throws {
    let schema = try parse(#"{"type":"integer","minimum":1,"maximum":10}"#)

    XCTAssertEqual(schema["minimum"] as? Int, 1)
    XCTAssertEqual(schema["maximum"] as? Int, 10)
  }

  func testIntegerKeepsExclusiveBounds() throws {
    let schema = try parse(#"{"type":"integer","exclusiveMinimum":0,"exclusiveMaximum":10}"#)

    XCTAssertEqual(schema["minimum"] as? Int, 1)
    XCTAssertEqual(schema["maximum"] as? Int, 9)
  }

  func testIntegerRoundsFractionalBoundsInward() throws {
    let schema = try parse(#"{"type":"integer","exclusiveMinimum":0.5,"exclusiveMaximum":5.5}"#)

    XCTAssertEqual(schema["minimum"] as? Int, 1)
    XCTAssertEqual(schema["maximum"] as? Int, 5)
  }

  func testStricterBoundWins() throws {
    let schema = try parse(#"{"type":"integer","minimum":0,"exclusiveMinimum":2,"maximum":10,"exclusiveMaximum":8}"#)

    XCTAssertEqual(schema["minimum"] as? Int, 3)
    XCTAssertEqual(schema["maximum"] as? Int, 7)
  }
}
