"""Adapter to the proposed AI Use profile; no automatic condition classifier.

The unchanged vendored profile supplies context/sidecar schemas and condition
semantics. Its illustrative example_learning log verifier is deliberately NOT
used on qlm_import events. This module validates the importer's narrower scope.
"""
from copy import deepcopy
import re
import uuid

from .ai_profile.code import learnlog_ai as profile


def validate_context(context):
    profile.validate_schema(context, 'ai-context-v0.1.0.schema.json')
    profile.require(context['policy']['phase'] == context['phase'], 'policy phase mismatch')
    profile.require(context['policy']['scope']['activity_id'] == context['activity']['id'],
                    'policy activity scope mismatch')
    scope = context['observation']['scope']
    profile.require(scope['first_seq'] <= scope['last_seq'], 'reversed context observation scope')
    return context


def prepare_context(context, platform, tenant, key, pseudonymize):
    """Copy an explicit context; input scope.session is the mapped raw session ID.

    This local adapter convention is NOT a new Learnlog profile member. The
    output context and events contain only the scoped HMAC session identifier.
    """
    context = deepcopy(validate_context(context))
    scope = context['observation']['scope']
    scope['session'] = pseudonymize(platform, tenant, scope['session'], key)
    return context


def validate_instrument(instrument):
    profile.require(isinstance(instrument, dict), 'instrument must be an object')
    profile.require(instrument.get('source') in {'deterministic', 'model', 'human'},
                    'explicit instrument source must be deterministic, model or human')
    if instrument['source'] == 'model':
        profile.require(isinstance(instrument.get('model'), str) and instrument['model'],
                        'model instrument requires model identifier')
        profile.require(isinstance(instrument.get('config_hash'), str) and
                        re.fullmatch('[0-9a-f]{64}', instrument['config_hash']) is not None,
                        'model instrument requires SHA-256 configuration hash')
    if 'validated' in instrument:
        profile.require(isinstance(instrument['validated'], bool), 'validated must be explicit boolean')
    return deepcopy(instrument)


def bind_event(event, context):
    profile.require(event.get('activity') == context['activity'],
                    'event activity/version does not match immutable AI context')
    profile.require(event.get('session') == context['observation']['scope']['session'],
                    'event session does not match immutable AI context')
    event['ai_context'] = {'context_id': context['context_id'], 'stage': context['phase'],
                           'policy_id': context['policy']['id']}


def validate_record_context(record):
    context = validate_context(record['header']['ai_context'])
    entries = record['entries']
    scope = context['observation']['scope']
    profile.require(1 <= scope['first_seq'] <= scope['last_seq'] <= len(entries),
                    'context observation scope exceeds record bounds')
    for entry in entries:
        if 'event' not in entry:  # Integrity can be verified after redaction; review cannot.
            continue
        event = entry['event']
        profile.require(event.get('activity') == context['activity'], 'event activity/version mismatch')
        profile.require(event.get('session') == scope['session'], 'event session mismatch')
        profile.require(event.get('ai_context') == {
            'context_id': context['context_id'], 'stage': context['phase'],
            'policy_id': context['policy']['id']}, 'event AI context reference mismatch')
        if 'instrument' in event:
            validate_instrument(event['instrument'])
    return context


def condition_index(document):
    """Verify hash chains and explicit context bindings for supported import logs."""
    from .core import verify, digest
    verify(document)
    index = {}
    for record in document['records']:
        profile.require('ai_context' in record['header'], 'condition review requires an explicit AI context')
        profile.require(all('event' in e for e in record['entries']),
                        'condition review of redacted entries is unsupported')
        context = validate_record_context(record)
        key = (record['header']['record_id'], digest(record['header']))
        index[key] = {'record': record, 'context': context,
                      'entries': {e['seq']: e for e in record['entries']}}
    return index


