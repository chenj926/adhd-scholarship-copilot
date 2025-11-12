# server/llm.py

import json
import os
from typing import Any, Dict, Optional, Tuple, Dict, List

from dotenv import load_dotenv
from anthropic import Anthropic
import re

load_dotenv()
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")

# create client only if we have a key
client: Optional[Anthropic] = None
if ANTHROPIC_API_KEY:
    client = Anthropic(api_key=ANTHROPIC_API_KEY)

# fallback so the app still works even if Claude fails
FALLBACK_PLAN: Dict[str, Any] = {
    "micro_start": "Open the scholarship page and copy the requirements.",
    "step_type": "make_outline",
    "selector": None,
    "placeholder": "Bullet 1: Why I fit…",
    "block_minutes": 20,
    # "check_ins": ["After 5 minutes, make sure you copied at least 2 items."],
    "check_ins": ["T+5","T+12"],
    "reentry_script": "I paused; I'll just finish copying requirements.",
    "purpose": "Reduce startup friction for this application.",
    "deadline": None,
    "ai_policy": "ok",
}

FORBID_PATTERNS = [
    r"no\s+ai[-\s]?generated\s+content",
    r"generative\s+ai\s+not\s+permitted",
    r"must\s+be\s+your\s+own\s+work",
    r"original\s+work\s+only",
    r"plagiarism"
]

def detect_ai_policy(text: str) -> str:
    hay = (text or "").lower()
    return "coach_only" if any(re.search(p, hay) for p in FORBID_PATTERNS) else "ok"

def normalize_date_like(s: Optional[str]) -> Optional[str]:
    if not s: return None
    try:
        from dateutil import parser as dateparser
        dt = dateparser.parse(s, fuzzy=True)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None

def extract_fields_rag_or_llm(page_text: str, user_id: str = "demo-user") -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    try:
        from server.rag.retriever import extract_fields_with_llm as _extract  # type: ignore
        if client is None:
            return ({"deadline": None,"refs_required": None,"values": [],"ai_policy": detect_ai_policy(page_text)}, [])
        fields, sources = _extract(client, user_id, page_text)
        fields["deadline"] = normalize_date_like(fields.get("deadline"))
        if fields.get("ai_policy") not in ("ok","coach_only"):
            fields["ai_policy"] = detect_ai_policy(page_text)
        return fields, sources
    except Exception:
        pass
    if client is None:
        return ({"deadline": None,"refs_required": None,"values": [],"ai_policy": detect_ai_policy(page_text)}, [])
    SYSTEM = "Return JSON only. No extra words."
    SCHEMA = '''Return ONLY valid JSON:
{
  "deadline": string|null,
  "refs_required": number|null,
  "values": string[],
  "ai_policy": "ok"|"coach_only"
}'''
    prompt = f"""Extract fields from the TEXT below. If uncertain, use null/[] and do not invent.
TEXT:
{page_text[:4000]}

{SCHEMA}
"""
    try:
        msg = client.messages.create(model=MODEL, system=SYSTEM, max_tokens=400,
                                     messages=[{"role":"user","content": prompt}])
        raw = msg.content[0].text if msg.content else "{}"
        data = json.loads(raw)
    except Exception:
        data = {"deadline": None, "refs_required": None, "values": [], "ai_policy": "ok"}
    data["deadline"] = normalize_date_like(data.get("deadline"))
    if data.get("ai_policy") not in ("ok","coach_only"):
        data["ai_policy"] = detect_ai_policy(page_text)
    return data, []

def _load_user_profile(user_id: str) -> Dict[str, Any]:
    try:
        from server.user_repo import get_user  # type: ignore
        return get_user(user_id)
    except Exception:
        return {"user_id": user_id, "preferences":{"tone":"warm_direct","block_minutes":20,"checkins":["T+5","T+12"]},
                "history":{"frictions":[],"wins":[]}, "program":None, "interests":[]}

