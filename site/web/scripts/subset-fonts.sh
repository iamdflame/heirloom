#!/usr/bin/env bash
# Rebuilds the self-hosted font files in public/fonts (latin only, total <= 100 kB).
# Newsreader: the fontsource latin opsz file, subset, then instanced to wght 400-500 (opsz 6-72 kept).
set -euo pipefail
cd "$(dirname "$0")/.."
NR=node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2
PM=node_modules/@fontsource/ibm-plex-mono/files
OUT=public/fonts
TMP=$(mktemp -d)
FT="uvx --from fonttools --with brotli"
$FT pyftsubset "$NR" --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+00B7,U+2070-209F,U+2191,U+2192,U+2212,U+00D7,U+2713,U+25CB" \
  --layout-features='kern,liga,lnum,tnum,onum,pnum,case' --flavor=woff2 --output-file="$TMP/nr.woff2"
$FT fonttools varLib.instancer "$TMP/nr.woff2" wght=400:500 -o "$TMP/nr-i.woff2"
$FT python -c "from fontTools.ttLib import TTFont; f=TTFont('$TMP/nr-i.woff2'); f.flavor='woff2'; f.save('$OUT/newsreader-latin-opsz-wght400-500.woff2')"
for w in 400 500; do
  $FT pyftsubset "$PM/ibm-plex-mono-latin-$w-normal.woff2" \
    --unicodes="U+0020-007E,U+00A0,U+00B7,U+00D7,U+2013,U+2014,U+2019,U+2026,U+207A,U+207B,U+2192,U+2212,U+2713,U+25CB" \
    --layout-features='kern,tnum,case,zero' --flavor=woff2 --output-file="$OUT/ibm-plex-mono-latin-$w.woff2"
done
ls -la "$OUT"
