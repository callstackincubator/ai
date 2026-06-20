package com.callstack.ai.adk

import kotlinx.coroutines.CompletableDeferred
import java.util.concurrent.ConcurrentHashMap

object AdkToolBridge {
  private val pendingResults = ConcurrentHashMap<String, CompletableDeferred<String>>()

  suspend fun awaitResult(toolCallId: String): String {
    val deferred = CompletableDeferred<String>()
    pendingResults[toolCallId] = deferred
    return deferred.await()
  }

  fun submitResult(toolCallId: String, result: String) {
    pendingResults.remove(toolCallId)?.complete(result)
  }

  fun cancelAll() {
    pendingResults.values.forEach { deferred ->
      if (!deferred.isCompleted) {
        deferred.complete("{\"error\":\"Tool call cancelled\"}")
      }
    }
    pendingResults.clear()
  }
}
