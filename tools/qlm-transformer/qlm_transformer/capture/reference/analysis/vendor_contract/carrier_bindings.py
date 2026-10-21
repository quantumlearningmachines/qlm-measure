"""Bounded draft importer-created observation bindings, not native learner events.

No network, LRS, Sensor API request, authentication or certification is performed.
Caller must supply the actual importer identity and actual record-creation time.
"""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import re
from uuid import UUID, uuid5, NAMESPACE_URL
from urllib.parse import urlsplit

from carrier_fragments import KEY
from validate_contract import absolute_reference, timestamp, validate

PROFILE = "https://example.org/learnlog/proposal/assistance-capture-profile"
PROFILE_VERSION = PROFILE + "/v/0.1.1-draft"
TEMPLATE = PROFILE_VERSION + "/templates/importer-created-observation"
ACTIVITY_TYPE = PROFILE + "/activity-types/assistance-capture-record"
IMPORT = PROFILE + "/extensions/importer-observation"
CREATE = "http://activitystrea.ms/schema/1.0/create"
CALIPER_CONTEXT = "http://purl.imsglobal.org/ctx/caliper/v1p2"
BINDING_VERSION = "0.1.1-draft"
MODE = "importer_created_observation"


def _reference(value, name):
    if not absolute_reference(value):
        raise ValueError(f"{name} must be an explicit absolute reference")
    return value


def _time(value):
    fraction = re.search(r"\.(\d+)(?:[Zz]|[+-]\d{2}:\d{2})$", value) if isinstance(value, str) else None
    if fraction and any(character != "0" for character in fraction.group(1)[3:]):
        raise ValueError("Importer time must be exactly representable at millisecond precision")
    if not timestamp(value):
        raise ValueError("Explicit timezone-bearing importer creation time is required")
    parsed = datetime.fromisoformat(value.upper().replace("Z", "+00:00")).astimezone(timezone.utc)
    if parsed.microsecond % 1000:
        raise ValueError("Importer time must be exactly representable at millisecond precision")
    return parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def capture_digest(record):
    """Implementation-defined JSON digest, not JCS, signature or authenticity proof."""
    validate(record)
    raw = json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def resource_id(record):
    return "urn:learnlog:assistance-capture:sha256:" + capture_digest(record)


def _account(homepage, name):
    """Bounded HTTP(S) Account IRL support; identity ownership is not authenticated."""
    _reference(homepage, "Account homePage")
    parsed = urlsplit(homepage)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Account homePage must be an HTTP(S) account-system homepage URL, not a software URN")
    try:
        parsed.port
    except ValueError as error:
        raise ValueError("Invalid account-system homepage URL") from error
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("Account homePage must not contain credentials")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Account name must be supplied explicitly")
    return {"homePage": homepage, "name": name}


def _metadata(record, importer_id, observed_at, importer_account=None):
    meta = {"binding_version": BINDING_VERSION, "mode": MODE,
            "importer_id": _reference(importer_id, "Importer identity"),
            "created_at": _time(observed_at), "capture_sha256": capture_digest(record),
            "source_record_id": deepcopy(record["record_id"])}
    if importer_account is not None:
        meta["importer_account"] = deepcopy(importer_account)
    return meta


def _event_id(carrier, meta):
    # Arrays avoid concatenation ambiguities. Different records/importers/times get
    # different IDs; repeating the same construction is a stable replay.
    return str(uuid5(NAMESPACE_URL, json.dumps([PROFILE_VERSION, carrier, meta], sort_keys=True, separators=(",", ":"))))


def xapi_statement(record, importer_id, observed_at, *, account_homepage, account_name):
    """Create an xAPI 1.0.3-shaped record of this software creating an observation.

    Actor is the importer software account, never the source learner. timestamp
    is observation-record creation time, never an imputation of source time.
    """
    account = _account(account_homepage, account_name)
    meta = _metadata(record, importer_id, observed_at, account)
    statement = {"id": _event_id("xapi", meta),
        "actor": {"objectType": "Agent", "account": deepcopy(account)},
        "verb": {"id": CREATE, "display": {"en": "created"}},
        "object": {"objectType": "Activity", "id": resource_id(record),
            "definition": {"type": ACTIVITY_TYPE, "name": {"en": "Assistance capture observation record"}}},
        "timestamp": meta["created_at"],
        "context": {"contextActivities": {"category": [{"objectType": "Activity", "id": PROFILE_VERSION}]},
                    "extensions": {KEY: deepcopy(record), IMPORT: meta}}}
    validate_xapi(statement)
    return statement


