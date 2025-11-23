# server/llm.py
# ---------------------------------------------------------
# Unified LLM module for ADHD Copilot backend.
#
# Combines:
# - RAG-based /parse + micro-plan (/plan) for popup
# - Firecrawl + Claude workflow for overlay "AI Micro Start"
#
# Public helpers used by routes:
#   - make_workflow_with_llm(goal, text, user_id, page_url=None)
#   - extract_fields_rag_or_llm(page_text, user_id="demo-user")
#   - make_plan_with_llm(goal, text=None, user_id="demo-user")
# ---------------------------------------------------------

import json
import os
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from anthropic import Anthropic

# Try to parse dates if available (for deadlines)
try:
    from dateutil import parser as dateparser
except Exception:  # pragma: no cover
    dateparser = None  # type: ignore

# .../adhd_start/server
BASE_DIR = Path(__file__).resolve().parent
# repo root .../adhd-scholarship-copilot
ROOT_DIR = BASE_DIR.parent

# Load ENV from both root and adhd_start, plus generic .env
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env")
load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = os.getenv("ANTHROPIC_MODEL") or "claude-sonnet-4-5-20250929"

client: Optional[Anthropic] = None
if ANTHROPIC_API_KEY:
    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    prefix = (
        ANTHROPIC_API_KEY[:8] + "..."
        if len(ANTHROPIC_API_KEY or "") >= 8
        else "(short key)"
    )
    print("[llm] Anthropic client initialized; key prefix:", prefix)
    print("[llm] Using Anthropic model:", MODEL)
else:
    print("[llm] No ANTHROPIC_API_KEY found. Using heuristic fallbacks.")

# Backwards-compat alias name some code may expect
claude = client

# -------------------------------------------------------------------
# Firecrawl imports (overlay / AI Micro Start)
# -------------------------------------------------------------------

try:  # pragma: no cover - Firecrawl optional in some dev envs
    from .firecrawl_client import scrape_page_markdown, FirecrawlError
except Exception:  # pragma: no cover
    scrape_page_markdown = None  # type: ignore

    class FirecrawlError(Exception):
        pass


# -------------------------------------------------------------------
# Shared helpers
# -------------------------------------------------------------------

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

    return json.loads(s or "{}")


def _call_claude_json(
    system_prompt: str,
    user_text: str,
    max_tokens: int = 1024,
    temperature: float = 0.3,
) -> Dict[str, Any]:
    """
    Generic helper to call Claude and parse a JSON-ish response.
    Used mainly by make_workflow_with_llm.
    """
    if client is None:
        return {}

    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_text}],
        )
        content = message.content[0].text if message.content else ""
        # Try strict JSON extraction first
        try:
            return _coerce_json_from_claude(content)
        except Exception:
            # Last-resort: simple { ... } slice
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > 0:
                return json.loads(content[start:end])
            return {}
    except Exception as e:
        print("[llm] Claude API Error in _call_claude_json:", repr(e))
        return {}


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


FORBID_PATTERNS = [
    r"no\s+ai[-\s]?generated\s+content",
    r"must\s+be\s+your\s+own\s+work",
    r"generative\s+ai\s+not\s+permitted",
    r"plagiarism|original work only",
]


def detect_ai_policy(text: str, extra_context: str = "") -> str:
    """
    Detects if the page forbids AI-generated content.
    Returns:
      - "coach_only" if AI-writing seems forbidden
      - "ok" otherwise
    """
    hay = (text + "\n" + extra_context).lower()
    return "coach_only" if any(re.search(p, hay) for p in FORBID_PATTERNS) else "ok"


# -------------------------------------------------------------------
# User profile helper (for micro-plan personalization)
# -------------------------------------------------------------------

try:
    from server.user_repo import get_user as _get_user  # type: ignore
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
# /plan (popup) fallback plan
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

    SYSTEM = "You are a precise JSON-only parser for scholarship or job application pages."
    SCHEMA = (
        "Return ONLY valid JSON:\n"
        "{\n"
        '  "deadline": string|null,           // YYYY-MM-DD if possible; else null\n'
        '  "refs_required": number|null,      // number of reference letters required (0,1,2...), or null\n'
        '  "values": string[],                // e.g., ["creativity", "leadership"]\n'
        '  "ai_policy": "ok"|"coach_only"     // "coach_only" if the page forbids AI-generated content\n'
        "}\n"
    )

    prompt = (
        "You extract structured fields from THIS PAGE.\n\n"
        "Use BOTH:\n"
        "- PAGE TEXT: the raw text from the current page\n"
        "- CONTEXT: snippets from similar scholarship/job pages (may include example deadlines & rules)\n\n"
        "If you are unsure about any field, use null or an empty list.\n\n"
        "PAGE TEXT (truncated):\n"
        f"{page_text[:4000]}\n\n"
        "CONTEXT (from related examples, may contain explicit deadlines & requirements):\n"
        f"{context[:4000]}\n\n"
        f"{SCHEMA}"
    )

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
# /plan (popup): micro-plan generation
# -------------------------------------------------------------------

