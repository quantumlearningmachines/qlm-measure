#!/usr/bin/env python3
"""Opt-in, pinned source fetch; raw learner telemetry is never packaged.

IDETrace's pinned Croissant dataset declaration specifies CC-BY-4.0 and lists
raw telemetry in its distribution. This is the documented reuse basis for the
selected transformation and aggregate analysis, with attribution and changes
identified. Research opt-in remains a deliberate data-access safeguard. It is
not an ethics determination; learner text/code/identifiers are not packaged.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

from aggregate import ZENODO_SHA, TUTORTRACE_SHA, TUTORTRACE_COMMIT

SOURCES = {
    "zenodo": {
        "url": "https://zenodo.org/api/records/17551130/files/ai_hints_interaction.zip/content",
        "sha256": ZENODO_SHA, "bytes": 54628100,
        "filename": "zenodo17551130.private.zip",
    },
    "tutortrace": {
        "url": "https://raw.githubusercontent.com/divadbaroon/TutorTrace_dataset_and_benchmark/" + TUTORTRACE_COMMIT + "/dataset/raw_telemetry/deployment_8.json",
        "sha256": TUTORTRACE_SHA, "bytes": 8370959,
        "filename": "tutortrace_deployment8.private.json",
    },
}


def fetch_one(name, cache_dir, allow_tutortrace_research=False):
    if name == "tutortrace" and not allow_tutortrace_research:
        raise ValueError("Read the source caveats and explicitly pass --allow-tutortrace-research before fetching TutorTrace")
    source = SOURCES[name]
    target = Path(cache_dir) / source["filename"]
    if target.exists():
        data = target.read_bytes()
        mode = "existing_cache_verified"
    else:
        with urlopen(Request(source["url"], headers={"User-Agent": "QLM reproducible assistance-log research audit"}), timeout=60) as response:
            data = response.read()
        mode = "downloaded_and_verified"
    if len(data) != source["bytes"] or hashlib.sha256(data).hexdigest() != source["sha256"]:
        raise ValueError("Input does not match pinned byte length and SHA-256: " + name)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(data)
    return {"source": name, "mode": mode, "bytes": len(data), "sha256": source["sha256"], "raw_rows_distributed": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--source", choices=["zenodo", "tutortrace", "both"], default="zenodo")
    parser.add_argument("--allow-tutortrace-research", action="store_true")
    args = parser.parse_args()
    if args.source in ("tutortrace", "both") and not args.allow_tutortrace_research:
        parser.error("TutorTrace metadata and privacy caveats require --allow-tutortrace-research; no data was downloaded")
    names = ["zenodo", "tutortrace"] if args.source == "both" else [args.source]
    print(json.dumps([fetch_one(name, args.cache_dir, args.allow_tutortrace_research) for name in names], indent=2))


if __name__ == "__main__":
    main()
