//
//  AiModuleFoundation.swift
//  Pods
//
//  Created by Szymon Rybczak on 10/06/2025.
//

import FoundationModels

@objc public class AiModuleFoundation: NSObject {
  
  
  @objc public static func generateResponse(systemPrompt: String, userMessage: String) async throws -> String {

    let instructions = """
        """


    if #available(iOS 26.0, *) {
      let session = LanguageModelSession(instructions: instructions)
      let response = try await session.respond(to: userMessage)
      return response.content;
    } else {
      // Fallback on earlier versions
      return ""
    }


  
  }
  
}
