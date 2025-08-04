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
  @objc
  public func isAvailable() -> Bool {
    return true // AVSpeechSynthesizer is available on all iOS versions we support
  }
  
  @objc
  public func generate(_ text: String, options: [String: Any]?, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    // TODO: Implement text-to-speech functionality
    resolve(nil)
  }
}
