# server/llm.py
# ---------------------------------------------------------
# Central LLM helpers:
#   - extract_fields_rag_or_llm: for /parse
#   - make_plan_with_llm: for /plan
#
# Uses RAG context from extension.rag.retriever, but keeps
# all structured extraction logic here for easier debugging.
# ---------------------------------------------------------

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from anthropic import Anthropic

# Try to parse dates if available
try:
    from dateutil import parser as dateparser
except Exception:  # pragma: no cover
    dateparser = None  # type: ignore

# .../adhd_start/server
BASE_DIR = Path(__file__).resolve().parent
# repo root .../adhd-scholarship-copilot
ROOT_DIR = BASE_DIR.parent

# Load env from both root and adhd_start
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = os.getenv("ANTHROPIC_MODEL") or "claude-sonnet-4-5-20250929"

client: Optional[Anthropic] = None
if ANTHROPIC_API_KEY:
    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    prefix = (ANTHROPIC_API_KEY[:8] + "...") if len(ANTHROPIC_API_KEY or "") >= 8 else "(short key)"
    print("[llm] Anthropic client initialized; key prefix:", prefix)
    print("[llm] Using Anthropic model:", MODEL)
else:
    print("[llm] No ANTHROPIC_API_KEY found. Using heuristic fallback.")

# -------------------------------------------------------------------
# Fallback plan (used if LLM fails)
# -------------------------------------------------------------------

FALLBACK_PLAN: Dict[str, Any] = {
  "micro_start": "Open the scholarship page and copy the requirements.",
  "step_type": "make_outline",
  "selector": None,
  "placeholder": "Bullet 1: Why I fit…",
  "block_minutes": 20,
  "check_ins": ["T+5", "T+12"],
  "reentry_script": "I paused; I'll just finish copying requirements.",
  "purpose": "Reduce startup friction for this application.",
  "deadline": None,
  "ai_policy": "ok",
}

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

FORBID_PATTERNS = [
    r"no\s+ai[-\s]?generated\s+content",
    r"must\s+be\s+your\s+own\s+work",
    r"generative\s+ai\s+not\s+permitted",
    r"plagiarism|original work only",
]


def normalize_date_like(s: Optional[str]) -> Optional[str]:
    """Try to coerce arbitrary date-like strings into YYYY-MM-DD."""
    if not s:
        return None
    if dateparser is None:
        m = re.search(r"\d{4}-\d{2}-\d{2}", s)
        return m.group(0) if m else s
    try:
        dt = dateparser.parse(s, fuzzy=True)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None


def detect_ai_policy(text: str, extra_context: str = "") -> str:
    hay = (text + "\n" + extra_context).lower()
    return "coach_only" if any(re.search(p, hay) for p in FORBID_PATTERNS) else "ok"


def _coerce_json_from_claude(raw: str) -> Dict[str, Any]:
    """
    Claude often wraps JSON in ```json fences or adds extra prose.
    Strip fences and grab the first {...} block.
    """
    s = raw.strip()

    # Strip ``` / ```json fences if present
    if s.startswith("```"):
        lines = s.splitlines()
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()

    if not s.lstrip().startswith("{"):
        m = re.search(r"\{.*\}", s, flags=re.S)
        if m:
            s = m.group(0)

    return json.loads(s)


# -------------------------------------------------------------------
# User profile helper
# -------------------------------------------------------------------

try:
    from server.user_repo import get_user as _get_user
except Exception:  # pragma: no cover
    _get_user = None  # type: ignore


def _default_user_profile(user_id: str = "demo-user") -> Dict[str, Any]:
    return {
        "user_id": user_id,
        "preferences": {
            "tone": "warm_direct",
            "block_minutes": 20,
            "checkins": ["T+5", "T+12"],
            "coach_only_on_restricted": True,
        },
        "history": {"apps": [], "wins": [], "frictions": []},
        "program": None,
        "interests": [],
        "weights": {"source_penalty": {}, "nudge_success": {}},
    }


def _load_user_profile(user_id: str = "demo-user") -> Dict[str, Any]:
    if _get_user is None:
        return _default_user_profile(user_id)
    try:
        u = _get_user(user_id)
        base = _default_user_profile(user_id)
        for k, v in base.items():
            if k not in u:
                u[k] = v
        return u
    except Exception as e:
        print("[llm] Could not load user profile:", repr(e))
        return _default_user_profile(user_id)


# -------------------------------------------------------------------
# /parse: RAG + structured extraction
# -------------------------------------------------------------------

