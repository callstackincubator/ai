#!/bin/bash

# MLC Runtime Build Script
# Simple wrapper around mlc_llm package command

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
PLATFORM=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 --platform <ios|android>"
      echo ""
      echo "Build MLC runtime for React Native"
      echo ""
      echo "Options:"
      echo "  --platform <ios|android>  Target platform (required)"
      echo "  -h, --help               Show this help message"
      echo ""
      echo "Prerequisites:"
      echo "  1. Install Git LFS (for downloading models):"
      echo "     brew install git-lfs && git lfs install"
      echo "  2. For iOS builds - Install Metal toolchain:"
      echo "     xcodebuild -downloadComponent MetalToolchain"
      echo "  3. For Android builds - Install additional dependencies:"
      echo "     - Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
      echo "     - Android Studio with NDK 27.0.11718014"
      echo "     - JDK >= 17 (preferably Android Studio's bundled JBR)"
      echo "     - Set environment variables: ANDROID_NDK, TVM_NDK_CC, JAVA_HOME, TVM_SOURCE_DIR"
      echo "  4. Clone MLC LLM repository with submodules:"
      echo "     # Fresh clone (recommended):"
      echo "     git clone --recursive https://github.com/mlc-ai/mlc-llm.git"
      echo "     # Or if already cloned without --recursive:"
      echo "     cd mlc-llm && git submodule update --init --recursive"
      echo "  5. Set environment variable:"
      echo "     export MLC_LLM_SOURCE_DIR=/path/to/mlc-llm"
      echo "  6. Install MLC Python package:"
      echo "     pip install --pre -U -f https://mlc.ai/wheels mlc-llm-cpu mlc-ai-cpu"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate platform
if [ -z "$PLATFORM" ]; then
  echo -e "${RED}Error: Platform is required${NC}"
  echo "Usage: $0 --platform <ios|android>"
  exit 1
fi

if [ "$PLATFORM" != "ios" ] && [ "$PLATFORM" != "android" ]; then
  echo -e "${RED}Error: Invalid platform: $PLATFORM${NC}"
  echo "Platform must be either 'ios' or 'android'"
  exit 1
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PACKAGE_DIR/build"
CONFIG_FILE="$PACKAGE_DIR/mlc-package-config-$PLATFORM.json"
OUTPUT_DIR="$PACKAGE_DIR/prebuilt/$PLATFORM"

echo -e "${GREEN}🚀 MLC Runtime Build${NC}"
echo "===================="
echo "Platform: $PLATFORM"
echo "Config: $CONFIG_FILE"
echo "Output: $OUTPUT_DIR"
echo ""

# Check if config exists
if [ ! -f "$CONFIG_FILE" ]; then
  echo -e "${RED}Error: Config file not found: $CONFIG_FILE${NC}"
  exit 1
fi

# Check for Git LFS
if ! git lfs version > /dev/null 2>&1; then
  echo -e "${RED}Error: Git LFS not found${NC}"
  echo ""
  echo "Please install Git LFS:"
  echo "  macOS: brew install git-lfs && git lfs install"
  echo "  Ubuntu: sudo apt-get install git-lfs && git lfs install"
  exit 1
fi

# Check for Metal toolchain on macOS (required for iOS builds)
if [ "$PLATFORM" = "ios" ] && [ "$(uname)" = "Darwin" ]; then
  if ! xcrun -sdk iphoneos metal --version > /dev/null 2>&1; then
    echo -e "${RED}Error: Metal toolchain not found${NC}"
    echo ""
    echo "Please install the Metal toolchain:"
    echo "  xcodebuild -downloadComponent MetalToolchain"
    echo ""
    echo "This may require Xcode to be installed and opened at least once."
    exit 1
  fi
fi

