package com.callstack.ai.adk

import kotlinx.coroutines.CompletableDeferred
import java.util.concurrent.ConcurrentHashMap

/** Waits for tool results that JavaScript submits, grouped by run. */
object AdkToolBridge {
  private val pendingResults =
    ConcurrentHashMap<String, ConcurrentHashMap<String, CompletableDeferred<String>>>()

  /** Registers the call before [request] asks JS to run it, then waits for the result. */
  suspend fun call(runId: String, toolCallId: String, request: () -> Unit): String {
    val calls = pendingResults.computeIfAbsent(runId) { ConcurrentHashMap() }
    val deferred = CompletableDeferred<String>()
    calls[toolCallId] = deferred
    try {
      request()
      return deferred.await()
    } finally {
      calls.remove(toolCallId, deferred)
      // Drop the run once it has no pending calls
      pendingResults.computeIfPresent(runId) { _, runCalls -> runCalls.takeIf { it.isNotEmpty() } }
    }
  }

  fun submitResult(runId: String, toolCallId: String, result: String) {
    pendingResults[runId]?.get(toolCallId)?.complete(result)
  }

  fun cancel(runId: String) {
    pendingResults.remove(runId)?.values?.forEach { it.complete(CANCELLED_RESULT) }
  }

  fun cancelAll() {
    pendingResults.keys.toList().forEach(::cancel)
  }

  private const val CANCELLED_RESULT = "{\"error\":\"Tool call cancelled\"}"
}
