# DRAFT (not filed): neatlogs: AGENT/CHAIN-root traces dead-letter (`TRACE_FINALIZATION_FAILED`); `doctor --probe` stuck at `pii_redaction`

**Product / SDK:** neatlogs Python SDK 1.4.26 with `neatlogs[litellm]`; Public API `https://app.neatlogs.com/api/v1/public`. Observed 2026-10-11 on one project (id in the filer's account).

## What we observed

1. **Root kind decides whether a trace finalizes.** From the measured table in [docs/spikes.md](https://github.com/iamdflame/heirloom/blob/e391f81ec676448dfa55d56c9866676f28b6404c/docs/spikes.md) ("L0 follow-up · neatlogs span shapes"):

| Experiment (UTC) | Variant | Result |
|---|---|---|
| exp1 01:06 | WORKFLOW root + TOOL child (string attr) | **finalized**, 2 spans |
| exp1 01:06 | AGENT root (no children / TOOL child / GUARDRAIL child / str, bool+num, empty-string attrs), CHAIN root, `@neatlogs.span(kind="AGENT")` | `dlq` (all 7), 0 spans |
| exp2 01:09 | WORKFLOW root + GUARDRAIL child + AGENT child → TOOL grandchild | never listed (`GET /traces/{id}` 404 after 8 min) |
| exp3 01:21 | 10 WORKFLOW-root variants | after 11 min only 3 listed, all `dlq`; the other 7 not listed |

2. The dead-lettered trace's export returns `409 TRACE_FINALIZATION_FAILED` ("could not be finalized for span projection"); no further reason is exposed.
3. `neatlogs doctor --probe` → `FAIL TRACE_READBACK_TIMEOUT … Ingestion: processing at pii_redaction`.
4. Root GUARDRAIL spans were dropped (never ingested); the SDK's `_ROOT_KINDS` accepts only workflow/chain/agent/mcp_tool/llm. `neatlogs.identify()` has no `parent_session_id` parameter (signature `session_id, end_user_id, end_user_metadata`), although our integration plan expected one for linking CVE sessions to a campaign session.

## Minimal repro

The S4 emitter, which produced observations 2-4's first runs (a GUARDRAIL span never ingested; an AGENT-root trace that stayed at `spansCount` 0 / `dlq`), is committed verbatim as [neatlogs-pii-dlq-emit_s4.py](https://github.com/iamdflame/heirloom/blob/e391f81ec676448dfa55d56c9866676f28b6404c/docs/outreach/neatlogs-pii-dlq-emit_s4.py) (`python emit_s4.py <run-id>`; needs `NEATLOGS_API_KEY`, and `LITELLM_API_KEY` for its one LiteLLM call, which can be deleted). It emits, under an AGENT root, one GUARDRAIL child span with about a dozen small string/bool/int/float attributes. The table in observation 1 came from separate scratch emitters that are not committed. **All attributes are small** (tens of bytes); it is not a large-payload repro. Then:

```
neatlogs trace get <trace-id>          # 404 for minutes, or:
curl -H "Authorization: Bearer $TOKEN" -H "x-project-id: $PROJECT" $BASE/traces   # status "dlq", spansCount 0
neatlogs doctor --probe                 # TRACE_READBACK_TIMEOUT ... processing at pii_redaction
```

## What we do NOT know (so please read these as questions)

- We suspected large attributes (a ~120 KB LiteLLM payload) breaking server-side PII redaction. [hackathon.md](https://github.com/iamdflame/heirloom/blob/e391f81ec676448dfa55d56c9866676f28b6404c/hackathon.md) records that this is **unconfirmed**: with a 16 KB attribute mask, LLM input/output capture off and `pii_span_types` limited to TOOL/GUARDRAIL/CHAIN/WORKFLOW, a 12-span trace finalized, and "the earlier unmasked 100 KB experiment trace also finalized eventually, so the old dead-lettering was at least partly transient on neatlogs' side". So we cannot say payload size causes the stall.
- The repro above has small attributes yet dead-letters under an AGENT root, so the root kind (or the pipeline's state at that time) seems relevant. We have not re-run the exact script after the later successes to separate "transient backend lag" from "AGENT-root bug".

## Asks

1. Is an AGENT/CHAIN root expected to finalize? If so, what does `TRACE_FINALIZATION_FAILED` mean for it, and can the response name the failing stage?
2. Is a queue stuck at `pii_redaction` visible anywhere other than `doctor --probe`?
3. Docs: the `parent_session_id` parameter and root-kind restrictions.
