#!/usr/bin/env bash
# Rebuilds the self-hosted font files in public/fonts (latin subset, OFL).
# Instrument Serif 400 normal + italic (display), Geist variable 400-600 (UI/body), Geist Mono variable 400-500.
set -euo pipefail
cd "$(dirname "$0")/.."
IS=node_modules/@fontsource/instrument-serif/files
GS=node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2
GM=node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2
OUT=public/fonts
rm -f "$OUT"/*.woff2 "$OUT"/LICENSE-*.txt
TMP=$(mktemp -d)
FT="uvx --from fonttools --with brotli"
U="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+00B7,U+2070-209F,U+2191,U+2192,U+2212,U+00D7,U+2713,U+25CB,U+2190,U+2193,U+2197"
for s in normal italic; do
  $FT pyftsubset "$IS/instrument-serif-latin-400-$s.woff2" --unicodes="$U" \
    --layout-features='kern,liga,lnum,tnum,case' --flavor=woff2 --output-file="$OUT/instrument-serif-400-$s.woff2"
done
$FT fonttools varLib.instancer "$GS" wght=400:600 -o "$TMP/g.woff2"
$FT pyftsubset "$TMP/g.woff2" --unicodes="$U" --layout-features='kern,liga,tnum,case,ss01' --flavor=woff2 --output-file="$OUT/geist-wght400-600.woff2"
$FT fonttools varLib.instancer "$GM" wght=400:500 -o "$TMP/gm.woff2"
$FT pyftsubset "$TMP/gm.woff2" --unicodes="$U" --layout-features='kern,tnum,case,zero' --flavor=woff2 --output-file="$OUT/geist-mono-wght400-500.woff2"
cp node_modules/@fontsource/instrument-serif/LICENSE "$OUT/LICENSE-instrument-serif.txt" 2>/dev/null || true
cp node_modules/@fontsource-variable/geist/LICENSE "$OUT/LICENSE-geist.txt" 2>/dev/null || true
ls -la "$OUT"
