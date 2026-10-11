# Heirloom: hackathon log

## Project

Heirloom is an agent that keeps end-of-life software patched. It backports new upstream security fixes to old release lines that distributions still ship, proves which lines are actually vulnerable, adapts and verifies the fix, and asks a person only when it can't prove something. First target: Django 4.2 (EOL 2026-04-07).

## Team

- Dflame (@iamdflame)

## Stack

- Python 3.12, uv, Typer, FastAPI
- LiteLLM (model gateway), headless Claude Code (adapter)
- neatlogs (agent observability, detections)
- Entire (agent sessions as git checkpoints)
- PostGIS in Docker (GIS tests)

## Build log

## Demo

## Known limitations and next steps

## Submission
