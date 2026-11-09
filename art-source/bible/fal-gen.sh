#!/bin/zsh
# fal.ai image generation for the Parcelwood art bible.
#
# Key: export FAL_KEY=...   (or put it alone in ~/.config/fal/key)
# Usage:
#   art-source/bible/fal-gen.sh -o out.png -p prompt.txt [-r reference.png] [-m model] [-n 1]
#
# Defaults to the edit endpoint when a reference image is given (keeps the item's identity),
# and the text-to-image endpoint otherwise. The OpenAI models on fal can't return a transparent
# background, so the image is generated on flat white and cut out afterwards with BiRefNet.
set -euo pipefail

out="" prompt_file="" ref="" model="" n=1 size="square_hd" cutout=1
while getopts "o:p:r:m:n:s:k" opt; do
  case $opt in
    o) out=$OPTARG ;;
    p) prompt_file=$OPTARG ;;
    r) ref=$OPTARG ;;
    m) model=$OPTARG ;;
    n) n=$OPTARG ;;
    s) size=$OPTARG ;;
    k) cutout=0 ;;
    *) print -u2 "unknown option -$opt"; exit 2 ;;
  esac
done
[[ -n $out && -n $prompt_file ]] || { print -u2 "need -o and -p"; exit 2; }

key=${FAL_KEY:-}
if [[ -z $key && -f ~/.config/fal/key ]]; then key=$(<~/.config/fal/key); fi
[[ -n $key ]] || { print -u2 "FAL_KEY is not set. export FAL_KEY=... or write it to ~/.config/fal/key"; exit 3; }

if [[ -z $model ]]; then
  [[ -n $ref ]] && model="openai/gpt-image-2/edit" || model="openai/gpt-image-2"
fi

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

python3 - "$prompt_file" "$ref" "$n" "$size" "$model" > "$tmp/body.json" <<'PY'
import base64, json, mimetypes, sys
prompt_file, ref, n, size, model = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4], sys.argv[5]
body = {"prompt": open(prompt_file).read().strip(), "num_images": n,
        "output_format": "png", "quality": "high"}
if ref:
    body["image_urls"] = ["data:%s;base64,%s" % (
        mimetypes.guess_type(ref)[0] or "image/png",
        base64.b64encode(open(ref, "rb").read()).decode())]
if "gpt-image" in model:
    body["image_size"] = size
else:
    body["resolution"] = "2K"
print(json.dumps(body))
PY

print -u2 "→ $model"
curl -sS --max-time 300 -X POST "https://fal.run/$model" \
  -H "Authorization: Key $key" -H "Content-Type: application/json" \
  --data @"$tmp/body.json" -o "$tmp/resp.json" -w "http %{http_code}\n" >&2

url=$(python3 - "$tmp/resp.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
if "images" in d and d["images"]:
    print(d["images"][0]["url"])
else:
    sys.stderr.write(json.dumps(d)[:600] + "\n")
    sys.exit(1)
PY
)

if [[ $cutout -eq 1 ]]; then
  print -u2 "→ fal-ai/birefnet (cutout)"
  python3 - "$url" > "$tmp/cut.json" <<'PY'
import json, sys
print(json.dumps({"image_url": sys.argv[1], "output_format": "png", "refine_foreground": True}))
PY
  curl -sS --max-time 300 -X POST "https://fal.run/fal-ai/birefnet" \
    -H "Authorization: Key $key" -H "Content-Type: application/json" \
    --data @"$tmp/cut.json" -o "$tmp/cut-resp.json" -w "http %{http_code}\n" >&2
  url=$(python3 - "$tmp/cut-resp.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
if "image" in d and d["image"]:
    print(d["image"]["url"])
else:
    sys.stderr.write(json.dumps(d)[:600] + "\n")
    sys.exit(1)
PY
)
fi

curl -sS --max-time 120 "$url" -o "$out"
echo "$out"
magick identify "$out"
