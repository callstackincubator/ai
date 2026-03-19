#pragma once

#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include <ncnn/net.h>

namespace facebook::react
{

struct LoadedModelInfo
{
    std::string paramPath;
    std::string binPath;
    std::unique_ptr<ncnn::Net> net;
};

class NcnnWrapperModule : public TurboModule
{
public:
    NcnnWrapperModule(std::shared_ptr<CallInvoker> jsInvoker);

    static constexpr auto kModuleName = "NcnnWrapperModule";

    jsi::Value loadModel(jsi::Runtime &rt, const jsi::Value *args, size_t count);
    jsi::Value runInference(jsi::Runtime &rt, const jsi::Value *args, size_t count);
    jsi::Value getLoadedModelIDs(jsi::Runtime &rt, const jsi::Value *args, size_t count);
    jsi::Value getModelInfo(jsi::Runtime &rt, const jsi::Value *args, size_t count);

private:
    std::map<uint32_t, LoadedModelInfo> loadedModels_;
    uint32_t nextModelId_{1};
};

std::shared_ptr<TurboModule> NcnnWrapperCxxModuleProvider(
    const std::string &name,
    const std::shared_ptr<CallInvoker> &jsInvoker);

} // namespace facebook::react
