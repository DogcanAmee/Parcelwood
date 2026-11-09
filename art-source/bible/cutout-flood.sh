#!/bin/zsh
# Cutout for white-background renders whose interiors contain white/sky areas that BiRefNet punches holes in.
# Removes only the background connected to the canvas edge; everything inside the dark outline stays opaque.
# Usage: art-source/bible/cutout-flood.sh white-bg.png out-1024.png out-400.png [fuzz%]
set -euo pipefail
in=$1 big=$2 small=$3 fuzz=${4:-8}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
magick "$in" -alpha set -bordercolor white -border 2 -fuzz "$fuzz%" -fill none \
  -draw "color 0,0 floodfill" -shave 2x2 -alpha extract \
  -morphology Erode Disk:1 -blur 0x0.8 "$tmp/mask.png"
magick "$in" "$tmp/mask.png" -alpha off -compose CopyOpacity -composite -define png:color-type=6 "$big"
magick "$big" -filter Lanczos -resize 400x400 "$small"
magick identify "$big" "$small"
