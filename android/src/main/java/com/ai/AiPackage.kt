package com.ai

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.HashMap

class AiPackage : TurboReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == AiModule.NAME) {
      AiModule(reactContext)
    } else {
      null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
      val isTurboModule: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      moduleInfos[AiModule.NAME] = ReactModuleInfo(
        AiModule.NAME,
        AiModule.NAME,
        // canOverrideExistingModule
        false,
        // needsEagerInit
        false,
        // hasConstants
        true,
        // isCxxModule
        false,
        // isTurboModule
        isTurboModule
      )

      moduleInfos
    }
}
