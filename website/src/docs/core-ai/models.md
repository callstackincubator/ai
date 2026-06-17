# Starter Models

Source this list from `apple/coreai-models/python/src/coreai_models/model_registry.py` when updating the package catalog. Prefer iOS examples. Use macOS only when the registry has no iOS entry.

| Feature                                                      | Starter model                 | Platform    | Package status                 | Notes                                                          |
| ------------------------------------------------------------ | ----------------------------- | ----------- | ------------------------------ | -------------------------------------------------------------- |
| Language sessions, text generation, structured output, tools | `qwen3-0.6b`                  | iOS + macOS | Implemented                    | Best first Core AI session demo.                               |
| Better iOS language quality                                  | `qwen2.5-1.5b-instruct`       | iOS + macOS | Implemented                    | Good second example after the session API works.               |
| Larger iOS language validation                               | `qwen3-4b`                    | iOS + macOS | Implemented                    | Useful for memory and specialization testing.                  |
| macOS-only LLM validation                                    | `gpt-oss-20b`, `gemma3-4b-it` | macOS       | Implemented when running macOS | Not iOS demo candidates in the current registry.               |
| Text/image embeddings                                        | `clip-vit-b32`                | iOS + macOS | Export starter only            | Needs a CLIP embedding runner before the AI SDK adapter works. |
| Audio/text embeddings                                        | `clap-htsat`                  | iOS + macOS | Export starter only            | Needs a CLAP embedding runner.                                 |
| Reranking                                                    | None                          | None        | Not exposed                    | Do not ship a fake provider until there is a real reranker.    |
| Image generation                                             | `sd-1.5`                      | iOS + macOS | Implemented                    | Lowest-friction diffusion starter.                             |
| Modern image generation                                      | `flux2-klein-4b`              | iOS + macOS | Implemented                    | Later demo; heavier setup and memory profile.                  |
| Transcription smoke test                                     | `wav2vec2-base`               | iOS + macOS | Export starter only            | Needs an ASR output decoder before the AI SDK adapter works.   |
| Transcription API parity                                     | `whisper-large-v3-turbo`      | iOS + macOS | Export starter only            | Better match for AI SDK transcription expectations.            |
| Speech generation                                            | None                          | None        | Not exposed                    | Keep using `@react-native-ai/apple` for `AVSpeechSynthesizer`. |
| Video generation                                             | None                          | None        | Not exposed                    | No Core AI video-generation starter in the current registry.   |
| Image segmentation                                           | `efficient-sam-vitt`          | iOS + macOS | Implemented                    | Least-gated segmentation starter.                              |
| Promptable segmentation validation                           | `sam3`                        | iOS + macOS | Implemented                    | Gated on Hugging Face; not first-run docs.                     |
| Object detection                                             | `yolos-tiny`                  | iOS + macOS | Implemented                    | Smaller detection starter.                                     |
| Object detection quality check                               | `yolos-base`                  | iOS + macOS | Implemented                    | Larger detector after wrapper is stable.                       |
| Depth estimation                                             | `depth-anything-3-small`      | macOS       | Export starter only            | macOS-only in the current Apple registry.                      |
| Super-resolution                                             | `edsr-x2`                     | iOS + macOS | Export starter only            | Needs an image-to-image result wrapper.                        |
| Raw model example                                            | `pvt-v2-b0`                   | iOS + macOS | Load/inspect only              | Good for validating raw `.aimodel` loading.                    |

Example exports:

```bash
uv run coreai.llm.export Qwen/Qwen3-0.6B --platform iOS --output-dir ./models
uv run coreai.diffusion.export runwayml/stable-diffusion-v1-5
uv run models/efficient-sam/export.py --model efficient_sam_vitt
uv run models/yolo/export.py --model hustvl/yolos-tiny
```
