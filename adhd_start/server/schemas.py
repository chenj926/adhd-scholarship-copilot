# server/schemas.py  

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field


class ParseIn(BaseModel):
    user_id: str = "demo-user"
    text: str

class ParseOut(BaseModel):
    deadline: Optional[str] = None
    refs_required: Optional[int] = None
    values: List[str] = []
    ai_policy: Literal["ok","coach_only"] = "ok"
    confidence: Optional[float] = None
    sources: List[Dict[str, Any]] = []

class PlanIn(BaseModel):
    user_id: str = "demo-user"
    goal: str
    text: Optional[str] = None  # scholarship description or page text

class PlanOut(BaseModel):
    micro_start: str
    step_type: str
    selector: Optional[str] = None
    placeholder: Optional[str] = None
    block_minutes: int
    check_ins: List[str]
    reentry_script: str
    purpose: str
    deadline: Optional[str] = None
    ai_policy: Literal["ok","coach_only"] = "ok"

# for bookmark

class BookmarkIn(BaseModel):
    user_id: str = "demo-user"
    url: str
    title: str | None = None
    source_site: str | None = None
    deadline: str | None = None
    tags: list[str] = Field(default_factory=list)

class BookmarkStatusIn(BaseModel):
    user_id: str = "demo-user"
    id: str                 # bookmark id
    status: Literal["saved","in_progress","submitted","won","dropped"]

class BookmarkOut(BaseModel):
    id: str
    url: str
    title: str | None = None
    source_site: str | None = None
    status: Literal["saved","in_progress","submitted","won","dropped"] = "saved"
    deadline: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: str
    updated_at: str