def extract_fields_rag_or_llm(
    page_text: str,
    user_id: str = "demo-user",
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Use RAG context + Claude to extract:
      - deadline
      - refs_required
      - values
      - ai_policy

    Returns:
      fields: dict
      sources: list[ { source, snippet } ]
    """
    if client is None:
        # Pure heuristic fallback (no API key)
        fields = {
            "deadline": None,
            "refs_required": None,
            "values": [],
            "ai_policy": detect_ai_policy(page_text),
        }
        return fields, []

    # 1) Build RAG context from Chroma (sample pages + user memory)
    context = ""
    sources: List[Dict[str, Any]] = []
    try:
        from extension.rag.retriever import get_context_for_parse  # type: ignore

        context, sources = get_context_for_parse(page_text=page_text, user_id=user_id)
        print("[llm] RAG context length for /parse:", len(context))
    except Exception as e:
        print("[llm] RAG retrieval failed, falling back to page-only:", repr(e))
        context, sources = "", []

    # 2) Single Claude call for JSON extraction (page_text + context)
    SYSTEM = "You are a precise JSON-only parser for scholarship or job application pages."
    SCHEMA = """
Return ONLY valid JSON:
{
  "deadline": string|null,           // YYYY-MM-DD if possible; else null
  "refs_required": number|null,      // number of reference letters required (0,1,2...), or null
  "values": string[],                // e.g., ["creativity", "leadership"]
  "ai_policy": "ok"|"coach_only"     // "coach_only" if the page forbids AI-generated content
}
"""

    prompt = f"""You extract structured fields from THIS PAGE.

Use BOTH:
- PAGE TEXT: the raw text from the current page
- CONTEXT: snippets from similar scholarship/job pages (may include example deadlines & rules)

If you are unsure about any field, use null or an empty list.

PAGE TEXT (truncated):
{page_text[:4000]}

CONTEXT (from related examples, may contain explicit deadlines & requirements):
{context[:4000]}

{SCHEMA}
"""

    try:
        print("[llm] Calling Claude extractor for /parse")
        resp = client.messages.create(
            model=MODEL,
            system=SYSTEM,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text if resp.content else "{}"
        print("[llm] Claude extractor raw JSON (first 200 chars):", raw[:200])
        data = _coerce_json_from_claude(raw)
    except Exception as e:
        print("[llm] Claude extractor error (parse):", repr(e))
        data = {
            "deadline": None,
            "refs_required": None,
            "values": [],
            "ai_policy": "ok",
        }

    # Normalize + sanity check
    data["deadline"] = normalize_date_like(data.get("deadline"))
    if data.get("ai_policy") not in ("ok", "coach_only"):
        data["ai_policy"] = detect_ai_policy(page_text, context)
    data.setdefault("values", [])
    data.setdefault("refs_required", None)

    return data, sources


# -------------------------------------------------------------------
# /plan: micro-plan generation
# -------------------------------------------------------------------

def make_plan_with_llm(
    goal: str,
    text: Optional[str] = None,
    user_id: str = "demo-user",
) -> Dict[str, Any]:
    """
    Calls Claude to generate an ADHD-friendly micro plan.

    - Uses parsed fields from extract_fields_rag_or_llm
    - Uses user profile (tone, block length, history) for personalization
    - Falls back to a static plan on failure
    """
    if client is None:
        return FALLBACK_PLAN

    page_text = text or ""
    user_profile = _load_user_profile(user_id)
    parsed_fields, _sources = extract_fields_rag_or_llm(page_text=page_text, user_id=user_id)

    SYSTEM = (
        "You are an ADHD-friendly START-FIRST coach. "
        "You create tiny, low-friction first steps and simple micro-plans "
        "that help someone get unstuck with scholarship or job applications."
    )

    schema_block = """
Return ONLY valid JSON matching this schema:
{
  "micro_start": string,
  "step_type": "focus_input"|"click_selector"|"make_outline"|"open_url",
  "selector": string|null,
  "placeholder": string|null,
  "block_minutes": number,
  "check_ins": [string, ...],
  "reentry_script": string,
  "purpose": string,
  "deadline": string|null,
  "ai_policy": "ok"|"coach_only"
}
"""

    user_msg = f"""
Goal:
{goal}

Page text (truncated):
{page_text[:4000]}

Parsed fields from /parse:
{json.dumps(parsed_fields, ensure_ascii=False)}

User profile:
{json.dumps(user_profile, ensure_ascii=False)}

Instructions:
- Design a micro-plan that is extremely easy to start.
- Prefer a 15–25 minute time block unless the user profile says otherwise.
- Make the micro_start concrete and action-oriented.
- If ai_policy is "coach_only", assume the user writes content; you only guide.

{schema_block}
"""

    try:
        resp = client.messages.create(
            model=MODEL,
            system=SYSTEM,
            max_tokens=600,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw = resp.content[0].text if resp.content else "{}"
        print("[llm] Claude plan raw JSON (first 200 chars):", raw[:200])
        data = _coerce_json_from_claude(raw)
    except Exception as e:
        print("[llm] Claude plan error:", repr(e))
        return FALLBACK_PLAN

    # Merge with fallback & parsed fields
    out: Dict[str, Any] = dict(FALLBACK_PLAN)
    for k in FALLBACK_PLAN:
        if k in data and data[k] is not None:
            out[k] = data[k]

    # Deadline: prefer plan's own; else parsed
    out["deadline"] = normalize_date_like(
        data.get("deadline") or parsed_fields.get("deadline")
    )

    # ai_policy: prefer explicit, else parsed, else "ok"
    if data.get("ai_policy") in ("ok", "coach_only"):
        out["ai_policy"] = data["ai_policy"]
    else:
        out["ai_policy"] = parsed_fields.get("ai_policy", "ok")

    # Ensure non-empty check_ins
    if not out.get("check_ins"):
        out["check_ins"] = FALLBACK_PLAN["check_ins"]

    return out