def caliper_event(record, importer_id, observed_at):
    """Caliper 1.2 GeneralProfile: software Created a DigitalResource record."""
    meta = _metadata(record, importer_id, observed_at)
    event = {"@context": CALIPER_CONTEXT, "id": "urn:uuid:" + _event_id("caliper", meta),
        "type": "Event", "profile": "GeneralProfile",
        "actor": {"id": importer_id, "type": "SoftwareApplication"}, "action": "Created",
        "object": {"id": resource_id(record), "type": "DigitalResource"},
        "eventTime": meta["created_at"], "extensions": {KEY: deepcopy(record), IMPORT: meta}}
    validate_caliper(event)
    return event


def _extensions(value, *, xapi=False):
    if not isinstance(value, dict) or set(value) != {KEY, IMPORT}:
        raise ValueError("Draft binding requires exactly the capture and importer-observation extensions")
    record, meta = value[KEY], value[IMPORT]
    validate(record)
    required = {"binding_version", "mode", "importer_id", "created_at", "capture_sha256", "source_record_id"}
    if xapi:
        required.add("importer_account")
    if not isinstance(meta, dict) or set(meta) != required:
        raise ValueError("Missing or unsupported importer-observation metadata")
    account = None
    if xapi:
        supplied = meta["importer_account"]
        if not isinstance(supplied, dict) or set(supplied) != {"homePage", "name"}:
            raise ValueError("Malformed importer account")
        account = _account(supplied["homePage"], supplied["name"])
    expected = _metadata(record, meta["importer_id"], meta["created_at"], account)
    if meta != expected:
        raise ValueError("Importer metadata does not agree with the capture payload")
    return record, meta


def _authority(value):
    # Deliberately bounded support for a single identified LRS Agent. Group
    # authorities (e.g. some OAuth arrangements) need the full upstream parser;
    # refusing them here is safer than claiming unsupported base validation.
    allowed = {"objectType", "name", "account", "mbox", "mbox_sha1sum", "openid"}
    if not isinstance(value, dict) or set(value) - allowed or value.get("objectType", "Agent") != "Agent":
        raise ValueError("This bounded reader supports only an identified Agent authority")
    identifiers = set(value) & {"account", "mbox", "mbox_sha1sum", "openid"}
    if len(identifiers) != 1:
        raise ValueError("Authority Agent requires exactly one inverse functional identifier")
    if "name" in value and (not isinstance(value["name"], str) or not value["name"].strip()):
        raise ValueError("Invalid authority Agent name")
    if "account" in value:
        account = value["account"]
        if not isinstance(account, dict) or set(account) != {"homePage", "name"} or not isinstance(account["name"], str) or not account["name"].strip():
            raise ValueError("Invalid authority Agent account")
        _account(account["homePage"], account["name"])
    if "openid" in value:
        _reference(value["openid"], "Authority openid")
    if "mbox" in value and (not isinstance(value["mbox"], str) or not re.fullmatch(r"mailto:[^\s@]+@[^\s@]+", value["mbox"])):
        raise ValueError("Invalid authority Agent mbox")
    if "mbox_sha1sum" in value and (not isinstance(value["mbox_sha1sum"], str) or not re.fullmatch(r"[a-fA-F0-9]{40}", value["mbox_sha1sum"])):
        raise ValueError("Invalid authority Agent mbox_sha1sum")


