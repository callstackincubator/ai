//
//  AppleEmbeddingsImpl.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 27/07/2025.
//

import Foundation
import React
import NaturalLanguage
import Accelerate


@objc
public class AppleEmbeddingsImpl: NSObject {
  @objc
  public func prepare(_ language: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    if #available(iOS 17.0, *) {
      guard let nlLanguage = try? convertToNLLanguage(language),
            let contextualEmbedding = NLContextualEmbedding(language: nlLanguage) else {
        reject("AppleEmbeddings", "Failed to create NLContextualEmbedding for language: \(language)", nil)
        return
      }
      Task {
        do {
          let result = try await contextualEmbedding.requestAssets()
          switch result {
          case .available:
            resolve(nil)
          case .notAvailable:
            reject("AppleEmbeddings", "Assets not available for language: \(language)", nil)
          case .error:
            reject("AppleEmbeddings", "Failed to request assets", nil)
          @unknown default:
            reject("AppleEmbeddings", "Unknown asset request result", nil)
          }
        } catch {
          reject("AppleEmbeddings", "Failed to request assets: \(error.localizedDescription)", error)
        }
      }
    } else {
      reject("AppleEmbeddings", "NLContextualEmbedding is not supported on this device", nil)
    }
  }
  
  enum LanguageConversionError: Error {
    case unsupportedLanguage(String)
  }
  
  private func convertToNLLanguage(_ languageString: String) throws -> NLLanguage {
    switch languageString.lowercased() {
    case "english", "en":
      return .english
    case "french", "fr":
      return .french
    case "spanish", "es":
      return .spanish
    case "german", "de":
      return .german
    case "italian", "it":
      return .italian
    case "portuguese", "pt":
      return .portuguese
    case "russian", "ru":
      return .russian
    case "turkish", "tr":
      return .turkish
    case "chinese", "zh":
      return .simplifiedChinese
    case "arabic", "ar":
      return .arabic
    case "czech", "cs":
      return .czech
    case "dutch", "nl":
      return .dutch
    case "finnish", "fi":
      return .finnish
    case "hebrew", "he":
      return .hebrew
    case "hindi", "hi":
      return .hindi
    case "hungarian", "hu":
      return .hungarian
    case "icelandic", "is":
      return .icelandic
    case "indonesian", "id":
      return .indonesian
    case "japanese", "ja":
      return .japanese
    case "korean", "ko":
      return .korean
    case "malay", "ms":
      return .malay
    case "norwegian", "no":
      return .norwegian
    case "polish", "pl":
      return .polish
    case "romanian", "ro":
      return .romanian
    case "slovak", "sk":
      return .slovak
    case "swedish", "sv":
      return .swedish
    case "thai", "th":
      return .thai
    case "ukrainian", "uk":
      return .ukrainian
    case "amharic", "am":
      return .amharic
    case "armenian", "hy":
      return .armenian
    case "bengali", "bn":
      return .bengali
    case "bulgarian", "bg":
      return .bulgarian
    case "burmese", "my":
      return .burmese
    case "catalan", "ca":
      return .catalan
    case "cherokee", "chr":
      return .cherokee
    case "croatian", "hr":
      return .croatian
    case "danish", "da":
      return .danish
    case "georgian", "ka":
      return .georgian
    case "greek", "el":
      return .greek
    case "gujarati", "gu":
      return .gujarati
    case "kannada", "kn":
      return .kannada
    case "khmer", "km":
      return .khmer
    case "lao", "lo":
      return .lao
    case "malayalam", "ml":
      return .malayalam
    case "marathi", "mr":
      return .marathi
    case "mongolian", "mn":
      return .mongolian
    case "oriya", "or":
      return .oriya
    case "persian", "fa":
      return .persian
    case "punjabi", "pa":
      return .punjabi
    case "sinhalese", "si":
      return .sinhalese
    case "tamil", "ta":
      return .tamil
    case "telugu", "te":
      return .telugu
    case "tibetan", "bo":
      return .tibetan
    case "urdu", "ur":
      return .urdu
    case "vietnamese", "vi":
      return .vietnamese
    case "kazakh", "kk":
      if #available(iOS 16.0, *) {
        return .kazakh
      } else {
        throw LanguageConversionError.unsupportedLanguage("\(languageString) (requires iOS 16+)")
      }
    default:
      throw LanguageConversionError.unsupportedLanguage(languageString)
    }
  }
  
  @available(iOS 17, *)
  private func generateEmbeddings(for sentence: String, model: NLContextualEmbedding) throws -> [Float] {
    let embedding = try model.embeddingResult(for: sentence, language: nil)
    let dimension = model.dimension
    let sequenceLength = embedding.sequenceLength
    
    var meanPooledEmbeddings = [Float](repeating: 0.0, count: dimension)
    var tokenBuffer = [Float](repeating: 0.0, count: dimension)
    
    embedding.enumerateTokenVectors(in: sentence.startIndex ..< sentence.endIndex) { (tokenVector, _) -> Bool in
      for i in 0..<dimension {
        tokenBuffer[i] = Float(tokenVector[i])
      }
      vDSP_vadd(meanPooledEmbeddings, 1, tokenBuffer, 1, &meanPooledEmbeddings, 1, vDSP_Length(dimension))
      return true
    }
    
    var divisor = Float(sequenceLength)
    vDSP_vsdiv(meanPooledEmbeddings, 1, &divisor, &meanPooledEmbeddings, 1, vDSP_Length(dimension))
    return meanPooledEmbeddings
  }
  
  @objc
  public func generateEmbeddings(_ sentences: [String], language: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    if #available(iOS 17.0, *) {
      guard let nlLanguage = try? convertToNLLanguage(language),
            let model = NLContextualEmbedding(language: nlLanguage) else {
        reject("AppleEmbeddings", "Failed to create NLContextualEmbedding for language: \(language)", nil)
        return
      }
      Task {
        do {
          var allEmbeddings: [[Float]] = []
          for sentence in sentences {
            let embedding = try self.generateEmbeddings(for: sentence, model: model)
            allEmbeddings.append(embedding)
          }
          resolve(allEmbeddings)
        } catch {
          reject("AppleEmbeddings", error.localizedDescription, nil)
        }
      }
    } else {
      reject("AppleEmbeddings", "NLContextualEmbedding is not supported on this device", nil)
    }
  }
}
