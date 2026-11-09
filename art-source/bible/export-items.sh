#!/bin/zsh
# Exports the game item art as small lossy WebP:
#   art-source/bible/redraw/<id>.png (1024×1024 master) when present, otherwise art-source/items/<id>.png (400×400)
#   -> public/items/<id>.webp (256×256, lossy quality 85, alpha kept)
# The art-source masters are not changed. This script only writes the game copies.
# Usage: art-source/bible/export-items.sh
set -euo pipefail
cd "${0:A:h}/../.."
command -v cwebp >/dev/null || { echo "cwebp not found (brew install webp)" >&2; exit 1; }
for src in art-source/items/*.png; do
  base=${src:t:r}
  case $base in
    kite) master=art-source/bible/redraw/box-kite.png ;;
    rubber-duck-v2) master=art-source/bible/redraw/rubber-duck.png ;;
    tin-robot) master='' ;; # this redraw is a different design
    *) master="art-source/bible/redraw/$base.png" ;;
  esac
  if [[ -n $master && -f $master ]]; then source=$master; note='1024 master'; else source=$src; note='400 source'; fi
  cwebp -quiet -q 85 -alpha_q 100 -resize 256 256 "$source" -o "public/items/$base.webp"
  printf "%-18s -> public/items/%s.webp (256, q85, %s)\n" "$base" "$base" "$note"
done
