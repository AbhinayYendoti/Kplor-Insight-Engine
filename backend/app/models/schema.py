from typing import List, Optional

from pydantic import BaseModel, Field


class ApiError(BaseModel):
    error: str
    details: str


class AnalyzeRequest(BaseModel):
    feedback: List[str] = Field(default_factory=list)
    source: str = "Mixed"


class Cluster(BaseModel):
    name: str
    frequency: int
    severity: int = Field(ge=1, le=5)
    implication: str


class AnalyzeResponse(BaseModel):
    clusters: List[Cluster]


class RecommendRequest(BaseModel):
    clusters: List[Cluster]
    source: str = "Mixed"


class SprintItem(BaseModel):
    priority: int
    feature_name: str
    why_now: str
    what_to_build: List[str]
    expected_impact: str


class RecommendResponse(BaseModel):
    sprint_focus: List[SprintItem]
    defer: List[str] = Field(default_factory=list)
    confidence: str
    confidence_note: str
    raw_output: Optional[str] = None
