package com.callstack.ai.android

import com.google.mlkit.genai.common.FunctionArgValue
import com.google.mlkit.genai.schema.tools.FunctionDeclaration
import com.google.mlkit.genai.schema.tools.FunctionSchema
import com.google.mlkit.genai.schema.tools.FunctionType
import org.json.JSONArray
import org.json.JSONObject

/**
 * Converts between JSON and ML Kit's function calling types: JSON Schema to [FunctionSchema],
 * and JSON values to and from [FunctionArgValue].
 */
object FunctionJson {

  fun declaration(name: String, description: String, parameters: String): FunctionDeclaration =
    try {
      FunctionDeclaration(name, description, schema(JSONObject(parameters)))
    } catch (error: Exception) {
      throw AndroidAIErrors.CodedException(
        AndroidAIErrors.INVALID_SCHEMA,
        "Cannot convert the parameters of $name: ${error.message}",
        error,
      )
    }

  /** Maps the JSON Schema keywords that [FunctionSchema] has. Others are left out. */
  fun schema(json: JSONObject): FunctionSchema {
    // A type such as ["string", "null"] is a nullable string
    val types = when (val type = json.opt("type")) {
      is JSONArray -> List(type.length()) { type.getString(it) }
      is String -> listOf(type)
      else -> emptyList()
    }
    val type = types.firstOrNull { it != "null" } ?: types.firstOrNull()

    return FunctionSchema(
      type = functionType(type),
      description = json.optStringOrNull("description"),
      properties = json.optJSONObject("properties")?.let { properties ->
        properties.keys().asSequence().associateWith { schema(properties.getJSONObject(it)) }
      },
      required = json.optJSONArray("required")?.strings(),
      enum = json.optJSONArray("enum")?.let { values -> List(values.length()) { values.get(it).toString() } },
      format = json.optStringOrNull("format"),
      nullable = if (types.size > 1 && "null" in types) true else null,
      items = json.optJSONObject("items")?.let(::schema),
      minItems = json.optLongOrNull("minItems"),
      maxItems = json.optLongOrNull("maxItems"),
      minimum = json.optDoubleOrNull("minimum"),
      maximum = json.optDoubleOrNull("maximum"),
      minLength = json.optLongOrNull("minLength"),
      maxLength = json.optLongOrNull("maxLength"),
      pattern = json.optStringOrNull("pattern"),
      anyOf = json.optJSONArray("anyOf")?.let { schemas -> List(schemas.length()) { schema(schemas.getJSONObject(it)) } },
      title = json.optStringOrNull("title"),
      minProperties = json.optLongOrNull("minProperties"),
      maxProperties = json.optLongOrNull("maxProperties"),
    )
  }

  private fun functionType(type: String?): Int =
    when (type) {
      "string" -> FunctionType.STRING
      "number" -> FunctionType.NUMBER
      "integer" -> FunctionType.INTEGER
      "boolean" -> FunctionType.BOOLEAN
      "array" -> FunctionType.ARRAY
      "object" -> FunctionType.OBJECT
      "null" -> FunctionType.NULL
      else -> FunctionType.UNSPECIFIED
    }

  fun argumentsToJson(arguments: Map<String, FunctionArgValue>): JSONObject =
    JSONObject().apply { arguments.forEach { (key, value) -> put(key, toJson(value)) } }

  private fun toJson(value: FunctionArgValue): Any =
    when (value) {
      is FunctionArgValue.StringValue -> value.value
      is FunctionArgValue.IntValue -> value.value
      is FunctionArgValue.LongValue -> value.value
      is FunctionArgValue.DoubleValue -> value.value
      is FunctionArgValue.BoolValue -> value.value
      is FunctionArgValue.ListValue -> JSONArray().apply { value.values.forEach { put(toJson(it)) } }
      is FunctionArgValue.MapValue -> argumentsToJson(value.map)
    }

  fun argumentsFromJson(json: JSONObject): Map<String, FunctionArgValue> =
    json.keys().asSequence().mapNotNull { key -> fromJson(json.get(key))?.let { key to it } }.toMap()

  private fun fromJson(value: Any?): FunctionArgValue? =
    when (value) {
      is String -> FunctionArgValue.StringValue(value)
      is Boolean -> FunctionArgValue.BoolValue(value)
      is Int -> FunctionArgValue.IntValue(value)
      is Long -> FunctionArgValue.LongValue(value)
      is Number -> FunctionArgValue.DoubleValue(value.toDouble())
      is JSONArray -> FunctionArgValue.ListValue(List(value.length()) { value.get(it) }.mapNotNull(::fromJson))
      is JSONObject -> FunctionArgValue.MapValue(argumentsFromJson(value))
      else -> null
    }

  /** A function response for [com.google.mlkit.genai.prompt.FunctionResponsePart]. */
  fun toMap(json: JSONObject): Map<String, Any?> =
    json.keys().asSequence().associateWith { toPlain(json.get(it)) }

  private fun toPlain(value: Any?): Any? =
    when (value) {
      is JSONObject -> toMap(value)
      is JSONArray -> List(value.length()) { toPlain(value.get(it)) }
      JSONObject.NULL -> null
      else -> value
    }

  private fun JSONArray.strings(): List<String> = List(length()) { getString(it) }

  private fun JSONObject.optStringOrNull(key: String): String? =
    if (has(key) && !isNull(key)) getString(key) else null

  private fun JSONObject.optLongOrNull(key: String): Long? =
    if (has(key) && !isNull(key)) getLong(key) else null

  private fun JSONObject.optDoubleOrNull(key: String): Double? =
    if (has(key) && !isNull(key)) getDouble(key) else null
}
