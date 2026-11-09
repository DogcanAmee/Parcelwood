#!/bin/zsh
# Builds the art-bible A/B sheet: each input is shown at 180/64/34 px, as a silhouette, on kraft and on dark.
# Usage: art-source/bible/ab-sheet.sh out.png before.png [after.png]
set -euo pipefail
out=$1; shift
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
rows=()
i=0
for src in "$@"; do
  i=$((i+1))
  tiles=()
  for bg in '#f1e4c8' '#222a3d'; do
    for px in 180 64 34; do
      magick "$src" -resize ${px}x${px} -background none -gravity center -extent ${px}x${px} \
        \( -size 200x200 xc:"$bg" \) +swap -gravity center -composite "$tmp/t$i-${bg#\#}-$px.png"
      tiles+=("$tmp/t$i-${bg#\#}-$px.png")
    done
  done
  magick "$src" -resize 64x64 -fill '#3a2c1f' -colorize 100 \
    \( -size 200x200 xc:'#f1e4c8' \) +swap -gravity center -composite "$tmp/s$i.png"
  tiles+=("$tmp/s$i.png")
  magick "${tiles[@]}" +append -bordercolor '#3a2c1f' -border 2 "$tmp/r$i.png"
  label=$([ $i -eq 1 ] && echo "A  current" || echo "B  art bible v0.1")
  magick "$tmp/r$i.png" -gravity northwest -background '#fffaf0' -splice 0x28 \
    -font '/System/Library/Fonts/Supplemental/Arial Bold.ttf' -pointsize 18 -fill '#3a2c1f' -annotate +8+4 "$label" "$tmp/r$i.png"
  rows+=("$tmp/r$i.png")
done
magick "${rows[@]}" -background '#fffaf0' -gravity west -append \
  \( -size 1414x32 xc:'#fffaf0' -gravity northwest -font /System/Library/Fonts/Supplemental/Arial.ttf -pointsize 14 -fill '#6d5a47' \
     -annotate +8+22 "kraft: 180 / 64 / 34 px      dark: 180 / 64 / 34 px      silhouette (album --sil) 64 px" \) -append +repage "$out"
echo "$out"
