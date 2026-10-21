"""Write reproducible software-check evidence; no participant or study results."""
import hashlib
import io
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path
from validate_contract import SCHEMA, validate
from jsonschema import Draft202012Validator

ROOT = Path(__file__).parent


def main():
    Draft202012Validator.check_schema(SCHEMA)
    examples = sorted((ROOT / "examples").glob("SYNTHETIC_hint_*.json"))
    for path in examples:
        validate(json.loads(path.read_text()))
    transcript = io.StringIO()
    suite = unittest.defaultTestLoader.discover(str(ROOT), pattern="test_*.py")
    result = unittest.TextTestRunner(stream=transcript, verbosity=2).run(suite)
    (ROOT / "verification.log").write_text(transcript.getvalue())
    files = sorted(path for path in ROOT.rglob("*") if path.is_file() and "__pycache__" not in path.parts and path.name not in ["verification.json", "verification.log"])
    proof = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "software_checks_passed" if result.wasSuccessful() else "software_checks_failed",
        "scope": "Unpublished assistance capture profile with complete bounded importer-created-observation bindings for xAPI1.0.3 and Caliper1.2; not live receiver interoperability or certification.",
        "schema_id": SCHEMA["$id"], "tests_run": result.testsRun, "failures": len(result.failures), "errors": len(result.errors),
        "synthetic_contract_fixtures_validated": len(examples),
        "fragment_roundtrips_covered_within_tests": 9,
        "complete_carrier_fixture_roundtrips_covered_within_tests": 9,
        "complete_synthetic_source_fixtures": 3,
        "complete_record_models": ["xAPI1.0.3 Statement: importer Agent creates observation Activity", "Caliper1.2 Event/GeneralProfile: importer SoftwareApplication Created observation DigitalResource", "Caliper1.2 envelope: sensor/sendTime/dataVersion/data"],
        "inline_extension_schemas": "Draft7 translation of supported common subset; additional consistency checks required",
        "real_product_observations": 0, "independent_semantic_reviews": 0, "superiority_established": False,
        "limitations": ["Schema validity and local digests cannot authenticate evidence or guarantee truthful capture.", "Bounded emitted-record validation is not a full parser for every valid xAPI or Caliper record.", "Normalized source date-times require Python-supported dates, no leap seconds and exact microsecond representation; importer clocks require exact millisecond representation. Original source strings may retain higher precision.", "Legacy fragments remain distinct from full bindings.", "No live LRS/Sensor API exchange, Caliper certification, governed identifier publication or xAPI2.0 validation occurred.", "Upstream validator evidence is separate; extension presence does not validate contents.", "No common-format record by itself establishes comparability or learning."],
        "sha256": {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in files},
    }
    (ROOT / "verification.json").write_text(json.dumps(proof, indent=2) + "\n")
    print(json.dumps({key: value for key, value in proof.items() if key != "sha256"}, indent=2))
    if not result.wasSuccessful():
        raise SystemExit(1)


if __name__ == "__main__":
    main()
