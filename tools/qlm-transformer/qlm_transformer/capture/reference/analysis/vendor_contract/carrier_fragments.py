"""Proposed extension fragments, not complete certified carrier records."""
from copy import deepcopy
from validate_contract import absolute_reference, validate

KEY = "https://example.org/learnlog/proposal/assistance-capture/0.1.0"


def sidecar_host(value):
    if not isinstance(value, str) or not value.strip() or not absolute_reference(value):
        raise ValueError("A sidecar requires an explicit absolute host record reference")
    return value


def fragment(carrier, record, host_record_reference=None):
    validate(record)
    payload = deepcopy(record)
    if carrier == "xapi":
        return {"context": {"extensions": {KEY: payload}}}
    if carrier == "caliper_event":
        return {"extensions": {KEY: payload}}
    if carrier == "learnlog_sidecar":
        return {"host_record_reference": sidecar_host(host_record_reference), "assistance_capture": payload}
    raise ValueError("Unsupported carrier")


def extract(carrier, value):
    if carrier == "xapi":
        record = value["context"]["extensions"][KEY]
    elif carrier == "caliper_event":
        record = value["extensions"][KEY]
    elif carrier == "learnlog_sidecar":
        sidecar_host(value.get("host_record_reference"))
        record = value["assistance_capture"]
    else:
        raise ValueError("Unsupported carrier")
    return deepcopy(validate(record))
