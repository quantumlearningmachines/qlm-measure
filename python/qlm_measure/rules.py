"""
Public update rule registry.

Each rule is a pure function: given inputs, produce a posterior.
Rules are keyed by ruleId. Third-party rules can be registered.

This module ships with the SDK and has no server dependency.
"""
from __future__ import annotations

import math
from typing import Callable, Optional

# Rule signature: (prior, correct, weight, params) -> posterior
RuleFn = Callable[[float, bool, float, dict], float]

_REGISTRY: dict[str, RuleFn] = {}


def register_rule(rule_id: str, fn: RuleFn) -> None:
    """Register a rule implementation."""
    _REGISTRY[rule_id] = fn


def get_rule(rule_id: str) -> Optional[RuleFn]:
    """Look up a rule by ID. Returns None if not registered."""
    return _REGISTRY.get(rule_id)


def reproduce(
    rule_id: str,
    params: dict,
    prior: float,
    correct: bool,
    weight: float,
) -> Optional[float]:
    """Reproduce a posterior using a registered rule.

    Returns the posterior, or None if the rule is not registered.
    """
    fn = get_rule(rule_id)
    if fn is None:
        return None
    return fn(prior, correct, weight, params)


# ── tempered-bkt-1 ──────────────────────────────────────────────────────
# Written from depth_engine/update.py, verified against golden vectors.
# Spec: rules/tempered-bkt-1.md

def _tempered_bkt_1(prior: float, correct: bool, weight: float, params: dict) -> float:
    """Tempered BKT update rule.

    Inputs:
        prior: P(L) in (0, 1) exclusive
        correct: whether the response was correct
        weight: evidential weight in [0, 1]
        params: must contain 'slip' and 'guess'

    Returns:
        posterior P(L | response) in (0, 1)
    """
    slip = params["slip"]
    guess = params["guess"]

    if prior <= 0.0 or prior >= 1.0:
        raise ValueError(f"prior must be in (0, 1), got {prior}")
    if weight < 0.0 or weight > 1.0:
        raise ValueError(f"weight must be in [0, 1], got {weight}")

    if weight == 0.0:
        return prior

    if correct:
        p_obs_mastered = (1.0 - slip) ** weight
        p_obs_not_mastered = guess ** weight
    else:
        p_obs_mastered = slip ** weight
        p_obs_not_mastered = (1.0 - guess) ** weight

    numerator = prior * p_obs_mastered
    denominator = numerator + (1.0 - prior) * p_obs_not_mastered
    posterior = numerator / denominator

    return max(1e-15, min(1.0 - 1e-15, posterior))


register_rule("tempered-bkt-1", _tempered_bkt_1)
