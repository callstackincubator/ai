import Foundation
import HuggingFace
import MLXLMCommon
import Tokenizers

// What MLXHuggingFace's #hubDownloader() and #huggingFaceTokenizerLoader()
// macros expand to. Written out so the build doesn't need macro approval

struct HubDownloader: MLXLMCommon.Downloader {
  private let upstream = HubClient()

  struct InvalidRepositoryID: Error {
    let id: String
  }

  func download(
    id: String,
    revision: String?,
    matching patterns: [String],
    useLatest: Bool,
    progressHandler: @Sendable @escaping (Progress) -> Void
  ) async throws -> URL {
    guard let repoID = Repo.ID(rawValue: id) else {
      throw InvalidRepositoryID(id: id)
    }
    return try await upstream.downloadSnapshot(
      of: repoID,
      revision: revision ?? "main",
      matching: patterns,
      progressHandler: { @MainActor progress in progressHandler(progress) }
    )
  }
}

struct TransformersTokenizerLoader: MLXLMCommon.TokenizerLoader {
  func load(from directory: URL) async throws -> any MLXLMCommon.Tokenizer {
    TokenizerBridge(upstream: try await AutoTokenizer.from(modelFolder: directory))
  }
}

private struct TokenizerBridge: MLXLMCommon.Tokenizer {
  let upstream: any Tokenizers.Tokenizer

  func encode(text: String, addSpecialTokens: Bool) -> [Int] {
    upstream.encode(text: text, addSpecialTokens: addSpecialTokens)
  }

  func decode(tokenIds: [Int], skipSpecialTokens: Bool) -> String {
    upstream.decode(tokens: tokenIds, skipSpecialTokens: skipSpecialTokens)
  }

  func convertTokenToId(_ token: String) -> Int? {
    upstream.convertTokenToId(token)
  }

  func convertIdToToken(_ id: Int) -> String? {
    upstream.convertIdToToken(id)
  }

  var bosToken: String? { upstream.bosToken }
  var eosToken: String? { upstream.eosToken }
  var unknownToken: String? { upstream.unknownToken }

  func applyChatTemplate(
    messages: [[String: any Sendable]],
    tools: [[String: any Sendable]]?,
    additionalContext: [String: any Sendable]?
  ) throws -> [Int] {
    do {
      return try upstream.applyChatTemplate(
        messages: messages, tools: tools, additionalContext: additionalContext)
    } catch Tokenizers.TokenizerError.missingChatTemplate {
      throw MLXLMCommon.TokenizerError.missingChatTemplate
    }
  }
}
