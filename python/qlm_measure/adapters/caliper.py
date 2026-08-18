"""
Caliper adapter — convert IMS Caliper 1.1/1.2 events to ObservationEvents.

Targets AssessmentItemEvent (Completed) joined with GradeEvent (Graded)
on the same attempt or object.

Actor: Person actors only (Groups skipped).
Correctness: scoreGiven == maxScore, or a mapping threshold.
Session: session.id, federatedSession.id, or gap inference.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

from .common import pseudonymize


# Caliper event types that map to responses
_ITEM_EVENT_TYPES = {
    "AssessmentItemEvent",
    "http://purl.imsglobal.org/caliper/AssessmentItemEvent",
}
_GRADE_EVENT_TYPES = {
    "GradeEvent",
    "http://purl.imsglobal.org/caliper/GradeEvent",
}
_ITEM_ACTIONS = {"Completed", "Submitted"}
_GRADE_ACTIONS = {"Graded", "Scored"}


def _extract_actor_id(actor: dict) -> Optional[str]:
    """Extract actor ID from a Caliper Person entity."""
    if not actor:
        return None
    actor_type = actor.get("type", actor.get("@type", ""))
    if actor_type not in ("Person", "http://purl.imsglobal.org/caliper/Person"):
        return None
    return actor.get("id") or actor.get("@id")


def _extract_session_id(event: dict) -> Optional[str]:
    """Extract session from Caliper event."""
    session = event.get("session")
    if isinstance(session, dict):
        return session.get("id") or session.get("@id")
    if isinstance(session, str):
        return session
    fed = event.get("federatedSession")
    if isinstance(fed, dict):
        return fed.get("id") or fed.get("@id")
    if isinstance(fed, str):
        return fed
    return None


def _extract_object_id(event: dict) -> Optional[str]:
    """Extract the object (item) ID."""
    obj = event.get("object")
    if isinstance(obj, dict):
        return obj.get("id") or obj.get("@id")
    if isinstance(obj, str):
        return obj
    return None


def _extract_attempt_id(event: dict) -> Optional[str]:
    """Extract attempt ID for joining item events with grade events."""
    generated = event.get("generated")
    if isinstance(generated, dict):
        attempt = generated.get("attempt") or generated.get("assignable")
        if isinstance(attempt, dict):
            return attempt.get("id") or attempt.get("@id")
        if isinstance(attempt, str):
            return attempt
        return generated.get("id") or generated.get("@id")
    return _extract_object_id(event)


def _parse_duration_caliper(event: dict) -> Optional[int]:
    """Extract duration in ms from Caliper event."""
    generated = event.get("generated")
    if isinstance(generated, dict):
        duration = generated.get("duration")
        if isinstance(duration, str):
            # ISO 8601 duration
            import re
            m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?", duration)
            if m:
                h = int(m.group(1) or 0)
                mins = int(m.group(2) or 0)
                s = float(m.group(3) or 0)
                return int((h * 3600 + mins * 60 + s) * 1000)
        if isinstance(duration, (int, float)):
            return int(duration * 1000)

    # Try endedAtTime - startedAtTime
    started = generated.get("startedAtTime") if isinstance(generated, dict) else None
    ended = generated.get("endedAtTime") if isinstance(generated, dict) else None
    if started and ended:
        from datetime import datetime
        try:
            s = datetime.fromisoformat(started.replace("Z", "+00:00"))
            e = datetime.fromisoformat(ended.replace("Z", "+00:00"))
            return int((e - s).total_seconds() * 1000)
        except (ValueError, TypeError):
            pass
    return None


def load_caliper_events(path: str) -> list[dict]:
    """Load Caliper events from a file (envelope or bare array)."""
    with open(path) as f:
        raw = f.read().strip()

    data = json.loads(raw)
    if isinstance(data, list):
        return data
    # Caliper envelope
    if isinstance(data, dict):
        if "data" in data:
            return data["data"] if isinstance(data["data"], list) else [data["data"]]
        return [data]
    return []


def join_item_and_grade_events(
    events: list[dict],
    join_window_s: float = 600,
) -> list[dict]:
    """Join AssessmentItemEvents with GradeEvents on attempt/object.

    Returns joined records with correctness determined from the grade.
    Unjoined events are returned with correct=None.
    """
    item_events: dict[str, dict] = {}  # attempt_id -> event
    grade_events: dict[str, dict] = {}  # attempt_id -> grade

    unmatched = []

    for ev in events:
        ev_type = ev.get("type", ev.get("@type", ""))
        action = ev.get("action", "")

        if ev_type in _ITEM_EVENT_TYPES and action in _ITEM_ACTIONS:
            attempt_id = _extract_attempt_id(ev)
            if attempt_id:
                item_events[attempt_id] = ev
            else:
                unmatched.append(ev)
        elif ev_type in _GRADE_EVENT_TYPES and action in _GRADE_ACTIONS:
            attempt_id = _extract_attempt_id(ev)
            if attempt_id:
                grade_events[attempt_id] = ev
        # Other event types are skipped

    joined = []
    for attempt_id, item_ev in item_events.items():
        grade_ev = grade_events.get(attempt_id)
        if grade_ev:
            # Determine correctness
            generated = grade_ev.get("generated", {})
            score_given = None
            max_score = None
            if isinstance(generated, dict):
                score_given = generated.get("scoreGiven")
                max_score = generated.get("maxScore") or generated.get("totalScore")

            correct = None
            if score_given is not None and max_score is not None:
                try:
                    correct = float(score_given) >= float(max_score)
                except (ValueError, TypeError):
                    pass
            elif score_given is not None:
                try:
                    correct = float(score_given) > 0
                except (ValueError, TypeError):
                    pass

            item_ev["_correct"] = correct
            item_ev["_grade"] = grade_ev
        else:
            item_ev["_correct"] = None

        joined.append(item_ev)

    return joined


def to_observation_event(
    event: dict,
    salt: bytes,
    mapping: Optional[dict] = None,
) -> tuple[Optional[dict], Optional[str]]:
    """Convert one Caliper event to an ObservationEvent.

    Expects a joined event (with _correct set by join_item_and_grade_events).

    Returns:
        (event, None) on success
        (None, skip_reason) on skip
    """
    mapping = mapping or {}

    actor = event.get("actor", {})
    if isinstance(actor, str):
        actor = {"id": actor, "type": "Person"}
    actor_id = _extract_actor_id(actor)
    if not actor_id:
        return None, "no_actor"

    correct = event.get("_correct")
    if correct is None:
        # Try mapping threshold
        threshold = mapping.get("correctThreshold")
        generated = event.get("generated", {})
        if isinstance(generated, dict) and threshold is not None:
            score = generated.get("scoreGiven")
            max_s = generated.get("maxScore")
            if score is not None and max_s is not None:
                try:
                    correct = float(score) / float(max_s) >= threshold
                except (ValueError, TypeError, ZeroDivisionError):
                    pass
        if correct is None:
            return None, "no_score"

    ts = event.get("eventTime", "")
    session_id = _extract_session_id(event)
    object_id = _extract_object_id(event)
    duration_ms = _parse_duration_caliper(event)

    # Source
    ed_app = event.get("edApp", {})
    source = ed_app.get("id") if isinstance(ed_app, dict) else str(ed_app) if ed_app else "caliper"

    # Domain
    domain_map = mapping.get("domainMap", {})
    group = event.get("group", {})
    group_id = group.get("id") if isinstance(group, dict) else str(group) if group else ""
    domain = domain_map.get(group_id, "unmapped")

    # Skill
    obj = event.get("object", {})
    skill_id = None
    if isinstance(obj, dict):
        part_of = obj.get("isPartOf")
        if isinstance(part_of, dict):
            skill_id = part_of.get("id")
        elif isinstance(part_of, str):
            skill_id = part_of

    student_id = pseudonymize(actor_id, salt)

    obs: dict[str, Any] = {
        "kind": "observation",
        "studentId": student_id,
        "source": source,
        "timestamp": ts,
        "correct": bool(correct),
        "domain": domain,
    }

    if session_id:
        obs["sessionId"] = session_id
    if skill_id:
        obs["skillId"] = skill_id
    if duration_ms is not None:
        obs["responseTimeMs"] = duration_ms

    obs["ext"] = {
        "sourceEventId": event.get("id") or event.get("@id", ""),
        "type": event.get("type", event.get("@type", "")),
        "action": event.get("action", ""),
        "objectId": object_id or "",
        "sourceHash": hashlib.sha256(
            json.dumps(event, sort_keys=True, separators=(",", ":"), default=str).encode()
        ).hexdigest(),
    }

    if session_id:
        obs["_registration"] = session_id

    return obs, None
