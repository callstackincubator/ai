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
  private var liveSessions: [String: TranscriptionSession] = [:]
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

  /// Starts a session that transcribes audio the app appends, e.g. from its
  /// own recorder
  @objc
  public func startStreamTranscription(
    _ sessionId: String,
    language: String,
    sampleRate: Double,
    encoding: String,
    onResult: @escaping (String, String, Bool, Double, Double) -> Void,
    onError: @escaping (String, String) -> Void,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    guard #available(iOS 26, *) else {
      reject("UNSUPPORTED_OS", "Transcription needs iOS 26", nil)
      return
    }
    Task {
      do {
        let session = try await StreamTranscriptionSession.start(
          sessionId: sessionId,
          language: language,
          sampleRate: sampleRate,
          encoding: encoding,
          onResult: onResult,
          onError: onError
        )
        self.liveSessionsLock.withLock { self.liveSessions[sessionId] = session }
        resolve(nil)
      } catch {
        reject("AppleTranscription", error.localizedDescription, error)
      }
    }
  }

  /// Called on the JS thread with the next chunk of a stream session's audio
  @objc
  public func appendTranscriptionAudio(_ sessionId: String, data: Data) throws {
    guard #available(iOS 26, *),
          let session = liveSessionsLock.withLock({ liveSessions[sessionId] }) as? StreamTranscriptionSession else {
      throw LiveTranscriptionError.noSession
    }
    try session.append(data)
  }

  @objc
  public func stopLiveTranscription(
    _ sessionId: String,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, Error?) -> Void
  ) {
    guard let session = liveSessionsLock.withLock({ liveSessions.removeValue(forKey: sessionId) }) else {
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
  }
}

/// A live session, recording the microphone or transcribing appended audio
protocol TranscriptionSession: AnyObject {
  /// Finalizes what was heard so far and waits for its results
  func stop() async throws
}

enum LiveTranscriptionError: LocalizedError {
  case microphoneAccessDenied
  case noMicrophone
  case unsupportedLocale(String)
  case captureFailed
  case invalidAudioFormat
  case noSession

  var errorDescription: String? {
    switch self {
    case .microphoneAccessDenied:
      return "Microphone access was denied"
    case .noMicrophone:
      return "No microphone is available"
    case .unsupportedLocale(let language):
      return "Locale not supported: \(language)"
    case .captureFailed:
      return "The microphone could not start recording"
    case .invalidAudioFormat:
      return "The audio format is not supported"
    case .noSession:
      return "The transcription session is not running"
    }
  }
}

/// Set once a session is ending, so the results stream ending is not an error
final class LiveTranscriptionStopFlag: @unchecked Sendable {
  private let lock = NSLock()
  private var stopped = false

  var isStopped: Bool {
    lock.withLock { stopped }
  }

  func stop() {
    lock.withLock { stopped = true }
  }
}

@available(iOS 26, *)
enum LiveTranscriber {
  /// Volatile results are quick guesses that later results replace
  static func create(for locale: Locale) async throws -> SpeechTranscriber {
    let transcriber = SpeechTranscriber(
      locale: locale,
      transcriptionOptions: [],
      reportingOptions: [.volatileResults],
      attributeOptions: [.audioTimeRange]
    )
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      try await request.downloadAndInstall()
    }
    return transcriber
  }

  /// Reports each result until the results end
  static func reportResults(
    of transcriber: SpeechTranscriber,
    sessionId: String,
    stopFlag: LiveTranscriptionStopFlag,
    onResult: @escaping (String, String, Bool, Double, Double) -> Void,
    onError: @escaping (String, String) -> Void
  ) -> Task<Void, Never> {
    Task {
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
        // Stopping cancels the analyzer, which ends the results with an error
        if !stopFlag.isStopped {
          onError(sessionId, error.localizedDescription)
        }
      }
    }
  }
}

/// Transcribes mono PCM audio that is appended in chunks of any size
@available(iOS 26, *)
final class StreamTranscriptionSession: TranscriptionSession, @unchecked Sendable {
  private let analyzer: SpeechAnalyzer
  private let input: AsyncStream<AnalyzerInput>.Continuation
  private let inputFormat: AVAudioFormat
  // Converts to the format the analyzer takes, unless the input already is
  private let converter: AVAudioConverter?
  private let results: Task<Void, Never>
  private let stopFlag: LiveTranscriptionStopFlag
  // Guards the converter and the bytes of a sample split between two chunks
  private let lock = NSLock()
  private var remainder = Data()
  private var hasAudio = false

