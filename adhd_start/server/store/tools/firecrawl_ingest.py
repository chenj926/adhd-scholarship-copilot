# server/tools/firecrawl_ingest.py

from __future__ import annotations
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin

import json
import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from firecrawl import Firecrawl

from server.scholarship_models import Scholarship
from server.scholarship_repo import _DATA_PATH as SCHOLARSHIPS_JSON_PATH

load_dotenv()  # load FIRECRAWL_API_KEY from .env if present


BASE_DIR = Path(__file__).resolve().parents[1]
URLS_FILE = BASE_DIR / "store" / "public_scholarship_urls.txt"


# -----------------------------------------------------------
# UTILITIES
# -----------------------------------------------------------

def clean_markdown_snippet(markdown: str) -> str:
    """
    Turn a messy markdown (or plain text) blob into a short, readable snippet:
    - remove headings (# ...)
    - remove images (![...])
    - remove [text](url) link syntax
    - drop 'Skip to main content' lines
    - prefer lines mentioning scholarships/awards/deadlines/apply/eligibility
    """
    import re

    lines = [ln.strip() for ln in markdown.splitlines()]
    important: list[str] = []

    keywords = (
        "scholar",
        "award",
        "grant",
        "bursary",
        "deadline",
        "apply",
        "application",
        "eligibility",
        "eligible",
    )

    def strip_links(text: str) -> str:
        # [Text](url) -> Text
        return re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)

    def keep_line(ln: str) -> bool:
        if not ln:
            return False
        lower = ln.lower()
        if ln.startswith("#"):
            return False
        if ln.startswith("!["):
            return False
        if lower.startswith("[skip to main content"):
            return False
        return True

    # First pass: keep only keyword lines
    for ln in lines:
        if not keep_line(ln):
            continue
        ln_clean = strip_links(ln)
        if any(k in ln_clean.lower() for k in keywords):
            important.append(ln_clean)

    # Fallback: if no keyword lines, just take first few decent lines
    if not important:
        for ln in lines:
            if not keep_line(ln):
                continue
            ln_clean = strip_links(ln)
            if not ln_clean:
                continue
            important.append(ln_clean)
            if len(important) >= 3:
                break

    snippet = " ".join(important)
    snippet = re.sub(r"\s+", " ", snippet).strip()

    if len(snippet) > 600:
        snippet = snippet[:600] + "…"

    return snippet


def load_existing_scholarships() -> List[Scholarship]:
    if not SCHOLARSHIPS_JSON_PATH.exists():
        return []
    text = SCHOLARSHIPS_JSON_PATH.read_text(encoding="utf-8").strip()
    if not text:
        return []
    raw = json.loads(text)
    return [Scholarship.model_validate(item) for item in raw]


def save_scholarships(scholarships: List[Scholarship]) -> None:
    data = [s.model_dump(mode="json") for s in scholarships]
    SCHOLARSHIPS_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    SCHOLARSHIPS_JSON_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"[firecrawl_ingest] Saved {len(scholarships)} scholarships to {SCHOLARSHIPS_JSON_PATH}")


def read_urls() -> List[str]:
    if not URLS_FILE.exists():
        print(f"[firecrawl_ingest] No URL file found at {URLS_FILE}")
        return []
    lines = [ln.strip() for ln in URLS_FILE.read_text(encoding="utf-8").splitlines()]
    urls = [ln for ln in lines if ln and not ln.startswith("#")]
    print(f"[firecrawl_ingest] Loaded {len(urls)} URLs from {URLS_FILE}")
    return urls


def make_id_from_url(url: str) -> str:
    """Deterministic ID based on URL."""
    import re
    sanitized = re.sub(r"[^a-z0-9]+", "-", url.lower())
    sanitized = sanitized.strip("-")
    return f"sch-public-{sanitized[:60]}"


# -----------------------------------------------------------
#  Extract individual scholarships from UofT Engineering page
# -----------------------------------------------------------

