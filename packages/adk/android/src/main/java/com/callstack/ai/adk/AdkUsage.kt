package com.callstack.ai.adk

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.google.adk.kt.events.Event
import com.google.adk.kt.types.UsageMetadata

object AdkUsage {
  fun toWritableMap(usage: UsageMetadata?): WritableMap? {
    if (usage == null) return null

    return Arguments.createMap().apply {
      usage.promptTokenCount?.let { putInt("promptTokenCount", it) }
      usage.candidatesTokenCount?.let { putInt("candidatesTokenCount", it) }
      usage.totalTokenCount?.let { putInt("totalTokenCount", it) }
    }
  }

  fun latestFromEvents(events: List<Event>): UsageMetadata? =
    events.mapNotNull { it.usageMetadata }.lastOrNull()
}