# Check for MLC_LLM_SOURCE_DIR
if [ -z "$MLC_LLM_SOURCE_DIR" ]; then
  echo -e "${RED}Error: MLC_LLM_SOURCE_DIR not set${NC}"
  echo ""
  echo "Please set the MLC LLM source directory:"
  echo "  1. Clone the repository: git clone https://github.com/mlc-ai/mlc-llm.git"
  echo "  2. Export the path: export MLC_LLM_SOURCE_DIR=/path/to/mlc-llm"
  echo "  3. Make sure to checkout the correct version tag (per CLI) and not the main branch"
  exit 1
fi

if [ ! -d "$MLC_LLM_SOURCE_DIR" ]; then
  echo -e "${RED}Error: MLC_LLM_SOURCE_DIR does not exist: $MLC_LLM_SOURCE_DIR${NC}"
  exit 1
fi

# Android-specific checks
if [ "$PLATFORM" = "android" ]; then
  echo "Checking Android prerequisites..."
  
  # Check for Rust
  if ! command -v rustc > /dev/null 2>&1 || ! command -v cargo > /dev/null 2>&1 || ! command -v rustup > /dev/null 2>&1; then
    echo -e "${RED}Error: Rust toolchain not found${NC}"
    echo ""
    echo "Rust is required to cross-compile HuggingFace tokenizers to Android."
    echo "Please install Rust from https://rustup.rs/ and ensure rustc, cargo, and rustup are in \$PATH"
    exit 1
  fi
  
  # Check for ANDROID_NDK
  if [ -z "$ANDROID_NDK" ]; then
    echo -e "${RED}Error: ANDROID_NDK environment variable not set${NC}"
    echo ""
    echo "Please install Android Studio with NDK and set up environment variables:"
    echo "  1. Install Android Studio from https://developer.android.com/studio"
    echo "  2. Install NDK via SDK Manager → SDK Tools → NDK"
    echo "  3. Set ANDROID_NDK environment variable:"
    echo ""
    echo "Example paths:"
    echo "  macOS:   export ANDROID_NDK=\$HOME/Library/Android/sdk/ndk/27.0.11718014"
    echo "  Linux:   export ANDROID_NDK=\$HOME/Android/Sdk/ndk/27.0.11718014"
    echo "  Windows: export ANDROID_NDK=%HOME%/AppData/Local/Android/Sdk/ndk/27.0.11718014"
    exit 1
  fi
  
  if [ ! -d "$ANDROID_NDK" ]; then
    echo -e "${RED}Error: ANDROID_NDK directory does not exist: $ANDROID_NDK${NC}"
    exit 1
  fi
  
  if [ ! -f "$ANDROID_NDK/build/cmake/android.toolchain.cmake" ]; then
    echo -e "${RED}Error: Android NDK toolchain not found at: $ANDROID_NDK/build/cmake/android.toolchain.cmake${NC}"
    echo "Please ensure you have installed the correct NDK version."
    exit 1
  fi
  
  # Check for TVM_NDK_CC
  if [ -z "$TVM_NDK_CC" ]; then
    echo -e "${RED}Error: TVM_NDK_CC environment variable not set${NC}"
    echo ""
    echo "Please set TVM_NDK_CC to point to NDK's clang compiler:"
    echo ""
    echo "Example paths:"
    echo "  macOS:   export TVM_NDK_CC=\$ANDROID_NDK/toolchains/llvm/prebuilt/darwin-x86_64/bin/aarch64-linux-android24-clang"
    echo "  Linux:   export TVM_NDK_CC=\$ANDROID_NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android24-clang"
    echo "  Windows: export TVM_NDK_CC=\$ANDROID_NDK/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android24-clang"
    exit 1
  fi
  
  if [ ! -f "$TVM_NDK_CC" ]; then
    echo -e "${RED}Error: TVM_NDK_CC compiler not found: $TVM_NDK_CC${NC}"
    exit 1
  fi
  
  # Check for JAVA_HOME
  if [ -z "$JAVA_HOME" ]; then
    echo -e "${RED}Error: JAVA_HOME environment variable not set${NC}"
    echo ""
    echo "Please install JDK >= 17 and set JAVA_HOME:"
    echo "We recommend using the JDK bundled with Android Studio:"
    echo ""
    echo "Example paths:"
    echo "  macOS: export JAVA_HOME=/Applications/Android\\ Studio.app/Contents/jbr/Contents/Home"
    echo "  Linux: export JAVA_HOME=/opt/android-studio/jbr"
    echo ""
    echo "Make sure \$JAVA_HOME/bin/java exists and JDK version matches Android Studio's JBR."
    exit 1
  fi
  
  if [ ! -f "$JAVA_HOME/bin/java" ]; then
    echo -e "${RED}Error: Java binary not found: $JAVA_HOME/bin/java${NC}"
    echo "Please verify your JAVA_HOME path is correct."
    exit 1
  fi
  
  # Check Java version (should be >= 17)
  JAVA_VERSION=$("$JAVA_HOME/bin/java" -version 2>&1 | grep -oP 'version "([0-9]+)' | grep -oP '[0-9]+' | head -1)
  if [ -n "$JAVA_VERSION" ] && [ "$JAVA_VERSION" -gt 0 ] 2>/dev/null && [ "$JAVA_VERSION" -lt 17 ]; then
    echo -e "${YELLOW}Warning: Java version is $JAVA_VERSION, but >= 17 is recommended${NC}"
  fi
  
  # Check for TVM_SOURCE_DIR
  if [ -z "$TVM_SOURCE_DIR" ]; then
    echo -e "${RED}Error: TVM_SOURCE_DIR environment variable not set${NC}"
    echo ""
    echo "Please set TVM_SOURCE_DIR to point to the TVM runtime:"
    echo "  export TVM_SOURCE_DIR=$MLC_LLM_SOURCE_DIR/3rdparty/tvm"
    exit 1
  fi
  
  if [ ! -d "$TVM_SOURCE_DIR" ]; then
    echo -e "${RED}Error: TVM_SOURCE_DIR directory does not exist: $TVM_SOURCE_DIR${NC}"
    echo "Expected path: $MLC_LLM_SOURCE_DIR/3rdparty/tvm"
    exit 1
  fi
  
  echo -e "${GREEN}✅ Android prerequisites verified${NC}"
