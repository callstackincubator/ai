package com.callstack.ai.adk

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.google.adk.kt.events.Event

class AdkStreamToolCallEmitter(
  private val streamId: String,
  private val emit: (WritableMap) -> Unit,
) {
  private class ActiveCall(
    var toolName: String,
    var started: Boolean = false,
    var completed: Boolean = false,
    val inputBuilder: StringBuilder = StringBuilder(),
  )

  private val activeCalls = mutableMapOf<String, ActiveCall>()

  fun handleEvent(event: Event) {
    for (functionCall in event.functionCalls()) {
      val toolCallId = functionCall.id ?: "${functionCall.name}-${activeCalls.size}"
      val state = activeCalls.getOrPut(toolCallId) {
        ActiveCall(toolName = functionCall.name)
      }

      if (functionCall.name.isNotEmpty()) {
        state.toolName = functionCall.name
      }

      if (!state.started && state.toolName.isNotEmpty()) {
        emit(
          Arguments.createMap().apply {
            putString("streamId", streamId)
            putString("phase", "start")
            putString("toolCallId", toolCallId)
            putString("toolName", state.toolName)
          },
        )
        state.started = true
      }

      if (!functionCall.partialArgs.isNullOrEmpty()) {
        for (partialArg in functionCall.partialArgs) {
          val delta =
            partialArg.stringValue
              ?: partialArg.numberValue?.toString()
              ?: partialArg.boolValue?.toString()
              ?: continue

          emit(
            Arguments.createMap().apply {
              putString("streamId", streamId)
              putString("phase", "delta")
              putString("toolCallId", toolCallId)
              putString("inputDelta", delta)
            },
          )
          state.inputBuilder.append(delta)
        }
      }

      if (functionCall.args.isNotEmpty() && !state.completed) {
        val input = AdkJson.encode(functionCall.args)
        if (state.inputBuilder.isEmpty()) {
          emit(
            Arguments.createMap().apply {
              putString("streamId", streamId)
              putString("phase", "delta")
              putString("toolCallId", toolCallId)
              putString("inputDelta", input)
            },
          )
        }

        emitEnd(toolCallId, state.toolName, input)
        state.completed = true
      } else if (functionCall.willContinue == false && state.started && !state.completed) {
        val input = state.inputBuilder.toString().ifEmpty { "{}" }
        emitEnd(toolCallId, state.toolName, input)
        state.completed = true
      }
    }
  }

  private fun emitEnd(toolCallId: String, toolName: String, input: String) {
    emit(
      Arguments.createMap().apply {
        putString("streamId", streamId)
        putString("phase", "end")
        putString("toolCallId", toolCallId)
        putString("toolName", toolName)
        putString("input", input)
      },
    )
  }
}
