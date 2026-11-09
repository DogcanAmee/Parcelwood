#!/bin/zsh
# Installs redrawn art into the game: art-source/items/<id>.png (400px master) + public/items/<id>.webp (lossless).
# Backs up the previous versions to art-source/items-backup-v0/ first.
# Usage: art-source/bible/install.sh rows.tsv
#   rows.tsv: one "<slug>\t<game basename>\t<new 1024 source.png>" per line.
set -euo pipefail
cd "${0:A:h}/../.."
bak=art-source/items-backup-v0
mkdir -p "$bak"

while IFS=$'\t' read -r slug base src; do
  [[ -z ${slug:-} || ${slug:0:1} == '#' ]] && continue
  [[ -f "art-source/items/$base.png" && ! -f "$bak/$base.png" ]] && cp "art-source/items/$base.png" "$bak/$base.png"
  [[ -f "public/items/$base.webp" && ! -f "$bak/$base.webp" ]] && cp "public/items/$base.webp" "$bak/$base.webp"
  magick "$src" -filter Lanczos -resize 400x400! "art-source/items/$base.png"
  magick "art-source/items/$base.png" -define webp:lossless=true "public/items/$base.webp"
  printf "%-16s -> art-source/items/%s.png  public/items/%s.webp\n" "$slug" "$base" "$base"
done < "$1"
