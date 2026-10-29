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
      usage.thoughtsTokenCount?.let { putInt("thoughtsTokenCount", it) }
      usage.cachedContentTokenCount?.let { putInt("cachedContentTokenCount", it) }
    }
  }

  /** Usage of a whole run: the sum over its complete events, which carry their call's usage. */
  fun fromEvents(events: List<Event>): UsageMetadata? =
    events.filterNot { it.partial }.fold(null as UsageMetadata?) { total, event -> add(total, event) }
      ?: events.mapNotNull { it.usageMetadata }.lastOrNull()

  /** Adds a complete event's usage to [total]. Partial events repeat their call's usage. */
  fun add(total: UsageMetadata?, event: Event): UsageMetadata? {
    val usage = event.usageMetadata
    if (event.partial || usage == null) return total
    if (total == null) return usage

    return UsageMetadata(
      promptTokenCount = sum(total.promptTokenCount, usage.promptTokenCount),
      candidatesTokenCount = sum(total.candidatesTokenCount, usage.candidatesTokenCount),
      totalTokenCount = sum(total.totalTokenCount, usage.totalTokenCount),
      thoughtsTokenCount = sum(total.thoughtsTokenCount, usage.thoughtsTokenCount),
      toolUsePromptTokenCount = sum(total.toolUsePromptTokenCount, usage.toolUsePromptTokenCount),
      cachedContentTokenCount = sum(total.cachedContentTokenCount, usage.cachedContentTokenCount),
    )
  }

  private fun sum(a: Int?, b: Int?): Int? = if (a == null && b == null) null else (a ?: 0) + (b ?: 0)
}
