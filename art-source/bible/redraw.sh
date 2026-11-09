#!/bin/zsh
# Regenerates a whole series from the art bible.
# Usage: art-source/bible/redraw.sh <series.tsv> <palette text> [slug...]
# Writes art-source/bible/redraw/<slug>.png and a 400px copy; does NOT install into public/items.
set -euo pipefail
cd "${0:A:h}/../.."
series=$1 palette=$2; shift 2
want=("$@")
style=$(cat art-source/bible/style-block.txt)
mkdir -p art-source/bible/redraw art-source/bible/prompts

while IFS=$'\t' read -r slug ref identity; do
  [[ -z ${slug:-} || ${slug:0:1} == '#' ]] && continue
  [[ ${#want[@]} -gt 0 && ${want[(ie)$slug]} -gt ${#want} ]] && continue
  print -u2 "=== $slug ==="
  prompt="art-source/bible/prompts/$slug.txt"
  print -r -- "$identity"$'\n'"${style//SERIES_PALETTE/$palette}" > "$prompt"
  art-source/bible/fal-gen.sh -o "art-source/bible/redraw/$slug.png" -p "$prompt" -r "$ref" || {
    print -u2 "FAILED: $slug"; continue }
  magick "art-source/bible/redraw/$slug.png" -filter Lanczos -resize 400x400! \
    "art-source/bible/redraw/$slug-400.png"
done < "$series"

echo "--- done ---"
ls -la art-source/bible/redraw/ | tail -n +2