def make_plan_with_llm(
    goal: str,
    text: Optional[str] = None,
    user_id: str = "demo-user",
) -> Dict[str, Any]:
    """
    Calls Claude to generate an ADHD-friendly micro plan for the popup flow.

    - Uses parsed fields from extract_fields_rag_or_llm
    - Uses user profile (tone, block length, history) for personalization
    - Falls back to a static plan on failure
    """
    if client is None:
        return dict(FALLBACK_PLAN)

    page_text = text or ""
    user_profile = _load_user_profile(user_id)
    parsed_fields, _sources = extract_fields_rag_or_llm(
        page_text=page_text, user_id=user_id
    )

    SYSTEM = (
        "You are an ADHD-friendly START-FIRST coach. "
        "You create tiny, low-friction first steps and simple micro-plans "
        "that help someone get unstuck with scholarship or job applications."
    )

    schema_block = (
        "Return ONLY valid JSON matching this schema:\n"
        "{\n"
        '  "micro_start": string,\n'
        '  "step_type": "focus_input"|"click_selector"|"make_outline"|"open_url",\n'
        '  "selector": string|null,\n'
        '  "placeholder": string|null,\n'
        '  "block_minutes": number,\n'
        '  "check_ins": [string, ...],\n'
        '  "reentry_script": string,\n'
        '  "purpose": string,\n'
        '  "deadline": string|null,\n'
        '  "ai_policy": "ok"|"coach_only"\n'
        "}\n"
    )

    user_msg = (
        "Goal:\n"
        f"{goal}\n\n"
        "Page text (truncated):\n"
        f"{page_text[:4000]}\n\n"
        "Parsed fields from /parse:\n"
        f"{json.dumps(parsed_fields, ensure_ascii=False)}\n\n"
        "User profile:\n"
        f"{json.dumps(user_profile, ensure_ascii=False)}\n\n"
        "Instructions:\n"
        "- Design a micro-plan that is extremely easy to start.\n"
        "- Prefer a 15–25 minute time block unless the user profile says otherwise.\n"
        "- Make the micro_start concrete and action-oriented.\n"
        '- If ai_policy is "coach_only", assume the user writes content; you only guide.\n\n'
        f"{schema_block}"
    )

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
        return dict(FALLBACK_PLAN)

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


# -------------------------------------------------------------------
# Overlay "AI Micro Start" workflow (uses Firecrawl)
# -------------------------------------------------------------------

def _fallback_workflow(goal: str, text: str, url: Optional[str]) -> Dict[str, Any]:
    """Hardcoded fallback if Anthropic / Firecrawl are unavailable."""
    return {
        "plan_id": "fallback",
        "summary": {
            "title": "Quick Start",
            "one_liner": "API unavailable, using a tiny manual plan.",
            "deadline": None,
            "tags": [],
        },
        "key_points": [],
        "micro_tasks": [
            "Find and skim the eligibility/requirements section.",
            "Highlight one requirement you definitely meet.",
        ],
        "block_minutes": 20,
        "check_ins": [5, 12],
        "deadline": None,
        "sources": [url] if url else [],
        "_scraped_content": text,
    }


def make_workflow_with_llm(
    goal: str,
    text: str,
    user_id: str,
    page_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    1. Scrape page with Firecrawl (if available).
    2. Analyze with Claude (AI).
    3. Return structured Workflow JSON for the Overlay.
    """
    markdown = ""
    metadata: Dict[str, Any] = {}
    combined_text = text or ""

    # 1) Try Firecrawl when URL + client are available
    if page_url and scrape_page_markdown is not None:
        try:
            markdown, metadata = scrape_page_markdown(page_url)
            if markdown:
                combined_text = markdown
        except FirecrawlError as e:
            print(f"[llm] Firecrawl failed, using raw text instead: {e}")
        except Exception as e:
            print(f"[llm] Firecrawl unexpected error, using raw text instead: {e}")

    # 2) If no Claude key, return Fallback (heuristic)
    if client is None:
        return _fallback_workflow(goal, combined_text, page_url)

    # 3) Real AI Generation
    system_prompt = (
        "You are an expert ADHD Coach. Your goal is to break down a scholarship or job "
        "application page into a 'Micro-Start' workflow. "
        "The user is overwhelmed. Do NOT tell them to 'apply'. Tell them to do ONE tiny "
        "reading task first.\n\n"
        "Return ONLY a valid JSON object with this structure:\n"
        "{\n"
        '  "title": "Short title of the opportunity",\n'
        '  "one_liner": "A warm, encouraging one-sentence summary of why this fits them.",\n'
        '  "deadline": "YYYY-MM-DD" or null,\n'
        '  "key_points": ["3 bullet points highlighting eligibility or values"],\n'
        '  "micro_tasks": [\n'
        '    "Step 1: The absolute smallest reading action (e.g. Find the eligibility section)",\n'
        '    "Step 2: A simple follow up",\n'
        '    "Step 3: Another simple check"\n'
        "  ],\n"
        '  "tags": ["Tag1", "Tag2", "Tag3"]\n'
        "}\n"
    )

    user_prompt = (
        f"User ID: {user_id}\n"
        f"User Goal: {goal}\n"
        f"Page URL: {page_url}\n\n"
        "Page Content (truncated to 15k chars):\n"
        f"{combined_text[:15000]}"
    )

    ai_data = _call_claude_json(system_prompt, user_prompt)

    # 4. Normalize deadline and merge into Workflow structure
    deadline_norm = (
        normalize_date_like(ai_data.get("deadline"))
        if ai_data.get("deadline")
        else None
    )

    return {
        "plan_id": str(uuid.uuid4()),
        "summary": {
            "title": ai_data.get("title", "Opportunity"),
            "one_liner": ai_data.get(
                "one_liner", "Let's just take a tiny first step."
            ),
            "deadline": deadline_norm,
            "tags": ai_data.get("tags", []),
        },
        "key_points": ai_data.get("key_points", []),
        "micro_tasks": ai_data.get(
            "micro_tasks", ["Read the first paragraph of the page."]
        ),
        "block_minutes": 20,
        "check_ins": [5, 12],
        "deadline": deadline_norm,
        "sources": [page_url] if page_url else [],
        # Pass back text for RAG storage in app.py if needed
        "_scraped_content": combined_text,
        "metadata": metadata,
    }
