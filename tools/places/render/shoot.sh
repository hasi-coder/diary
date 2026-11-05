#!/bin/zsh
# Renders frames of an animation with the real world code, and saves them as PNGs.
#
#   tools/places/render/shoot.sh care-haircut 8,20 1 [size] [out dir] [debug 0|1]
#
# debug=1 draws each plant target as a red cross and a magenta line from the hand to it, and the printed
# lines give how far each hand ended from its target.
#
# Starts a dev server on :5199 and a headless Chrome of its own (it closes only those), then extracts the
# frames Chrome dumps from the page. Needs Google Chrome. Output defaults to tmp/renders/.
ID=$1; BEATS=${2:-8}; ROT=${3:-1}; SIZE=${4:-2.2}; OUT=${5:-tmp/renders}; DEBUG=${6:-0}
mkdir -p "$OUT"
npx vite --config tools/places/render/vite.config.ts > /tmp/render-vite.log 2>&1 &
VITE=$!
sleep 4
rm -rf /tmp/render-profile
HTML="$OUT/dump_$ID.html"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --user-data-dir=/tmp/render-profile --window-size=800,600 --virtual-time-budget=120000 --dump-dom \
  "http://localhost:5199/tools/places/render/harness.html?id=$ID&beats=$BEATS&rot=$ROT&size=$SIZE&debug=$DEBUG" > "$HTML" 2>/dev/null
kill $VITE 2>/dev/null
python3 - "$HTML" "$OUT" <<'PY'
import re, sys, base64
html = open(sys.argv[1], errors="replace").read()
for m in re.finditer(r'<pre class="shot" data-name="([^"]+)">data:image/png;base64,([^<]+)</pre>', html):
    open(f"{sys.argv[2]}/{m.group(1)}.png", "wb").write(base64.b64decode(m.group(2)))
    print("wrote", f"{sys.argv[2]}/{m.group(1)}.png")
g = re.search(r'<pre id="gaps">([^<]*)</pre>', html)
e = re.search(r'<pre id="error">([^<]*)</pre>', html)
print(g.group(1) if g else "")
print("ERROR:", e.group(1)[:600] if e else "none")
PY
rm -f "$HTML"
