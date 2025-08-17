//
//  AppleSpeechImpl.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 04/08/2025.
//

import Foundation
import AVFoundation

@objc
public class AppleSpeechImpl: NSObject {
  private let speechSynthesizer = AVSpeechSynthesizer()
  
  @objc
  public func getVoices(_ resolve: @escaping ([Any]) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    Task {
      if #available(iOS 17.0, *) {
        await withCheckedContinuation { continuation in
          AVSpeechSynthesizer.requestPersonalVoiceAuthorization { _ in
            continuation.resume()
          }
        }
      }
      
      let allVoices = AVSpeechSynthesisVoice.speechVoices()
      let voiceInfos = allVoices.map { $0.toDictionary() }
      resolve(voiceInfos)
    }
  }
  
  @objc
  public func generateAudio(_ text: String, options: [String: Any], resolve: @escaping (Data) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    let utterance = AVSpeechUtterance(string: text)
    
    utterance.voice = if let voiceId = options["voice"] as? String {
      AVSpeechSynthesisVoice(identifier: voiceId)
    } else if let language = options["language"] as? String {
      AVSpeechSynthesisVoice(language: language)
    } else {
      nil
    }
    
    var collectedBuffers: [AVAudioPCMBuffer] = []
    
    var resolveCallback: ((Data) -> Void)? = resolve
    var rejectCallback: ((String, String, Error?) -> Void)? = reject
    
    speechSynthesizer.write(utterance) { buffer in
      guard let pcm = buffer as? AVAudioPCMBuffer else { return }
      
      if pcm.frameLength == 0 {
        guard let resolve = resolveCallback, let reject = rejectCallback else { return }
        
        do {
          let data = try AppleSpeechImpl.wavData(from: collectedBuffers)
          resolve(data)
        } catch {
          reject("AppleSpeech", "Error generating WAV data", error)
        }
        
        resolveCallback = nil
        rejectCallback = nil
        return
      }
      
      collectedBuffers.append(pcm)
    }
  }
}

extension AppleSpeechImpl {
  /// Build a single WAV file by generating the header using the first buffer's
  /// format and then concatenating the raw PCM payloads of all subsequent buffers.
  /// Assumes all buffers share the same format and are WAV-compatible.
  static func wavData(from buffers: [AVAudioPCMBuffer]) throws -> Data {
    guard let first = buffers.first else {
      throw NSError(domain: "WAV", code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "No audio buffers collected"])
    }
    
    let channels = Int(first.format.channelCount)
    let sampleRate = Int(first.format.sampleRate)
    let isFloat32 = (first.format.commonFormat == .pcmFormatFloat32)
    let bitsPerSample = isFloat32 ? 32 : 16
    let byteRate = sampleRate * channels * bitsPerSample / 8
    let blockAlign = channels * bitsPerSample / 8
    
    // Helper: little-endian encoders
    func le16(_ v: Int) -> [UInt8] { [UInt8(v & 0xff), UInt8((v >> 8) & 0xff)] }
    func le32(_ v: Int) -> [UInt8] {
      [UInt8(v & 0xff), UInt8((v >> 8) & 0xff),
       UInt8((v >> 16) & 0xff), UInt8((v >> 24) & 0xff)]
    }
    
    // Estimate capacity from actual valid bytes in each buffer
    let estimatedCapacity = buffers.reduce(0) { acc, buf in
      let audioBuffer = buf.audioBufferList.pointee.mBuffers
      return acc + Int(audioBuffer.mDataByteSize)
    }
    
    var payload = Data()
    payload.reserveCapacity(estimatedCapacity)
    
    // Concatenate payloads using mDataByteSize, which is kept in sync with frameLength
    for buf in buffers {
      let m = buf.audioBufferList.pointee.mBuffers
      let byteCount = Int(m.mDataByteSize)
      if let p = m.mData {
        payload.append(contentsOf: UnsafeRawBufferPointer(start: p, count: byteCount))
      }
    }
    
    let dataChunkSize = payload.count
    let fmtChunkSize = 16
    let riffChunkSize = 4 + (8 + fmtChunkSize) + (8 + dataChunkSize)
    
    var header = Data()
    header.append(contentsOf: Array("RIFF".utf8))
    header.append(contentsOf: le32(riffChunkSize))
    header.append(contentsOf: Array("WAVE".utf8))
    
    // fmt chunk
    header.append(contentsOf: Array("fmt ".utf8))
    header.append(contentsOf: le32(fmtChunkSize))
    header.append(contentsOf: le16(isFloat32 ? 3 : 1)) // 3 = IEEE float, 1 = PCM
    header.append(contentsOf: le16(channels))
    header.append(contentsOf: le32(sampleRate))
    header.append(contentsOf: le32(byteRate))
    header.append(contentsOf: le16(blockAlign))
    header.append(contentsOf: le16(bitsPerSample))
    
    // data chunk
    header.append(contentsOf: Array("data".utf8))
    header.append(contentsOf: le32(dataChunkSize))
    
    var out = Data(capacity: header.count + payload.count)
    out.append(header)
    out.append(payload)
    
    return out
  }
}

extension AVSpeechSynthesisVoice {
  func toDictionary() -> [String: Any] {
    var data = [
      "identifier": self.identifier,
      "name": self.name,
      "language": self.language,
      "quality": quality,
      "isPersonalVoice": false,
      "isNoveltyVoice": false
    ] as [String : Any]
    
    if #available(iOS 17.0, *) {
      data["isPersonalVoice"] = self.voiceTraits.contains(.isPersonalVoice)
      data["isNoveltyVoice"] = self.voiceTraits.contains(.isNoveltyVoice)
    }
    
    return data
  }
}
