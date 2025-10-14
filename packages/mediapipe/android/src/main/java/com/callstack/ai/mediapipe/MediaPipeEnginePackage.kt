package com.callstack.ai.mediapipe

import com.facebook.react.BaseReactPackage

import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.HashMap

class MediaPipeEnginePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == MediaPipeEngineModule.NAME) {
      MediaPipeEngineModule(reactContext)
    } else {
      null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
      moduleInfos[MediaPipeEngineModule.NAME] = ReactModuleInfo(
        MediaPipeEngineModule.NAME,
        MediaPipeEngineModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        hasConstants = true,
        isCxxModule = false,
        isTurboModule = true
      )

      moduleInfos
    }
}
