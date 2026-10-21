"""Regression coverage for the 0.2.1 identifier and envelope audit fixes."""
from copy import deepcopy
import hashlib
import hmac
import unittest

import rfc8785

from qlm_transformer.core import digest, subject_id, timestamp, transform, verify


KEY = b'k' * 32
TIME = '2026-10-08T20:00:00Z'
SOURCE_HASH = 'a' * 64


class StringLikeObject:
    def __str__(self):
        return 'student-1'


class ValidationTests(unittest.TestCase):
    def summary(self, rows=None, profile=None, imported_at=TIME):
        return transform([{'id': 'student-1'}] if rows is None else rows,
                         'ixl', {'fields': {'subject_id': 'id'}} if profile is None else profile,
                         KEY, 'demo', imported_at, SOURCE_HASH)

    def events(self, actor=None, time=TIME):
        profile = {
            'mode': 'events',
            'fields': {'subject_id': 'id', 'time': 'time', 'event_type': 'kind',
                       'scaffold_type': 'scaffold'},
            'event_types': {'help': 'scaffold_provided'},
            'scaffold_actor': {'role': 'instructor', 'kind': 'software'} if actor is None else actor,
        }
        return self.summary([{'id': 'student-1', 'time': time, 'kind': 'help',
                              'scaffold': 'hint'}], profile)

    def rehash(self, document):
        """Recommit mutations so semantic failures cannot be hash mismatches."""
        for record in document['records']:
            record_hash = digest(record['header'])
            previous = record_hash
            for entry in record['entries']:
                if 'event' in entry:
                    entry['event_hash'] = digest(entry['event'])
                entry['prev_hash'] = previous
                hashed = {key: entry[key] for key in ('seq', 'time', 'event_hash', 'prev_hash')}
                entry['entry_hash'] = digest(dict(record_hash=record_hash, **hashed))
                previous = entry['entry_hash']

    def test_subject_ids_preserve_existing_text_and_decimal_integer_hmac_values(self):
        for value in ('student-1', '001', ' 001 ', 'élève', '0', 0, 7, -12, 10 ** 100):
            with self.subTest(value=value):
                expected = 'qlm:' + hmac.new(
                    KEY, rfc8785.dumps(['demo', 'ixl', str(value)]), hashlib.sha256).hexdigest()
                self.assertEqual(subject_id('ixl', 'demo', value, KEY), expected)
        self.assertEqual(subject_id('ixl', 'demo', 7, KEY),
                         subject_id('ixl', 'demo', '7', KEY))
        self.assertNotEqual(subject_id('ixl', 'demo', 7, KEY),
                            subject_id('ixl', 'demo', '007', KEY))

    def test_subject_ids_reject_unsupported_values_without_string_coercion(self):
        for value in (None, True, False, 1.0, float('nan'), float('inf'),
                      -float('inf'), [], ['student-1'], {}, {'id': 'student-1'},
                      '', ' \t\n', StringLikeObject()):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    subject_id('ixl', 'demo', value, KEY)

    def test_unsupported_subject_ids_cannot_merge_with_their_text_spellings(self):
        # These pairs previously shared a record through unconditional str(value).
        for value, text in ((True, 'True'), (1.0, '1.0'), ([], '[]'), ({}, '{}'),
                            (None, 'None'), (StringLikeObject(), 'student-1')):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    self.summary([{'id': text}, {'id': value}])

    def test_valid_integer_text_normalization_groups_only_equivalent_ids(self):
        document = self.summary([{'id': 7}, {'id': '7'}, {'id': '007'}])
        self.assertEqual([len(record['entries']) for record in document['records']], [2, 1])
        self.assertTrue(verify(document))

    def test_session_ids_use_the_same_identifier_contract(self):
        profile = {'fields': {'subject_id': 'id', 'session_id': 'session'}}
        for value in (False, 1.0, [], {}, ' '):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    self.summary([{'id': 'student-1', 'session': value}], profile)

    def test_generated_producer_version_is_021(self):
        self.assertEqual(self.summary()['records'][0]['header']['producer']['version'], '0.2.1')

    def test_writer_rejects_malformed_nested_profile_map_types(self):
        for name in ('fields', 'metrics', 'event_types'):
            for value in (None, [], 'map', 7, False):
                with self.subTest(name=name, value=value):
                    profile = {'fields': {'subject_id': 'id'}, name: value}
                    with self.assertRaisesRegex(ValueError, 'profile\\.' + name):
                        self.summary(profile=profile)

    def test_writer_requires_text_mapping_labels_columns_and_event_semantics(self):
        for name in ('fields', 'metrics', 'event_types'):
            for key, value in ((1, 'column'), (False, 'column'), ('', 'column'),
                               (' \t', 'column'), ('label', None), ('label', []),
                               ('label', {}), ('label', 1), ('label', False),
                               ('label', ''), ('label', ' \t')):
                with self.subTest(name=name, key=key, value=value):
                    profile = {'fields': {'subject_id': 'id'}}
                    profile[name] = dict(profile['fields']) if name == 'fields' else {}
                    profile[name][key] = value
                    with self.assertRaisesRegex(ValueError, 'profile\\.' + name):
                        self.summary(profile=profile)

    def test_valid_maps_preserve_unknown_profile_metadata_and_source_column_names(self):
        profile = {
            'fields': {'subject_id': 'Student ID', 'custom_field': 'Custom source'},
            'metrics': {'vendor score': 'Reported score'},
            'event_types': {'custom_event': 'custom_semantic'},
            'custom_metadata': {'notes': ['retained', 1, None]},
        }
        original = deepcopy(profile)
        document = self.summary([{'Student ID': 'student-1', 'Reported score': 80}], profile)
        self.assertEqual(profile, original)
        self.assertEqual(document['records'][0]['header']['mapping_sha256'], digest(profile))
        self.assertEqual(document['records'][0]['entries'][0]['event']['data']['reported_metrics'],
                         {'vendor score': 80})
        self.assertTrue(verify(document))

    def test_writer_accepts_explicit_provider_roles_and_optional_text_ids(self):
        for actor in ({'role': 'instructor', 'kind': 'human'},
                      {'role': 'custom provider', 'kind': 'software', 'id': 'tutor-1'}):
            with self.subTest(actor=actor):
                document = self.events(actor)
                self.assertEqual(document['records'][0]['entries'][0]['event']['actor'], actor)
                self.assertTrue(verify(document))

    def invalid_actors(self):
        yield []
        yield 'instructor'
        yield {'kind': 'human'}
        yield {'role': 'instructor'}
        for role in ('', ' \t', 1, True, None, [], {}):
            yield {'role': role, 'kind': 'software'}
        for kind in (None, '', 'robot', False, [], {}):
            yield {'role': 'instructor', 'kind': kind}
        for identifier in ('', ' \t', 7, False, None, [], {}):
            yield {'role': 'instructor', 'kind': 'human', 'id': identifier}

    def test_writer_rejects_malformed_provider_actors(self):
        for actor in self.invalid_actors():
            with self.subTest(actor=actor):
                with self.assertRaises(ValueError):
                    self.events(actor)
        with self.assertRaises(ValueError):
            self.summary(profile={'fields': {'subject_id': 'id'}, 'scaffold_actor': None})

    def test_verifier_rejects_invalid_present_actors_after_hashes_are_recomputed(self):
        for actor in (None, *self.invalid_actors()):
            with self.subTest(actor=actor):
                document = self.events()
                document['records'][0]['entries'][0]['event']['actor'] = actor
                self.rehash(document)
                with self.assertRaisesRegex(ValueError, 'actor'):
                    verify(document)

    def test_verifier_rejects_malformed_top_level_and_record_shapes(self):
        for document in (None, [], 'document', 1, True, {}):
            with self.subTest(document=document):
                with self.assertRaises(ValueError):
                    verify(document)
        for records in (None, {}, [], [None], [[]], ['record'], [{}]):
            with self.subTest(records=records):
                document = self.summary()
                document['records'] = records
                with self.assertRaises(ValueError):
                    verify(document)

    def test_verifier_rejects_malformed_headers_and_required_fields(self):
        for header in (None, [], 'header', {}, {'record_id': []}):
            with self.subTest(header=header):
                document = self.summary()
                document['records'][0]['header'] = header
                with self.assertRaises(ValueError):
                    verify(document)
        for field in ('record_id', 'hash_alg', 'created'):
            with self.subTest(missing=field):
                document = self.summary()
                del document['records'][0]['header'][field]
                with self.assertRaises(ValueError):
                    verify(document)
        for identifier in (None, [], {}, '', ' '):
            with self.subTest(record_id=identifier):
                document = self.summary()
                document['records'][0]['header']['record_id'] = identifier
                with self.assertRaises(ValueError):
                    verify(document)

    def test_verifier_rejects_malformed_entries_and_required_fields(self):
        for entries in (None, {}, [], [None], [[]], ['entry'], [{}]):
            with self.subTest(entries=entries):
                document = self.summary()
                document['records'][0]['entries'] = entries
                with self.assertRaises(ValueError):
                    verify(document)
        for field in ('seq', 'time', 'event_hash', 'prev_hash', 'entry_hash'):
            with self.subTest(missing=field):
                document = self.summary()
                del document['records'][0]['entries'][0][field]
                with self.assertRaises(ValueError):
                    verify(document)
        for sequence in (True, 1.0, '1', None, []):
            with self.subTest(sequence=sequence):
                document = self.summary()
                document['records'][0]['entries'][0]['seq'] = sequence
                with self.assertRaises(ValueError):
                    verify(document)

    def test_verifier_rejects_malformed_events_after_hashes_are_recomputed(self):
        valid_event = self.summary()['records'][0]['entries'][0]['event']
        malformed = [None, [], 'event', {}, dict(valid_event, name=1),
                     dict(valid_event, salt=None), dict(valid_event, data=[])]
        for field in ('name', 'salt', 'data'):
            event = deepcopy(valid_event)
            del event[field]
            malformed.append(event)
        for event in malformed:
            with self.subTest(event=event):
                document = self.summary()
                document['records'][0]['entries'][0]['event'] = event
                self.rehash(document)
                with self.assertRaisesRegex(ValueError, 'event'):
                    verify(document)

    def test_timestamp_accepts_rfc3339_offsets_and_supported_precision(self):
        examples = {
            '2026-10-08T12:00:00-07:00': '2026-10-08T19:00:00Z',
            '2026-10-08T20:00:00+00:00': TIME,
            '2026-10-08T20:00:00-00:00': TIME,
            '2026-10-08t20:00:00z': TIME,
            '2026-10-08T20:00:00.1Z': '2026-10-08T20:00:00.100000Z',
            '2026-10-08T12:00:00.123456-07:00': '2026-10-08T19:00:00.123456Z',
        }
        for value, expected in examples.items():
            with self.subTest(value=value):
                self.assertEqual(timestamp(value), expected)

    def test_timestamp_rejects_non_rfc3339_forms_and_invalid_calendars(self):
        for value in (None, 1, TIME.encode(), '2026-10-08', '20261008T200000Z',
                      '2026-W41-4T20:00:00Z', '2026-10-08 20:00:00Z',
                      '2026-10-08T20:00:00', '2026-10-08T20:00:00+00',
                      '2026-10-08T20:00:00+01:99', '2026-10-08T20:00:00+00:00:30',
                      '2026-02-30T20:00:00Z', '2026-10-08T24:00:00Z',
                      '0001-01-01T00:00:00+01:00'):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    timestamp(value)

    def test_timestamp_rejects_excess_precision_instead_of_truncating(self):
        for value in ('2026-10-08T20:00:00.1234567Z',
                      '2026-10-08T20:00:00.1234560+00:00'):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, 'precision'):
                    timestamp(value)
                with self.assertRaisesRegex(ValueError, 'precision'):
                    self.summary(imported_at=value)
                with self.assertRaisesRegex(ValueError, 'precision'):
                    self.events(time=value)

    def test_verifier_rejects_recommitted_excess_precision(self):
        for location in ('header', 'entry'):
            with self.subTest(location=location):
                document = self.summary()
                record = document['records'][0]
                target, field = ((record['header'], 'created') if location == 'header'
                                 else (record['entries'][0], 'time'))
                target[field] = '2026-10-08T20:00:00.1234567Z'
                self.rehash(document)
                with self.assertRaisesRegex(ValueError, 'precision'):
                    verify(document)


if __name__ == '__main__':
    unittest.main()