def conditions_template(document, record_id=None, *, created, synthetic=False):
    """Return all C01-C16 as unreviewed, with no inferred findings or absences.

    One report reviews one immutable record. Multi-record callers must supply
    record_id and produce one report per record; references remain hash-bound.
    """
    profile.check_timestamp(created)
    profile.require(isinstance(synthetic, bool), 'synthetic flag must be boolean')
    index = condition_index(document)
    if record_id is None:
        profile.require(len(index) == 1, 'record_id is required for multi-record input')
        item = next(iter(index.values()))
    else:
        matches = [v for k, v in index.items() if k[0] == record_id]
        profile.require(len(matches) == 1, 'record_id does not resolve')
        item = matches[0]
    from .core import digest
    record, context = item['record'], item['context']
    bound = context['observation']['scope']
    scope = {'record_id': record['header']['record_id'], 'record_hash': digest(record['header']),
             'activity_id': context['activity']['id'], 'session': bound['session'],
             'first_seq': bound['first_seq'], 'last_seq': bound['last_seq'],
             'domain': 'producer_activity_only'}
    catalogue = profile.load_json(profile.BASE / 'conditions.json')
    assessments = [{
        'condition_id': c['condition_id'], 'review_status': 'unreviewed',
        'assertion': c['assertion'], 'scope': deepcopy(scope),
        'operational_definition': c['analysis_requirement'],
        'pending_reason': 'No condition judgment has been made. Review explicit evidence, observation limits and any required comparator.'
    } for c in catalogue['conditions']]
    report = {'profile_id': profile.PROFILE_ID, 'profile_version': profile.VERSION,
              'condition_set_id': profile.CONDITION_SET_ID,
              'condition_set_version': profile.CONDITION_SET_VERSION,
              'report_id': 'urn:uuid:' + str(uuid.uuid4()), 'created': created,
              'synthetic': synthetic,
              'disclaimer': 'Proposed unvalidated condition set. Unreviewed information is not a finding of absence or non-reporting. Permission does not establish use or compliance; outside assistance and learning effects remain unknown.',
              'assessments': assessments}
    verify_conditions(document, report)
    return report


def verify_conditions(document, report):
    """Validate authored condition judgments, their coverage and evidence links.

    This checks structure and references, not the truth of an interpretation.
    Imported row order alone is insufficient for C01 support; this adapter
    rejects supported C01 classifications until observed ordering is verified.
    """
    index = condition_index(document)
    profile.check_timestamp(report['created'])
    result = profile.verify_assessment(report, index)
    for a in report['assessments']:
        if a.get('result') in {'supported_present', 'supported_absent'} and a['condition_id'] == 'C01':
            raise profile.ValidationError('C01 support unavailable: imported row order is not verified observed chronology')
        item = index[(a['scope']['record_id'], a['scope']['record_hash'])]
        context = item['context']
        if a.get('result') == 'supported_present' and a['condition_id'] == 'C06':
            profile.require(context['phase'] == 'assessment' and context['policy']['permission'] in
                            {'permitted', 'restricted'}, 'C06 presence requires applicable assessment permission')
        if a.get('result') == 'supported_present' and a['condition_id'] == 'C07':
            profile.require(context['phase'] == 'assessment' and context['policy']['permission'] ==
                            'prohibited', 'C07 presence requires prohibited assessment policy; restricted-rule interpretation is unsupported')
            observed = []
            for ref in a['evidence']:
                if ref['kind'] == 'entry':
                    evidence_record = index[(ref['record_id'], ref['record_hash'])]
                    if evidence_record is item:
                        observed.append(item['entries'][ref['seq']]['event'])
            profile.require(any(e['name'] == 'assist:scaffold_provided' and
                                e.get('instrument', {}).get('source') == 'model' and
                                e.get('actor', {}).get('kind') == 'software' for e in observed),
                            'C07 presence requires cited observed model assistance, not policy alone')
    return dict(result, integrity='hash_consistent_unsigned', authenticity='not_established',
                conformance='qlm_import_context_and_condition_subset',
                condition_set_validation='not_established')
