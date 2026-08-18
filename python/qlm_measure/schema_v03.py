"""
Schema 0.3 — Two-level record with evidence and estimate chains.

Evidence chain: what happened (anyone can write it).
Estimate chain: what an estimator concluded (declared, checkable).
Consent lives in the evidence chain as events.
Attestations hang off the record and reference entries by hash.
"""
from __future__ import annotations

from typing import TypedDict, Literal, Optional, Any, Union


# ── Enums ────────────────────────────────────────────────────────────

ConsentAction = Literal["granted", "withdrawn"]
ConsentScope = Literal["instruction", "research", "export"]
EventKind = Literal["observation", "consent", "redacted"]
EstimatorOpaque = Literal[True, False]


# ── Events ───────────────────────────────────────────────────────────

class ObservationEvent(TypedDict, total=False):
    """What happened — the raw interaction."""
    kind: Literal["observation"]
    studentId: str
    sessionId: str
    source: str
    timestamp: str
    correct: bool
    responseTimeMs: int
    domain: str
    scaffoldType: str
    epistemicMode: str
    misconceptionId: str
    skillId: str
    score: float
    difficulty: float
    ext: dict[str, Any]


class ConsentEvent(TypedDict, total=False):
    """Consent granted or withdrawn — lives in the evidence chain."""
    kind: Literal["consent"]
    action: ConsentAction
    scopes: list[ConsentScope]
    at: str
    source: str


class RedactedEvent(TypedDict):
    """Replaces an event after withdrawal. Hash-preserving by construction."""
    redacted: Literal[True]
    eventHash: str


Event = Union[ObservationEvent, ConsentEvent, RedactedEvent]


# ── Evidence chain ───────────────────────────────────────────────────

class EvidenceEntry(TypedDict):
    version: int
    timestamp: str
    eventHash: str
    event: Event
    prevHash: str
    entryHash: str


class CompactionBoundary(TypedDict):
    version: int
    summaryHash: str


class EvChain(TypedDict, total=False):
    entries: list[EvidenceEntry]
    compactedBefore: CompactionBoundary


# ── Estimate chain ───────────────────────────────────────────────────

class EstimatorDeclaration(TypedDict, total=False):
    name: str
    version: str
    ruleId: str
    params: dict[str, float]
    opaque: bool


class EstimateEntry(TypedDict, total=False):
    version: int
    evidenceVersion: int
    evidenceEntryHash: str
    triageResult: str
    depthLevel: str
    decisionTier: str
    evidentialWeight: float
    priorPosterior: float
    updatedPosterior: float
    params: dict[str, float]
    nonInterventionDecision: dict[str, Any]
    prevHash: str
    entryHash: str


class EstimateChainRecord(TypedDict, total=False):
    estimator: EstimatorDeclaration
    entries: list[EstimateEntry]
    compactedBefore: CompactionBoundary


# ── Attestation ──────────────────────────────────────────────────────

class AttestationCovers(TypedDict, total=False):
    throughEvidenceVersion: int
    evidenceEntryHash: str


class Attestation(TypedDict, total=False):
    type: str
    issuer: str
    issuedAt: str
    covers: AttestationCovers
    payload: dict[str, Any]
    payloadHash: str
    signature: Optional[str]


# ── Export block ─────────────────────────────────────────────────────

class ExportBlock(TypedDict, total=False):
    exportedAt: str
    scope: str
    exporterId: str


# ── Derivation ───────────────────────────────────────────────────────

class DerivedFrom(TypedDict, total=False):
    schemaVersion: str
    lastEntryHash: str


# ── Record ───────────────────────────────────────────────────────────

class Record_v03(TypedDict, total=False):
    """Schema 0.3 record — two-level: evidence + estimates."""
    schemaVersion: Literal["0.3"]
    studentScopeId: str
    evidence: EvChain
    estimates: list[EstimateChainRecord]
    attestations: list[Attestation]
    export: ExportBlock
    derivedFrom: DerivedFrom
