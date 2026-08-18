"""
qlm-measure — Open measurement SDK for education AI.

Provides:
- Evidence event schema (ObservationEvent, MeasurementEvent)
- Evidence record format + verifier
- CLI: qlm-measure verify | explain | version
- Dataset clients (OntologyClient)
- Engine client (EngineClient, commercial boundary)

Apache-2.0
"""

__version__ = "0.2.5"

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
from .verifier import verify_record, replay_to_version, posterior_at_version, Violation, VerificationResult
from .verifier_v03 import verify_record_v03, VerificationResult_v03
from .checks import CATALOG, CATALOG_BY_ID, SHIPPED_CHECKS, PLANNED_CHECKS, CheckDef
from .recorder import Recorder
from .estimate_chain import EstimateChain
from .migrate import migrate_0_2_to_0_3
from .rules import reproduce, register_rule, get_rule

try:
    from .clients import OntologyClient, EngineClient
except ImportError:
    pass  # clients have optional dependencies


def verify(record: dict, **kwargs):
    """Dispatch to the right verifier by schemaVersion."""
    version = record.get("schemaVersion", "0.2")
    if version == "0.3":
        return verify_record_v03(record, **kwargs)
    return verify_record(record, **kwargs)