  private init(
    analyzer: SpeechAnalyzer,
    input: AsyncStream<AnalyzerInput>.Continuation,
    inputFormat: AVAudioFormat,
    converter: AVAudioConverter?,
    results: Task<Void, Never>,
    stopFlag: LiveTranscriptionStopFlag
  ) {
    self.analyzer = analyzer
    self.input = input
    self.inputFormat = inputFormat
    self.converter = converter
    self.results = results
    self.stopFlag = stopFlag
  }

  static func start(
    sessionId: String,
    language: String,
    sampleRate: Double,
    encoding: String,
    onResult: @escaping (String, String, Bool, Double, Double) -> Void,
    onError: @escaping (String, String) -> Void
  ) async throws -> StreamTranscriptionSession {
    let commonFormat: AVAudioCommonFormat = encoding == "float32" ? .pcmFormatFloat32 : .pcmFormatInt16
    guard sampleRate > 0,
          let inputFormat = AVAudioFormat(commonFormat: commonFormat, sampleRate: sampleRate, channels: 1, interleaved: false) else {
      throw LiveTranscriptionError.invalidAudioFormat
    }
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: language)) else {
      throw LiveTranscriptionError.unsupportedLocale(language)
    }
    let transcriber = try await LiveTranscriber.create(for: locale)
    guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
      throw LiveTranscriptionError.invalidAudioFormat
    }
    var converter: AVAudioConverter?
    if inputFormat != analyzerFormat {
      guard let audioConverter = AVAudioConverter(from: inputFormat, to: analyzerFormat) else {
        throw LiveTranscriptionError.invalidAudioFormat
      }
      converter = audioConverter
    }

    let (inputSequence, input) = AsyncStream.makeStream(of: AnalyzerInput.self)
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    let stopFlag = LiveTranscriptionStopFlag()
    let results = LiveTranscriber.reportResults(
      of: transcriber,
      sessionId: sessionId,
      stopFlag: stopFlag,
      onResult: onResult,
      onError: onError
    )

    do {
      try await analyzer.start(inputSequence: inputSequence)
    } catch {
      // Ends the results, so their task does not wait forever
      stopFlag.stop()
      input.finish()
      await analyzer.cancelAndFinishNow()
      await results.value
      throw error
    }

    return StreamTranscriptionSession(
      analyzer: analyzer,
      input: input,
      inputFormat: inputFormat,
      converter: converter,
      results: results,
      stopFlag: stopFlag
    )
  }

  func append(_ data: Data) throws {
    try lock.withLock {
      let bytes = remainder + data
      let bytesPerFrame = Int(inputFormat.streamDescription.pointee.mBytesPerFrame)
      let frameCount = bytes.count / bytesPerFrame
      let byteCount = frameCount * bytesPerFrame
      remainder = Data(bytes.suffix(from: bytes.startIndex + byteCount))
      guard frameCount > 0,
            let buffer = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: AVAudioFrameCount(frameCount)),
            let destination = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)[0].mData else {
        return
      }
      buffer.frameLength = AVAudioFrameCount(frameCount)
      bytes.withUnsafeBytes { source in
        destination.copyMemory(from: source.baseAddress!, byteCount: byteCount)
      }
      try yield(buffer)
    }
  }

  /// Converts a buffer to the analyzer's format and passes it on. Without a
  /// buffer, it flushes the frames the converter holds back for resampling
  private func yield(_ buffer: AVAudioPCMBuffer?) throws {
    guard let converter else {
      if let buffer {
        hasAudio = true
        input.yield(AnalyzerInput(buffer: buffer))
      }
      return
    }
    let inputFrames = Double(buffer?.frameLength ?? 0)
    let ratio = converter.outputFormat.sampleRate / converter.inputFormat.sampleRate
    // Room for the frames held back from the previous chunk too
    let capacity = AVAudioFrameCount((inputFrames * ratio).rounded(.up)) + 1024
    guard let output = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: capacity) else {
      throw LiveTranscriptionError.invalidAudioFormat
    }
    var consumed = false
    var conversionError: NSError?
    let status = converter.convert(to: output, error: &conversionError) { _, inputStatus in
      guard let buffer, !consumed else {
        inputStatus.pointee = buffer == nil ? .endOfStream : .noDataNow
        return nil
      }
      consumed = true
      inputStatus.pointee = .haveData
      return buffer
    }
    if status == .error {
      throw conversionError ?? LiveTranscriptionError.invalidAudioFormat
    }
    if output.frameLength > 0 {
      hasAudio = true
      input.yield(AnalyzerInput(buffer: output))
    }
  }

  func stop() async throws {
    let hasAudio = lock.withLock {
      try? yield(nil)
      remainder = Data()
      return self.hasAudio
    }
    input.finish()
    // An analyzer that never had audio neither finalizes nor finishes, and
    // has no results to wait for
    guard hasAudio else {
      stopFlag.stop()
      results.cancel()
      Task { [analyzer] in await analyzer.cancelAndFinishNow() }
      return
    }
    // Finishing ends the results. A failed finalize still finishes the
    // analyzer, so the results task does not wait forever
    var finalizeError: Error?
    do {
      try await analyzer.finalizeAndFinishThroughEndOfInput()
    } catch {
      finalizeError = error
      stopFlag.stop()
      await analyzer.cancelAndFinishNow()
    }
    await results.value
    if let finalizeError {
      throw finalizeError
    }
  }
}

