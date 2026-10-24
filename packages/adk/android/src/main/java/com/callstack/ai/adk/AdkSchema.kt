package com.callstack.ai.adk

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.google.adk.kt.types.Schema
import com.google.adk.kt.types.Type

object AdkSchema {
  fun fromReadableMap(map: ReadableMap): Schema {
    val properties = map.getMap("properties")?.let { props ->
      val result = mutableMapOf<String, Schema>()
      val iterator = props.keySetIterator()
      while (iterator.hasNextKey()) {
        val key = iterator.nextKey()
        props.getMap(key)?.let { result[key] = fromReadableMap(it) }
      }
      result
    }

    val required = map.getArray("required")?.let { array ->
      (0 until array.size()).mapNotNull { index -> array.getString(index) }
    }

    val enumValues = map.getArray("enum")?.let { array ->
      (0 until array.size()).mapNotNull { index ->
        when (array.getType(index)) {
          ReadableType.String -> array.getString(index)
          ReadableType.Number -> array.getDouble(index).toString()
          ReadableType.Boolean -> array.getBoolean(index).toString()
          else -> null
        }
      }
    }

    return Schema(
      type = parseType(map.getString("type")),
      properties = properties,
      items = map.getMap("items")?.let { fromReadableMap(it) },
      required = required,
      description = map.getString("description"),
      enum = enumValues,
    )
  }

  private fun parseType(type: String?): Type? {
    return when (type) {
      "string" -> Type.STRING
      "number", "integer" -> Type.NUMBER
      "boolean" -> Type.BOOLEAN
      "array" -> Type.ARRAY
      "object" -> Type.OBJECT
      else -> null
    }
  }
}