def validate_xapi(statement):
    if not isinstance(statement, dict) or set(statement) - {"id", "actor", "verb", "object", "timestamp", "context", "stored", "authority", "version"}:
        raise ValueError("Unsupported fields in bounded xAPI binding")
    try:
        if not {"id", "actor", "verb", "object", "timestamp", "context"} <= set(statement):
            raise ValueError("Missing required xAPI binding fields")
        context = statement["context"]
        if set(context) != {"contextActivities", "extensions"}:
            raise ValueError("Unsupported xAPI context fields")
        record, meta = _extensions(context["extensions"], xapi=True)
        expected = {"objectType": "Agent", "account": meta["importer_account"]}
        if statement["actor"] != expected:
            raise ValueError("xAPI actor must identify the declared importer software account")
        if statement["verb"] != {"id": CREATE, "display": {"en": "created"}}:
            raise ValueError("xAPI verb must describe creation of the observation record")
        if statement["object"] != {"objectType": "Activity", "id": resource_id(record), "definition": {"type": ACTIVITY_TYPE, "name": {"en": "Assistance capture observation record"}}}:
            raise ValueError("xAPI object must identify the exact capture record")
        if context["contextActivities"] != {"category": [{"objectType": "Activity", "id": PROFILE_VERSION}]}:
            raise ValueError("xAPI category must declare this draft profile version")
        if statement["timestamp"] != meta["created_at"] or statement["id"] != _event_id("xapi", meta):
            raise ValueError("xAPI importer time or record identity mismatch")
        UUID(statement["id"])
        if "stored" in statement and not timestamp(statement["stored"]):
            raise ValueError("Invalid LRS stored timestamp")
        if "version" in statement and (not isinstance(statement["version"], str) or not re.fullmatch(r"1\.0\.(0|[1-9][0-9]*)", statement["version"])):
            raise ValueError("This bounded xAPI 1.0.3 reader supports stable Statement versions 1.0.x")
        if "authority" in statement:
            _authority(statement["authority"])
        # Authority is an LRS-supplied authentication assertion; this tool cannot
        # authenticate or evaluate it. It is retained but never used as evidence.
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError("Malformed xAPI binding") from error
    return statement


def validate_caliper(event):
    required = {"@context", "id", "type", "profile", "actor", "action", "object", "eventTime", "extensions"}
    if not isinstance(event, dict) or set(event) != required:
        raise ValueError("Missing or unsupported fields in bounded Caliper binding")
    try:
        record, meta = _extensions(event["extensions"])
        if event["@context"] != CALIPER_CONTEXT or event["type"] != "Event" or event["profile"] != "GeneralProfile" or event["action"] != "Created":
            raise ValueError("Caliper must describe importer creation using Event/GeneralProfile/Created")
        if event["actor"] != {"id": meta["importer_id"], "type": "SoftwareApplication"}:
            raise ValueError("Caliper actor must identify the declared importer SoftwareApplication")
        if event["object"] != {"id": resource_id(record), "type": "DigitalResource"}:
            raise ValueError("Caliper object must identify the exact capture record")
        if event["eventTime"] != meta["created_at"] or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", event["eventTime"]):
            raise ValueError("Caliper importer event time must agree in UTC milliseconds")
        if event["id"] != "urn:uuid:" + _event_id("caliper", meta):
            raise ValueError("Caliper record identity mismatch")
        UUID(event["id"][9:])
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError("Malformed Caliper binding") from error
    return event


def caliper_envelope(events, sensor_id, send_time):
    envelope = {"sensor": _reference(sensor_id, "Sensor identity"), "sendTime": _time(send_time), "dataVersion": CALIPER_CONTEXT, "data": deepcopy(events)}
    validate_caliper_envelope(envelope)
    return envelope


def validate_caliper_envelope(envelope):
    if not isinstance(envelope, dict) or set(envelope) != {"sensor", "sendTime", "dataVersion", "data"}:
        raise ValueError("Caliper envelope allows no custom top-level properties")
    _reference(envelope["sensor"], "Sensor identity")
    if envelope["sendTime"] != _time(envelope["sendTime"]) or envelope["dataVersion"] != CALIPER_CONTEXT:
        raise ValueError("Invalid Caliper envelope time or data version")
    if not isinstance(envelope["data"], list) or not envelope["data"]:
        raise ValueError("Draft binding envelope requires one or more events")
    identities = set()
    for event in envelope["data"]:
        validate_caliper(event)
        if event["id"] in identities:
            raise ValueError("Duplicate event identity inside envelope")
        identities.add(event["id"])
        if event["eventTime"] > envelope["sendTime"]:
            raise ValueError("Envelope sendTime precedes importer eventTime")
    return envelope


def extract_xapi(statement):
    validate_xapi(statement)
    return deepcopy(statement["context"]["extensions"][KEY])


def extract_caliper(event):
    validate_caliper(event)
    return deepcopy(event["extensions"][KEY])


def extract_caliper_envelope(envelope):
    validate_caliper_envelope(envelope)
    return [extract_caliper(event) for event in envelope["data"]]
