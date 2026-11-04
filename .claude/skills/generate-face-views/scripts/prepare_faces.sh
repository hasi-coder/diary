#!/usr/bin/env bash
# Make the four face views in a folder square 512x512 PNGs, in place.
#
#   bash prepare_faces.sh ~/MyDiaryFaces/<name>
#
# Expects front.png, left.png, right.png and back.png. Uses macOS sips: scales
# the long side to 512, then pads to a square.
set -euo pipefail

dir="${1:?usage: prepare_faces.sh <folder>}"
missing=0
for view in front left right back; do
  [[ -f "$dir/$view.png" ]] || { echo "missing: $dir/$view.png" >&2; missing=1; }
done
(( missing == 0 )) || exit 1

for view in front left right back; do
  f="$dir/$view.png"
  sips -s format png -Z 512 "$f" --out "$f" >/dev/null
  sips -p 512 512 "$f" --out "$f" >/dev/null
  echo "$f: $(sips -g pixelWidth -g pixelHeight "$f" | awk '/pixel/ {printf "%s ", $2}')"
done
