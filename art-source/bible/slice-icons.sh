#!/bin/zsh
# Slices a 4x4 white-background icon sheet into transparent square icons.
# Usage: art-source/bible/slice-icons.sh sheet.png name1 name2 ... name16
# Writes art-source/bible/icons/<name>.png (256 master) and public/icons/<name>.webp (96px, lossless).
set -euo pipefail
cd "${0:A:h}/../.."
sheet=$1; shift
names=("$@")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p art-source/bible/icons public/icons
magick "$sheet" -crop 4x4@ +repage "$tmp/cell-%02d.png"
i=0
for name in "${names[@]}"; do
  cell=$(printf "%s/cell-%02d.png" "$tmp" $i); i=$((i+1))
  [[ $name == - ]] && continue
  art-source/bible/cutout-flood.sh "$cell" "$tmp/cut.png" "$tmp/ignore.png" >/dev/null
  magick "$tmp/cut.png" -trim +repage -background none -gravity center \
    -extent "%[fx:max(w,h)*1.08]x%[fx:max(w,h)*1.08]" "$tmp/sq.png"
  magick "$tmp/sq.png" -filter Lanczos -resize 256x256 "art-source/bible/icons/$name.png"
  magick "art-source/bible/icons/$name.png" -filter Lanczos -resize 96x96 -define webp:lossless=true "public/icons/$name.webp"
  print "$name"
done
