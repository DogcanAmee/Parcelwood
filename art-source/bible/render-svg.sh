#!/bin/zsh
# Renders an art-bible SVG with Chromium (Playwright CLI) to a transparent 1024 PNG master and a 400x400 item PNG.
# Usage: art-source/bible/render-svg.sh in.svg out-1024.png out-400.png
set -euo pipefail
svg=$1 big=$2 small=$3
P="${CODEX_HOME:-$HOME/.codex}/skills/playwright/scripts/playwright_cli.sh"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
b64=$(base64 < "$svg" | tr -d '\n')
bash "$P" open about:blank >/dev/null 2>&1 || true
bash "$P" --raw eval "async () => { const img = new Image(); img.src = 'data:image/svg+xml;base64,$b64'; await img.decode(); const c = document.createElement('canvas'); c.width = c.height = 1024; c.getContext('2d').drawImage(img, 0, 0, 1024, 1024); return c.toDataURL('image/png'); }" > "$tmp/out.txt"
tr -d '"' < "$tmp/out.txt" | sed 's|^data:image/png;base64,||' | base64 -D > "$big"
magick "$big" -filter Lanczos -resize 400x400 "$small"
magick identify "$big" "$small"
