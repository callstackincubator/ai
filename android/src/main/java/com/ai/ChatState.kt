package com.ai

import ai.mlc.mlcllm.MLCEngine
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

  fun generateResponse(messages: MutableList<ChatCompletionMessage>, callback: ChatStateCallback) {
    executorService.submit {
      viewModelScope.launch {
        val chatResponse = engine.chat.completions.create(messages = messages)
        val response = chatResponse.toList().joinToString("") { it.choices.joinToString("") { it.delta.content?.text ?: "" } }
        callback.onMessageReceived(response)
      }
    }
  }

  interface ChatStateCallback {
    fun onMessageReceived(message: String)
  }
}
