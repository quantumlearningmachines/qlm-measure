"""Learnlog draft-01 contained writer. Vendor fields are explicitly mapped."""
import copy
import base64
import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime, timezone
import rfc8785
from . import ai

PLATFORMS = ('khan_academy', 'mathia', 'ixl', 'dreambox', 'aleks')
# An experimental schema identifier, not an IANA registration or deployed endpoint.
SCHEMA = 'https://example.org/qlm-transformer/schemas/import-v0.2'
RFC3339 = re.compile(
    r'[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2}'
    r'(?:\.([0-9]+))?(?:[Zz]|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])')

def digest(value):
    return hashlib.sha256(rfc8785.dumps(value)).hexdigest()

def timestamp(value):
    match = RFC3339.fullmatch(value) if isinstance(value, str) else None
    if match is None:
        raise ValueError('timestamp must be an RFC3339 string with timezone')
    if match.group(1) is not None and len(match.group(1)) > 6:
        raise ValueError('timestamp precision greater than 6 fractional digits is unsupported')
    try:
        date = datetime.fromisoformat(value.upper().replace('Z', '+00:00'))
        return date.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    except (ValueError, OverflowError) as exc:
        raise ValueError('timestamp is outside the supported RFC3339 calendar range') from exc

def subject_id(platform, tenant, value, key):
    if len(key) < 32:
        raise ValueError('pseudonym key must contain at least 32 bytes')
    if isinstance(value, str):
        if not value.strip():
            raise ValueError('identifier must contain non-whitespace text')
        identifier = value
    elif isinstance(value, int) and not isinstance(value, bool):
        # Decimal integers retain the original string/integer HMAC equivalence.
        # Calling the base implementation avoids arbitrary object string coercion.
        identifier = int.__repr__(value)
    else:
        raise ValueError('identifier must be nonempty text or a non-boolean integer')
    message = rfc8785.dumps([tenant, platform, identifier])
    return 'qlm:' + hmac.new(key, message, hashlib.sha256).hexdigest()

def _validate_actor(actor, label='actor'):
    """Validate this importer's explicit actor subset, not the full Party CDDL."""
    if not isinstance(actor, dict):
        raise ValueError(label + ' must be an object')
    if not isinstance(actor.get('role'), str) or not actor['role'].strip():
        raise ValueError(label + '.role must be nonempty text')
    if actor.get('kind') not in ('human', 'software'):
        raise ValueError(label + '.kind must be human or software')
    if 'id' in actor and (not isinstance(actor['id'], str) or not actor['id'].strip()):
        raise ValueError(label + '.id must be nonempty text when present')

def _validate_text_mapping(mapping, label):
    """Check only map types used by the importer; permit additional profile metadata."""
    if not isinstance(mapping, dict):
        raise ValueError(label + ' must be an object')
    for name, value in mapping.items():
        if not isinstance(name, str) or not name.strip():
            raise ValueError(label + ' keys must be nonempty text')
        if not isinstance(value, str) or not value.strip():
            raise ValueError(label + ' values must be nonempty text')

def field(row, mapping, name):
    column = mapping.get(name)
    if column is None:
        return None
    if column not in row:
        raise ValueError('mapped column is absent: ' + column)
    value = row[column]
    return None if value is None or value == '' else value

