#!/usr/bin/env bash
set -e

NCNN_VERSION="${NCNN_VERSION:-20260113}"
VENDOR_DIR="$(cd "$(dirname "$0")/../vendor" && pwd)"
OUTPUT_DIR="${VENDOR_DIR}/ncnn-android-vulkan"
ZIP_NAME="ncnn-${NCNN_VERSION}-android-vulkan.zip"
DOWNLOAD_URL="https://github.com/Tencent/ncnn/releases/download/${NCNN_VERSION}/${ZIP_NAME}"
TEMP_DIR="${VENDOR_DIR}/.ncnn-android-tmp"

echo "Downloading NCNN ${NCNN_VERSION} for Android (Vulkan)..."
mkdir -p "${TEMP_DIR}"
curl -sL "${DOWNLOAD_URL}" -o "${TEMP_DIR}/${ZIP_NAME}"

echo "Extracting..."
unzip -q -o "${TEMP_DIR}/${ZIP_NAME}" -d "${TEMP_DIR}"

echo "Installing to ${OUTPUT_DIR}..."
mkdir -p "${OUTPUT_DIR}"
EXTRACTED_ROOT="${TEMP_DIR}/ncnn-${NCNN_VERSION}-android-vulkan"
for abi in arm64-v8a armeabi-v7a x86 x86_64; do
  if [ -d "${EXTRACTED_ROOT}/${abi}" ]; then
    rm -rf "${OUTPUT_DIR}/${abi}"
    cp -R "${EXTRACTED_ROOT}/${abi}" "${OUTPUT_DIR}/"
    echo "  - ${abi}"
  fi
done

echo "Cleaning up..."
rm -rf "${TEMP_DIR}"

echo "Done. NCNN Android artifacts installed to ${OUTPUT_DIR}"
