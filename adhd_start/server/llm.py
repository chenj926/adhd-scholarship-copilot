# server/llm.py
"""
LLM Module:
1. Uses Firecrawl to scrape raw Markdown.
2. Uses Anthropic (Claude Sonnet 4.5) to analyze the page and generate the Micro-Start Plan.
"""

import os
import json
import uuid
from typing import Any, Dict, List, Optional, Tuple
from dotenv import load_dotenv
import anthropic

from .firecrawl_client import scrape_page_markdown, FirecrawlError

# Load env vars
load_dotenv()

# Initialize Anthropic
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
claude = None
if ANTHROPIC_API_KEY:
    claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
else:
    print("[llm] WARNING: ANTHROPIC_API_KEY not found. Using fallback heuristics.")


def _call_claude_json(system_prompt: str, user_text: str) -> Dict[str, Any]:
    """Helper to call Claude and force JSON output."""
    if not claude:
        return {}
    
    try:
        # UPDATED MODEL NAME HERE
        message = claude.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1024,
            temperature=0.3,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_text}
            ]
        )
        # Extract text content
        content = message.content[0].text
        # Find JSON blob if wrapped in text
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > 0:
            return json.loads(content[start:end])
        return {}
    except Exception as e:
        print(f"[llm] Claude API Error: {e}")
        return {}


def make_workflow_with_llm(goal: str, text: str, user_id: str, page_url: Optional[str] = None) -> Dict[str, Any]:
    """
    1. Scrape page (Firecrawl).
    2. Analyze with Claude (AI).
    3. Return structured Workflow JSON for the Overlay.
    """
    # 1. Scrape
    markdown = ""
    metadata = {}
    
    # Fallback text if scrape fails
    combined_text = text 

    if page_url:
        try:
            markdown, metadata = scrape_page_markdown(page_url)
            if markdown:
                combined_text = markdown
        except FirecrawlError as e:
            print(f"[llm] Firecrawl failed, using raw text: {e}")

    # 2. If no Claude key, return Fallback (heuristic)
    if not claude:
        return _fallback_workflow(goal, combined_text, page_url)

    # 3. Real AI Generation
    system_prompt = """
    You are an expert ADHD Coach. Your goal is to break down a scholarship or job application page into a "Micro-Start" workflow.
    The user is overwhelmed. Do NOT tell them to "apply". Tell them to do ONE tiny reading task.
    
    Return a valid JSON object with this structure:
    {
        "title": "Short title of the opportunity",
        "one_liner": "A warm, encouraging one-sentence summary of why this fits them.",
        "deadline": "YYYY-MM-DD" or null,
        "key_points": ["3 bullet points highlighting eligibility or values"],
        "micro_tasks": [
            "Step 1: The absolute smallest reading action (e.g. Find the eligibility section)",
            "Step 2: A simple follow up",
            "Step 3: Another simple check"
        ],
        "tags": ["Tag1", "Tag2", "Tag3"]
    }
    """

    user_prompt = f"""
    User Goal: {goal}
    Page URL: {page_url}
    Page Content:
    {combined_text[:15000]} 
    """

    ai_data = _call_claude_json(system_prompt, user_prompt)

    # 4. Merge AI data into Workflow structure
    return {
        "plan_id": str(uuid.uuid4()),
        "summary": {
            "title": ai_data.get("title", "Opportunity"),
            "one_liner": ai_data.get("one_liner", "Let's just take a quick look."),
            "deadline": ai_data.get("deadline"),
            "tags": ai_data.get("tags", []),
        },
        "key_points": ai_data.get("key_points", []),
        "micro_tasks": ai_data.get("micro_tasks", ["Read the first paragraph."]),
        "block_minutes": 20,
        "check_ins": [5, 12],
        "deadline": ai_data.get("deadline"),
        "sources": [page_url] if page_url else [],
        # Pass back text for RAG storage in app.py
        "_scraped_content": combined_text 
    }


def extract_fields_rag_or_llm(page_text: str, user_id: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Simple parser for the popup 'Scan' feature."""
    return {}, []


def make_plan_with_llm(goal: str, text: str, user_id: str) -> Dict[str, Any]:
    # Simple popup plan
    return {
        "micro_start": "Scan the page requirements.",
        "step_type": "read_section",
        "block_minutes": 20,
        "check_ins": ["T+5"],
        "purpose": goal
    }


def _fallback_workflow(goal, text, url):
    """Hardcoded fallback if API fails."""
    return {
        "plan_id": "fallback",
        "summary": { "title": "Quick Start", "one_liner": "API Unavailable, manual mode." },
        "micro_tasks": ["Read the requirements section.", "Check the deadline."],
        "block_minutes": 20,
        "check_ins": [5, 12]
    }