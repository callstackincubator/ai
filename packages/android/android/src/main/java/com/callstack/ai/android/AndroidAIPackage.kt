package com.callstack.ai.android

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.HashMap

class AndroidAIPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == AndroidAIModule.NAME) {
      AndroidAIModule(reactContext)
    } else {
      null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
      moduleInfos[AndroidAIModule.NAME] = ReactModuleInfo(
        AndroidAIModule.NAME,
        AndroidAIModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        hasConstants = false,
        isCxxModule = false,
        isTurboModule = true
      )

      moduleInfos
    }
}
