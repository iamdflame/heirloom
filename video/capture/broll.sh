#!/usr/bin/env bash
# Trim + grade the stock b-roll towards ink/brass → ~/video-out/broll/. Usage: broll.sh <raw dir>
set -euo pipefail
RAW=${1:-$HOME/stock-dl/raw}
OUT=$HOME/video-out/broll
mkdir -p "$OUT"
# slight desaturation, crushed blacks, warm (brass) mids/highs, cooler-less shadows, soft vignette
GRADE="scale=1920:1080:flags=lanczos,eq=saturation=0.74:contrast=1.07:gamma=0.97,curves=r='0/0 0.08/0.035 0.5/0.53 1/0.98':g='0/0 0.08/0.03 0.5/0.49 1/0.93':b='0/0 0.08/0.03 0.5/0.41 1/0.82',vignette=angle=PI/5,format=yuv420p"
enc() { # src start dur out
  ffmpeg -loglevel error -y -ss "$2" -t "$3" -i "$RAW/$1" -an -vf "$GRADE" \
    -c:v libx264 -preset slow -crf 14 -profile:v high -pix_fmt yuv420p \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -movflags +faststart "$OUT/$4"
}
enc pexels-11965370.mp4 0.4 7.5 BR01-balance-wheel-skeleton.mp4 &
enc pexels-12163205.mp4 0.8 9.0 BR02-balance-wheel-gilt-train.mp4 &
enc mixkit-3652-2160.mp4 4.1 6.0 BR03-movement-through-caseback.mp4 &
wait
ls -la "$OUT"
