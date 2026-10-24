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
  
  // Locale identifiers can carry keywords such as "@rg=plzzzz", which
  // SpeechTranscriber does not match, so strip them before resolving
  @available(iOS 26, *)
  private func supportedLocale(for language: String) async -> Locale? {
    let identifier = language.split(separator: "@", maxSplits: 1).first.map(String.init) ?? language
    return await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: identifier))
  }

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
  @objc
  public func isAvailable(_ language: String) -> Bool {
    if #available(iOS 26, *) {
      return SpeechTranscriber.isAvailable
    } else {
      return false
    }
  }

  @objc
  public func prepare(_ language: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    if #available(iOS 26, *) {
      Task {
        do {
          guard let supportedLocale = await self.supportedLocale(for: language) else {
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
  public func transcribe(_ audioData: Data, language: String, resolve: @escaping ([String: Any]) -> Void, reject: @escaping (String, String, Error?) -> Void) {
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
            defer {
              try? FileManager.default.removeItem(at: fileURL)
            }

            guard let supportedLocale = await self.supportedLocale(for: language) else {
              reject("AppleTranscription", "Locale not supported: \(language)", nil)
              return
            }

            let transcriber = createTranscriber(for: supportedLocale)
            let analyzer = SpeechAnalyzer(modules: [transcriber])
            
            var segments: [[String: Any]] = []
            
            Task {
              for try await result in transcriber.results {
                if result.isFinal {
                  let segment: [String: Any] = [
                    "text": String(result.text.characters),
                    "startSecond": CMTimeGetSeconds(result.range.start),
                    "endSecond": CMTimeGetSeconds(CMTimeRangeGetEnd(result.range))
                  ]
                  segments.append(segment)
                }
              }
            }
            
            let lastSampleTime = try await analyzer.analyzeSequence(from: audioFile)
            
            if let lastSampleTime {
              try await analyzer.finalizeAndFinish(through: lastSampleTime)
            } else {
              await analyzer.cancelAndFinishNow()
            }
            
            let totalDuration = if let lastSampleTime { CMTimeGetSeconds(lastSampleTime) } else { 0.0 }
            
            let result: [String: Any] = [
              "segments": segments,
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

