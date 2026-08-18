"""
EstimateChain — build a declared estimate chain over evidence.

Usage:
    from qlm_measure.estimate_chain import EstimateChain

    chain = EstimateChain(estimator={"name": "my-model", "version": "1.0", "opaque": True})
    chain.append(evidence_entry, weight=0.42, prior=0.35, updated=0.5032)
    estimates = chain.export()

For reproducible estimators:
    chain = EstimateChain(estimator={
        "name": "qlm-tempered-bkt", "version": "1.2.0",
        "ruleId": "tempered-bkt-1",
        "params": {"slip": 0.10, "guess": 0.20},
        "opaque": False,
    })
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

from .schema_v03 import EstimateEntry, EstimateChainRecord, EstimatorDeclaration


def _canonicalize(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _estimate_entry_hash(entry: dict) -> str:
    """Hash everything except entryHash itself."""
    hashable = {k: v for k, v in entry.items() if k != "entryHash"}
    return _sha256(_canonicalize(hashable))


class EstimateChain:
    """Build a declared estimate chain over an evidence chain."""

    def __init__(self, estimator: dict):
        if not estimator.get("name"):
            raise ValueError("estimator must have a name")
        self._estimator: EstimatorDeclaration = estimator
        self._entries: list[EstimateEntry] = []
        self._version = 0
        self._prev_hash = ""
        self._last_updated: Optional[float] = None
        self._last_evidence_version = 0

    def append(
        self,
        evidence_entry: dict,
        weight: float,
        prior: float,
        updated: float,
        triage_result: Optional[str] = None,
        depth_level: Optional[str] = None,
        decision_tier: Optional[str] = None,
        params: Optional[dict[str, float]] = None,
        non_intervention: Optional[dict[str, Any]] = None,
    ) -> EstimateEntry:
        """Append an estimate for one evidence entry."""
        ev_version = evidence_entry.get("version", 0)
        ev_hash = evidence_entry.get("entryHash", "")

        if ev_version <= self._last_evidence_version:
            raise ValueError(
                f"Evidence version {ev_version} <= previous {self._last_evidence_version}. "
                "Estimates must follow evidence order."
            )

        # Posterior chain check
        if self._last_updated is not None and abs(prior - self._last_updated) > 1e-9:
            raise ValueError(
                f"Prior {prior} != previous updated {self._last_updated}. "
                "Posterior chain broken."
            )

        self._version += 1

        entry: dict = {
            "version": self._version,
            "evidenceVersion": ev_version,
            "evidenceEntryHash": ev_hash,
            "evidentialWeight": weight,
            "priorPosterior": prior,
            "updatedPosterior": updated,
            "prevHash": self._prev_hash,
        }

        if triage_result:
            entry["triageResult"] = triage_result
        if depth_level:
            entry["depthLevel"] = depth_level
        if decision_tier:
            entry["decisionTier"] = decision_tier
        if params:
            entry["params"] = params
        if non_intervention:
            entry["nonInterventionDecision"] = non_intervention

        entry["entryHash"] = _estimate_entry_hash(entry)

        self._entries.append(entry)
        self._prev_hash = entry["entryHash"]
        self._last_updated = updated
        self._last_evidence_version = ev_version

        return entry

    def export(self) -> EstimateChainRecord:
        """Export the estimate chain as a record fragment."""
        return {
            "estimator": self._estimator,
            "entries": list(self._entries),
        }
