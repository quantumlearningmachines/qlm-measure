"""Record fresh checks of the prepared demo and its current download artifacts."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parents[1]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    command = ["node", "--test", "--test-reporter=tap"] + [str(p.relative_to(ROOT)) for p in sorted((ROOT / "tests").glob("*.test.mjs"))]
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    output = result.stdout + result.stderr
    (ROOT / "PROFILE_TEST_RESULTS.tap").write_text(output, encoding="utf-8")
    release = json.loads((ROOT / "dist/release-candidate.json").read_text())
    downloads = {name: {"expected_sha256": expected["sha256"],
                  "actual_sha256": sha(ROOT / "dist/downloads" / name),
                  "matches": sha(ROOT / "dist/downloads" / name) == expected["sha256"]}
                 for name, expected in release["downloads"].items()}
    paths = ["dist/demo.html", "dist/styles.css", "dist/assistance-gap.mjs", "dist/assistance-profile-examples.mjs",
             "dist/examples/assistance-profile-bindings.json", "dist/downloads/learnlog-assistance-profile-draft.zip",
             "dist/downloads/qlm-transformer-airflow.zip"]
    counts = {key: int(value) for key, value in re.findall(r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$", output, re.MULTILINE)}
    passed = result.returncode == 0 and counts.get("fail") == 0 and all(item["matches"] for item in downloads.values())
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(), "passed": passed,
        "scope": "Current prepared demo, synthetic carrier fixtures, bounded research transformations and regenerated download checksums.",
        "command": command, "exit_code": result.returncode, "node_version": subprocess.check_output(["node", "--version"], text=True).strip(),
        "tests": counts, "download_checksums": downloads,
        "artifact_sha256": {name: sha(ROOT / name) for name in paths},
        "binding_fixture_provenance": json.loads((ROOT / "dist/examples/assistance-profile-bindings.json").read_text())["provenance"],
        "limits": ["No browser visual or interaction QA; managed container has no supported control-browser skill.",
                   "No deployment, endpoint exchange, LRS interoperability or certification performed by this verification.",
                   "Airflow downloads are rebuilt from the current monorepo source. This check does not execute Airflow tasks.",
                   "Synthetic profile fixtures never enter the empirical aggregate. Existing research exports do not claim the new profile's conformance."]
    }
    (ROOT / "PROFILE_VERIFICATION.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": passed, "tests": counts, "download_checksums_match": all(item["matches"] for item in downloads.values())}, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