fi

# Check for submodules
if [ ! -f "$MLC_LLM_SOURCE_DIR/3rdparty/tvm/CMakeLists.txt" ] || [ ! -f "$MLC_LLM_SOURCE_DIR/3rdparty/tokenizers-cpp/CMakeLists.txt" ]; then
  echo -e "${RED}Error: MLC LLM submodules not initialized${NC}"
  echo ""
  echo "The MLC LLM repository exists but submodules are missing."
  echo "Please initialize them by running:"
  echo ""
  echo "  cd $MLC_LLM_SOURCE_DIR"
  echo "  git submodule update --init --recursive"
  echo ""
  echo "This will download TVM and tokenizers-cpp dependencies."
  exit 1
fi

# Check if mlc_llm is available
if ! python3 -m mlc_llm --help > /dev/null 2>&1; then
  echo -e "${RED}Error: mlc_llm not found${NC}"
  echo ""
  echo "Please install MLC:"
  echo "  pip install --pre -U -f https://mlc.ai/wheels mlc-llm-cpu mlc-ai-cpu"
  exit 1
fi

# Check for conflicting build artifacts from other platforms
if [ -f "$BUILD_DIR/CMakeCache.txt" ]; then
  # Check if this is an Xcode/iOS build when building for Android
  if [ "$PLATFORM" = "android" ] && grep -q "Xcode" "$BUILD_DIR/CMakeCache.txt" 2>/dev/null; then
    echo -e "${YELLOW}Warning: Detected Xcode/iOS build artifacts in $BUILD_DIR${NC}"
    echo "This can cause CMake cache conflicts for Android builds."
    echo "Cleaning build directory..."
    rm -rf "$BUILD_DIR"
    echo -e "${GREEN}Build directory cleaned${NC}"
  fi
  # Check if this is an Android build when building for iOS
  if [ "$PLATFORM" = "ios" ] && grep -q "Android" "$BUILD_DIR/CMakeCache.txt" 2>/dev/null; then
    echo -e "${YELLOW}Warning: Detected Android build artifacts in $BUILD_DIR${NC}"
    echo "This can cause CMake cache conflicts for iOS builds."
    echo "Cleaning build directory..."
    rm -rf "$BUILD_DIR"
    echo -e "${GREEN}Build directory cleaned${NC}"
  fi
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Run MLC package command
if [ "$PLATFORM" = "ios" ]; then
  for is_simulator in false true; do
    echo "Preparing libs (is_simulator=$is_simulator)..."
    PREPARE_LIBS_PATH="$MLC_LLM_SOURCE_DIR/ios/prepare_libs.sh"
    if [ -f "$PREPARE_LIBS_PATH" ]; then
      sed -i '' "s/^is_simulator=.*/is_simulator=\"$is_simulator\"/" "$PREPARE_LIBS_PATH"
    fi

    echo "Building runtime (is_simulator=$is_simulator)..."
    python3 -m mlc_llm package \
      --package-config "$CONFIG_FILE" \
      --output "$OUTPUT_DIR"

    if [ -d "$OUTPUT_DIR/lib" ]; then
      if [ "$is_simulator" = "true" ]; then
        lib_suffix="iphonesim"
      else
        lib_suffix="iphone"
      fi
      rm -rf "$OUTPUT_DIR/lib_$lib_suffix"
      mv "$OUTPUT_DIR/lib" "$OUTPUT_DIR/lib_$lib_suffix"
    fi
  done