def transform(rows, platform, profile, key, tenant, imported_at, source_hash, ai_context=None,
              *, custom_platforms=()):
    if not isinstance(profile, dict):
        raise ValueError('profile must be an object')
    if platform not in PLATFORMS and platform not in custom_platforms:
        raise ValueError('unsupported platform')
    if platform not in PLATFORMS and profile.get('platform') != platform:
        raise ValueError('custom platform requires matching explicit profile.platform')
    if not tenant:
        raise ValueError('tenant scope is required')
    imported_at = timestamp(imported_at)
    if profile.get('platform', platform) != platform:
        raise ValueError('profile platform mismatch')
    mapping = profile.get('fields')
    _validate_text_mapping(mapping, 'profile.fields')
    for name in ('metrics', 'event_types'):
        if name in profile:
            _validate_text_mapping(profile[name], 'profile.' + name)
    mode = profile.get('mode', 'summary')
    if mode not in ('summary', 'events'):
        raise ValueError('mode must be summary or events')
    if not mapping.get('subject_id'):
        raise ValueError('a stable subject_id mapping is required; names are not identifiers')
    if 'scaffold_actor' in profile:
        _validate_actor(profile['scaffold_actor'], 'scaffold_actor')
    if ai_context is not None:
        if mode != 'events':
            raise ValueError('AI observation context requires event-mode input; summary reports cannot establish event scope')
        ai_context = ai.prepare_context(ai_context, platform, tenant, key, subject_id)
        if not all(mapping.get(k) for k in ('activity_id', 'activity_version', 'session_id')):
            raise ValueError('AI context requires explicit activity_id, activity_version and session_id mappings')
    records = {}
    for index, row in enumerate(rows, 1):
        if not isinstance(row, dict):
            raise ValueError('rows must be objects')
        raw_subject = field(row, mapping, 'subject_id')
        if raw_subject is None:
            raise ValueError(f'row {index}: subject identifier missing')
        subject = subject_id(platform, tenant, raw_subject, key)
        if subject not in records:
            header = dict(record_id=str(uuid.uuid4()), subject=subject,
                          hash_alg='sha-256', created=imported_at,
                          producer={'name': 'QLM-transformer', 'version': '0.2.1'},
                          source_platform=platform, source_sha256=source_hash,
                          mapping_sha256=digest(profile), import_mode=mode,
                          assistance_coverage='not_established',
                          event_order_basis='input_row_order_not_independently_verified')
            if ai_context is not None:
                header['ai_context'] = copy.deepcopy(ai_context)
            records[subject] = dict(header=header, event_schemas=[SCHEMA], entries=[])
        record = records[subject]
        provenance = dict(platform=platform, source_sha256=source_hash,
                          source_row=index, imported_at=imported_at,
                          mapping_sha256=digest(profile))
        if mode == 'summary':
            # This is an importer action, NOT a retrospectively invented learner action.
            name = 'qlm_import:summary_observed'
            time = imported_at
            metrics = {label: row[column] for label, column in profile.get('metrics', {}).items()
                       if column in row and row[column] not in ('', None)}
            missing = [label for label, column in profile.get('metrics', {}).items()
                       if column not in row or row[column] in ('', None)]
            data = dict(provenance=provenance, reported_metrics=metrics,
                        missing_metrics=missing, assistance='unknown')
            actor = {'role': 'system', 'kind': 'software', 'id': 'QLM-transformer'}
        else:
            time_value = field(row, mapping, 'time')
            if time_value is None:
                raise ValueError(f'row {index}: event time missing')
            time = timestamp(time_value)
            kind = field(row, mapping, 'event_type')
            semantic = profile.get('event_types', {}).get(str(kind))
            if semantic not in ('response', 'help_requested', 'scaffold_provided'):
                raise ValueError(f'row {index}: unmapped event type')
            data = {'provenance': provenance}
            actor = None
            if semantic == 'response':
                name = 'qlm_import:response_observed'
                response = field(row, mapping, 'response')
                if response is None:
                    raise ValueError(f'row {index}: response missing')
                data['response'] = response
            elif semantic == 'help_requested':
                name = 'assist:help_requested'
            else:
                name = 'assist:scaffold_provided'
                scaffold_type = field(row, mapping, 'scaffold_type')
                if scaffold_type is None:
                    raise ValueError(f'row {index}: scaffold type missing')
                data['type'] = str(scaffold_type)
                actor = profile.get('scaffold_actor')
                _validate_actor(actor, 'scaffold_actor')
                ref = field(row, mapping, 'content_ref')
                if ref is not None:
                    data['content_ref'] = str(ref)
                content = field(row, mapping, 'content')
                if content is not None:
                    if not isinstance(content, str):
                        raise ValueError('mapped scaffold content must be a string')
                    data['content'] = content
                reveals_answer = field(row, mapping, 'reveals_answer')
                if reveals_answer is not None:
                    if reveals_answer in ('true', 'false'):
                        reveals_answer = reveals_answer == 'true'
                    if not isinstance(reveals_answer, bool):
                        raise ValueError('mapped reveals_answer must be an explicit boolean')
                    data['reveals_answer'] = reveals_answer
            if name.startswith('assist:') and 'urn:ietf:params:learnlog:events:assist' not in record['event_schemas']:
                record['event_schemas'].append('urn:ietf:params:learnlog:events:assist')
        event = dict(name=name, salt=base64.urlsafe_b64encode(secrets.token_bytes(16)).decode().rstrip('='), data=data)
        if actor:
            event['actor'] = copy.deepcopy(actor)
        if mode == 'events' and semantic == 'scaffold_provided' and 'scaffold_instrument' in profile:
            event['instrument'] = ai.validate_instrument(profile['scaffold_instrument'])
        activity = field(row, mapping, 'activity_id')
        if activity is not None:
            event['activity'] = {'id': str(activity)}
            version = field(row, mapping, 'activity_version')
            if version is not None:
                event['activity']['version'] = str(version)
        session = field(row, mapping, 'session_id')
        if session is not None:
            # Do not publish raw vendor session identifiers.
            event['session'] = subject_id(platform, tenant, session, key)
        if ai_context is not None:
            ai.bind_event(event, ai_context)
        entries = record['entries']
        record_hash = digest(record['header'])
        entry = dict(seq=len(entries)+1, time=time, event_hash=digest(event),
                     prev_hash=entries[-1]['entry_hash'] if entries else record_hash)
        entry['entry_hash'] = digest(dict(record_hash=record_hash, **entry))
        entry['event'] = event
        entries.append(entry)
    if not records:
        raise ValueError('empty input cannot produce a contained LearnLog file')
    document = dict(file_schema='urn:ietf:params:learnlog:file:contained',
                    serialization_format='application/learnlog+json', records=list(records.values()))
    if ai_context is not None:
        for record in document['records']:
            ai.validate_record_context(record)
    return document

