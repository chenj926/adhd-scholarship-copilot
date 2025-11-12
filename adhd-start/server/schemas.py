# server/schemas.py

from typing import List, Optional
from pydantic import BaseModel


class PlanIn(BaseModel):
    goal: str
    text: Optional[str] = None  # scholarship description or page text


class PlanOut(BaseModel):
    micro_start: str
    block_minutes: int
    check_ins: List[str]
    reentry_script: str
    purpose: str
    deadline: Optional[str] = None
    ai_policy: str = "ok"
