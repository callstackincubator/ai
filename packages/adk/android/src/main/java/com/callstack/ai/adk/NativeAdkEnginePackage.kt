package com.callstack.ai.adk

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.HashMap

class NativeAdkEnginePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == NativeAdkEngineModule.NAME) {
      NativeAdkEngineModule(reactContext)
    } else {
      null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
      moduleInfos[NativeAdkEngineModule.NAME] = ReactModuleInfo(
        NativeAdkEngineModule.NAME,
        NativeAdkEngineModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        hasConstants = false,
        isCxxModule = false,
        isTurboModule = true
      )

      moduleInfos
    }
}
