# server/schemas.py
"""
Pydantic schemas for ADHD Copilot backend.

This file defines the structured payloads used by:
- /parse          (ParseIn, ParseOut)
- /plan           (PlanIn, PlanOut)
- /workflow       (WorkflowIn, WorkflowOut, WorkflowSummary)
- /bookmark*      (BookmarkIn, BookmarkStatusIn, BookmarkOut)
- /eligibility    (EligibilityIn, EligibilityOut)
- /feedback       (FeedbackIn)
"""

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# /parse
# ---------------------------------------------------------------------------

class ParseIn(BaseModel):
    user_id: str = "demo-user"
    text: str


class ParseOut(BaseModel):
    deadline: Optional[str] = None
    refs_required: Optional[int] = None
    values: List[str] = Field(default_factory=list)
    ai_policy: Literal["ok", "coach_only"] = "ok"
    confidence: Optional[float] = None
    # simple { "source": str, "snippet": str } items
    sources: List[Dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# /plan  (micro-start plan used by current popup)
# ---------------------------------------------------------------------------

class PlanIn(BaseModel):
    user_id: str = "demo-user"
    goal: str
    # scholarship description or page text
    text: Optional[str] = None


class PlanOut(BaseModel):
    micro_start: str
    step_type: str
    selector: Optional[str] = None
    placeholder: Optional[str] = None
    block_minutes: int
    # e.g. ["T+5", "T+12"]
    check_ins: List[str]
    reentry_script: str
    purpose: str
    deadline: Optional[str] = None
    ai_policy: Literal["ok", "coach_only"] = "ok"


# ---------------------------------------------------------------------------
# /workflow  (richer plan powering the 0–4 step overlay)
# ---------------------------------------------------------------------------

class WorkflowIn(BaseModel):
    user_id: str
    goal: str
    page_url: str
    # optional fallback if you still want to send plain text from the extension
    raw_text: Optional[str] = None


class WorkflowSummary(BaseModel):
    title: str
    one_liner: str
    deadline: Optional[str] = None
    days_left: Optional[int] = None
    tags: List[str] = []


class WorkflowOut(BaseModel):
    plan_id: str
    summary: WorkflowSummary
    key_points: List[str] = []
    micro_tasks: List[str] = []
    block_minutes: int = 20
    max_block_minutes: int = 30
    check_ins: List[int] = []  # e.g. [5, 12] in minutes
    deadline: Optional[str] = None
    ai_policy: Optional[str] = None
    sources: List[str] = []

# ---------------------------------------------------------------------------
# Bookmarks / saved scholarships
# ---------------------------------------------------------------------------

class BookmarkIn(BaseModel):
    user_id: str = "demo-user"
    url: str
    title: Optional[str] = None
    source_site: Optional[str] = None
    deadline: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class BookmarkStatusIn(BaseModel):
    user_id: str = "demo-user"
    # bookmark id
    id: str
    status: Literal["saved", "in_progress", "submitted", "won", "dropped"]


class BookmarkOut(BaseModel):
    id: str
    url: str
    title: Optional[str] = None
    source_site: Optional[str] = None
    status: Literal["saved", "in_progress", "submitted", "won", "dropped"] = "saved"
    deadline: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Eligibility check
# ---------------------------------------------------------------------------

class EligibilityIn(BaseModel):
    """
    Payload from the extension to check if a user is eligible
    for a scholarship based on the page text + stored profile.
    """
    user_id: str = "demo-user"
    # whatever profile.html stores
    profile: Dict[str, Any]
    # scholarship page text (innerText)
    text: str


class EligibilityOut(BaseModel):
    eligible: bool
    reasons: List[str]
    missing_info: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# /feedback
# ---------------------------------------------------------------------------

class FeedbackIn(BaseModel):
    """
    Feedback from one micro-start / workflow round.

    Notes:
    - rating: 3=very helpful, 2=meh, 1=not helpful
    - reasons: short reason codes (too_long, too_many_steps, etc.)
    - comment: optional free-form text from the user
    - nudge_result: optional behavioral outcomes (completed/dropped/snoozed)
    """
    user_id: str = "demo-user"
    plan_id: Optional[str] = None
    rating: Optional[int] = None
    reasons: List[str] = Field(default_factory=list)
    nudge_result: Dict[str, str] = Field(default_factory=dict)
    bad_sources: List[str] = Field(default_factory=list)
    comment: Optional[str] = None
