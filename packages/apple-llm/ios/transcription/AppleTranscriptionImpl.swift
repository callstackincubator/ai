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
  // Live sessions by id. They start on the JS thread and stop from tasks
  private var liveSessions: [String: AnyObject] = [:]
  private let liveSessionsLock = NSLock()
  

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

  @objc
  public func isAvailable(_ language: String) -> Bool {
    if #available(iOS 26, *) {
      guard SpeechTranscriber.isAvailable else {
        return false
      }
      // isAvailable is synchronous in JS, and the supported locales are only
      // available asynchronously. The lookup is local, so waiting is short
      let semaphore = DispatchSemaphore(value: 0)
      var isSupported = false
      Task.detached {
        isSupported = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: language)) != nil
        semaphore.signal()
      }
      semaphore.wait()
      return isSupported
    } else {
      return false
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

  // MARK: - Live transcription

  @objc
  public func startLiveTranscription(
    _ sessionId: String,
    language: String,
    contextualStrings: [String],
    onResult: @escaping (String, String, Bool, Double, Double) -> Void,
    onError: @escaping (String, String) -> Void,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if compiler(>=6.4)
    if #available(iOS 27, *) {
      Task {
        do {
          let session = try await LiveTranscriptionSession.start(
            sessionId: sessionId,
            language: language,
            contextualStrings: contextualStrings,
            onResult: onResult,
            onError: onError
          )
          self.liveSessionsLock.withLock { self.liveSessions[sessionId] = session }
          resolve(nil)
        } catch {
          reject("AppleTranscription", error.localizedDescription, error)
        }
      }
      return
    }
#endif
    reject("UNSUPPORTED_OS", "Live transcription needs iOS 27", nil)
  }

  @objc
  public func stopLiveTranscription(
    _ sessionId: String,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
#if compiler(>=6.4)
    if #available(iOS 27, *) {
      let session = liveSessionsLock.withLock { liveSessions.removeValue(forKey: sessionId) }
      guard let session = session as? LiveTranscriptionSession else {
        resolve(nil)
        return
      }
      Task {
        do {
          try await session.stop()
          resolve(nil)
        } catch {
          reject("AppleTranscription", error.localizedDescription, error)
        }
      }
      return
    }
#endif
    resolve(nil)
  }
}

#if compiler(>=6.4)
enum LiveTranscriptionError: LocalizedError {
  case microphoneAccessDenied
  case noMicrophone
  case unsupportedLocale(String)

  var errorDescription: String? {
    switch self {
    case .microphoneAccessDenied:
      return "Microphone access was denied"
    case .noMicrophone:
      return "No microphone is available"
    case .unsupportedLocale(let language):
      return "Locale not supported: \(language)"
    }
  }
}

/// Transcribes the microphone as it records, with CaptureInputSequenceProvider
/// feeding the capture session's audio to a SpeechAnalyzer
@available(iOS 27, *)
final class LiveTranscriptionSession: @unchecked Sendable {
  private let provider: CaptureInputSequenceProvider
  private let analyzer: SpeechAnalyzer
  private let results: Task<Void, Never>
  // startRunning() and stopRunning() block until the session changes state
  private static let captureQueue = DispatchQueue(label: "com.callstack.ai.live-transcription")

  private init(provider: CaptureInputSequenceProvider, analyzer: SpeechAnalyzer, results: Task<Void, Never>) {
    self.provider = provider
    self.analyzer = analyzer
    self.results = results
  }

  static func start(
    sessionId: String,
    language: String,
    contextualStrings: [String],
    onResult: @escaping (String, String, Bool, Double, Double) -> Void,
    onError: @escaping (String, String) -> Void
  ) async throws -> LiveTranscriptionSession {
    guard await AVCaptureDevice.requestAccess(for: .audio) else {
      throw LiveTranscriptionError.microphoneAccessDenied
    }
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: language)) else {
      throw LiveTranscriptionError.unsupportedLocale(language)
    }
    guard let device = AVCaptureDevice.default(for: .audio) else {
      throw LiveTranscriptionError.noMicrophone
    }

    // Volatile results are quick guesses that later results replace
    let transcriber = SpeechTranscriber(
      locale: locale,
      transcriptionOptions: [],
      reportingOptions: [.volatileResults],
      attributeOptions: [.audioTimeRange]
    )
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      try await request.downloadAndInstall()
    }

    let provider = try await CaptureInputSequenceProvider.providerWithSession(
      from: device,
      compatibleWith: [transcriber]
    )
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    if !contextualStrings.isEmpty {
      let context = AnalysisContext()
      context.contextualStrings[.general] = contextualStrings
      try await analyzer.setContext(context)
    }

    let results = Task {
      do {
        for try await result in transcriber.results {
          onResult(
            sessionId,
            String(result.text.characters),
            result.isFinal,
            CMTimeGetSeconds(result.range.start),
            CMTimeGetSeconds(CMTimeRangeGetEnd(result.range))
          )
        }
      } catch {
        onError(sessionId, error.localizedDescription)
      }
    }

    try await analyzer.start(inputSequence: provider.analyzerInputs)
    let captureSession = provider.captureSession
    await withCheckedContinuation { continuation in
      captureQueue.async {
        if !captureSession.isRunning {
          captureSession.startRunning()
        }
        continuation.resume()
      }
    }

    return LiveTranscriptionSession(provider: provider, analyzer: analyzer, results: results)
  }

  /// Stops recording, finalizes what was heard so far and waits for its results
  func stop() async throws {
    let captureSession = provider.captureSession
    await withCheckedContinuation { continuation in
      Self.captureQueue.async {
        captureSession.stopRunning()
        continuation.resume()
      }
    }
    try await analyzer.finalize(through: nil)
    await analyzer.cancelAndFinishNow()
    await results.value
  }
}
#endif