else
  echo "Building runtime..."
  python3 -m mlc_llm package \
    --package-config "$CONFIG_FILE" \
    --output "$OUTPUT_DIR"
fi

# Copy necessary headers for iOS
if [ "$PLATFORM" = "ios" ]; then
  echo "Copying headers..."
  INCLUDE_DIR="$OUTPUT_DIR/include"
  mkdir -p "$INCLUDE_DIR"
  
  # Copy TVM runtime headers (needed by iOS code)
  if [ -d "$MLC_LLM_SOURCE_DIR/3rdparty/tvm/include/tvm" ]; then
    cp -r "$MLC_LLM_SOURCE_DIR/3rdparty/tvm/include/tvm" "$INCLUDE_DIR/"
  fi
  
  # Copy TVM FFI headers (also needed)
  if [ -d "$MLC_LLM_SOURCE_DIR/3rdparty/tvm/ffi/include/tvm/ffi" ]; then
    cp -r "$MLC_LLM_SOURCE_DIR/3rdparty/tvm/ffi/include/tvm/ffi" "$INCLUDE_DIR/tvm/"
  fi
  
  # Copy dlpack headers (often needed with TVM)
  if [ -d "$MLC_LLM_SOURCE_DIR/3rdparty/tvm/3rdparty/dlpack/include/dlpack" ]; then
    cp -r "$MLC_LLM_SOURCE_DIR/3rdparty/tvm/3rdparty/dlpack/include/dlpack" "$INCLUDE_DIR/"
  fi
  
  # Copy dmlc headers (logging and other utilities)
  if [ -d "$MLC_LLM_SOURCE_DIR/3rdparty/tvm/3rdparty/dmlc-core/include/dmlc" ]; then
    cp -r "$MLC_LLM_SOURCE_DIR/3rdparty/tvm/3rdparty/dmlc-core/include/dmlc" "$INCLUDE_DIR/"
  fi
  
  echo "Headers copied to $INCLUDE_DIR"
fi

echo -e "${GREEN}✅ Build complete!${NC}"
echo "Runtime binaries are in: $OUTPUT_DIR"
