package com.ai

import ai.mlc.mlcllm.MLCEngine
import ai.mlc.mlcllm.OpenAIProtocol
import ai.mlc.mlcllm.OpenAIProtocol.ChatCompletionMessage
import java.io.File
import java.util.concurrent.Executors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.toList
import kotlinx.coroutines.launch

class Chat(modelConfig: ModelConfig, modelDir: File) {
  private val engine = MLCEngine()
  private val executorService = Executors.newSingleThreadExecutor()
  private val viewModelScope = CoroutineScope(Dispatchers.Main + Job())

  init {
    engine.unload()
    engine.reload(modelDir.path, modelConfig.modelLib)
  }

  fun generateResponse(messages: MutableList<ChatCompletionMessage>, callback: GenerateCallback) {
    executorService.submit {
      viewModelScope.launch {
        val chatResponse = engine.chat.completions.create(messages = messages)
        val response = chatResponse.toList().joinToString("") { it.choices.joinToString("") { it.delta.content?.text ?: "" } }
        callback.onMessageReceived(response)
      }
    }
  }

  fun streamResponse(messages: MutableList<ChatCompletionMessage>, callback: StreamCallback) {
    executorService.submit {
      viewModelScope.launch {
        val chatResponse = engine.chat.completions.create(messages = messages, stream_options = OpenAIProtocol.StreamOptions(include_usage = true))

        var finishReasonLength = false
        var streamingText = ""

        for (res in chatResponse) {
          for (choice in res.choices) {
            choice.delta.content?.let { content ->
              streamingText = content.asText()
            }
            choice.finish_reason?.let { finishReason ->
              if (finishReason == "length") {
                finishReasonLength = true
              }
            }
          }

          callback.onUpdate(streamingText)
          if (finishReasonLength) {
            streamingText = " [output truncated due to context length limit...]"
            callback.onUpdate(streamingText)
          }
        }
        callback.onFinished(streamingText)
      }
    }
  }

  interface GenerateCallback {
    fun onMessageReceived(message: String)
  }

  interface StreamCallback {
    fun onUpdate(message: String)
    fun onFinished(message: String)
  }
}
