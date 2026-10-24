"""Versioned assistance context, mapping disclosures and conservative pooling.

The JSON resources are shared with the browser implementation. Matching hashes
identify a profile; independent semantic review is a separate requirement.
"""
from copy import deepcopy
from importlib.resources import files
import json

from qlm_transformer.core import digest


def resource(name):
    return json.loads(files("qlm_airflow").joinpath("resources", name).read_text(encoding="utf-8"))


PROFILE = resource("assistance-context-v0.1.0.json")
# Profile versions in order. A later version only adds platform contracts; it never
# changes an earlier one. Each platform's documents bind the version that introduced
# its contract, so documents (and ledger payloads) written before a new platform was
# added keep their exact binding and still verify.
PROFILE_V0_2 = resource("assistance-context-v0.2.0.json")
PROFILES = (PROFILE, PROFILE_V0_2)
IMPORT_SCHEMA = resource("research-import-v2.json")
LIFECYCLE_SCHEMA = resource("assistance-lifecycle-v1.json")
SANDPIPER_SCHEMA = resource("sandpiper-utterance-v1.json")
_MISSING = object()


def normalize_context(value=_MISSING):
    if value is _MISSING:
        value = {}
    if not isinstance(value, dict) or any(key not in PROFILE["context_fields"] for key in value):
        raise ValueError("context must use only declared assistance-context fields")
    context = {}
    for key, definition in PROFILE["context_fields"].items():
        item = value.get(key, definition["default"])
        if "values" in definition:
            if item not in definition["values"]:
                raise ValueError("unsupported context " + key)
        elif item is not None and (not isinstance(item, str) or not item.strip() or len(item) > 2000):
            raise ValueError("context " + key + " must be null or nonempty bounded text")
        context[key] = item
    if context["capture"] == "complete_within_boundary" and context["capture_boundary"] is None:
        raise ValueError("complete capture requires an explicit capture_boundary")
    return context


def binding(schema):
    result = {"id": schema.get("profile_id", schema["$id"]), "sha256": digest(schema), "hash_basis": "RFC8785"}
    if "version" in schema:
        result["version"] = schema["version"]
    return result


def profile_for(platform):
    """The profile version that introduced this platform's mapping contract."""
    for profile in PROFILES:
        if isinstance(platform, str) and platform in profile["semantics"]:
            return profile
    raise ValueError("source has no declared semantic mapping contract")


def mapping_contract(platform):
    return deepcopy(profile_for(platform)["semantics"][platform])


def apply_semantic_header(header, platform, schema):
    header["semantic_profile_binding"] = binding(profile_for(platform))
    header["semantic_mapping"] = mapping_contract(platform)
    header["event_schema_bindings"] = [binding(schema)]


