# Starter Models

| Type               | Models                                      | Platform    | Model file |
| ------------------ | ------------------------------------------- | ----------- | ---------- |
| Language           | `qwen3-0.6b`                                | iOS + macOS | TBD        |
| Language           | `qwen2.5-1.5b-instruct`, `qwen3-4b`         | iOS + macOS | TBD        |
| Language           | `gpt-oss-20b`, `gemma3-4b-it`               | macOS       | TBD        |
| Image generation   | `sd-1.5`, `flux2-klein-4b`                  | iOS + macOS | TBD        |
| Image segmentation | `efficient-sam-vitt`, `sam3`                | iOS + macOS | TBD        |
| Object detection   | `yolos-tiny`, `yolos-base`                  | iOS + macOS | TBD        |

Example exports for listed models:

```bash
uv run coreai.llm.export Qwen/Qwen3-0.6B --platform iOS --output-dir ./models
uv run coreai.diffusion.export runwayml/stable-diffusion-v1-5
uv run models/efficient-sam/export.py --model efficient_sam_vitt
uv run models/yolo/export.py --model hustvl/yolos-tiny
```
