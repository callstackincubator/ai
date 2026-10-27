#!/usr/bin/env bash

# Builds the MLX benchmark app, installs it on a device, runs it and prints the
# BENCHMARK lines it logs. Needs XcodeGen (brew install xcodegen).
#
#   DEVICE=<udid> TEAM=<team id> [MODEL=qwen3-1.7b] [LAUNCHES=3] \
#     harness/benchmarks/mlx/run.sh

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

: "${DEVICE:?Set DEVICE to the device UDID, as xcrun devicectl list devices shows it}"
: "${TEAM:?Set TEAM to the development team that signs the app}"

# The same prompts as the React Native runtimes
bun -e "import { LONG_PROMPT, SHORT_PROMPT } from '../prompts'; console.log(JSON.stringify({ short: SHORT_PROMPT, long: LONG_PROMPT }))" > prompts.json

xcodegen generate --quiet
xcodebuild -project MLXBenchmark.xcodeproj -scheme MLXBenchmark \
  -configuration Release -destination "id=$DEVICE" \
  -derivedDataPath build -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM" -quiet build

# The models in ../models.ts, as MLX community 4-bit weights
MODEL="${MODEL:-qwen3-0.6b}"
case "$MODEL" in
  qwen3-0.6b) REPO=mlx-community/Qwen3-0.6B-4bit ;;
  qwen3-1.7b) REPO=mlx-community/Qwen3-1.7B-4bit ;;
  *) echo "Unknown model $MODEL" >&2; exit 1 ;;
esac

xcrun devicectl device install app --device "$DEVICE" \
  build/Build/Products/Release-iphoneos/MLXBenchmark.app
for launch in $(seq "${LAUNCHES:-3}"); do
  xcrun devicectl device process launch --device "$DEVICE" --console \
    --terminate-existing com.callstack.ai.mlxbenchmark -model "$REPO" -name "$MODEL" |
    grep '^BENCHMARK'
  sleep "${COOLDOWN:-60}"
done
