//
//  AppleTranscriptionImpl.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 01/08/2025.
//

import Foundation
import Speech
import AVFoundation
import UniformTypeIdentifiers

@objc
public class AppleTranscriptionImpl: NSObject {
  
  @available(iOS 26, *)
  private func createTranscriber(for locale: Locale) -> SpeechTranscriber {
    let preset = SpeechTranscriber.Preset.timeIndexedTranscriptionWithAlternatives
    
    return SpeechTranscriber(
      locale: locale,
      transcriptionOptions: preset.transcriptionOptions,
      reportingOptions: preset.reportingOptions.subtracting([.alternativeTranscriptions]),
      attributeOptions: preset.attributeOptions
    )
  }
  /// The transcriber times each run of the text, which is a word or a few
  /// characters of punctuation
  @available(iOS 26, *)
  private static func timedWords(in text: AttributedString) -> [[String: Any]] {
    text.runs.compactMap { run in
      guard let timeRange = run[AttributeScopes.SpeechAttributes.TimeRangeAttribute.self] else {
        return nil
      }
      let word = String(text[run.range].characters).trimmingCharacters(in: .whitespacesAndNewlines)
      guard !word.isEmpty else {
        return nil
      }
      return [
        "text": word,
        "startSecond": CMTimeGetSeconds(timeRange.start),
        "endSecond": CMTimeGetSeconds(CMTimeRangeGetEnd(timeRange))
      ]
    }
  }

  /// Whether the device can transcribe. Locale support is only known
  /// asynchronously, so getModelInfo reports it
  @objc
  public func isAvailable(_ language: String) -> Bool {
    if #available(iOS 26, *) {
      return SpeechTranscriber.isAvailable
    } else {
      return false
    }
  }

  @objc
  public func getModelInfo(_ language: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    guard #available(iOS 26, *) else {
      reject("UNSUPPORTED_OS", "Transcription needs iOS 26", nil)
      return
    }
    Task {
      let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: language))
      var info: [String: Any] = [
        "isAvailable": SpeechTranscriber.isAvailable,
        "supportsLocale": locale != nil,
        "supportedLocales": await SpeechTranscriber.supportedLocales.map { $0.identifier(.bcp47) }.sorted(),
      ]
      if let locale {
        info["locale"] = locale.identifier(.bcp47)
        switch await AssetInventory.status(forModules: [createTranscriber(for: locale)]) {
        case .installed:
          info["assets"] = "installed"
        case .downloading:
          info["assets"] = "downloading"
        case .supported:
          info["assets"] = "supported"
        case .unsupported:
          info["assets"] = "unsupported"
        @unknown default:
          break
        }
      }
      resolve(info)
    }
  }

  @objc
  public func prepare(_ language: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    if #available(iOS 26, *) {
      Task {
        do {
          let locale = Locale(identifier: language)
          
          guard let supportedLocale = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else {
            reject("AppleTranscription", "Locale not supported: \(language)", nil)
            return
          }
          
          let transcriber = createTranscriber(for: supportedLocale)
          
          let status = await AssetInventory.status(forModules: [transcriber])
          
          switch status {
          case .installed:
            resolve(nil)
          case .supported, .downloading:
            if let request = try? await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
              try await request.downloadAndInstall()
              resolve(nil)
            } else {
              resolve(nil)
            }
          case .unsupported:
            reject("AppleTranscription", "Assets not supported for locale: \(supportedLocale.identifier)", nil)
          @unknown default:
            reject ("AppleTranscription", "Unknown asset inventory status", nil)
          }
        } catch {
          reject("AppleTranscription", "Failed to prepare assets: \(error.localizedDescription)", error)
        }
      }
    } else {
      reject("AppleTranscription", "Not available on this platform", nil)
    }
  }

  @objc
  public func transcribe(_ audioData: Data, language: String, contextualStrings: [String], resolve: @escaping ([String: Any]) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    if #available(iOS 26, *) {
      let tempDirectory = FileManager.default.temporaryDirectory
      let fileName = UUID().uuidString
      let fileURL = tempDirectory.appendingPathComponent(fileName)
      
      do {
        try audioData.write(to: fileURL)
        
        guard let audioFile = try? AVAudioFile(forReading: fileURL) else {
          reject("AppleTranscription", "Invalid audio data", nil)
          return
        }
        
        Task {
          do {
            // Resolves the locale like prepare() does, so "en" and "en_US" work too
            guard let supportedLocale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: language)) else {
              try? FileManager.default.removeItem(at: fileURL)
              reject("AppleTranscription", "Locale not supported: \(language)", nil)
              return
            }
            let transcriber = createTranscriber(for: supportedLocale)
            
            let analyzer = SpeechAnalyzer(modules: [transcriber])
            
            defer {
              try? FileManager.default.removeItem(at: fileURL)
            }
            
            // Collect results concurrently and await them after the analyzer finishes,
            // so segments that arrive while finalizing are not dropped
            let resultsTask = Task {
              var segments: [[String: Any]] = []
              var words: [[String: Any]] = []
              for try await result in transcriber.results {
                if result.isFinal {
                  let segment: [String: Any] = [
                    "text": String(result.text.characters),
                    "startSecond": CMTimeGetSeconds(result.range.start),
                    "endSecond": CMTimeGetSeconds(CMTimeRangeGetEnd(result.range))
                  ]
                  segments.append(segment)
                  words.append(contentsOf: Self.timedWords(in: result.text))
                }
              }
              return (segments, words)
            }
            
            if !contextualStrings.isEmpty {
              let context = AnalysisContext()
              context.contextualStrings[.general] = contextualStrings
              try await analyzer.setContext(context)
            }
            
            let lastSampleTime = try await analyzer.analyzeSequence(from: audioFile)
            
            if let lastSampleTime {
              try await analyzer.finalizeAndFinish(through: lastSampleTime)
            } else {
              await analyzer.cancelAndFinishNow()
            }
            
            let (segments, words) = try await resultsTask.value
            let totalDuration = if let lastSampleTime { CMTimeGetSeconds(lastSampleTime) } else { 0.0 }
            
            let result: [String: Any] = [
              "segments": segments,
              "words": words,
              "duration": totalDuration
            ]
            
            resolve(result)
          } catch {
            reject("AppleTranscription", "Transcription failed: \(error.localizedDescription)", error)
          }
        }
      } catch {
        reject("AppleTranscription", "Failed to write audio data: \(error.localizedDescription)", error)
      }
    } else {
      reject("AppleTranscription", "Not available on this platform", nil)
    }
  }
}

