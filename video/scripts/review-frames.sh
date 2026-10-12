#!/usr/bin/env bash
# 1 frame per 2 s from a master → out/review/f_XXX.jpg, plus 2×3 contact sheets (6 frames each, 960 px tiles).
set -e
src="${1:-$HOME/video-out/master/HeirloomDemo-silent.mp4}"
out="$(dirname "$0")/../out/review"
rm -rf "$out"; mkdir -p "$out"
ffmpeg -v error -i "$src" -vf "fps=1/2,scale=960:540" -q:v 3 "$out/f_%03d.jpg"
n=$(ls "$out"/f_*.jpg | wc -l)
i=0; s=1
while [ $i -lt $n ]; do
  files=(); for k in 0 1 2 3 4 5; do j=$((i+k+1)); f=$(printf "$out/f_%03d.jpg" $j); [ -f "$f" ] && files+=("-i" "$f"); done
  cnt=$((${#files[@]}/2))
  if [ $cnt -eq 6 ]; then
    ffmpeg -v error -y "${files[@]}" -filter_complex "xstack=inputs=6:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h0|w0_h0+h0" "$out/sheet_$(printf %02d $s).jpg"
  fi
  i=$((i+6)); s=$((s+1))
done
echo "$n frames, sheets in $out"
