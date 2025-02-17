package com.ai

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.TurboModule
import org.json.JSONArray
import org.json.JSONObject

@ReactModule(name = AiModule.NAME)
class AiModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), TurboModule {
    companion object {
        const val NAME = "Ai"
    }

    override fun getName(): String = NAME

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
          val modelsArray = Arguments.createArray().apply {
            val model1 = Arguments.createMap().apply { putString("model_id", "mock_model_1") }
            val model2 = Arguments.createMap().apply { putString("model_id", "mock_model_2") }
            pushMap(model1)
            pushMap(model2)
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
