#!/bin/bash
# Runs the native Swift tests in ios/Tests with XCTest on macOS.
# The sources are built for the host macOS version, so APIs gated on an iOS version are available.
# React is replaced with the stub module in scripts/react-stub.
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

PLATFORM_DIR="$(xcrun --sdk macosx --show-sdk-platform-path)"
BUNDLE="$BUILD_DIR/AppleLLMTests.xctest"
mkdir -p "$BUNDLE/Contents/MacOS"

xcrun swiftc -version

find "$PACKAGE_DIR/ios" -name '*.swift' -print0 | xargs -0 xcrun -sdk macosx swiftc \
  -swift-version 5 \
  -suppress-warnings \
  -module-name AppleLLMTests \
  -target "$(uname -m)-apple-macos$(sw_vers -productVersion)" \
  -I "$PACKAGE_DIR/scripts/react-stub" \
  -F "$PLATFORM_DIR/Developer/Library/Frameworks" \
  -I "$PLATFORM_DIR/Developer/usr/lib" \
  -L "$PLATFORM_DIR/Developer/usr/lib" \
  -Xlinker -bundle \
  -Xlinker -rpath -Xlinker "$PLATFORM_DIR/Developer/Library/Frameworks" \
  -Xlinker -rpath -Xlinker "$PLATFORM_DIR/Developer/usr/lib" \
  -o "$BUNDLE/Contents/MacOS/AppleLLMTests"

xcrun xctest "$BUNDLE"
