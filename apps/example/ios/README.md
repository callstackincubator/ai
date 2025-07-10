# Setup

To compile the model you need to execute the following command:

```bash
mlc_llm package
```

> [!NOTE]
> To setup `mlc_llm` read the [official documentation](https://llm.mlc.ai/docs/install/mlc_llm.html#install-mlc-packages)

This will generate necessary binaries and model itself in the `build` & `dist` directories.

Then model is added to XCode project under `bundle/` directory which then is used by the module. 

In the future, we will automate this process, so when the model is not found under the bundle/ directory, it will be downloaded from HuggingFace in the runtime.
