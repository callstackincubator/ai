package com.callstack.ai.adk

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.google.adk.kt.types.Schema
import com.google.adk.kt.types.Type

/**
 * Converts a JSON Schema from the AI SDK to an ADK [Schema]. Keywords that Gemini does not
 * support, such as `$ref` or `additionalProperties`, are dropped.
 */
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

    // `type: ["string", "null"]` and `anyOf: [..., { type: "null" }]` both mean nullable
    val typeNames = readTypeNames(map)
    var nullable = typeNames.contains("null") || map.getBooleanOrNull("nullable") == true
    val type = typeNames.firstOrNull { it != "null" }?.let { parseType(it) }

    val anyOf = (map.getArray("anyOf") ?: map.getArray("oneOf"))?.let { array ->
      val schemas = (0 until array.size()).mapNotNull { index -> array.getMap(index) }
      val nonNull = schemas.filterNot { readTypeNames(it) == listOf("null") }
      if (nonNull.size < schemas.size) nullable = true
      nonNull.map { fromReadableMap(it) }
    }

    // A nullable value with a single option is that option, marked nullable
    if (type == null && anyOf?.size == 1) {
      return anyOf.first().copy(nullable = if (nullable) true else anyOf.first().nullable)
    }

    return Schema(
      type = type,
      properties = properties,
      items = map.getMap("items")?.let { fromReadableMap(it) },
      required = required,
      description = map.getString("description"),
      enum = enumValues,
      format = map.getString("format"),
      nullable = if (nullable) true else null,
      anyOf = anyOf?.takeIf { it.isNotEmpty() },
      title = map.getString("title"),
      pattern = map.getString("pattern"),
      minimum = map.getDoubleOrNull("minimum"),
      maximum = map.getDoubleOrNull("maximum"),
      minLength = map.getDoubleOrNull("minLength")?.toLong(),
      maxLength = map.getDoubleOrNull("maxLength")?.toLong(),
      minItems = map.getDoubleOrNull("minItems")?.toLong(),
      maxItems = map.getDoubleOrNull("maxItems")?.toLong(),
      minProperties = map.getDoubleOrNull("minProperties")?.toLong(),
      maxProperties = map.getDoubleOrNull("maxProperties")?.toLong(),
    )
  }

  private fun readTypeNames(map: ReadableMap): List<String> {
    if (!map.hasKey("type")) return emptyList()
    return when (map.getType("type")) {
      ReadableType.String -> listOfNotNull(map.getString("type"))
      ReadableType.Array -> map.getArray("type")?.strings() ?: emptyList()
      else -> emptyList()
    }
  }

  private fun ReadableArray.strings(): List<String> =
    (0 until size()).mapNotNull { index -> getString(index) }

  private fun ReadableMap.getDoubleOrNull(key: String): Double? =
    if (hasKey(key) && getType(key) == ReadableType.Number) getDouble(key) else null

  private fun ReadableMap.getBooleanOrNull(key: String): Boolean? =
    if (hasKey(key) && getType(key) == ReadableType.Boolean) getBoolean(key) else null

  private fun parseType(type: String?): Type? {
    return when (type) {
      "string" -> Type.STRING
      "number" -> Type.NUMBER
      "integer" -> Type.INTEGER
      "boolean" -> Type.BOOLEAN
      "array" -> Type.ARRAY
      "object" -> Type.OBJECT
      else -> null
    }
  }
}