def verify(document, expected_heads=None):
    """Validate this writer's subset and hash chain; no signature/truncation support."""
    if not isinstance(document, dict):
        raise ValueError('document must be an object')
    if document.get('file_schema') != 'urn:ietf:params:learnlog:file:contained':
        raise ValueError('unsupported file schema')
    if document.get('serialization_format') != 'application/learnlog+json':
        raise ValueError('unsupported serialization')
    records = document.get('records')
    if not isinstance(records, list) or not records:
        raise ValueError('records must be nonempty')
    heads = {}
    for record in records:
        if not isinstance(record, dict):
            raise ValueError('record must be an object')
        if 'truncated' in record or 'signed_heads' in record:
            raise ValueError('truncation/signature verification not implemented')
        header = record.get('header')
        if not isinstance(header, dict):
            raise ValueError('header must be an object')
        if not isinstance(header.get('record_id'), str) or not header['record_id'].strip():
            raise ValueError('record_id must be nonempty text')
        if header.get('hash_alg') != 'sha-256':
            raise ValueError('unsupported hash algorithm')
        timestamp(header.get('created'))
        if not header['created'].endswith('Z'):
            raise ValueError('LearnLog times must be UTC')
        rh = digest(header)
        prev = rh
        if not isinstance(record.get('entries'), list) or not record['entries']:
            raise ValueError('entries must be nonempty')
        for seq, entry in enumerate(record['entries'], 1):
            if not isinstance(entry, dict):
                raise ValueError('entry must be an object')
            for name in ('seq', 'time', 'event_hash', 'prev_hash', 'entry_hash'):
                if name not in entry:
                    raise ValueError('entry missing required field: ' + name)
            if (not isinstance(entry['seq'], int) or isinstance(entry['seq'], bool)
                    or entry['seq'] != seq or entry['prev_hash'] != prev):
                raise ValueError('broken sequence or previous hash')
            timestamp(entry['time'])
            if not entry['time'].endswith('Z'):
                raise ValueError('LearnLog times must be UTC')
            if ('event' in entry) == ('redacted' in entry):
                raise ValueError('exactly one of event and redacted is required')
            if 'event' in entry:
                event = entry['event']
                if not isinstance(event, dict):
                    raise ValueError('event must be an object')
                if not isinstance(event.get('name'), str) or not event['name'].strip():
                    raise ValueError('event.name must be nonempty text')
                if not isinstance(event.get('salt'), str) or not event['salt']:
                    raise ValueError('event.salt must be nonempty text')
                if not isinstance(event.get('data'), dict):
                    raise ValueError('event.data must be an object')
                if 'actor' in event:
                    _validate_actor(event['actor'])
                if digest(event) != entry['event_hash']:
                    raise ValueError('event hash mismatch')
            elif entry['redacted'] is not True:
                raise ValueError('invalid redaction marker')
            hashed = {k: entry[k] for k in ('seq','time','event_hash','prev_hash')}
            if digest(dict(record_hash=rh, **hashed)) != entry['entry_hash']:
                raise ValueError('entry hash mismatch')
            prev = entry['entry_hash']
        if 'ai_context' in header:
            ai.validate_record_context(record)
        if header['record_id'] in heads:
            raise ValueError('duplicate record ID')
        heads[header['record_id']] = {'seq': len(record['entries']), 'entry_hash': prev}
    if expected_heads is not None and heads != expected_heads:
        raise ValueError('external checkpoint mismatch')
    return heads
