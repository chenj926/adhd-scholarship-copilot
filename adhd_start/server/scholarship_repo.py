# server/scholarship_repo.py

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from .scholarship_models import Scholarship

_BASE_DIR = Path(__file__).resolve().parent
_DATA_PATH = _BASE_DIR / "store" / "scholarships.json"


class ScholarshipRepo:
    """
    Simple in-memory repository backed by scholarships.json.
    For hackathon/demo use.
    """

    def __init__(self, data_path: Path = _DATA_PATH):
        self._data_path = data_path
        self._scholarships = self._load()

    def _load(self) -> List[Scholarship]:
        import json

        if not self._data_path.exists():
            # No data yet – return empty list
            return []

        try:
            text = self._data_path.read_text(encoding="utf-8").strip()
            if not text:
                # Empty file – treat as no data
                return []

            raw = json.loads(text)
        except Exception as e:
            # For safety in dev/hackathon: log and fall back to empty list
            print(f"[scholarship_repo] Failed to load JSON from {self._data_path}: {e}")
            return []

        return [Scholarship.model_validate(item) for item in raw]


    def list(
        self,
        q: Optional[str] = None,
        source_site: Optional[str] = None,
        level_of_study: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Scholarship]:
        """
        Basic in-memory filtering. This is enough for your hackathon demo.
        """
        items = self._scholarships

        if source_site:
            items = [s for s in items if s.source_site.lower() == source_site.lower()]

        if level_of_study:
            items = [
                s
                for s in items
                if (s.level_of_study or "").lower() == level_of_study.lower()
            ]

        if q:
            q_lower = q.lower()
            items = [
                s
                for s in items
                if q_lower in s.title.lower()
                or q_lower in (s.description_short or "").lower()
                or q_lower in (s.eligibility_summary or "").lower()
            ]

        return items[offset : offset + limit]

    def get(self, scholarship_id: str) -> Optional[Scholarship]:
        for s in self._scholarships:
            if s.id == scholarship_id:
                return s
        return None


# Create a single repo instance you can import in app.py
scholarship_repo = ScholarshipRepo()



