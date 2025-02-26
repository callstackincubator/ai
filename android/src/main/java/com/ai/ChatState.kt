package com.ai

import ai.mlc.mlcllm.MLCEngine
import ai.mlc.mlcllm.OpenAIProtocol
import ai.mlc.mlcllm.OpenAIProtocol.ChatCompletionMessage
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.toMutableStateList
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.Executors

class Chat(
  modelConfig: ModelConfig,
  modelDir: File
) {
  val messages = emptyList<MessageData>().toMutableStateList()
  val report = mutableStateOf("")
  val modelName = mutableStateOf("")
  private val engine = MLCEngine()
  private val executorService = Executors.newSingleThreadExecutor()
  private val viewModelScope = CoroutineScope(Dispatchers.Main + Job())

  init {
    engine.unload()
    engine.reload(modelDir.path, modelConfig.modelLib)
  }

  suspend fun generateResponse(messages: MutableList<ChatCompletionMessage>) {
    return withContext(Dispatchers.IO) { // Ensure it's running on the background thread
      engine.chat.completions.create(messages = messages)
    }
  }

//  fun generateResponse(messages: List<ChatCompletionMessage>) {
//    executorService.submit {
//      viewModelScope.launch {
//        val response = engine.chat.completions.create(
//          messages = messages,
//        )
//      }
//    }
//  }
}
