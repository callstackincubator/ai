//
//  AppleSpeechImpl.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 01/08/2025.
//

import Foundation
import Speech
import AVFoundation
import UniformTypeIdentifiers

@objc
public class AppleSpeechImpl: NSObject {
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
      resolve("")
    } else {
      reject("AppleSpeech", "Not available on this platform", nil)
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
          reject("AppleSpeech", "Invalid audio data", nil)
          return
        }
        
        Task {
          do {
            let locale = Locale(identifier: language)
            
            let preset = SpeechTranscriber.Preset.timeIndexedTranscriptionWithAlternatives
            
            let transcriber = SpeechTranscriber(
              locale: Locale.current,
              transcriptionOptions: preset.transcriptionOptions,
              reportingOptions: preset.reportingOptions.subtracting([.alternativeTranscriptions]),
              attributeOptions: preset.attributeOptions
            )
            
            let analyzer = SpeechAnalyzer(modules: [transcriber])
            
            defer {
              try? FileManager.default.removeItem(at: fileURL)
            }
            
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
            reject("AppleSpeech", "Transcription failed: \(error.localizedDescription)", error)
          }
        }
      } catch {
        reject("AppleSpeech", "Failed to write audio data: \(error.localizedDescription)", error)
      }
    } else {
      reject("AppleSpeech", "Not available on this platform", nil)
    }
  }
}

