#!/usr/bin/env bash

# Fetches MLC prebuilt native artifacts from the published @react-native-ai/mlc
# npm package when local prebuilt/ios or prebuilt/android dirs are missing.

set -euo pipefail

if [[ "${SKIP_MLC_PREBUILT_FETCH:-}" == "1" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
PREBUILT_DIR="$PACKAGE_DIR/prebuilt"

need_ios=false
need_android=false

if [[ ! -d "$PREBUILT_DIR/ios" ]]; then
  need_ios=true
fi

if [[ ! -d "$PREBUILT_DIR/android" ]]; then
  need_android=true
fi

if [[ "$need_ios" == false && "$need_android" == false ]]; then
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "fetch-prebuilt: npm is required to download MLC prebuilt artifacts" >&2
  exit 1
fi

VERSION="$(node -pe "require('${PACKAGE_DIR}/package.json').version")"
PKG="@react-native-ai/mlc@${VERSION}"

echo "MLC prebuilt artifacts missing — fetching ${PKG} from npm..."

TMPDIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

(
  cd "$TMPDIR"
  npm pack "$PKG" --silent >/dev/null
)

TARBALL="$(ls "$TMPDIR"/react-native-ai-mlc-*.tgz)"
tar -xzf "$TARBALL" -C "$TMPDIR"

mkdir -p "$PREBUILT_DIR"

if [[ "$need_ios" == true ]]; then
  if [[ ! -d "$TMPDIR/package/prebuilt/ios" ]]; then
    echo "fetch-prebuilt: ios prebuilt directory not found in ${PKG}" >&2
    exit 1
  fi
  cp -R "$TMPDIR/package/prebuilt/ios" "$PREBUILT_DIR/"
  echo "  installed prebuilt/ios"
fi

if [[ "$need_android" == true ]]; then
  if [[ ! -d "$TMPDIR/package/prebuilt/android" ]]; then
    echo "fetch-prebuilt: android prebuilt directory not found in ${PKG}" >&2
    exit 1
  fi
  cp -R "$TMPDIR/package/prebuilt/android" "$PREBUILT_DIR/"
  echo "  installed prebuilt/android"
fi

echo "MLC prebuilt artifacts ready at ${PREBUILT_DIR}"
