package com.callstack.ai.ncnnwrapper

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * NcnnWrapper uses a pure C++ TurboModule. The module is provided via
 * cxxModuleProvider - the consuming app must add NcnnWrapperCxxModuleProvider
 * to their OnLoad.cpp cxxModuleProvider.
 */
class NcnnWrapperPackage : TurboReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            val moduleInfo = mutableMapOf<String, ReactModuleInfo>()
            moduleInfo["NcnnWrapperModule"] = ReactModuleInfo(
                "NcnnWrapperModule",
                "com.callstack.ai.ncnnwrapper.NcnnWrapperModule",
                canOverrideExistingModule = false,
                needsEagerInit = false,
                hasConstants = false,
                isCxxModule = true,
                isTurboModule = true
            )
            moduleInfo
        }
    }

    companion object {
        init {
            System.loadLibrary("reactnativeai_ncnnwrapper")
        }
    }
}
