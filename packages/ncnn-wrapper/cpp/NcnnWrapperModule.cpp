#include "NcnnWrapperModule.h"
#include <chrono>
#include <cstring>
#include <fstream>
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

    std::string paramPath = args[0].asString(rt).utf8(rt);
    std::string modelPath = args[1].asString(rt).utf8(rt);

    auto net = std::make_unique<ncnn::Net>();
    ncnn::Option opt;
    opt.lightmode = true;
    opt.num_threads = 4;
#if NCNN_VULKAN
    net->opt.use_vulkan_compute = true;
#endif

    int ret = 0;
    if (paramPath.size() >= 4 && paramPath.compare(paramPath.size() - 4, 4, ".bin") == 0)
    {
        ret = net->load_param_bin(paramPath.c_str());
    }
    else
    {
        ret = net->load_param(paramPath.c_str());
    }
    if (ret != 0)
    {
        auto result = jsi::Object(rt);
        result.setProperty(rt, "success", jsi::Value(false));
        result.setProperty(rt, "error", jsi::String::createFromUtf8(rt, "Failed to load param file"));
        return result;
    }

    ret = net->load_model(modelPath.c_str());
    if (ret != 0)
    {
        auto result = jsi::Object(rt);
        result.setProperty(rt, "success", jsi::Value(false));
        result.setProperty(rt, "error", jsi::String::createFromUtf8(rt, "Failed to load model file"));
        return result;
    }

    uint32_t modelId = nextModelId_++;
    loadedModels_[modelId] = LoadedModelInfo{
        std::move(paramPath),
        std::move(modelPath),
        std::move(net)};

    auto result = jsi::Object(rt);
    result.setProperty(rt, "success", jsi::Value(true));
    result.setProperty(rt, "modelId", jsi::Value(static_cast<double>(modelId)));
    result.setProperty(rt, "paramPath", jsi::String::createFromUtf8(rt, loadedModels_[modelId].paramPath));
    result.setProperty(rt, "binPath", jsi::String::createFromUtf8(rt, loadedModels_[modelId].modelPath));

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
    if (it == loadedModels_.end() || !it->second.net)
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

    std::string inputBlob = "in0";
    std::string outputBlob = "out0";
    if (count >= 4)
    {
        inputBlob = args[2].asString(rt).utf8(rt);
        outputBlob = args[3].asString(rt).utf8(rt);
    }

    ncnn::Net *net = it->second.net.get();
    ncnn::Extractor ex = net->create_extractor();

    ncnn::Mat in(static_cast<int>(inputData.size()), inputData.data());
    ex.input(inputBlob.c_str(), in);

    auto start = std::chrono::high_resolution_clock::now();
    ncnn::Mat out;
    int ret = ex.extract(outputBlob.c_str(), out);
    auto end = std::chrono::high_resolution_clock::now();
    double inferenceTime = std::chrono::duration<double, std::milli>(end - start).count();

    if (ret != 0)
    {
        auto error = jsi::Object(rt);
        error.setProperty(rt, "error", jsi::String::createFromUtf8(rt, "Inference failed"));
        return error;
    }

    size_t total = out.total();
    auto outputArray = jsi::Array(rt, total);
    const float *outData = (const float *)out.data;
    for (size_t i = 0; i < total; ++i)
    {
        outputArray.setValueAtIndex(rt, i, jsi::Value(outData[i]));
    }

    auto result = jsi::Object(rt);
    result.setProperty(rt, "success", jsi::Value(true));
    result.setProperty(rt, "output", std::move(outputArray));
    result.setProperty(rt, "inferenceTime", jsi::Value(inferenceTime));

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
