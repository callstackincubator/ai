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
  public func getInfo(_ language: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    if #available(iOS 17.0, *) {
      guard let nlLanguage = try? convertToNLLanguage(language),
            let model = NLContextualEmbedding(language: nlLanguage) else {
        reject("AppleEmbeddings", "Failed to create NLContextualEmbedding for language: \(language)", nil)
        return
      }
      
      let languages = model.languages.map { $0.rawValue }
      let scripts = model.scripts.map { $0.rawValue }
      
      let info: [String: Any] = [
        "hasAvailableAssets": model.hasAvailableAssets,
        "dimension": model.dimension,
        "languages": languages,
        "maximumSequenceLength": model.maximumSequenceLength,
        "modelIdentifier": model.modelIdentifier,
        "revision": model.revision,
        "scripts": scripts
      ]
      
      resolve(info)
    } else {
      reject("AppleEmbeddings", "NLContextualEmbedding is not supported on this device", nil)
    }
  }
  
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
  
  @available(iOS 16, *)
  private func convertToNLLanguage(_ languageString: String) throws -> NLLanguage {
    let locale = Locale(identifier: languageString)
    guard let languageCode = locale.language.languageCode else {
      throw LanguageConversionError.unsupportedLanguage("Cannot extract language code from locale: \(locale)")
    }
    
    switch languageCode {
    case "en":
      return .english
    case "fr":
      return .french
    case "es":
      return .spanish
    case "de":
      return .german
    case "it":
      return .italian
    case "pt":
      return .portuguese
    case "ru":
      return .russian
    case "tr":
      return .turkish
    case "zh":
      return .simplifiedChinese
    case "ar":
      return .arabic
    case "cs":
      return .czech
    case "nl":
      return .dutch
    case "fi":
      return .finnish
    case "he":
      return .hebrew
    case "hi":
      return .hindi
    case "hu":
      return .hungarian
    case "is":
      return .icelandic
    case "id":
      return .indonesian
    case "ja":
      return .japanese
    case "ko":
      return .korean
    case "ms":
      return .malay
    case "no":
      return .norwegian
    case "pl":
      return .polish
    case "ro":
      return .romanian
    case "sk":
      return .slovak
    case "sv":
      return .swedish
    case "th":
      return .thai
    case "uk":
      return .ukrainian
    case "am":
      return .amharic
    case "hy":
      return .armenian
    case "bn":
      return .bengali
    case "bg":
      return .bulgarian
    case "my":
      return .burmese
    case "ca":
      return .catalan
    case "chr":
      return .cherokee
    case "hr":
      return .croatian
    case "da":
      return .danish
    case "ka":
      return .georgian
    case "el":
      return .greek
    case "gu":
      return .gujarati
    case "kn":
      return .kannada
    case "km":
      return .khmer
    case "lo":
      return .lao
    case "ml":
      return .malayalam
    case "mr":
      return .marathi
    case "mn":
      return .mongolian
    case "or":
      return .oriya
    case "fa":
      return .persian
    case "pa":
      return .punjabi
    case "si":
      return .sinhalese
    case "ta":
      return .tamil
    case "te":
      return .telugu
    case "bo":
      return .tibetan
    case "ur":
      return .urdu
    case "vi":
      return .vietnamese
    case "kk":
      return .kazakh
    default:
      throw LanguageConversionError.unsupportedLanguage("\(languageCode)")
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
