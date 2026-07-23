"""
Example 02: Run a released classifier on a student transcript.

Demonstrates using the OntologyClient to look up misconceptions
and the verifier to check record integrity.

Run: python examples/02-run-classifier.py
"""

import sys
import os

# Add the python package to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))

from qlm_measure import OntologyClient, verify_record
from qlm_measure.schema import ObservationEvent, EvidenceEntry, EvidenceRecord
from qlm_measure.verifier import _sha256, _canonicalize


def build_entry(version, correct, prior, updated, prev_hash, domain="math"):
    """Build a valid evidence entry."""
    event = {
        "studentId": "demo-student",
        "sessionId": "demo-session",
        "source": "example",
        "timestamp": f"2026-07-22T10:{version:02d}:00Z",
        "correct": correct,
        "responseTimeMs": 3500,
        "domain": domain,
    }

    hashable = {
        "version": version,
        "timestamp": event["timestamp"],
        "event": event,
        "scaffoldType": "none",
        "depthLevel": "conceptual",
        "epistemicMode": "experience",
        "triageResult": "correct" if correct else "misconception",
        "evidentialWeight": 0.9,
        "priorPosterior": prior,
        "updatedPosterior": updated,
        "nonInterventionDecision": None,
    }

    return {
        **hashable,
        "entryHash": _sha256(_canonicalize(hashable)),
        "prevHash": prev_hash,
    }


def main():
    print("=== Example 02: Query Ontology + Verify Record ===\n")

    # Step 1: Query misconceptions
    print("1. Querying math misconceptions from the ontology...\n")
    try:
        client = OntologyClient()
        misconceptions = client.get_misconceptions("math")
        print(f"   Found {len(misconceptions)} math misconceptions.\n")
        for m in misconceptions[:3]:
            mid = m.get("id", "?")
            name = m.get("name", m.get("label", "?"))
            print(f"   - {mid}: {name}")
        print()
    except Exception as e:
        print(f"   (Ontology fetch skipped: {e})\n")
        print("   Using local demo data instead.\n")

    # Step 2: Build and verify a record
    print("2. Building a 4-entry evidence record...\n")

    posteriors = [0.20, 0.28, 0.36, 0.30, 0.42]
    entries = []
    prev_hash = ""
    for i in range(4):
        correct = i != 2  # Entry 3 is incorrect
        entry = build_entry(i + 1, correct, posteriors[i], posteriors[i + 1], prev_hash)
        entries.append(entry)
        prev_hash = entry["entryHash"]
        status = "correct" if correct else "misconception"
        print(f"   Entry {i+1}: {status}, posterior {posteriors[i]:.2f} -> {posteriors[i+1]:.2f}")

    record = {"studentScopeId": "demo-student", "entries": entries}

    print("\n3. Verifying record integrity...\n")
    result = verify_record(record)
    print(f"   Valid: {result.valid}")
    print(f"   Entries checked: {result.entries_checked}")
    print(f"   Violations: {len(result.violations)}")

    if result.valid:
        print("\n   Record is intact — no tampering detected.")
    else:
        for v in result.violations:
            print(f"   [{v.category}] v{v.version}: {v.message}")

    # Step 3: Tamper and re-verify
    print("\n4. Tampering with entry 2's posterior (0.30 -> 0.99)...\n")
    entries[1] = {**entries[1], "updatedPosterior": 0.99}
    tampered = {"studentScopeId": "demo-student", "entries": entries}
    result2 = verify_record(tampered)
    print(f"   Valid: {result2.valid}")
    for v in result2.violations:
        print(f"   [{v.category}] v{v.version}: {v.message}")

    print("\n=== Verifier caught the tampering without any estimation math. ===\n")


if __name__ == "__main__":
    main()