def make_plan_with_llm(goal: str, text: Optional[str] = None, user_id: str = "demo-user") -> Dict[str, Any]:
    """
    Calls Claude to generate an ADHD-friendly micro plan.
    Returns a dict shaped like PlanOut.
    Falls back to a static plan if anything goes wrong.
    """
    # no key or no client → fallback
    if client is None:
        return FALLBACK_PLAN

    page_text = text or ""
    user_profile = _load_user_profile(user_id)
    parsed_fields, _ = extract_fields_rag_or_llm(page_text=page_text, user_id=user_id)

    SYSTEM = '''You are an ADHD‑friendly START‑FIRST coach.
Return ONLY valid JSON matching this schema:
{
  "micro_start": string,
  "step_type": "focus_input"|"click_selector"|"make_outline"|"open_url",
  "selector": string|null,
  "placeholder": string|null,
  "block_minutes": number,
  "check_ins": [ "T+5", "T+12" ],
  "reentry_script": string,
  "purpose": string,
  "deadline": string|null,
  "ai_policy": "ok"|"coach_only"
}'''
    user_ctx = {"program": user_profile.get("program"), "interests": user_profile.get("interests"),
                "prefs": user_profile.get("preferences"),
                "last_frictions": (user_profile.get("history",{}).get("frictions",[]) or [])[-2:]}

    def choose_checkins():
        ns = user_profile.get("weights",{}).get("nudge_success",{})
        pool = ["T+5","T+8","T+10","T+12"]
        def score(k):
            s = ns.get(k,{}).get("success",0); f = ns.get(k,{}).get("fail",0)
            return (s+1)/((s+f)+2)
        pool.sort(key=score, reverse=True)
        return pool[:2]
    check_ins = choose_checkins() or user_profile.get("preferences",{}).get("checkins",["T+5","T+12"])
    block = user_profile.get("preferences",{}).get("block_minutes", 20)

    prompt_obj = {"goal": goal, "page_excerpt": page_text[:800], "parsed": parsed_fields,
                  "user": user_ctx, "constraints":{"start_first": True, "max_micro_words": 12, "prefer_focus_input": True},
                  "defaults":{"block_minutes": block, "check_ins": check_ins}}
    try:
        resp = client.messages.create(model=MODEL, system=SYSTEM, max_tokens=450,
                                      messages=[{"role":"user","content": json.dumps(prompt_obj)}], temperature=0.2)
        raw = resp.content[0].text if resp.content else "{}"
        data = json.loads(raw)
    except Exception:
        data = FALLBACK_PLAN.copy()

    data.setdefault("block_minutes", block)
    data.setdefault("check_ins", check_ins)
    if not data.get("deadline"): data["deadline"] = parsed_fields.get("deadline")
    if not data.get("ai_policy"): data["ai_policy"] = parsed_fields.get("ai_policy","ok")
    for k, v in FALLBACK_PLAN.items(): data.setdefault(k, v)
    return data


#     user_prompt = f"""
# You help students with ADHD start scholarship applications.

# User goal:
# {goal}

# Scholarship text (may be empty):
# {text or "No extra scholarship text."}

# Return ONLY valid JSON with these keys:
# - "micro_start": string
# - "block_minutes": number
# - "check_ins": array of strings
# - "reentry_script": string
# - "purpose": string
# - "deadline": string or null
# - "ai_policy": string ("ok")
# """.strip()

#     try:
#         resp = client.messages.create(
#             model="claude-3-5-sonnet-20241022",  # change to a model you have
#             max_tokens=400,
#             temperature=0.3,
#             messages=[
#                 {
#                     "role": "user",
#                     "content": user_prompt,
#                 }
#             ],
#         )

#         # anthropic python sdk returns a list of content blocks
#         raw = resp.content[0].text if resp.content else "{}"

#         # try to parse JSON
#         data = json.loads(raw)

#         # make sure all keys exist
#         for k, v in FALLBACK_PLAN.items():
#             data.setdefault(k, v)

#         return data
#     except Exception as e:
#         # print for debugging
#         print("Claude error:", e)
#         return FALLBACK_PLAN
