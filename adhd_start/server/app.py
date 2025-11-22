# server/app.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Literal, Dict, Any
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from server.schemas import (
    PlanIn, PlanOut, ParseIn, ParseOut,
    BookmarkIn, BookmarkOut, BookmarkStatusIn,
    EligibilityIn, EligibilityOut,
)

from server.llm import extract_fields_rag_or_llm, make_plan_with_llm



from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query

from .scholarship_models import Scholarship
from .scholarship_repo import scholarship_repo


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
    
    
@app.post("/bookmark", response_model=BookmarkOut)
def add_or_update_bookmark(payload: BookmarkIn):
    """Create/update a bookmark entry (de-dupes by URL per user)."""
    from server.user_repo import upsert_bookmark  # type: ignore
    bm = upsert_bookmark(
        user_id=payload.user_id,
        url=payload.url,
        title=payload.title,
        source_site=payload.source_site,
        deadline=payload.deadline,
        tags=payload.tags,
    )
    return BookmarkOut(**bm)

@app.get("/bookmarks", response_model=List[BookmarkOut])
def get_bookmarks(user_id: str = "demo-user"):
    """List bookmarks for a user."""
    from server.user_repo import list_bookmarks  # type: ignore
    items = list_bookmarks(user_id)
    return [BookmarkOut(**it) for it in items]

@app.post("/bookmark/status", response_model=BookmarkOut)
def update_bookmark_status(payload: BookmarkStatusIn):
    """Update only the status of a bookmark."""
    from server.user_repo import set_bookmark_status  # type: ignore
    bm = set_bookmark_status(payload.user_id, payload.id, payload.status)
    return BookmarkOut(**bm)

# List scholarships with optional filters
@app.get("/scholarships", response_model=List[Scholarship])
def list_scholarships(
    q: Optional[str] = Query(default=None, description="Full-text search query"),
    source_site: Optional[str] = Query(default=None, description="Filter by source site"),
    level_of_study: Optional[str] = Query(default=None, description="Filter by level of study"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """
    Return a list of scholarships from your curated JSON file.
    """
    return scholarship_repo.list(
        q=q,
        source_site=source_site,
        level_of_study=level_of_study,
        limit=limit,
        offset=offset,
    )


# Get full details for a single scholarship
@app.get("/scholarships/{scholarship_id}", response_model=Scholarship)
def get_scholarship(scholarship_id: str):
    """
    Get details (including winner stories) for a single scholarship.
    """
    sch = scholarship_repo.get(scholarship_id)
    if not sch:
        raise HTTPException(status_code=404, detail="Scholarship not found")
    return sch

@app.post("/eligibility", response_model=EligibilityOut)
def check_eligibility(payload: EligibilityIn) -> EligibilityOut:
    """
    Simple rule-based eligibility check using the scholarship page text
    and the user's profile from the extension.

    It returns:
      - eligible: True/False
      - reasons: explanation for the decision
      - missing_info: things the profile is missing / unclear
    """
    text = (payload.text or "").lower()
    profile = payload.profile or {}

    reasons: list[str] = []
    missing: list[str] = []
    eligible = True

    # ---- Normalize profile fields ----
    program = (profile.get("program") or "").strip().lower()
    country = (profile.get("country") or "").strip().lower()
    province = (profile.get("province") or "").strip().lower()

    citizen_flag = bool(profile.get("citizen"))      # checkbox in profile.html
    pr_flag = bool(profile.get("pr"))
    other_status = bool(profile.get("otherStatus"))

    # If they say country = Canada and not "other / international",
    # treat them as Canadian-ish even if the checkbox is missing.
    is_canadian_country = country == "canada"
    has_canadian_status = citizen_flag or pr_flag or (is_canadian_country and not other_status)

    # ---- Citizenship requirements ----
    if "canadian citizen" in text or "citizen of canada" in text:
        # If we have *no* information at all, treat as missing instead of hard fail
        if not citizen_flag and not pr_flag and not is_canadian_country:
            missing.append(
                "Scholarship requires Canadian citizenship, but your profile citizenship section looks empty."
            )
        elif not has_canadian_status:
            eligible = False
            reasons.append(
                "Scholarship requires Canadian citizenship, and your profile does not show that."
            )

    # ---- PR or citizen requirements ----
    if "permanent resident" in text or "permanent resident of canada" in text:
        if not (pr_flag or citizen_flag or is_canadian_country):
            if not pr_flag:
                missing.append(
                    "Scholarship mentions Canadian permanent residents; your PR checkbox is not ticked."
                )
            else:
                eligible = False
                reasons.append(
                    "Scholarship requires Canadian PR or citizenship, which your profile does not show."
                )

    # ---- Engineering student requirement (very rough heuristic) ----
    if "engineering" in text and "student" in text:
        if not program:
            missing.append(
                "Scholarship appears to be for engineering students; your program field is empty."
            )
        elif "engineer" not in program and "eng" not in program:
            eligible = False
            reasons.append(
                f"Scholarship appears to be for engineering students, but your program is '{profile.get('program') or 'not set'}'."
            )

    # ---- Studying in Canada requirement ----
    if (
        "post-secondary institution in canada" in text
        or "university in canada" in text
        or "canadian institution" in text
        or "canadian university" in text
        or "in canada" in text
    ):
        if not country and not province:
            missing.append(
                "Scholarship mentions studying in Canada, but your country/province are not set in your profile."
            )
        elif "canada" not in country:
            eligible = False
            reasons.append(
                "Scholarship requires studying in Canada, but your profile country is not Canada."
            )

    # ---- Undergrad hint ----
    if "undergraduate" in text or "undergrad" in text:
        missing.append(
            "Scholarship mentions undergraduates; make sure you are currently in an undergraduate program."
        )

    # If nothing obviously wrong, add a gentle positive reason
    if eligible and not reasons:
        reasons.append(
            "No conflicting requirements detected based on your profile and this page text."
        )

    return EligibilityOut(
        eligible=eligible,
        reasons=reasons,
        missing_info=missing,
    )