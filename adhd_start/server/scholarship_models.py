# server/scholarship_models.py

from typing import List, Optional
from pydantic import BaseModel, HttpUrl, Field
from datetime import date


class WinnerStory(BaseModel):
    id: str = Field(..., description="Internal ID for the winner story")
    title: str
    source_url: HttpUrl
    note: Optional[str] = Field(
        default=None,
        description="Short note like 'Official winner profile from UofT'"
    )


class Scholarship(BaseModel):
    id: str = Field(..., description="Internal ID, e.g. 'sch-studentawards-001'")
    title: str
    source_site: str = Field(..., description="e.g. 'StudentAwards' or 'ScholarshipsCanada'")
    source_url: HttpUrl = Field(..., description="URL to the info page on the source site")
    apply_url: Optional[HttpUrl] = Field(
        default=None,
        description="Direct application link if different from source_url"
    )

    provider_name: Optional[str] = None

    amount: Optional[float] = Field(
        default=None,
        description="Numeric amount, e.g. 5000.0"
    )
    currency: str = "CAD"

    deadline_date: Optional[date] = Field(
        default=None,
        description="Application deadline if known"
    )

    description_short: Optional[str] = Field(
        default=None,
        description="Short 2–3 sentence summary, ideally in your own words"
    )
    eligibility_summary: Optional[str] = Field(
        default=None,
        description="Bullet-style summary of eligibility"
    )
    level_of_study: Optional[str] = Field(
        default=None,
        description="e.g. HS, Undergrad, Grad"
    )
    location: Optional[str] = Field(
        default=None,
        description="e.g. Canada, Ontario, Any"
    )
    tags: List[str] = Field(
        default_factory=list,
        description="e.g. ['ADHD', 'disability', 'STEM']"
    )

    winner_stories: List[WinnerStory] = Field(
        default_factory=list,
        description="Optional winner stories / example applications"
    )
