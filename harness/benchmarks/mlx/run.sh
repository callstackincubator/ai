#!/usr/bin/env bash

# Builds the MLX benchmark app, installs it on a device, runs it and prints the
# BENCHMARK lines it logs. Needs XcodeGen (brew install xcodegen).
#
#   DEVICE=<udid> TEAM=<team id> harness/benchmarks/mlx/run.sh [-model <repo>]

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

xcrun devicectl device install app --device "$DEVICE" \
  build/Build/Products/Release-iphoneos/MLXBenchmark.app
xcrun devicectl device process launch --device "$DEVICE" --console \
  --terminate-existing com.callstack.ai.mlxbenchmark "$@" | grep '^BENCHMARK'
