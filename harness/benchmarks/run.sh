#!/usr/bin/env bash

# Runs the React Native runtime benchmarks one at a time, each in its own app
# process, then copies the results off the device. Install the example app
# first (see README.md).
#
#   DEVICE=<udid> HARNESS_IOS_DEVICE="<device name>" harness/benchmarks/run.sh [config...]
#
# Configurations: core-ai core-ai-gpu llama executorch-mlx executorch-xnnpack

set -euo pipefail

: "${DEVICE:?Set DEVICE to the device UDID}"
: "${HARNESS_IOS_DEVICE:?Set HARNESS_IOS_DEVICE to the device name}"

BENCHMARKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIGS=("${@:-core-ai core-ai-gpu llama executorch-mlx executorch-xnnpack}")
# Lets the phone cool down between runtimes, so one doesn't throttle the next
COOLDOWN="${COOLDOWN:-60}"

cd "$BENCHMARKS_DIR/../../apps/expo-example"

for config in ${CONFIGS[@]}; do
  echo "Running $config"
  HARNESS_BENCHMARK=true npx react-native-harness --harnessRunner ios \
    "../../harness/benchmarks/$config.device.benchmark.harness.ts" ||
    echo "$config failed"
  sleep "$COOLDOWN"
done

xcrun devicectl device copy from --device "$DEVICE" \
  --domain-type appDataContainer --domain-identifier com.callstack.ai.example \
  --source Documents/benchmarks.jsonl --destination "$BENCHMARKS_DIR/benchmarks.jsonl"
echo "Results in $BENCHMARKS_DIR/benchmarks.jsonl"
