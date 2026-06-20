package com.callstack.ai.adk

import kotlinx.coroutines.CompletableDeferred
import java.util.concurrent.ConcurrentHashMap

object AdkToolBridge {
  private val pendingResults = ConcurrentHashMap<String, CompletableDeferred<String>>()
  private val streamToolCalls = ConcurrentHashMap<String, MutableSet<String>>()

  suspend fun awaitResult(toolCallId: String): String {
    val deferred = CompletableDeferred<String>()
    pendingResults[toolCallId] = deferred
    return deferred.await()
  }

  fun registerToolCall(streamId: String, toolCallId: String) {
    streamToolCalls.computeIfAbsent(streamId) { ConcurrentHashMap.newKeySet() }.add(toolCallId)
  }

  fun submitResult(toolCallId: String, result: String) {
    pendingResults.remove(toolCallId)?.complete(result)
    streamToolCalls.values.forEach { toolCallIds -> toolCallIds.remove(toolCallId) }
  }

  fun cancelForStream(streamId: String) {
    streamToolCalls.remove(streamId)?.forEach { toolCallId ->
      pendingResults.remove(toolCallId)?.let { deferred ->
        if (!deferred.isCompleted) {
          deferred.complete("{\"error\":\"Tool call cancelled\"}")
        }
      }
    }
  }

  fun cancelAll() {
    pendingResults.values.forEach { deferred ->
      if (!deferred.isCompleted) {
        deferred.complete("{\"error\":\"Tool call cancelled\"}")
      }
    }
    pendingResults.clear()
    streamToolCalls.clear()
  }
}
