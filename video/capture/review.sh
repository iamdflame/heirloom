#!/usr/bin/env bash
# Contact sheet of a capture at the given times → ~/video-out/review/<ID>.jpg (2 columns). Usage: review.sh ID t1 t2 …
id=$1; shift; i=0; args=(); dir=${DIR:-$HOME/video-out/captures}
mkdir -p ~/video-out/review
for t in "$@"; do ffmpeg -loglevel error -y -ss "$t" -i "$dir/$id.mp4" -frames:v 1 -vf scale=800:-2 /tmp/rv-$id-$i.png && args+=(-i /tmp/rv-$id-$i.png) && i=$((i+1)); done
if [ $i -eq 1 ]; then cp /tmp/rv-$id-0.png ~/video-out/review/$id.jpg; exit; fi
lay=""; for j in $(seq 0 $((i-1))); do c=$((j%2)); r=$((j/2)); x=$([ $c = 0 ] && echo 0 || echo w0); y=0; for k in $(seq 1 $r); do y="${y}+h0"; done; lay="$lay|${x}_${y}"; done
ffmpeg -loglevel error -y "${args[@]}" -filter_complex "$(for j in $(seq 0 $((i-1))); do printf "[$j]"; done)xstack=inputs=$i:layout=${lay:1}:fill=black" ~/video-out/review/$id.jpg