#if compiler(>=6.4)
/// Transcribes the microphone as it records, with CaptureInputSequenceProvider
/// feeding the capture session's audio to a SpeechAnalyzer
@available(iOS 27, *)
final class LiveTranscriptionSession: TranscriptionSession, @unchecked Sendable {
  private let provider: CaptureInputSequenceProvider
  private let analyzer: SpeechAnalyzer
  private let results: Task<Void, Never>
  private let stopFlag: LiveTranscriptionStopFlag
  // startRunning() and stopRunning() block until the session changes state
  private static let captureQueue = DispatchQueue(label: "com.callstack.ai.live-transcription")

  private init(
    provider: CaptureInputSequenceProvider,
    analyzer: SpeechAnalyzer,
    results: Task<Void, Never>,
    stopFlag: LiveTranscriptionStopFlag
  ) {
    self.provider = provider
    self.analyzer = analyzer
    self.results = results
    self.stopFlag = stopFlag
  }

  static func start(
    sessionId: String,
    language: String,
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

    let transcriber = try await LiveTranscriber.create(for: locale)

    let provider = try await CaptureInputSequenceProvider.providerWithSession(
      from: device,
      compatibleWith: [transcriber]
    )
    let analyzer = SpeechAnalyzer(modules: [transcriber])

    let stopFlag = LiveTranscriptionStopFlag()
    let results = LiveTranscriber.reportResults(
      of: transcriber,
      sessionId: sessionId,
      stopFlag: stopFlag,
      onResult: onResult,
      onError: onError
    )

    do {
      try await analyzer.start(inputSequence: provider.analyzerInputs)
    } catch {
      // Ends the results, so their task does not wait forever
      stopFlag.stop()
      await analyzer.cancelAndFinishNow()
      await results.value
      throw error
    }
    let captureSession = provider.captureSession
    await withCheckedContinuation { continuation in
      captureQueue.async {
        if !captureSession.isRunning {
          captureSession.startRunning()
        }
        continuation.resume()
      }
    }
    // startRunning() fails without throwing, leaving the session stopped
    guard captureSession.isRunning else {
      stopFlag.stop()
      await analyzer.cancelAndFinishNow()
      await results.value
      throw LiveTranscriptionError.captureFailed
    }

    return LiveTranscriptionSession(provider: provider, analyzer: analyzer, results: results, stopFlag: stopFlag)
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
    // The analyzer always finishes, so the results task ends even when
    // finalizing fails
    var finalizeError: Error?
    do {
      try await analyzer.finalize(through: nil)
    } catch {
      finalizeError = error
    }
    stopFlag.stop()
    await analyzer.cancelAndFinishNow()
    await results.value
    if let finalizeError {
      throw finalizeError
    }
  }
}
#endif
