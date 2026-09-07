#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSET_DIR="$ROOT_DIR/dist/public/manus-storage"
BASE_URL="https://typingarena-lf8xyyic.manus.space/manus-storage"

mkdir -p "$ASSET_DIR"

download_asset() {
  local asset="$1"
  curl -fsSL "$BASE_URL/$asset" -o "$ASSET_DIR/$asset"
}

download_asset "signal-lab-chamber-bg_6910abaf.png"
download_asset "signal-packet-burst_4c103518.png"
download_asset "signal-gate-logo_f663d1fc.png"

echo "LAN release assets prepared in $ASSET_DIR"
