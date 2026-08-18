"""
Verifier for schema 0.3 records — two-level verification.

Evidence chain: SCHEMA.*, VERSION.*, TIMESTAMP.*, ENUM.*, EVENT.COMMITMENT,
               HASH.*, COMPACTION.*
Estimate chain: ESTIMATE.DECLARED, ESTIMATE.LINKS_EVIDENCE, ESTIMATE.ORDER,
               VERSION.*, HASH.*, ENUM.*, WEIGHT.RANGE, POSTERIOR.*,
               ESTIMATE.REPRODUCE
Record level:   CONSENT.SCOPE, CONSENT.WITHDRAWAL, ATTEST.INTEGRITY, ATTEST.COVERS
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from .rules import reproduce


@dataclass
class Violation:
    version: int
    category: str
    message: str
    check_id: str = ""
    chain: str = "evidence"  # "evidence" | "estimate:0" | "record"


@dataclass
class VerificationResult_v03:
    valid: bool
    level: int  # 1 or 2
    violations: list[Violation] = field(default_factory=list)
    entries_checked: int = 0
    estimators: list[dict] = field(default_factory=list)


def _canonicalize(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _parse_ts(ts: str) -> Optional[float]:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000
    except (ValueError, TypeError, AttributeError):
        return None


_VALID_SCAFFOLD_TYPES = {"none", "socratic", "probing", "metacognitive", "scaffolding", "explain", "hint", "demonstrate"}
_VALID_EPISTEMIC_MODES = {"experience", "inference", "analogy", "testimony"}
_VALID_CONSENT_ACTIONS = {"granted", "withdrawn"}
_VALID_CONSENT_SCOPES = {"instruction", "research", "export"}
_VALID_TRIAGE_RESULTS = {"correct", "slip", "misconception", "disengagement", "ambiguous"}
_VALID_DEPTH_LEVELS = {"surface", "conceptual", "transfer", "integration"}
_VALID_DECISION_TIERS = {"INSTRUCTIONAL", "REPORTING", "PLACEMENT", "CREDENTIAL"}


def verify_record_v03(
    record: dict,
    timestamp_tolerance_ms: int = 1000,
    estimate_tolerance: float = 1e-4,
) -> VerificationResult_v03:
    """Verify a schema 0.3 record."""
    violations: list[Violation] = []

    scope_id = record.get("studentScopeId", "")
    if not scope_id:
        violations.append(Violation(0, "schema", "Missing studentScopeId", "SCHEMA.REQUIRED", "record"))

    evidence = record.get("evidence", {})
    ev_entries = evidence.get("entries", [])
    estimates = record.get("estimates", [])
    attestations = record.get("attestations", [])
    export_block = record.get("export")

    level = 2 if estimates else 1

    # ── Evidence chain ───────────────────────────────────────────────

    ev_by_version: dict[int, dict] = {}
    ev_by_hash: dict[str, dict] = {}
    compacted = evidence.get("compactedBefore")
    prev_version = compacted["version"] if compacted else 0
    prev_hash = compacted.get("summaryHash", "") if compacted else ""
    prev_ts = ""

    # Track consent state
    consent_state: dict[str, str] = {}  # scope -> "granted"|"withdrawn"

    for entry in ev_entries:
        v = entry.get("version", -1)
        chain = "evidence"

        # SCHEMA.REQUIRED
        for req in ("version", "timestamp", "eventHash", "event", "prevHash", "entryHash"):
            if req not in entry:
                violations.append(Violation(v, "schema", f"{req} is required", "SCHEMA.REQUIRED", chain))

        # SCHEMA.TIMESTAMP_FORMAT
        ts = entry.get("timestamp", "")
        ts_ms = _parse_ts(ts) if ts else None
        if ts and ts_ms is None:
            violations.append(Violation(v, "timestamp", f"Not valid ISO 8601: {ts!r}", "SCHEMA.TIMESTAMP_FORMAT", chain))

        # VERSION.MONOTONIC
        if isinstance(v, int) and v <= prev_version:
            violations.append(Violation(v, "version", f"Version {v} <= previous {prev_version}", "VERSION.MONOTONIC", chain))

        # VERSION.CONTIGUOUS
        if isinstance(v, int) and v != prev_version + 1 and not (compacted and v == compacted["version"] + 1 and entry is ev_entries[0]):
            violations.append(Violation(v, "version", f"Version {v} != previous {prev_version} + 1", "VERSION.CONTIGUOUS", chain))

        # TIMESTAMP.MONOTONIC
        if prev_ts and ts and ts_ms is not None:
            prev_ms = _parse_ts(prev_ts)
            if prev_ms is not None and ts_ms < prev_ms - timestamp_tolerance_ms:
                violations.append(Violation(v, "timestamp", "Timestamp goes backward", "TIMESTAMP.MONOTONIC", chain))

        # SCHEMA.EVENT_UNION
        event = entry.get("event", {})
        if event.get("redacted"):
            event_kind = "redacted"
        elif event.get("kind") == "consent" or event.get("action") in _VALID_CONSENT_ACTIONS:
            event_kind = "consent"
        elif "correct" in event or event.get("kind") == "observation":
            event_kind = "observation"
        else:
            event_kind = "unknown"
            violations.append(Violation(v, "schema", "Event is not Observation, Consent, or Redacted", "SCHEMA.EVENT_UNION", chain))

        # ENUM.VALID (on observation events)
        if event_kind == "observation":
            st = event.get("scaffoldType")
            if st and st not in _VALID_SCAFFOLD_TYPES:
                violations.append(Violation(v, "enum", f"Invalid scaffoldType: {st}", "ENUM.VALID", chain))
            em = event.get("epistemicMode")
            if em and em not in _VALID_EPISTEMIC_MODES:
                violations.append(Violation(v, "enum", f"Invalid epistemicMode: {em}", "ENUM.VALID", chain))

        # ENUM.VALID (on consent events)
        if event_kind == "consent":
            action = event.get("action")
            if action not in _VALID_CONSENT_ACTIONS:
                violations.append(Violation(v, "enum", f"Invalid consent action: {action}", "ENUM.VALID", chain))
            for s in event.get("scopes", []):
                if s not in _VALID_CONSENT_SCOPES:
                    violations.append(Violation(v, "enum", f"Invalid consent scope: {s}", "ENUM.VALID", chain))
            # Track consent state
            for s in event.get("scopes", []):
                consent_state[s] = action

        # EVENT.COMMITMENT
        if event_kind != "redacted":
            computed_ev_hash = _sha256(_canonicalize(event))
            if entry.get("eventHash") != computed_ev_hash:
                violations.append(Violation(v, "hash", "eventHash mismatch", "EVENT.COMMITMENT", chain))
        # For redacted events, EVENT.COMMITMENT is not_applicable

        # HASH.PREV_LINK
        if entry.get("prevHash") != prev_hash:
            violations.append(Violation(v, "hash", "prevHash mismatch", "HASH.PREV_LINK", chain))

        # HASH.ENTRY_RECOMPUTE
        hashable = {
            "version": entry.get("version"),
            "timestamp": entry.get("timestamp"),
            "eventHash": entry.get("eventHash"),
            "prevHash": entry.get("prevHash"),
        }
        computed_entry_hash = _sha256(_canonicalize(hashable))
        if entry.get("entryHash") != computed_entry_hash:
            violations.append(Violation(v, "hash", "entryHash mismatch", "HASH.ENTRY_RECOMPUTE", chain))

        ev_by_version[v] = entry
        ev_by_hash[entry.get("entryHash", "")] = entry
        prev_version = v if isinstance(v, int) else prev_version
        prev_ts = ts
        prev_hash = entry.get("entryHash", "")

    # ── Estimate chains ──────────────────────────────────────────────

    estimator_summaries = []
    for idx, est_chain in enumerate(estimates):
        chain_label = f"estimate:{idx}"
        estimator = est_chain.get("estimator", {})

        # ESTIMATE.DECLARED
        if not estimator.get("name"):
            violations.append(Violation(0, "schema", "Estimator name missing", "ESTIMATE.DECLARED", chain_label))

        is_opaque = estimator.get("opaque", True)
        rule_id = estimator.get("ruleId")
        default_params = estimator.get("params", {})

        estimator_summaries.append({
            "name": estimator.get("name", "unknown"),
            "version": estimator.get("version", "?"),
            "opaque": is_opaque,
        })

        est_entries = est_chain.get("entries", [])
        est_compacted = est_chain.get("compactedBefore")
        est_prev_version = est_compacted["version"] if est_compacted else 0
        est_prev_hash = est_compacted.get("summaryHash", "") if est_compacted else ""
        last_updated: Optional[float] = None
        last_ev_version = 0

        for entry in est_entries:
            v = entry.get("version", -1)

            # VERSION.MONOTONIC
            if isinstance(v, int) and v <= est_prev_version:
                violations.append(Violation(v, "version", f"Version {v} <= previous {est_prev_version}", "VERSION.MONOTONIC", chain_label))

            # HASH.PREV_LINK
            if entry.get("prevHash") != est_prev_hash:
                violations.append(Violation(v, "hash", "prevHash mismatch", "HASH.PREV_LINK", chain_label))

            # HASH.ENTRY_RECOMPUTE
            hashable = {k: v for k, v in entry.items() if k != "entryHash"}
            computed = _sha256(_canonicalize(hashable))
            if entry.get("entryHash") != computed:
                violations.append(Violation(v, "hash", "entryHash mismatch", "HASH.ENTRY_RECOMPUTE", chain_label))

            # ESTIMATE.LINKS_EVIDENCE
            ev_ver = entry.get("evidenceVersion")
            ev_hash = entry.get("evidenceEntryHash")
            if ev_ver and ev_ver not in ev_by_version:
                violations.append(Violation(v, "schema", f"evidenceVersion {ev_ver} not in evidence chain", "ESTIMATE.LINKS_EVIDENCE", chain_label))
            elif ev_hash and ev_hash not in ev_by_hash:
                violations.append(Violation(v, "hash", f"evidenceEntryHash not in evidence chain", "ESTIMATE.LINKS_EVIDENCE", chain_label))

            # ESTIMATE.ORDER
            if ev_ver is not None and ev_ver <= last_ev_version:
                violations.append(Violation(v, "version", f"evidenceVersion {ev_ver} <= previous {last_ev_version}", "ESTIMATE.ORDER", chain_label))

            # ENUM.VALID
            tr = entry.get("triageResult")
            if tr and tr not in _VALID_TRIAGE_RESULTS:
                violations.append(Violation(v, "enum", f"Invalid triageResult: {tr}", "ENUM.VALID", chain_label))
            dl = entry.get("depthLevel")
            if dl and dl not in _VALID_DEPTH_LEVELS:
                violations.append(Violation(v, "enum", f"Invalid depthLevel: {dl}", "ENUM.VALID", chain_label))
            dt = entry.get("decisionTier")
            if dt and dt not in _VALID_DECISION_TIERS:
                violations.append(Violation(v, "enum", f"Invalid decisionTier: {dt}", "ENUM.VALID", chain_label))

            # WEIGHT.RANGE
            w = entry.get("evidentialWeight")
            if isinstance(w, (int, float)) and (w < 0 or w > 1):
                violations.append(Violation(v, "schema", f"Weight {w} outside [0,1]", "WEIGHT.RANGE", chain_label))

            # POSTERIOR.RANGE
            for field_name in ("priorPosterior", "updatedPosterior"):
                pv = entry.get(field_name)
                if isinstance(pv, (int, float)) and (pv <= 0 or pv >= 1):
                    violations.append(Violation(v, "schema", f"{field_name} {pv} outside (0,1)", "POSTERIOR.RANGE", chain_label))

            # POSTERIOR.CHAIN
            if last_updated is not None:
                prior = entry.get("priorPosterior")
                if isinstance(prior, (int, float)) and abs(prior - last_updated) > 1e-9:
                    violations.append(Violation(v, "posterior", f"priorPosterior ({prior}) != previous updatedPosterior ({last_updated})", "POSTERIOR.CHAIN", chain_label))

            # ESTIMATE.REPRODUCE
            if not is_opaque and rule_id:
                params = entry.get("params", default_params)
                prior_val = entry.get("priorPosterior")
                updated_val = entry.get("updatedPosterior")
                weight_val = entry.get("evidentialWeight")
                # Need correctness from the linked evidence event
                ev_entry = ev_by_version.get(ev_ver, {})
                ev_event = ev_entry.get("event", {})
                correct = ev_event.get("correct")

                if correct is not None and isinstance(prior_val, (int, float)) and isinstance(weight_val, (int, float)):
                    reproduced = reproduce(rule_id, params, prior_val, correct, weight_val)
                    if reproduced is not None:
                        if abs(reproduced - updated_val) > estimate_tolerance:
                            violations.append(Violation(
                                v, "estimate",
                                f"Reproduced {reproduced:.6f} != recorded {updated_val:.6f} (tolerance {estimate_tolerance})",
                                "ESTIMATE.REPRODUCE", chain_label,
                            ))
                    # else: rule not registered, can't reproduce
                elif ev_event.get("redacted"):
                    pass  # not_applicable for redacted events

            est_prev_version = v if isinstance(v, int) else est_prev_version
            est_prev_hash = entry.get("entryHash", "")
            up = entry.get("updatedPosterior")
            if isinstance(up, (int, float)):
                last_updated = up
            if ev_ver is not None:
                last_ev_version = ev_ver

    # ── Record-level checks ──────────────────────────────────────────

    # CONSENT.SCOPE and CONSENT.WITHDRAWAL
    if export_block:
        export_scope = export_block.get("scope")
        if export_scope and export_scope in consent_state:
            if consent_state[export_scope] == "withdrawn":
                violations.append(Violation(0, "consent", f"Scope '{export_scope}' was withdrawn before export", "CONSENT.WITHDRAWAL", "record"))
        elif export_scope and export_scope not in consent_state:
            violations.append(Violation(0, "consent", f"No consent recorded for scope '{export_scope}'", "CONSENT.SCOPE", "record"))

    # ATTEST.INTEGRITY and ATTEST.COVERS
    for att in attestations:
        # ATTEST.INTEGRITY
        if att.get("payload") and att.get("payloadHash"):
            computed = _sha256(_canonicalize(att["payload"]))
            if computed != att["payloadHash"]:
                violations.append(Violation(0, "hash", "Attestation payloadHash mismatch", "ATTEST.INTEGRITY", "record"))

        # ATTEST.COVERS
        covers = att.get("covers", {})
        if "throughEvidenceVersion" in covers:
            tv = covers["throughEvidenceVersion"]
            if tv not in ev_by_version:
                violations.append(Violation(0, "schema", f"Attestation covers version {tv} not in evidence", "ATTEST.COVERS", "record"))
        if "evidenceEntryHash" in covers:
            eh = covers["evidenceEntryHash"]
            if eh not in ev_by_hash:
                violations.append(Violation(0, "hash", "Attestation covers hash not in evidence", "ATTEST.COVERS", "record"))

    return VerificationResult_v03(
        valid=len(violations) == 0,
        level=level,
        violations=violations,
        entries_checked=len(ev_entries) + sum(len(e.get("entries", [])) for e in estimates),
        estimators=estimator_summaries,
    )
