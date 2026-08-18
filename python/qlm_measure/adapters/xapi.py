"""
xAPI adapter — convert xAPI statements to ObservationEvents.

Targets xAPI 1.0.3 statements. Accepts single objects, arrays, or JSONL.

Verb mapping:
  answered, responded, completed (with success), passed, failed → response events
  Everything else → skipped (not_representable)

Actor mapping:
  mbox, mbox_sha1sum, openid, or account.homePage+account.name → HMAC pseudonym
  Group actors → skipped (no_actor)
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import Any, Optional

from .common import pseudonymize


# xAPI verbs that map to response events
_RESPONSE_VERBS = {
    "http://adlnet.gov/expapi/verbs/answered",
    "http://adlnet.gov/expapi/verbs/responded",
    "http://adlnet.gov/expapi/verbs/completed",
    "http://adlnet.gov/expapi/verbs/passed",
    "http://adlnet.gov/expapi/verbs/failed",
    "answered", "responded", "completed", "passed", "failed",
}


def _extract_actor_id(actor: dict) -> Optional[str]:
    """Extract a canonical actor identifier from an xAPI actor."""
    if actor.get("objectType") == "Group":
        return None  # skip groups

    if actor.get("mbox"):
        return actor["mbox"]
    if actor.get("mbox_sha1sum"):
        return actor["mbox_sha1sum"]
    if actor.get("openid"):
        return actor["openid"]
    account = actor.get("account")
    if account and account.get("homePage") and account.get("name"):
        return f"{account['homePage']}:{account['name']}"
    return None


def _extract_verb_id(verb: dict) -> str:
    """Extract verb ID."""
    return verb.get("id", "")


def _parse_duration(iso_dur: str) -> Optional[int]:
    """Parse ISO 8601 duration to milliseconds. Basic support for PT format."""
    if not iso_dur:
        return None
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?", iso_dur)
    if not m:
        return None
    hours = int(m.group(1) or 0)
    mins = int(m.group(2) or 0)
    secs = float(m.group(3) or 0)
    return int((hours * 3600 + mins * 60 + secs) * 1000)


def to_observation_event(
    statement: dict,
    salt: bytes,
    mapping: Optional[dict] = None,
) -> tuple[Optional[dict], Optional[str]]:
    """Convert one xAPI statement to an ObservationEvent.

    Returns:
        (event, None) on success
        (None, skip_reason) on skip
    """
    mapping = mapping or {}

    # Actor
    actor = statement.get("actor", {})
    actor_id = _extract_actor_id(actor)
    if not actor_id:
        return None, "no_actor"

    # Verb
    verb = statement.get("verb", {})
    verb_id = _extract_verb_id(verb)
    if verb_id not in _RESPONSE_VERBS:
        # Check short form
        verb_display = verb.get("display", {})
        short = next(iter(verb_display.values()), "") if verb_display else ""
        if short.lower() not in _RESPONSE_VERBS:
            return None, "not_representable"

    # Result
    result = statement.get("result", {})
    success = result.get("success")
    if success is None:
        # Try mapping rule
        score_rule = mapping.get("correctFromScore")
        if score_rule and result.get("score", {}).get("scaled") is not None:
            threshold = score_rule.get("threshold", 0.7)
            success = result["score"]["scaled"] >= threshold
        else:
            return None, "no_success"

    # Timestamp
    ts = statement.get("timestamp") or statement.get("stored")
    ts_source = "timestamp" if statement.get("timestamp") else "stored"

    # Duration
    duration_ms = _parse_duration(result.get("duration", ""))

    # Domain
    domain_map = mapping.get("domainMap", {})
    context = statement.get("context", {})
    context_activities = context.get("contextActivities", {})
    categories = context_activities.get("category", [])
    domain = "unmapped"
    for cat in (categories if isinstance(categories, list) else [categories]):
        cat_id = cat.get("id", "") if isinstance(cat, dict) else str(cat)
        if cat_id in domain_map:
            domain = domain_map[cat_id]
            break

    # Skill
    parent = context_activities.get("parent", [])
    skill_id = None
    if parent:
        p = parent[0] if isinstance(parent, list) else parent
        skill_id = p.get("id") if isinstance(p, dict) else str(p)

    # Platform/source
    source = context.get("platform") or "xapi"

    # Scaffold (from mapping only)
    scaffold_type = None
    ext_map = mapping.get("extensionMap", {})
    extensions = context.get("extensions", {})
    for ext_key, scaffold_val in ext_map.items():
        if ext_key in extensions:
            scaffold_type = scaffold_val
            break

    # Build event
    student_id = pseudonymize(actor_id, salt)
    registration = context.get("registration")

    event: dict[str, Any] = {
        "kind": "observation",
        "studentId": student_id,
        "source": source,
        "timestamp": ts,
        "correct": bool(success),
        "domain": domain,
    }

    if skill_id:
        event["skillId"] = skill_id
    if duration_ms is not None:
        event["responseTimeMs"] = duration_ms
        event["ext"] = event.get("ext", {})
        event["ext"]["responseTimeSource"] = "result.duration"
    if scaffold_type:
        event["scaffoldType"] = scaffold_type
    if result.get("score", {}).get("scaled") is not None:
        event["score"] = result["score"]["scaled"]

    # Extension fields (safe subset)
    event.setdefault("ext", {})
    event["ext"]["sourceStatementId"] = statement.get("id", "")
    event["ext"]["verb"] = verb_id
    event["ext"]["objectId"] = statement.get("object", {}).get("id", "")
    event["ext"]["sourceHash"] = hashlib.sha256(
        json.dumps(statement, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    event["ext"]["timestampSource"] = ts_source

    if registration:
        event["_registration"] = registration  # for session inference

    return event, None


def load_xapi_statements(path: str) -> list[dict]:
    """Load xAPI statements from a file (JSON object, array, or JSONL)."""
    with open(path) as f:
        raw = f.read().strip()

    if raw.startswith("["):
        return json.loads(raw)
    if raw.startswith("{"):
        lines = raw.split("\n")
        if len(lines) > 1 and all(l.strip().startswith("{") for l in lines if l.strip()):
            return [json.loads(l) for l in lines if l.strip()]
        obj = json.loads(raw)
        if "statements" in obj:
            return obj["statements"]
        return [obj]
    raise ValueError(f"Unrecognized xAPI format in {path}")
