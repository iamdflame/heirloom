#!/usr/bin/env bash
# Polls ~/video-out/captures every 60 s, links what is readable, exits once manifest.json exists.
cd "$(dirname "$0")/.."
while true; do
  echo "== $(date -u +%H:%M:%S)" >> out/poll.log
  node scripts/link-captures.mjs >> out/poll.log 2>&1
  if [ -f "$HOME/video-out/captures/manifest.json" ]; then echo "manifest present" >> out/poll.log; node scripts/link-captures.mjs >> out/poll.log 2>&1; exit 0; fi
  sleep 60
done
