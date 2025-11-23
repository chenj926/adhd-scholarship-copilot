# server/firecrawl_client.py
import os
from pathlib import Path
from typing import Tuple, Dict, Any

import httpx
from dotenv import load_dotenv

# Load .env from project root (adhd_start/)
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")  # loads FIRECRAWL_API_KEY if present

FIRECRAWL_API_BASE = "https://api.firecrawl.dev/v2/scrape"


class FirecrawlError(Exception):
    """Raised when the Firecrawl API returns an error."""


def _get_api_key() -> str:
    key = os.getenv("FIRECRAWL_API_KEY") or ""
    return key


def scrape_page_markdown(
    url: str,
    *,
    only_main_content: bool = True,
    max_age_ms: int = 2 * 24 * 60 * 60 * 1000,
) -> Tuple[str, Dict[str, Any]]:
    """
    Call Firecrawl /v2/scrape and return (markdown, metadata).
    """
    api_key = _get_api_key()
    if not api_key:
        raise FirecrawlError("FIRECRAWL_API_KEY is not set in the environment.")

    payload = {
        "url": url,
        "formats": ["markdown", "summary"],
        "onlyMainContent": only_main_content,
        "maxAge": max_age_ms,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=40.0) as client:
        resp = client.post(FIRECRAWL_API_BASE, json=payload, headers=headers)

    if resp.status_code != 200:
        raise FirecrawlError(
            f"Firecrawl error: status={resp.status_code}, body={resp.text}"
        )

    data = resp.json()
    if not data.get("success"):
        raise FirecrawlError(f"Firecrawl returned success=false: {data}")

    content = data.get("data", {})
    markdown = content.get("markdown") or ""
    metadata = content.get("metadata") or {}
    return markdown, metadata
