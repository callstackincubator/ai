#!/usr/bin/env bash

# Builds and installs the example app for a simulator or a physical device,
# then runs the harness tests in it, so the build always matches the tests.
#
#   bun run test:harness:simulator [test path]
#   HARNESS_IOS_DEVICE="My iPhone" bun run test:harness:device [test path]
#   HARNESS_ANDROID_DEVICE="Pixel 9 Pro" bun run test:harness:android [test path]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(dirname "$SCRIPT_DIR")"

TARGET="${1:-}"
shift || true

case "$TARGET" in
  simulator)
    # Core AI and Private Cloud Compute can't run in the Simulator, so the
    # simulator build leaves them out, and their tests are .device files
    unset CORE_AI PCC
    npx expo prebuild --clean --platform ios
    npx expo run:ios --device 'iPhone 18 Pro' --no-bundler
    HARNESS_SIMULATOR=true npx react-native-harness --harnessRunner ios-simulator "$@"
    ;;
  device)
    if [[ -z "${HARNESS_IOS_DEVICE:-}" ]]; then
      echo 'Set HARNESS_IOS_DEVICE to the device name, as `xcrun devicectl list devices` shows it' >&2
      exit 1
    fi
    # Every test runs on a device, so the build has Core AI and Private Cloud
    # Compute. The team signing it needs the Private Cloud Compute entitlement
    export CORE_AI=1 PCC=1
    npx expo prebuild --clean --platform ios
    npx expo run:ios --device "$HARNESS_IOS_DEVICE" --no-bundler
    npx react-native-harness --harnessRunner ios "$@"
    ;;
  android)
    if [[ -z "${HARNESS_ANDROID_DEVICE:-}" ]]; then
      echo 'Set HARNESS_ANDROID_DEVICE to the device model, as `adb shell getprop ro.product.model` shows it' >&2
      exit 1
    fi
    # Installs on the connected device, or the one ANDROID_SERIAL names when
    # more than one is connected
    npx expo prebuild --clean --platform android
    npx expo run:android --no-bundler ${ANDROID_SERIAL:+--device "$ANDROID_SERIAL"}
    HARNESS_PLATFORM=android npx react-native-harness --harnessRunner android "$@"
    ;;
  *)
    echo "Usage: $0 simulator|device|android [test path]" >&2
    exit 1
    ;;
esac
