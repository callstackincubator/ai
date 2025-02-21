package com.ai

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.TurboModule
import org.json.JSONObject
import java.io.File
import com.google.gson.annotations.SerializedName
import com.google.gson.Gson

@ReactModule(name = AiModule.NAME)
class AiModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  TurboModule {
  companion object {
    const val NAME = "Ai"

    const val AppConfigFilename = "mlc-app-config.json"
    const val ModelConfigFilename = "mlc-chat-config.json"
    const val ParamsConfigFilename = "ndarray-cache.json"
    const val ModelUrlSuffix = "resolve/main/"
  }

  private var appConfig = AppConfig(
    emptyList<String>().toMutableList(),
    emptyList<ModelRecord>().toMutableList()
  )

  override fun getName(): String = NAME

  private val gson = Gson()

  @ReactMethod
  fun getModel(name: String, promise: Promise) {
    try {
      val modelInstance = JSONObject().apply {
        put("model_id", name)
      }
      promise.resolve(modelInstance.toString())
    } catch (e: Exception) {
      promise.reject("JSON_ERROR", "Error creating JSON object", e)
    }
  }

  @ReactMethod
  fun getModels(promise: Promise) {
    try {
      val appConfigFile = File(reactApplicationContext.applicationContext.getExternalFilesDir(""), AppConfigFilename)

      val jsonString: String = if (appConfigFile.exists()) {
        appConfigFile.readText()
      } else {
        reactApplicationContext.applicationContext.assets.open(AppConfigFilename).bufferedReader().use { it.readText() }
      }

      appConfig = gson.fromJson(jsonString, AppConfig::class.java)
      appConfig.modelLibs = emptyList<String>().toMutableList()

      val modelsArray = Arguments.createArray().apply {
        for (modelRecord in appConfig.modelList) {
          pushMap(Arguments.createMap().apply { putString("model_id", modelRecord.modelId) })
        }
      }

      promise.resolve(modelsArray)
    } catch (e: Exception) {
      promise.reject("JSON_ERROR", "Error creating JSON array", e)
    }
  }

  @ReactMethod
  fun doGenerate(instanceId: String, text: String, promise: Promise) {
    promise.resolve("Generated text for $instanceId: $text")
  }

  @ReactMethod
  fun doStream(instanceId: String, text: String, promise: Promise) {
    promise.resolve("Streaming text for $instanceId: $text")
  }
}

data class AppConfig(
  @SerializedName("model_libs") var modelLibs: MutableList<String>,
  @SerializedName("model_list") val modelList: MutableList<ModelRecord>,
)

data class ModelRecord(
  @SerializedName("model_url") val modelUrl: String,
  @SerializedName("model_id") val modelId: String,
  @SerializedName("estimated_vram_bytes") val estimatedVramBytes: Long?,
  @SerializedName("model_lib") val modelLib: String
)
