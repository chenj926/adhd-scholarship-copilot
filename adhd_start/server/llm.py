# server/llm.py

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from anthropic import Anthropic

# Try to parse dates if dateutil is available
try:
    from dateutil import parser as dateparser
except Exception:  # pragma: no cover
    dateparser = None  # type: ignore

# -------------------------------------------------------------------
# Environment & client setup
# -------------------------------------------------------------------

# .../adhd_start/server
BASE_DIR = Path(__file__).resolve().parent
# repo root .../adhd-scholarship-copilot
ROOT_DIR = BASE_DIR.parent

# Load .env from both repo root and adhd_start for robustness
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
# Fallback plan used if LLM fails
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

def normalize_date_like(s: Optional[str]) -> Optional[str]:
    """Try to coerce arbitrary date-like strings into YYYY-MM-DD."""
    if not s:
        return None
    if dateparser is None:
        # Best-effort: look for a YYYY-MM-DD pattern
        m = re.search(r"\d{4}-\d{2}-\d{2}", s)
        return m.group(0) if m else s
    try:
        dt = dateparser.parse(s, fuzzy=True)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None


FORBID_PATTERNS = [
    r"no\s+ai[-\s]?generated\s+content",
    r"must\s+be\s+your\s+own\s+work",
    r"generative\s+ai\s+not\s+permitted",
    r"plagiarism|original work only",
]


def detect_ai_policy(text: str, extra_context: str = "") -> str:
    """Very simple heuristic detector for AI restrictions."""
    hay = (text + "\n" + extra_context).lower()
    return "coach_only" if any(re.search(p, hay) for p in FORBID_PATTERNS) else "ok"


def _coerce_json_from_claude(raw: str) -> Dict[str, Any]:
    """
    Claude sometimes wraps JSON in ```json fences or adds prose.
    Strip fences and pick the first {...} block.
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

    # If still not starting with '{', try to grab the first JSON object
    if not s.lstrip().startswith("{"):
        m = re.search(r"\{.*\}", s, flags=re.S)
        if m:
            s = m.group(0)

    return json.loads(s)


# -------------------------------------------------------------------
# User profile loader
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
# Field extraction (Parse endpoint)
# -------------------------------------------------------------------

def _extract_fields_direct(page_text: str) -> Dict[str, Any]:
    """
    Call Claude directly (no RAG) to extract deadline, refs, values, ai_policy.
    """
    if client is None:
        return {
            "deadline": None,
            "refs_required": None,
            "values": [],
            "ai_policy": detect_ai_policy(page_text),
        }

    SYSTEM = "You are a precise JSON-only parser for scholarship or job pages."
    SCHEMA = """
Return ONLY valid JSON:
{
  "deadline": string|null,           // YYYY-MM-DD if possible; else null
  "refs_required": number|null,      // integer number of reference letters required, or null
  "values": string[],                // e.g., ["creativity", "leadership"]
  "ai_policy": "ok"|"coach_only"     // "coach_only" if the page forbids AI-generated content
}
"""
    prompt = f"""You extract structured fields from THIS PAGE.
If you are unsure about a field, use null or an empty list.
No extra commentary, only JSON.

PAGE TEXT (truncated):
{page_text[:4000]}

{SCHEMA}
"""

    try:
        print("[llm] Calling Claude direct extractor for /parse")
        resp = client.messages.create(
            model=MODEL,
            system=SYSTEM,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text if resp.content else "{}"
        print("[llm] Claude direct extractor raw JSON (first 200 chars):", raw[:200])
        data = _coerce_json_from_claude(raw)
    except Exception as e:
        print("[llm] Claude direct extractor error:", repr(e))
        data = {
            "deadline": None,
            "refs_required": None,
            "values": [],
            "ai_policy": "ok",
        }

    data["deadline"] = normalize_date_like(data.get("deadline"))
    if data.get("ai_policy") not in ("ok", "coach_only"):
        data["ai_policy"] = detect_ai_policy(page_text)
    data.setdefault("values", [])
    data.setdefault("refs_required", None)
    return data


def extract_fields_rag_or_llm(
    page_text: str, user_id: str = "demo-user"
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Try RAG-based extraction (extension.rag.retriever.extract_fields_with_llm).
    If that fails, fall back to direct Claude.
    Always returns (fields_dict, sources_list).
    """
    # If no client at all, skip RAG entirely
    if client is None:
        fields = {
            "deadline": None,
            "refs_required": None,
            "values": [],
            "ai_policy": detect_ai_policy(page_text),
        }
        return fields, []

    # First try RAG
    try:
        from extension.rag.retriever import extract_fields_with_llm as rag_extract  # type: ignore

        print("[llm] Using RAG extractor for /parse")
        fields, sources = rag_extract(client, user_id, page_text)
        fields["deadline"] = normalize_date_like(fields.get("deadline"))
        if fields.get("ai_policy") not in ("ok", "coach_only"):
            fields["ai_policy"] = detect_ai_policy(page_text)
        fields.setdefault("values", [])
        fields.setdefault("refs_required", None)
        return fields, sources
    except Exception as e:
        print("[llm] RAG extractor failed, falling back to direct Claude:", repr(e))

    # If RAG import / call failed, use direct extractor (no sources)
    fields = _extract_fields_direct(page_text)
    return fields, []


# -------------------------------------------------------------------
# Plan generation (Plan endpoint)
# -------------------------------------------------------------------

def make_plan_with_llm(
    goal: str, text: Optional[str] = None, user_id: str = "demo-user"
) -> Dict[str, Any]:
    """
    Calls Claude to generate an ADHD-friendly micro plan.
    Returns a dict shaped like PlanOut.
    Falls back to a static plan if anything goes wrong or no API key.
    """
    # no key or no client → fallback
    if client is None:
        return FALLBACK_PLAN

    page_text = text or ""
    user_profile = _load_user_profile(user_id)
    parsed_fields, _ = extract_fields_rag_or_llm(page_text=page_text, user_id=user_id)

    SYSTEM = (
        "You are an ADHD-friendly START-FIRST coach. "
        "You create tiny, low-friction first steps and simple micro-plans that "
        "help someone get unstuck with applications or writing tasks."
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
- Prefer a 15–25 minute time block.
- Make the micro_start concrete and action-oriented.
- If ai_policy is "coach_only", allow the user to draft themselves and you only guide.

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

    # Ensure all keys exist; fill defaults where missing
    out: Dict[str, Any] = dict(FALLBACK_PLAN)
    out.update({k: data.get(k, v) for k, v in FALLBACK_PLAN.items()})
    out["deadline"] = normalize_date_like(
        data.get("deadline") or parsed_fields.get("deadline")
    )
    if data.get("ai_policy") in ("ok", "coach_only"):
        out["ai_policy"] = data["ai_policy"]
    else:
        out["ai_policy"] = parsed_fields.get("ai_policy", "ok")

    # Make sure check_ins is a non-empty list
    if not out.get("check_ins"):
        out["check_ins"] = FALLBACK_PLAN["check_ins"]

    return out
