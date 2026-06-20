package com.callstack.ai.adk

import org.json.JSONArray
import org.json.JSONObject

object AdkJson {
  fun encode(value: Map<String, Any>): String {
    return mapToJsonObject(value).toString()
  }

  fun decodeResult(value: String): Any {
    val trimmed = value.trim()
    return when {
      trimmed.startsWith("{") -> jsonObjectToMap(JSONObject(trimmed))
      trimmed.startsWith("[") -> jsonArrayToList(JSONArray(trimmed))
      trimmed == "true" -> true
      trimmed == "false" -> false
      trimmed == "null" -> emptyMap<String, Any>()
      trimmed.toDoubleOrNull() != null -> trimmed.toDouble()
      else -> trimmed.removeSurrounding("\"")
    }
  }

  private fun mapToJsonObject(value: Map<String, Any>): JSONObject {
    val json = JSONObject()
    value.forEach { (key, entryValue) ->
      json.put(key, toJsonValue(entryValue))
    }
    return json
  }

  private fun toJsonValue(value: Any?): Any {
    return when (value) {
      null -> JSONObject.NULL
      is Map<*, *> -> {
        @Suppress("UNCHECKED_CAST")
        mapToJsonObject(value as Map<String, Any>)
      }
      is Iterable<*> -> {
        val array = JSONArray()
        value.forEach { item -> array.put(toJsonValue(item)) }
        array
      }
      else -> value
    }
  }

  private fun jsonObjectToMap(json: JSONObject): Map<String, Any> {
    val result = mutableMapOf<String, Any>()
    json.keys().forEach { key ->
      result[key] = jsonValue(json.get(key))
    }
    return result
  }

  private fun jsonArrayToList(json: JSONArray): List<Any> {
    val result = mutableListOf<Any>()
    for (index in 0 until json.length()) {
      result.add(jsonValue(json.get(index)))
    }
    return result
  }

  private fun jsonValue(value: Any?): Any {
    return when (value) {
      JSONObject.NULL, null -> ""
      is JSONObject -> jsonObjectToMap(value)
      is JSONArray -> jsonArrayToList(value)
      else -> value
    }
  }
}
