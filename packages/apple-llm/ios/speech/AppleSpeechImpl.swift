//
//  AppleSpeechImpl.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 04/08/2025.
//

import Foundation
import AVFoundation

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

@objc
public class AppleSpeechImpl: NSObject {
  
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
    
    let synthesizer = AVSpeechSynthesizer()
    
    class SpeechDelegate: NSObject, AVSpeechSynthesizerDelegate {
      let resolve: (Data) -> Void
      let reject: (String, String, Error?) -> Void
      var audioData = Data()
      
      init(resolve: @escaping (Data) -> Void, reject: @escaping (String, String, Error?) -> Void) {
        self.resolve = resolve
        self.reject = reject
      }
      
      func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        resolve(audioData)
      }
      
      func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        reject("AppleSpeech", "Speech synthesis was cancelled", nil)
      }
    }
    
    let delegate = SpeechDelegate(resolve: resolve, reject: reject)
    synthesizer.delegate = delegate
    
    synthesizer.write(utterance) { [weak delegate] buffer in
      guard let delegate = delegate else { return }
      
      let audioBuffer = buffer.audioBufferList.pointee.mBuffers
      
      guard let data = audioBuffer.mData else {
        print("AppleSpeech: Received null audio buffer data (size: \(audioBuffer.mDataByteSize))")
        return
      }
      
      let bufferData = Data(bytes: data, count: Int(audioBuffer.mDataByteSize))
      delegate.audioData.append(bufferData)
    }
  }
}
