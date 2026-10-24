#!/bin/bash
# Typechecks the native Swift sources against the active Xcode iOS SDK.
# React is replaced with a stub module that declares the promise blocks the Swift code uses.
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

cat > "$STUB_DIR/React.h" <<'EOF'
#import <Foundation/Foundation.h>
typedef void (^RCTPromiseResolveBlock)(id _Nullable result);
typedef void (^RCTPromiseRejectBlock)(NSString *_Nullable code, NSString *_Nullable message, NSError *_Nullable error);
EOF

cat > "$STUB_DIR/module.modulemap" <<'EOF'
module React {
  header "React.h"
  export *
}
EOF

xcrun swiftc -version
find "$PACKAGE_DIR/ios" -name '*.swift' -print0 | xargs -0 xcrun -sdk iphoneos swiftc \
  -typecheck \
  -swift-version 5 \
  -I "$STUB_DIR" \
  -target arm64-apple-ios15.1
