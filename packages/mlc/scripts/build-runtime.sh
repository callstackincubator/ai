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
      echo "  3. Clone MLC LLM repository with submodules:"
      echo "     # Fresh clone (recommended):"
      echo "     git clone --recursive https://github.com/mlc-ai/mlc-llm.git"
      echo "     # Or if already cloned without --recursive:"
      echo "     cd mlc-llm && git submodule update --init --recursive"
      echo "  4. Set environment variable:"
      echo "     export MLC_LLM_SOURCE_DIR=/path/to/mlc-llm"
      echo "  5. Install MLC Python package:"
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

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Run MLC package command
echo "Building runtime..."
python3 -m mlc_llm package \
  --package-config "$CONFIG_FILE" \
  --output "$OUTPUT_DIR"

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
