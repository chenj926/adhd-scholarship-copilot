# server/schemas.py

from typing import List, Optional, Literal
from pydantic import BaseModel

class ParseIn(BaseModel):
    user_id: str = "demo-user"
    text: str

class ParseOut(BaseModel):
    deadline: Optional[str] = None
    refs_required: Optional[int] = None
    values: List[str] = []
    ai_policy: Literal["ok","coach_only"] = "ok"
    confidence: float | None = None
    sources: list[dict] = []

class PlanIn(BaseModel):
    user_id: str = "demo-user"
    goal: str
    text: Optional[str] = None  # scholarship description or page text

class PlanOut(BaseModel):
    micro_start: str
    step_type: str
    selector: str | None = None
    placeholder: str | None = None
    block_minutes: int
    check_ins: List[str]
    reentry_script: str
    purpose: str
    deadline: Optional[str] = None
    ai_policy: Literal["ok","coach_only"] = "ok"
