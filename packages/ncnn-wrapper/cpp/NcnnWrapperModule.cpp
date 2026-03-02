#include "NcnnWrapperModule.h"
#include <cstring>
#include <vector>

namespace facebook::react
{

NcnnWrapperModule::NcnnWrapperModule(std::shared_ptr<CallInvoker> jsInvoker)
    : TurboModule("NcnnWrapperModule", jsInvoker) {}

jsi::Value NcnnWrapperModule::loadModel(jsi::Runtime &rt, const jsi::Value *args, size_t count)
{
    if (count != 2)
    {
        throw jsi::JSError(rt, "loadModel expects 2 arguments");
    }

    std::string modelPath = args[0].asString(rt).utf8(rt);
    std::string paramPath = args[1].asString(rt).utf8(rt);

    uint32_t modelId = nextModelId_++;
    loadedModels_[modelId] = LoadedModelInfo{modelPath, paramPath};

    // TODO: Implement actual NCNN model loading
    auto result = jsi::Object(rt);
    result.setProperty(rt, "success", jsi::Value(true));
    result.setProperty(rt, "modelId", jsi::Value(static_cast<double>(modelId)));
    result.setProperty(rt, "modelPath", jsi::String::createFromUtf8(rt, modelPath));
    result.setProperty(rt, "paramPath", jsi::String::createFromUtf8(rt, paramPath));

    return result;
}

jsi::Value NcnnWrapperModule::runInference(jsi::Runtime &rt, const jsi::Value *args, size_t count)
{
    if (count < 2)
    {
        throw jsi::JSError(rt, "runInference expects at least 2 arguments (modelId, input)");
    }

    uint32_t modelId = static_cast<uint32_t>(args[0].asNumber());
    auto it = loadedModels_.find(modelId);
    if (it == loadedModels_.end())
    {
        auto error = jsi::Object(rt);
        error.setProperty(rt, "error", jsi::String::createFromUtf8(rt, "Model not loaded"));
        return error;
    }

    std::vector<float> inputData;

    auto inputVal = args[1];
    if (inputVal.isObject(rt))
    {
        auto obj = inputVal.asObject(rt);
        if (obj.isArrayBuffer(rt))
        {
            auto buffer = obj.getArrayBuffer(rt);
            size_t size = buffer.size(rt);
            const uint8_t *data = buffer.data(rt);
            inputData.resize(size / sizeof(float));
            std::memcpy(inputData.data(), data, size);
        }
        else if (obj.isArray(rt))
        {
            auto arr = obj.asArray(rt);
            size_t len = arr.size(rt);
            inputData.reserve(len);
            for (size_t i = 0; i < len; ++i)
            {
                inputData.push_back(static_cast<float>(arr.getValueAtIndex(rt, i).asNumber()));
            }
        }
        else
        {
            throw jsi::JSError(rt, "runInference input must be ArrayBuffer or number[]");
        }
    }
    else
    {
        throw jsi::JSError(rt, "runInference input must be ArrayBuffer or number[]");
    }

    // TODO: Implement actual NCNN inference
    auto result = jsi::Object(rt);
    result.setProperty(rt, "success", jsi::Value(true));

    auto outputArray = jsi::Array(rt, 3);
    outputArray.setValueAtIndex(rt, 0, jsi::Value(0.1));
    outputArray.setValueAtIndex(rt, 1, jsi::Value(0.7));
    outputArray.setValueAtIndex(rt, 2, jsi::Value(0.2));

    result.setProperty(rt, "output", std::move(outputArray));
    result.setProperty(rt, "inferenceTime", jsi::Value(25.5));

    return result;
}

jsi::Value NcnnWrapperModule::getLoadedModelIDs(jsi::Runtime &rt, const jsi::Value *args, size_t)
{
    auto arr = jsi::Array(rt, loadedModels_.size());
    size_t i = 0;
    for (const auto &[id, _] : loadedModels_)
    {
        arr.setValueAtIndex(rt, i++, jsi::Value(static_cast<double>(id)));
    }
    return arr;
}

jsi::Value NcnnWrapperModule::getModelInfo(jsi::Runtime &rt, const jsi::Value *args, size_t)
{
    auto info = jsi::Object(rt);
    info.setProperty(rt, "loadedCount", jsi::Value(static_cast<double>(loadedModels_.size())));
    info.setProperty(rt, "backend", jsi::String::createFromUtf8(rt, "NCNN"));
    info.setProperty(rt, "version", jsi::String::createFromUtf8(rt, "1.0.0"));

    return info;
}

std::shared_ptr<TurboModule> NcnnWrapperCxxModuleProvider(
    const std::string &name,
    const std::shared_ptr<CallInvoker> &jsInvoker)
{
    if (name == NcnnWrapperModule::kModuleName)
    {
        return std::make_shared<NcnnWrapperModule>(jsInvoker);
    }
    return nullptr;
}

} // namespace facebook::react