def pooling_compatibility(sources):
    """Match browser screening of declared source mappings and context strata."""
    if not isinstance(sources, list):
        raise ValueError("pooling inputs must be an array")
    reasons, strata, reference = [], [], None
    fields = ("measurement_profile", "target_unit", "denominator", "coding_method", "definition")
    for source in sources:
        if not isinstance(source, dict):
            source = {"invalid_descriptor": True}
        source_id = source.get("source_id")
        mapping, local = source.get("mapping"), []
        def reason(code, detail):
            local.append({"code": code, "detail": detail})
        if source.get("invalid_descriptor") or not isinstance(mapping, dict):
            reason("invalid_descriptor", "A structured mapping descriptor is required.")
        mapping = mapping if isinstance(mapping, dict) else {}
        if not isinstance(source_id, str) or not source_id.strip():
            reason("source_id_unknown", "A nonempty source stratum identity is required.")
        if source.get("source_kind") == "synthetic_fixture":
            reason("synthetic_fixture", "Synthetic contract fixtures cannot enter empirical pooled measurement.")
        if source.get("context_consistent") is False:
            reason("context_mixed", "Input contexts vary; stratify before considering pooling.")
        review = mapping.get("review")
        if not isinstance(review, dict) or review.get("status") != "independently_reviewed":
            reason("mapping_unreviewed", "Mapping has not been independently reviewed for semantic validity.")
        elif not all(isinstance(review.get(key), str) and review[key].strip() for key in ("reviewer", "scope", "reference")) or not review["reference"].startswith("https://"):
            reason("review_documentation_missing", "An independent review declaration requires reviewer, scope and an HTTPS review-record reference.")
        for key in ("source_unit",):
            if not isinstance(mapping.get(key), str) or not mapping[key].strip():
                reason(key + "_unknown", "Mapping " + key + " must be defined explicitly.")
        for key in ("transformations", "information_loss"):
            values = mapping.get(key)
            if not isinstance(values, list) or (key == "transformations" and not values) or any(not isinstance(item, str) or not item.strip() for item in values):
                reason(key + "_unknown", "Mapping " + key + " must be an explicit list of nonempty descriptions.")
        for field in fields:
            if not isinstance(mapping.get(field), str) or not mapping[field].strip():
                reason(field + "_unknown", "A shared " + field + " is not established.")
        coverage = mapping.get("coverage")
        if not isinstance(coverage, dict) or coverage.get("status") != "complete_within_boundary" or not isinstance(coverage.get("boundary"), str) or not coverage["boundary"].strip():
            reason("coverage_not_established", "Comparable capture coverage within an explicit boundary is not established.")
        signature = {field: mapping.get(field) for field in fields}
        signature["coverage"] = {"status": coverage.get("status"), "boundary": coverage.get("boundary")} if isinstance(coverage, dict) else None
        if source.get("context"):
            try:
                context = normalize_context(source["context"])
                signature["context"] = {key: context[key] for key in ("phase", "permission", "observed_use", "capture", "capture_boundary")}
                if context["phase"] == "unknown" or context["permission"] == "unknown" or context["observed_use"] == "unknown" or context["capture"] != "complete_within_boundary":
                    reason("context_unknown", "Phase, permitted assistance, observed-use scope and bounded capture must be established or explicitly stratified.")
            except ValueError:
                reason("context_invalid", "Declared assistance context is malformed.")
        else:
            reason("context_unknown", "No activity and assistance context was supplied.")
        if reference is not None:
            for field in fields:
                if signature[field] != reference[field]:
                    reason(field + "_incompatible", field + " differs from the first selected source.")
            if signature["coverage"] != reference["coverage"]:
                reason("coverage_incompatible", "Capture boundaries or coverage declarations differ.")
            if signature.get("context") != reference.get("context"):
                reason("context_incompatible", "Activity or assistance contexts differ; preserve source/context strata.")
        else:
            reference = signature
        strata.append({"source_id": source_id, "source_kind": source.get("source_kind", "unverified_user_input"),
                       "mapping_review": review.get("status", "unknown") if isinstance(review, dict) else "unknown", "signature": signature, "reasons": local})
        reasons.extend({"source_id": source_id, **item} for item in local)
    if len({source.get("source_id") for source in sources if isinstance(source, dict) and isinstance(source.get("source_id"), str) and source["source_id"].strip()}) < 2:
        reasons.append({"source_id": None, "code": "multiple_sources_required", "detail": "At least two distinct source strata are required for a pooling decision."})
    eligible = len(sources) >= 2 and not reasons
    return {"profile_id": "qlm:pooling-compatibility:0.1.0", "eligible": eligible,
            "status": "eligible_for_descriptive_pooling" if eligible else "blocked", "source_strata": strata, "reasons": reasons,
            "limitations": ["This screen checks declared compatibility; it does not validate declarations or mappings.",
                            "Eligibility does not establish independent observations, equivalent learning constructs, transportability or causal effects.",
                            "Do not add heterogeneous counts or treat missing assistance data as zero."]}
