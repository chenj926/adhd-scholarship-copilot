# server/app.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Literal, Dict, Any

# use our schemas (assumes these exist in server/schemas.py)
from server.schemas import PlanIn, PlanOut, ParseIn, ParseOut

# LLM helpers we already wired up
from server.llm import extract_fields_rag_or_llm, make_plan_with_llm

app = FastAPI()

# allow calls from your chrome extension / localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # fine for hackathon
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    from datetime import datetime
    return {"ok": True, "ts": datetime.now().isoformat()}

@app.post("/parse", response_model=ParseOut)
def parse_fields(payload: ParseIn):
    """
    Extract {deadline, refs_required, values, ai_policy} from the page text.
    Uses RAG if available (server/rag/retriever.extract_fields_with_llm),
    otherwise falls back to a direct LLM extractor.
    """
    fields, sources = extract_fields_rag_or_llm(page_text=payload.text, user_id=payload.user_id)
    found = sum(1 for k in ("deadline","refs_required","values") if fields.get(k))
    confidence = min(0.5 + 0.15*found, 0.98)
    
    return ParseOut(
        deadline=fields.get("deadline"),
        refs_required=fields.get("refs_required"),
        values=fields.get("values") or [],
        ai_policy=fields.get("ai_policy", "ok"),
        # If your ParseOut DOES include these two extra fields, enable them:
        confidence=min(0.5 + 0.15 * sum(1 for k in ("deadline","refs_required","values") if fields.get(k)), 0.98),
        sources=sources[:3],
    )


@app.post("/plan", response_model=PlanOut)
def make_plan(payload: PlanIn):
    """
    Return the Start-First plan schema that the extension expects:
      micro_start, step_type, selector/placeholder, block_minutes, check_ins,
      reentry_script, purpose, deadline (merged from parse), ai_policy
    """
    # call Claude to make an ADHD-friendly plan
    plan_dict = make_plan_with_llm(
        goal=payload.goal,
        text=payload.text or "",
        user_id=getattr(payload, "user_id", "demo-user"),
    )
    # make sure it matches the schema
    return PlanOut(**plan_dict)

class FeedbackIn(BaseModel):
    user_id: str = "demo-user"
    plan_id: Optional[str] = None
    rating: Optional[int] = None
    reasons: List[str] = []
    nudge_result: Dict[str, str] = {}
    bad_sources: List[str] = []

@app.post("/feedback")
def feedback(payload: FeedbackIn):
    """
    Adapt tone, penalize bad sources, and record nudge outcomes.
    This is no-op safe if user_repo is not present.
    """
    try:
        from server.user_repo import get_user, save_user  # type: ignore

        u = get_user(payload.user_id)

        # tone tweak
        if "too_long" in payload.reasons:
            u["preferences"]["tone"] = "brief_bullets"

        # source penalties
        pen = u["weights"].setdefault("source_penalty", {})
        for s in payload.bad_sources:
            pen[s] = pen.get(s, 1.0) * 0.7

        # check-in outcomes (Beta-Bernoulli style counts)
        ns = u["weights"].setdefault("nudge_success", {})
        for k, outcome in payload.nudge_result.items():
            stats = ns.setdefault(k, {"success": 0, "fail": 0})
            stats[outcome] = stats.get(outcome, 0) + 1

        save_user(u)
        return {"ok": True, "adapted": True}

    except Exception:
        # if user_repo isn't wired yet, don't crash the demo
        return {"ok": True, "adapted": False}