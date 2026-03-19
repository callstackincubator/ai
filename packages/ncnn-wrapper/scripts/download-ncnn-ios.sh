#!/usr/bin/env bash
set -e

NCNN_VERSION="${NCNN_VERSION:-20260113}"
VENDOR_DIR="$(cd "$(dirname "$0")/../vendor" && pwd)"
OUTPUT_DIR="${VENDOR_DIR}/ncnn-ios"
ZIP_NAME="ncnn-${NCNN_VERSION}-apple-vulkan.zip"
DOWNLOAD_URL="https://github.com/Tencent/ncnn/releases/download/${NCNN_VERSION}/${ZIP_NAME}"
TEMP_DIR="${VENDOR_DIR}/.ncnn-ios-tmp"

echo "Downloading NCNN ${NCNN_VERSION} for iOS (Vulkan)..."
mkdir -p "${TEMP_DIR}"
curl -sL "${DOWNLOAD_URL}" -o "${TEMP_DIR}/${ZIP_NAME}"

echo "Extracting..."
unzip -q -o "${TEMP_DIR}/${ZIP_NAME}" -d "${TEMP_DIR}"

echo "Installing to ${OUTPUT_DIR}..."
mkdir -p "${OUTPUT_DIR}"
EXTRACTED_ROOT="${TEMP_DIR}"
for xcframework in ncnn glslang openmp vulkan; do
  if [ -d "${EXTRACTED_ROOT}/${xcframework}.xcframework" ]; then
    rm -rf "${OUTPUT_DIR}/${xcframework}.xcframework"
    cp -R "${EXTRACTED_ROOT}/${xcframework}.xcframework" "${OUTPUT_DIR}/"
    echo "  - ${xcframework}.xcframework"
  fi
done

echo "Cleaning up..."
rm -rf "${TEMP_DIR}"

echo "Done. NCNN iOS artifacts installed to ${OUTPUT_DIR}"
