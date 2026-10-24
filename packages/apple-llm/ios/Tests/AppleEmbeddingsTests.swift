import NaturalLanguage
import XCTest

final class AppleEmbeddingsTests: XCTestCase {
  func testTextWithoutTokensHasNoNaN() throws {
    let model = try XCTUnwrap(NLContextualEmbedding(language: .english))
    try XCTSkipUnless(model.hasAvailableAssets, "English embedding assets are not installed")

    for text in ["", "   "] {
      let embedding = try AppleEmbeddingsImpl().generateEmbeddings(for: text, model: model)

      XCTAssertEqual(embedding.count, model.dimension)
      XCTAssertFalse(embedding.contains { $0.isNaN }, "\(text.debugDescription) has NaN values")
    }
  }
}
