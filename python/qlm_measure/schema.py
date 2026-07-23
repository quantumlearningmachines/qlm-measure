"""
Public event schema — Python mirror of TypeScript types.

All types are TypedDict for structural typing without runtime overhead.
"""

from __future__ import annotations
from typing import TypedDict, Literal, Optional, Any

# ── Enums (as Literal unions) ─────────────────────────────────────────────────

ScaffoldType = Literal[
    "none", "socratic", "probing", "metacognitive",
    "scaffolding", "explain", "hint", "demonstrate",
]

EpistemicMode = Literal["experience", "inference", "analogy", "testimony"]

DepthLevel = Literal["surface", "conceptual", "transfer", "integration"]

TriageResult = Literal["correct", "slip", "misconception", "disengagement", "ambiguous"]

EventCategory = Literal["learning", "teaching", "assessment", "interaction", "system"]

COMPACTION_RETENTION = 500

# ── Internal -> Public mapping ────────────────────────────────────────────────

_EPISTEMIC_MAP = {
    "direct": "experience",
    "reason": "inference",
    "compare": "analogy",
    "told": "testimony",
    "experience": "experience",
    "inference": "inference",
    "analogy": "analogy",
    "testimony": "testimony",
}


def to_public_epistemic_mode(value: str) -> EpistemicMode:
    return _EPISTEMIC_MAP.get(value, "testimony")  # type: ignore[return-value]


# ── ObservationEvent ──────────────────────────────────────────────────────────

class ObservationEvent(TypedDict, total=False):
    studentId: str
    sessionId: str
    source: str
    timestamp: str
    correct: bool
    responseTimeMs: int
    domain: str
    scaffoldType: Optional[ScaffoldType]
    misconceptionId: Optional[str]
    classifierConfidence: Optional[float]
    classifierLabel: Optional[str]
    skillId: Optional[str]
    score: Optional[float]
    difficulty: Optional[float]
    consecutiveErrors: Optional[int]
    sessionErrorRate: Optional[float]
    explanationQuality: Optional[float]
    isTransferProblem: Optional[bool]
    connectionsMade: Optional[int]
    epistemicMode: Optional[EpistemicMode]
    selfCorrected: Optional[bool]
    ext: Optional[dict[str, Any]]


# ── MeasurementEvent ──────────────────────────────────────────────────────────

class MeasurementEvent(TypedDict, total=False):
    eventType: str
    eventCategory: EventCategory
    sessionId: Optional[str]
    classroomId: Optional[str]
    domain: Optional[str]
    topic: Optional[str]
    mode: Optional[str]
    difficulty: Optional[float]
    payload: Optional[dict[str, Any]]
    qualitySignal: Optional[float]
    confidence: Optional[float]
    durationMs: Optional[int]
    parentEventId: Optional[str]


# ── Evidence Record ───────────────────────────────────────────────────────────

class NonInterventionDecision(TypedDict):
    intervened: bool
    confidence: float


class RedactedEvent(TypedDict):
    redacted: bool
    eventHash: str


class EvidenceEntry(TypedDict, total=False):
    version: int
    timestamp: str
    event: ObservationEvent | RedactedEvent
    scaffoldType: ScaffoldType
    depthLevel: DepthLevel
    epistemicMode: Optional[EpistemicMode]
    triageResult: TriageResult
    evidentialWeight: float
    priorPosterior: float
    updatedPosterior: float
    nonInterventionDecision: Optional[NonInterventionDecision]
    entryHash: str
    prevHash: str


class CompactedBefore(TypedDict):
    version: int
    summaryHash: str


class EvidenceRecord(TypedDict, total=False):
    studentScopeId: str
    entries: list[EvidenceEntry]
    compactedBefore: Optional[CompactedBefore]
