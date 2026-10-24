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

  func testIntegerEnumAllowsOnlyListedValues() throws {
    let schema = try parse(#"{"type":"integer","enum":[1,2,3]}"#)
    let choices = try XCTUnwrap(schema["anyOf"] as? [[String: Any]])

    XCTAssertEqual(choices.map { $0["type"] as? String }, ["integer", "integer", "integer"])
    XCTAssertEqual(choices.map { $0["minimum"] as? Int }, [1, 2, 3])
    XCTAssertEqual(choices.map { $0["maximum"] as? Int }, [1, 2, 3])
  }

  func testNumberEnumAllowsOnlyListedValues() throws {
    let schema = try parse(#"{"type":"number","enum":[0.5,1.5]}"#)
    let choices = try XCTUnwrap(schema["anyOf"] as? [[String: Any]])

    XCTAssertEqual(choices.map { $0["type"] as? String }, ["number", "number"])
    XCTAssertEqual(choices.map { $0["minimum"] as? Double }, [0.5, 1.5])
    XCTAssertEqual(choices.map { $0["maximum"] as? Double }, [0.5, 1.5])
  }

  func testObjectWithSeveralNumericEnums() throws {
    let schema = try parse(#"""
    {"type":"object","properties":{
      "size":{"type":"integer","enum":[1,2]},
      "level":{"type":"integer","enum":[3,4]}
    },"required":["size","level"]}
    """#)

    XCTAssertNotNil(schema["properties"])
  }
}