def extract_scholarships_from_page(
    page_url: str, html: str, markdown: str
) -> list[Scholarship]:
    parsed = urlparse(page_url)
    host = parsed.hostname or ""
    path = parsed.path or ""

    scholarships: list[Scholarship] = []

    # Special-case: UofT Engineering list page
    if "undergrad.engineering.utoronto.ca" in host and "fees-financial-aid/scholarships" in path:

        soup = BeautifulSoup(html or "", "html.parser")

        seen_urls: set[str] = set()

        for a in soup.find_all("a"):
            title = (a.get_text() or "").strip()
            href = a.get("href") or ""
            if not title or not href:
                continue

            # Skip anchors
            if href.startswith("#"):
                continue

            # Skip mailto: tel: javascript:
            parsed_href = urlparse(href)
            if parsed_href.scheme and parsed_href.scheme not in ("http", "https"):
                continue

            full_url = urljoin(page_url, href)

            # Skip if identical to parent page
            if full_url.rstrip("/") == page_url.rstrip("/"):
                continue

            if full_url in seen_urls:
                continue
            seen_urls.add(full_url)

            # Snippet text from parent <p>, cleaned
            parent_text = ""
            if a.parent:
                parent_text = a.parent.get_text(" ", strip=True)

            snippet = clean_markdown_snippet(parent_text)

            sch_id = make_id_from_url(full_url)

            sch = Scholarship(
                id=sch_id,
                title=title,
                source_site=urlparse(full_url).hostname or host,
                source_url=full_url,
                apply_url=None,
                provider_name=None,
                amount=None,
                currency="CAD",
                deadline_date=None,
                description_short=snippet,
                eligibility_summary=None,
                level_of_study=None,
                location="Canada",
                tags=[],
                winner_stories=[],
            )
            scholarships.append(sch)

        if scholarships:
            print(f"[firecrawl_ingest] Extracted {len(scholarships)} individual scholarships from list page.")
            return scholarships

    # Default behavior: treat whole page as single entry,
    # but with cleaned text (no headers/images/markdown links)
    clean_desc = clean_markdown_snippet(markdown) if markdown else ""

    sch_id = make_id_from_url(page_url)

    fallback_sch = Scholarship(
        id=sch_id,
        title=f"Scholarship page: {page_url}",
        source_site=host,
        source_url=page_url,
        apply_url=None,
        provider_name=None,
        amount=None,
        currency="CAD",
        deadline_date=None,
        description_short=clean_desc or None,
        eligibility_summary=None,
        level_of_study=None,
        location="Canada",
        tags=[],
        winner_stories=[],
    )
    return [fallback_sch]


# -----------------------------------------------------------
#  Main ingestion
# -----------------------------------------------------------

def main() -> None:
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise RuntimeError("FIRECRAWL_API_KEY environment variable is not set")

    firecrawl = Firecrawl(api_key=api_key)

    urls = read_urls()
    if not urls:
        print("[firecrawl_ingest] No URLs to process.")
        return

    existing = load_existing_scholarships()
    existing_by_id = {s.id: s for s in existing}

    new_or_updated: dict[str, Scholarship] = {}

    for url in urls:
        print(f"[firecrawl_ingest] Scraping {url} ...")
        try:
            doc = firecrawl.scrape(url, formats=["markdown", "html"])
        except Exception as e:
            print(f"[firecrawl_ingest] Error scraping {url}: {e}")
            continue

        doc_dict = doc.model_dump() if hasattr(doc, "model_dump") else doc

        html = (doc_dict.get("html") or "").strip()
        markdown = (doc_dict.get("markdown") or "").strip()

        # Extract one or many scholarships
        extracted = extract_scholarships_from_page(url, html, markdown)

        for sch in extracted:
            print(f"[firecrawl_ingest] Parsed scholarship: {sch.title} (id={sch.id})")
            new_or_updated[sch.id] = sch

    # Merge results
    merged: dict[str, Scholarship] = existing_by_id.copy()
    merged.update(new_or_updated)

    save_scholarships(list(merged.values()))
    print(f"[firecrawl_ingest] Done. {len(new_or_updated)} scholarships added/updated.")


if __name__ == "__main__":
    main()
