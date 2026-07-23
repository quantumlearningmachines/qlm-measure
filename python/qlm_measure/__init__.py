"""
qlm-measure — Open measurement SDK for education AI.

Python mirror of @qlm/measure (npm). Provides:
- Evidence event schema (ObservationEvent, MeasurementEvent)
- Evidence record format + verifier
- Dataset clients (OntologyClient)
- Engine client (EngineClient, commercial boundary)

Apache-2.0 · v0.1.0
"""

__version__ = "0.1.0"

from .schema import (
    ObservationEvent,
    MeasurementEvent,
    EvidenceEntry,
    EvidenceRecord,
    ScaffoldType,
    EpistemicMode,
    DepthLevel,
    TriageResult,
    COMPACTION_RETENTION,
)
from .verifier import verify_record, replay_to_version, posterior_at_version
from .clients import OntologyClient, EngineClient
