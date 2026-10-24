#!/bin/bash
# Typechecks the native Swift sources against the active Xcode iOS SDK.
# React is replaced with a stub module (scripts/react-stub) that declares the promise blocks the Swift code uses.
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STUB_DIR="$PACKAGE_DIR/scripts/react-stub"

xcrun swiftc -version

# Device and simulator SDKs ship different module overlays, so check both
for target in "iphoneos:arm64-apple-ios15.1" "iphonesimulator:arm64-apple-ios15.1-simulator"; do
  sdk="${target%%:*}"
  echo "Typechecking against $sdk SDK"
  find "$PACKAGE_DIR/ios" -name '*.swift' -not -path '*/Tests/*' -print0 | xargs -0 xcrun -sdk "$sdk" swiftc \
    -typecheck \
    -swift-version 5 \
    -I "$STUB_DIR" \
    -target "${target#*:}"
done
