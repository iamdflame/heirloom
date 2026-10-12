"""Spike S4: emit one matching + one non-matching 'calibrate' span, plus one LiteLLM call."""
import os, sys, time
from dotenv import load_dotenv

load_dotenv("/home/ubuntu/heirloom/.env")
import neatlogs  # noqa: E402

RUN = sys.argv[1]
neatlogs.init(api_key=os.environ["NEATLOGS_API_KEY"], workflow_name="heirloom",
              instrumentations=["litellm"], tags=["spike-s4", f"run-{RUN}"])
import litellm  # noqa: E402  (must come after neatlogs.init)

ATTRS = dict(line="4.2", stage="calibrate", reach=True, reason="", tests_edited_after_red=False,
             claims_unlinked=0, cost_usd=0.0)

def calibrate_span(cve, verdict, calibrated, claim):
    with neatlogs.trace(f"cve-{cve}", kind="AGENT"), neatlogs.trace("calibrate", kind="GUARDRAIL") as span:
        span.set_attribute("heirloom.cve", cve)
        span.set_attribute("heirloom.verdict", verdict)
        span.set_attribute("heirloom.calibrated", calibrated)
        span.set_attribute("heirloom.claim_id", claim)
        for k, v in ATTRS.items():
            span.set_attribute(f"heirloom.{k}", v)
        ctx = span.get_span_context() if hasattr(span, "get_span_context") else None
        return format(ctx.trace_id, "032x") if ctx else None, format(ctx.span_id, "016x") if ctx else None

try:
    with neatlogs.identify(session_id=f"campaign-s4-{RUN}"):
        with neatlogs.identify(session_id=f"cve-CVE-SPIKE-MATCH-{RUN}"):
            print("match   ", calibrate_span("CVE-SPIKE-MATCH", "NOT_AFFECTED_PROVEN", False, "c-match"))
        with neatlogs.identify(session_id=f"cve-CVE-SPIKE-CLEAN-{RUN}"):
            print("nomatch ", calibrate_span("CVE-SPIKE-CLEAN", "AFFECTED", True, "c-clean"))
            r = litellm.completion(model="openai/claude-haiku", api_base="https://litellm.vision.aivar.app/v1",
                                   api_key=os.environ["LITELLM_API_KEY"], max_tokens=5,
                                   messages=[{"role": "user", "content": "Say ok."}])
            print("litellm ", r.choices[0].message.content, r.usage.total_tokens)
finally:
    print("flush", neatlogs.flush())
    neatlogs.shutdown()
