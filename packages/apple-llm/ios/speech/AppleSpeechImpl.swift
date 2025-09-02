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
  public func generateAudio(_ text: String, options: [String: Any], resolve: @escaping ([String: Any]) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    let utterance = AVSpeechUtterance(string: text)
    
    utterance.voice = if let voiceId = options["voice"] as? String {
      AVSpeechSynthesisVoice(identifier: voiceId)
    } else if let language = options["language"] as? String {
      AVSpeechSynthesisVoice(language: language)
    } else {
      nil
    }
    
    var collectedBuffers: [AVAudioPCMBuffer] = []
   
    speechSynthesizer.write(utterance) { buffer in
      guard let pcm = buffer as? AVAudioPCMBuffer else { return }
      
      if pcm.frameLength == 0 {
        let result = AppleSpeechImpl.concatenatePCMDataWithFormat(from: collectedBuffers)
        resolve(result)
        return
      }
      
      collectedBuffers.append(pcm)
    }
  }
}

extension AppleSpeechImpl {
  /// Concatenate raw PCM data from AVAudioPCMBuffer array and return format information
  /// JavaScript will handle WAV header generation
  static func concatenatePCMDataWithFormat(from buffers: [AVAudioPCMBuffer]) -> [String: Any] {
    guard let first = buffers.first else {
      return [
        "data": Data(),
        "sampleRate": 22050,
        "channels": 1,
        "bitsPerSample": 32,
        "formatType": 1
      ]
    }
    
    let channels = Int(first.format.channelCount)
    let sampleRate = Int(first.format.sampleRate)
    
    // Determine format type and bits per sample based on AVAudioCommonFormat
    let (formatType, bitsPerSample): (Int, Int) = {
      switch first.format.commonFormat {
      case .pcmFormatFloat32:
        return (1, 32)
      case .pcmFormatFloat64:
        return (1, 64)
      case .pcmFormatInt16:
        return (0, 16)
      case .pcmFormatInt32:
        return (0, 32)
      default:
        return (1, 32)
      }
    }()
    
    // Estimate capacity from actual valid bytes in each buffer
    let estimatedCapacity = buffers.reduce(0) { acc, buf in
      let audioBuffer = buf.audioBufferList.pointee.mBuffers
      return acc + Int(audioBuffer.mDataByteSize)
    }
    
    var payload = Data()
    payload.reserveCapacity(estimatedCapacity)
    
    // Concatenate raw PCM payloads using mDataByteSize
    for buf in buffers {
      let m = buf.audioBufferList.pointee.mBuffers
      let byteCount = Int(m.mDataByteSize)
      if let p = m.mData {
        payload.append(contentsOf: UnsafeRawBufferPointer(start: p, count: byteCount))
      }
    }
    
    return [
      "data": payload,
      "sampleRate": sampleRate,
      "channels": channels,
      "bitsPerSample": bitsPerSample,
      "formatType": formatType
    ]
  }
}

extension AVSpeechSynthesisVoice {
  func toDictionary() -> [String: Any] {
    var data = [
      "identifier": self.identifier,
      "name": self.name,
      "language": self.language,
      "quality": self.quality,
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
