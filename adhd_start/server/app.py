# server/app.py
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import (  # type: ignore 
    ParseIn,
    ParseOut,
    PlanIn,
    PlanOut,
    WorkflowIn,
    WorkflowOut,
    FeedbackIn,
    BookmarkIn,
    BookmarkOut,
    BookmarkStatusIn,
    EligibilityIn,
    EligibilityOut,
)
from .llm import (  # type: ignore
    extract_fields_rag_or_llm,
    make_plan_with_llm,
    make_workflow_with_llm,
)
from .user_repo import (  # type: ignore 
    list_bookmarks,
    upsert_bookmark,
    set_bookmark_status,
)
from .scholarship_repo import scholarship_repo  # type: ignore 

import json
from datetime import datetime

from pathlib import Path
from dotenv import load_dotenv

# Load .env from the project root (adhd_start)
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

# Optional user‑RAG ingest
try:
    from extension.rag.ingest_user import (  # type: ignore
        upsert_user_text as _rag_upsert_user_text,
    )
except Exception as exc:  # pragma: no cover
    print("[app] user RAG ingest disabled:", exc)
    _rag_upsert_user_text = None  # type: ignore

app = FastAPI(title="ADHD Copilot Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STORE_DIR = BASE_DIR / "store"
STORE_DIR.mkdir(exist_ok=True)
FEEDBACK_FILE = STORE_DIR / "feedback.jsonl"


def _append_jsonl(path: Path, record: Dict[str, Any]) -> None:
    try:
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:  # pragma: no cover
        print("[store] append_jsonl error:", exc)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "ts": datetime.utcnow().isoformat()}


# ---------------------------------------------------------------------------
# /parse
# ---------------------------------------------------------------------------


@app.post("/parse", response_model=ParseOut)
def parse_fields(payload: ParseIn) -> ParseOut:
    fields, sources = extract_fields_rag_or_llm(
        page_text=payload.text,
        user_id=payload.user_id,
    )

    found = sum(1 for k in ("deadline", "refs_required", "values") if fields.get(k))
    confidence = min(0.5 + 0.15 * found, 0.98)

    return ParseOut(
        deadline=fields.get("deadline"),
        refs_required=fields.get("refs_required"),
        values=fields.get("values") or [],
        ai_policy=fields.get("ai_policy", "ok"),
        confidence=confidence,
        sources=(sources or [])[:5],
    )


# ---------------------------------------------------------------------------
# /plan – popup micro‑start
# ---------------------------------------------------------------------------


@app.post("/plan", response_model=PlanOut)
def plan(payload: PlanIn) -> PlanOut:
    plan_dict = make_plan_with_llm(
        goal=payload.goal,
        text=payload.text or "",
        user_id=payload.user_id,
    )
    return PlanOut(**plan_dict)


# ---------------------------------------------------------------------------
# /workflow – overlay micro‑start (Steps 1–4)
# ---------------------------------------------------------------------------


@app.post("/workflow", response_model=WorkflowOut)
def workflow(payload: WorkflowIn) -> WorkflowOut:
    wf_dict = make_workflow_with_llm(
        goal=payload.goal,
        text=payload.raw_text or "",
        user_id=payload.user_id,
        page_url=payload.page_url,
    )
    return WorkflowOut(**wf_dict)


# ---------------------------------------------------------------------------
# /feedback – from overlay step 4
# ---------------------------------------------------------------------------


@app.post("/feedback")
def feedback(payload: FeedbackIn) -> Dict[str, Any]:
    record = payload.model_dump()
    record["timestamp"] = datetime.utcnow().isoformat()
    _append_jsonl(FEEDBACK_FILE, record)

    # Optional: store positive rounds as text in per‑user RAG
    if _rag_upsert_user_text and payload.rating and payload.rating >= 3:
        try:
            reasons = ", ".join(payload.reasons or [])
            nr = payload.nudge_result or {}
            micro_tasks = nr.get("micro_tasks") or []
            used = nr.get("block_minutes_used")

            note = (
                "Focus round feedback\n"
                f"Rating: {payload.rating}\n"
                f"Reasons: {reasons}\n"
                f"Comment: {payload.comment or ''}\n"
                f"Minutes used: {used}\n"
                f"Micro‑tasks: {', '.join(map(str, micro_tasks))}\n"
            )
            _rag_upsert_user_text(
                payload.user_id,
                note,
                tag="feedback_good_round",
            )
        except Exception as exc:  # pragma: no cover
            print("[feedback] user RAG ingest failed:", exc)

    return {"ok": True}


# ---------------------------------------------------------------------------
# Eligibility – simple stub for now
# ---------------------------------------------------------------------------


@app.post("/eligibility", response_model=EligibilityOut)
def eligibility(payload: EligibilityIn) -> EligibilityOut:
    # You can make this smarter later; for now it's just a hint.
    return EligibilityOut(
        eligible=True,
        reasons=[
            "Eligibility check is not fully implemented yet; "
            "use Scan + your own judgment.",
        ],
        missing_info=[],
    )


# ---------------------------------------------------------------------------
# Bookmarks – use user_repo
# ---------------------------------------------------------------------------


@app.post("/bookmark", response_model=BookmarkOut)
def bookmark(payload: BookmarkIn) -> BookmarkOut:
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
def bookmarks(user_id: str = "demo-user") -> List[BookmarkOut]:
    items = list_bookmarks(user_id)
    return [BookmarkOut(**bm) for bm in items]


@app.post("/bookmark/status", response_model=BookmarkOut)
def bookmark_status(payload: BookmarkStatusIn) -> BookmarkOut:
    try:
        bm = set_bookmark_status(payload.user_id, payload.id, payload.status)
    except ValueError:
        raise HTTPException(status_code=404, detail="bookmark_not_found")
    return BookmarkOut(**bm)


# ---------------------------------------------------------------------------
# Scholarship library
# ---------------------------------------------------------------------------


@app.get("/scholarships")
def scholarships(q: str = "") -> List[Dict[str, Any]]:
    items = scholarship_repo.list(q=q or None)
    return [s.model_dump() for s in items]
