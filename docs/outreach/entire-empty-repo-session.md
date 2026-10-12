# DRAFT (not filed): Entire: a Claude Code session started before the repo's first commit is never tracked ("failed to get HEAD")

**Version:** Entire CLI 0.11.4 (go1.27.1, linux/amd64); Claude Code 2.1.296; agent `claude-code`.

## Problem

If `entire enable` is run in a repository with **no commits** and a Claude session is run there, the session is silently untracked: `entire session list` says "No sessions.", and the only trace is a WARN line in `.entire/logs/entire.log`. The only hint at enable time is a note ("Session checkpoints require at least one commit…"); a session that starts afterwards is still lost even after the first commit is made later, because the session's state was never created.

We hit this for real during a hackathon build: our first build session started in an empty repo, so its commits carry no `Entire-Checkpoint` trailer ([hackathon.md](https://github.com/iamdflame/heirloom/blob/e391f81ec676448dfa55d56c9866676f28b6404c/hackathon.md), "No Entire trailers for this build session"); it had to be recovered with `entire session attach`.

## Repro (run on 2026-10-12 in a scratch directory)

```
D=$(mktemp -d); cd $D && git init
entire enable --agent claude-code --yes --local --telemetry=false
#   Note: Session checkpoints require at least one commit. To get started,
#   commit the configuration files (e.g. .entire/, .claude/).
claude -p "Reply with the single word ok." --max-turns 1     # prints: ok
entire session list                                           # -> No sessions.
```

`.entire/logs/entire.log` then contains (session id 28805e48-…):

```
{"time":"2026-10-12T01:35:06.78331422Z","level":"WARN","msg":"failed to initialize session state","session_id":"28805e48-9348-4af4-b0e3-1f64934e5e13","component":"lifecycle","agent":"claude-code","error":"failed to initialize session: failed to get HEAD: reference not found"}
```

Control, same directory: after `git add -A && git commit -m init`, the same `claude -p` run is tracked: `entire session list` shows session `57cf2ba3-…` ("ended"), and the log has `session-end` / `phase transition` INFO lines.

## Expected / suggestions

- Either initialise session state without requiring HEAD (e.g. create the session on the first commit with the pending prompt), or make `entire status` / `entire session current` say the session is untracked and why. Today, `entire session current` inside the untracked session reports: "…running inside Claude Code session … but Entire has no session state for it. Entire may not be enabled here, its hooks may not have run yet, or this session's first turn has not completed", which does not point at the missing commit.
- Surface the WARN at `entire enable` / on the first prompt instead of only in the log file.
- Docs: state the "at least one commit before the first session" requirement next to `entire enable`.

## Not tested

Interactive Claude Code sessions (we ran `claude -p`); other agents; whether `entire session attach` was run on this scratch session (it was recovered that way in our real project).
