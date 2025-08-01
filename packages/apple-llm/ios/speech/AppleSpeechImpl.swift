//
//  AppleSpeechImpl.swift
//  AppleLLM
//
//  Created by Mike Grabowski on 01/08/2025.
//

import Foundation
import Speech

@objc
public class AppleSpeechImpl: NSObject {
  
  @objc public func isAvailable(_ language: String) -> Bool {
    if #available(iOS 26, *) {
      return SpeechTranscriber.isAvailable
    } else {
      return false
    }
  }

  @objc
  public func prepare(_ language: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    if #available(iOS 26, *) {
      let analyzer = SpeechAnalyzer(modules: [
        SpeechTranscriber(locale: .current, preset: .transcription)
      ])
      // TBD: finish
    } else {
      reject("AppleSpeech", "Not available on this platform", nil)
    }
  }

  @objc
  public func transcribe(_ audio: String, language: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
      
  }
}
