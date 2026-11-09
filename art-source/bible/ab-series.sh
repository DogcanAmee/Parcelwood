#!/bin/zsh
# Side-by-side (before | after) sheet for a whole series, 240px per image, on kraft.
# Usage: art-source/bible/ab-series.sh out.png rows
#   rows is a file with one "<slug>\t<old.png>\t<new.png>" line per item, order preserved.
set -euo pipefail
cd "${0:A:h}/../.."
out=$1 rows=$2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

all=()
per=4
i=0
row=""
rowidx=0
while IFS=$'\t' read -r slug old new; do
  [[ -z ${slug:-} || ${slug:0:1} == '#' ]] && continue
  for side in old new; do
    src=${(P)side}
    magick "$src" -background '#f1e4c8' -alpha remove -alpha off -filter Lanczos -resize 240x240 \
      -bordercolor '#3a2c1f' -border 1 -bordercolor '#fffaf0' -border 3 "$tmp/$slug-$side.png"
  done
  magick "$tmp/$slug-old.png" "$tmp/$slug-new.png" +append "$tmp/pair-$slug.png"
  magick "$tmp/pair-$slug.png" -gravity northwest -background '#fffaf0' -splice 0x24 \
    -font '/System/Library/Fonts/Supplemental/Arial Bold.ttf' -pointsize 15 -fill '#3a2c1f' \
    -annotate +6+4 "$slug" "$tmp/pair-$slug.png"
  if [[ -z $row ]]; then
    magick "$tmp/pair-$slug.png" "$tmp/row-$rowidx.png"
  else
    magick "$tmp/row-$rowidx.png" "$tmp/pair-$slug.png" -background '#fffaf0' +append "$tmp/row-$rowidx.png"
  fi
  row="x"
  i=$((i+1))
  if [[ $((i % per)) -eq 0 ]]; then row=""; rowidx=$((rowidx+1)); fi
done < "$rows"
[[ -n $row ]] && rowidx=$((rowidx+1))
rows=("$tmp"/row-*.png)
if [[ ${#rows} -gt 1 ]]; then
  magick "${rows[@]}" -background '#fffaf0' -gravity west -append "$out"
else
  magick "${rows[1]}" "$out"
fi
echo "$out"
magick identify "$out"
