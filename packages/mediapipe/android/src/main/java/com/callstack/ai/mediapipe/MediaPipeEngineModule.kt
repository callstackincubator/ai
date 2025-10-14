package com.callstack.ai.mediapipe

import com.facebook.react.bridge.*
import com.google.mediapipe.tasks.genai.llminference.LlmInference

class MediaPipeEngineModule(reactContext: ReactApplicationContext) : NativeMediaPipeSpec(reactContext) {
  override fun getName(): String = NAME

  companion object {
    const val NAME = "MediaPipeEngine"
  }

  override fun getModel(name: String, promise: Promise) {
    throw NotImplementedError("Method not implemented")
  }

  override fun getModels(promise: Promise) {
    throw NotImplementedError("Method not implemented")
  }

  override fun generateText(
    messages: ReadableArray,
    options: ReadableMap?,
    promise: Promise
  ) {
    val taskOptions = LlmInference.LlmInferenceOptions.builder()
      .setModelPath("/data/local/tmp/llm/model_version.task")
      .setMaxTopK(64)
      .build()

    val llmInference = LlmInference.createFromOptions(reactApplicationContext, taskOptions)

    val a = llmInference.generateResponseAsync("Who are you?")
  }

  override fun streamText(
    messages: ReadableArray,
    options: ReadableMap?,
    promise: Promise
  ) {
    throw NotImplementedError("Method not implemented")
  }

  override fun cancelStream(streamId: String, promise: Promise) {

    throw NotImplementedError("Method not implemented")
  }

  override fun downloadModel(instanceId: String, promise: Promise) {
    throw NotImplementedError("Method not implemented")
  }

  override fun removeModel(modelId: String, promise: Promise) {
    throw NotImplementedError("Method not implemented")
  }

  override fun prepareModel(instanceId: String, promise: Promise) {
    throw NotImplementedError("Method not implemented")
  }

  override fun unloadModel(promise: Promise) {
    throw NotImplementedError("Method not implemented")
  }

}

