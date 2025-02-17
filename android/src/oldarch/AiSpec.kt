package com.ai

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

abstract class AiSpec internal constructor(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  abstract fun getModel(name: String, promise: Promise)
  abstract fun getModels(promise: Promise)
  abstract fun doGenerate(a: Double, b: Double, promise: Promise)
  abstract fun doStream(a: Double, b: Double, promise: Promise)
}
