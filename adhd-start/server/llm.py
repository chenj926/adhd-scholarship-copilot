# server/llm.py

import json
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from anthropic import Anthropic

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# create client only if we have a key
client: Optional[Anthropic] = None
if ANTHROPIC_API_KEY:
    client = Anthropic(api_key=ANTHROPIC_API_KEY)

# fallback so the app still works even if Claude fails
FALLBACK_PLAN: Dict[str, Any] = {
    "micro_start": "Open the scholarship page and copy the requirements.",
    "block_minutes": 15,
    "check_ins": ["After 5 minutes, make sure you copied at least 2 items."],
    "reentry_script": "I paused; I'll just finish copying requirements.",
    "purpose": "Reduce startup friction for this application.",
    "deadline": None,
    "ai_policy": "ok",
}


def make_plan_with_llm(goal: str, text: Optional[str] = None) -> Dict[str, Any]:
    """
    Calls Claude to generate an ADHD-friendly micro plan.
    Returns a dict shaped like PlanOut.
    Falls back to a static plan if anything goes wrong.
    """
    # no key or no client → fallback
    if client is None:
        return FALLBACK_PLAN

    user_prompt = f"""
You help students with ADHD start scholarship applications.

User goal:
{goal}

Scholarship text (may be empty):
{text or "No extra scholarship text."}

Return ONLY valid JSON with these keys:
- "micro_start": string
- "block_minutes": number
- "check_ins": array of strings
- "reentry_script": string
- "purpose": string
- "deadline": string or null
- "ai_policy": string ("ok")
""".strip()

    try:
        resp = client.messages.create(
            model="claude-3-5-sonnet-20241022",  # change to a model you have
            max_tokens=400,
            temperature=0.3,
            messages=[
                {
                    "role": "user",
                    "content": user_prompt,
                }
            ],
        )

        # anthropic python sdk returns a list of content blocks
        raw = resp.content[0].text if resp.content else "{}"

        # try to parse JSON
        data = json.loads(raw)

        # make sure all keys exist
        for k, v in FALLBACK_PLAN.items():
            data.setdefault(k, v)

        return data
    except Exception as e:
        # print for debugging
        print("Claude error:", e)
        return FALLBACK_PLAN
