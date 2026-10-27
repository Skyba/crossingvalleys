#!/usr/bin/env bash
# tools/shots.sh <base-url> <out-dir>: full-page screenshots of the reference pages at 1440 and 390.
base=$1; out=$2; mkdir -p "$out"
pages=("/ home" "/2018/08/27/finally-at-destination/ post" "/portfolio/georgia/ country" "/2018/01/10/pictures-from-turkey/ gallery" "/photography/ photos" "/trip/ trip" "/blog/ blog" "/about-me/ about")
for p in "${pages[@]}"; do
  set -- $p
  node "$(dirname "$0")/shot.mjs" "$base$1" "$out/$2-1440.png" 1440 900 &
  node "$(dirname "$0")/shot.mjs" "$base$1" "$out/$2-390.png" 390 844 &
done
wait
