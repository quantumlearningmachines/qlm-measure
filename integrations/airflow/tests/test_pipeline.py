import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from jsonschema import Draft202012Validator

from qlm_transformer.core import digest, verify
from qlm_airflow import pipeline as p
from qlm_airflow.research_adapters import adapt
from qlm_airflow.scaffolding import measure_scaffolding

PACKAGE_ROOT = Path(__file__).resolve().parents[1]


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        for folder in ('config', 'samples', 'profiles', 'provenance'):
            shutil.copytree(PACKAGE_ROOT / folder, self.root / folder)
        self.secret = base64.b64encode(os.urandom(32)).decode()
        self.env = patch.dict(os.environ, {'QLM_PSEUDONYM_KEY_B64': self.secret})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temporary.cleanup()

    def manifest(self):
        return json.loads((self.root / 'config/demo.json').read_text())

    def save(self, config):
        (self.root / 'config/demo.json').write_text(json.dumps(config))

    def artifacts(self, run='demo'):
        return [p.transform_dataset(self.root, 'config/demo.json', run, identity) for identity in p.plan(self.root)]

    def document(self, dataset='tutormoments_sample', run='demo'):
        return json.loads((self.root / 'outputs' / run / dataset / 'learnlog.json').read_text())

    def transcript_rows(self):
        return [json.loads(line) for line in (self.root / 'samples/tutormoments-real-transcripts.jsonl').read_text().splitlines()]

    def rewrite_transcript(self, rows):
        (self.root / 'samples/tutormoments-real-transcripts.jsonl').write_text(''.join(json.dumps(row) + '\n' for row in rows))

    def test_two_genuine_schemas_produce_322_observations_and_14_records(self):
        result = p.run(self.root)
        self.assertEqual(result['observations'], 322)
        self.assertEqual(result['datasets'], 2)
        self.assertEqual(result['records'], 14)
        self.assertTrue(result['record_count_is_not_unique_people'])
        for dataset, count in (('tutormoments_sample', 2), ('oatutor_sample', 12)):
            folder = self.root / 'outputs/demo' / dataset
            doc = self.document(dataset)
            heads = json.loads((folder / 'checkpoint.json').read_text())
            self.assertEqual(verify(doc, heads), heads)
            self.assertEqual(len(doc['records']), count)
            self.assertTrue(all(record['header']['source_kind'] == 'verified_public_sample' for record in doc['records']))
        coverage = json.loads((Path(result['output_dir']) / 'coverage.json').read_text())
        self.assertEqual(coverage['evidence_counts'], {'tutor_utterance_recorded':168, 'student_utterance_recorded':142, 'assigned_condition_only':12})
        self.assertEqual(coverage['assigned_condition_counts'], {'ChatGPT':4, 'Human tutor':4, 'No-hint control':4})
        self.assertFalse(coverage['independent_performance_established'])
        self.assertEqual(coverage['external_ai_use'], 'not_established')
        self.assertIsNone(coverage['pooled_score'])

    def test_exact_sample_bytes_and_original_source_lines_are_bound(self):
        p.run(self.root)
        expected = {'tutormoments': ('tutormoments-real-transcripts.jsonl', '7df51fda0fff9c454ba14a33a0d2964d5e94b2556eff1d3897ec4f41373c8a66', [366,435]),
                    'oatutor': ('oatutor-real-participants.csv', '26b98b6f5718f5c2f473d81ae1ad8e1817d18bada3ba7390d8e0ac445a8ad5a2', list(range(2,14)))}
        for source, (name, sha, lines) in expected.items():
            self.assertEqual(hashlib.sha256((self.root / 'samples' / name).read_bytes()).hexdigest(), sha)
            doc = self.document(source + '_sample')
            self.assertEqual([r['entries'][0]['event']['data']['provenance']['source_file_row'] for r in doc['records']], lines)
            self.assertTrue(all(r['header']['source_provenance']['license'] == 'CC-BY-4.0' for r in doc['records']))

    def test_turn_text_roles_offsets_and_source_order_are_preserved(self):
        p.run(self.root)
        source = self.transcript_rows()
        document = self.document()
        for original, record in zip(source, document['records']):
            for index, (turn, entry) in enumerate(zip(original['turns'], record['entries'])):
                event = entry['event']
                self.assertEqual(event['data']['dialogue'], turn)
                self.assertEqual(event['data']['raw_source_fields']['turn'], turn)
                self.assertEqual(event['actor'], {'role':'system', 'kind':'software', 'id':'QLM-transformer'})
                self.assertEqual(event['name'], 'qlm_import:dialogue_turn_observed')
                self.assertEqual(entry['time'], self.manifest()['imported_at'])
                self.assertEqual(event['data']['time_basis'], 'import_time')
                self.assertEqual(event['data']['source_time_basis'], 'relative_offsets_seconds')
                self.assertEqual(event['data']['provenance']['source_field_path'], f'turns[{index}]')
                self.assertEqual(event['data']['provenance']['source_record_sha256'], digest(original))

    def test_original_oatutor_metrics_and_gain_rounding_are_not_changed(self):
        result = p.run(self.root)
        records = self.document('oatutor_sample')['records']
        original = list(csv.DictReader(io.StringIO((self.root / 'samples/oatutor-real-participants.csv').read_text())))
        for row, record in zip(original, records):
            data = record['entries'][0]['event']['data']
            for name in ('preTest','postTest','sessionTime','totalUniqueSteps','learningGain'):
                self.assertEqual(data['reported_metrics'][name], row[name])
            self.assertNotIn('anonUserID', data['raw_source_fields'])
            self.assertEqual(data['help_evidence'], {'condition':row['condition'], 'actual_help_use':'not_reported_in_participant_table'})
            self.assertEqual(data['assistance'], 'assigned_condition_only')
            self.assertEqual(len(record['entries']), 1)
        self.assertEqual(records[2]['entries'][0]['event']['data']['reported_metrics']['learningGain'], '0.333')
        with (Path(result['output_dir']) / 'original_metrics.csv').open() as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 60)
        with (Path(result['output_dir']) / 'metric_coverage.csv').open() as handle:
            self.assertEqual(len(list(csv.DictReader(handle))), 5)

    def test_generated_enrichments_and_known_identifiers_do_not_become_events(self):
        p.run(self.root)
        source = self.transcript_rows()
        doc = self.document()
        for original, record in zip(source, doc['records']):
            text = json.dumps(record)
            for name in ('student_id', 'tutor_id', 'session_id', 'transcript_id'):
                if name in original.get('session', {}):
                    self.assertNotIn(original['session'][name], text)
            self.assertEqual(len(record['entries']), len(original['turns']))
            for entry in record['entries']:
                self.assertNotIn('enrichments', entry['event']['data']['raw_source_fields'])
                self.assertEqual(entry['event']['data']['raw_source_fields']['session']['transcription_by'], 'SUT (Gemini 2.5 Pro)')

    def test_modified_source_loses_public_provenance_even_if_rows_unchanged(self):
        path = self.root / 'samples/tutormoments-real-transcripts.jsonl'
        path.write_bytes(path.read_bytes() + b'\n')
        p.run(self.root)
        for record in self.document()['records']:
            self.assertEqual(record['header']['source_kind'], 'unverified_user_input')
            self.assertNotIn('source_provenance', record['header'])
            self.assertNotIn('source_file_sha256', record['entries'][0]['event']['data']['provenance'])
            self.assertNotIn('source_file_row', record['entries'][0]['event']['data']['provenance'])
            self.assertEqual(record['entries'][0]['event']['actor'], {'role':'system', 'kind':'software', 'id':'QLM-transformer'})
            self.assertEqual(record['header']['assistance_coverage'], 'actual_help_use_not_established_by_this_adapter')
            self.assertEqual(record['entries'][0]['event']['data']['provenance']['source_kind'], 'unverified_user_input')

    def test_extra_turn_and_summary_identifier_fields_are_omitted(self):
        rows = self.transcript_rows()
        rows[0]['turns'][0]['email'] = 'PRIVATE_UNMAPPED_EMAIL'
        rows[0]['turns'][0]['student_id'] = 'PRIVATE_EXTRA_ID'
        rows[0]['session']['email'] = 'PRIVATE_SESSION_EMAIL'
        self.rewrite_transcript(rows)
        path = self.root / 'samples/oatutor-real-participants.csv'
        source = list(csv.DictReader(io.StringIO(path.read_text())))
        stream = io.StringIO(newline='')
        writer = csv.DictWriter(stream, fieldnames=list(source[0]) + ['email'])
        writer.writeheader()
        writer.writerows([{**row,'email':'PRIVATE_SUMMARY_EMAIL'} for row in source])
        path.write_text(stream.getvalue())
        p.run(self.root)
        text = json.dumps(self.document()) + json.dumps(self.document('oatutor_sample'))
        for value in ('PRIVATE_UNMAPPED_EMAIL','PRIVATE_EXTRA_ID','PRIVATE_SESSION_EMAIL','PRIVATE_SUMMARY_EMAIL'):
            self.assertNotIn(value, text)
        self.assertNotIn(self.secret, text)

    def test_same_learner_in_two_transcripts_stays_two_session_records(self):
        rows = self.transcript_rows()
        rows[1]['session']['student_id'] = rows[0]['session']['student_id']
        self.rewrite_transcript(rows)
        p.run(self.root)
        records = self.document()['records']
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]['header']['subject'], records[1]['header']['subject'])
        self.assertNotEqual(records[0]['header']['record_id'], records[1]['header']['record_id'])

    def test_repeat_run_is_byte_identical_without_duplicate_observations(self):
        result = p.run(self.root)
        before = {str(f): hashlib.sha256(f.read_bytes()).hexdigest() for f in (self.root / 'outputs/demo').rglob('*') if f.is_file()}
        self.assertEqual(p.run(self.root), result)
        after = {str(f): hashlib.sha256(f.read_bytes()).hexdigest() for f in (self.root / 'outputs/demo').rglob('*') if f.is_file()}
        self.assertEqual(before, after)

    def test_changed_secret_cannot_reuse_cached_pseudonyms(self):
        p.run(self.root)
        with patch.dict(os.environ, {'QLM_PSEUDONYM_KEY_B64':base64.b64encode(os.urandom(32)).decode()}):
            with self.assertRaisesRegex(ValueError, 'different inputs/configuration|cached pseudonyms'):
                p.run(self.root)

    def test_changed_input_cannot_reuse_run_id(self):
        p.run(self.root)
        path = self.root / 'samples/oatutor-real-participants.csv'
        path.write_bytes(path.read_bytes() + b'\r\n')
        with self.assertRaises(ValueError):
            p.run(self.root)

    def test_mapping_mutation_between_stages_is_rejected(self):
        artifacts = self.artifacts()
        path = self.root / 'profiles/oatutor.json'
        profile = json.loads(path.read_text()); profile['mapping']['metrics']['invented'] = 'invented'
        path.write_text(json.dumps(profile))
        with self.assertRaisesRegex(ValueError, 'profile changed'):
            p.aggregate(self.root, 'config/demo.json', 'demo', artifacts)

    def test_source_mutation_between_stages_is_rejected(self):
        artifacts = self.artifacts()
        path = self.root / 'samples/oatutor-real-participants.csv'; path.write_bytes(path.read_bytes() + b'\r\n')
        with self.assertRaisesRegex(ValueError, 'input changed'):
            p.aggregate(self.root, 'config/demo.json', 'demo', artifacts)

    def test_mislabelled_artifact_binding_is_rejected(self):
        artifacts = self.artifacts()
        path = self.root / 'outputs/demo/oatutor_sample/metadata.json'
        metadata = json.loads(path.read_text()); metadata['binding']['dataset_id'] = 'another_dataset'
        path.write_text(json.dumps(metadata))
        with self.assertRaisesRegex(ValueError, 'dataset identity'):
            p.aggregate(self.root, 'config/demo.json', 'demo', artifacts)

    def test_tampered_document_is_rejected(self):
        p.run(self.root)
        path = self.root / 'outputs/demo/oatutor_sample/learnlog.json'
        document = self.document('oatutor_sample'); document['records'][0]['entries'][0]['event']['data']['assistance'] = 'none'
        path.write_text(json.dumps(document))
        with self.assertRaises(ValueError):
            p.run(self.root)

    def test_incomplete_aggregate_refuses_silent_subset(self):
        artifact = p.transform_dataset(self.root, 'config/demo.json', 'partial', 'oatutor_sample')
        with self.assertRaises(ValueError):
            p.aggregate(self.root, 'config/demo.json', 'partial', [artifact])

    def test_paths_duplicate_ids_and_unsupported_platforms_are_rejected(self):
        original = self.manifest()
        for invalid in ('../../outside.json', '/tmp/outside.json', 'https://example.org/input', 'outputs/private.csv'):
            config = json.loads(json.dumps(original)); config['datasets'][0]['input'] = invalid; self.save(config)
            with self.assertRaises(ValueError):
                p.plan(self.root)
        for value in ('combined', original['datasets'][1]['id']):
            config = json.loads(json.dumps(original)); config['datasets'][0]['id'] = value; self.save(config)
            with self.assertRaises(ValueError):
                p.plan(self.root)
        config = json.loads(json.dumps(original)); config['datasets'][0]['platform'] = 'unsupported'; self.save(config)
        with self.assertRaises(ValueError): p.plan(self.root)
        self.save(original)
        with self.assertRaises(ValueError): p.run(self.root, run_id='../../escape')

    def test_file_level_output_symlink_escape_is_rejected(self):
        p.run(self.root)
        path = self.root / 'outputs/demo/oatutor_sample/checkpoint.json'
        outside = self.root.parent / (self.root.name + '-outside.json'); outside.write_bytes(path.read_bytes())
        try:
            path.unlink(); path.symlink_to(outside)
            with self.assertRaises(ValueError): p.run(self.root)
        finally:
            outside.unlink()

    def test_strict_json_csv_jsonl_and_limits(self):
        self.assertEqual(p.parse_rows(b'[{"id":"a"}]', '.json'), [{'id':'a'}])
        self.assertEqual(p.parse_rows(b'{"id":"a"}\n{"id":"b"}\n', '.jsonl'), [{'id':'a'},{'id':'b'}])
        self.assertEqual(p.parse_rows(b'id,value\r\na,"two, words"\r\n', '.csv'), [{'id':'a','value':'two, words'}])
        for content, suffix in ((b'[{"id":1,"id":2}]','.json'),(b'[{"id":NaN}]','.json'),(b'[]','.json'),(b'id,id\na,b\n','.csv'),(b'id,value\na,b,c\n','.csv'),(b'{}','.json')):
            with self.assertRaises(ValueError): p.parse_rows(content, suffix)

    def test_missing_key_invalid_key_and_runtime_provider(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValueError): p.read_key()
            self.assertEqual(p.read_key(lambda:self.secret), base64.b64decode(self.secret))
        for secret in ('bad!',base64.b64encode(b'short').decode()):
            with patch.dict(os.environ, {'QLM_PSEUDONYM_KEY_B64':secret}):
                with self.assertRaises(ValueError): p.read_key()

    def test_invalid_role_offsets_duplicate_turn_and_assignment_are_rejected(self):
        original = self.transcript_rows()
        for mutation in ('role','offset','duplicate'):
            rows = json.loads(json.dumps(original))
            if mutation == 'role': rows[0]['turns'][0]['role'] = 'Unknown'
            if mutation == 'offset': rows[0]['turns'][0]['end_seconds'] = -1
            if mutation == 'duplicate': rows[0]['turns'][1]['turn_number'] = rows[0]['turns'][0]['turn_number']
            self.rewrite_transcript(rows)
            with self.assertRaises(ValueError): p.run(self.root, run_id=mutation)
        self.rewrite_transcript(original)
        path=self.root/'samples/oatutor-real-participants.csv'; path.write_text(path.read_text().replace('ChatGPT','Unknown'))
        with self.assertRaises(ValueError): p.run(self.root, run_id='assignment')

    def test_csv_formula_text_is_escaped(self):
        self.assertEqual(p._csv_cell("=HYPERLINK('bad')"), "'=HYPERLINK('bad')")

    def test_unverified_summary_does_not_infer_missing_help_data_from_ignored_fields(self):
        path = self.root / 'samples/oatutor-real-participants.csv'
        path.write_bytes(path.read_bytes() + b'\r\n')
        p.run(self.root)
        for record in self.document('oatutor_sample')['records']:
            self.assertEqual(record['header']['source_kind'], 'unverified_user_input')
            self.assertEqual(record['header']['assistance_coverage'], 'actual_help_use_not_established_by_this_adapter')
            data = record['entries'][0]['event']['data']
            self.assertEqual(data['help_evidence']['actual_help_use'], 'not_established_by_this_adapter')
            self.assertEqual(data['provenance']['source_kind'], 'unverified_user_input')

    def test_all_322_events_validate_against_published_extension_schema(self):
        p.run(self.root)
        schema = json.loads((PACKAGE_ROOT / 'schemas/research-import-v2.json').read_text())
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)
        for source in ('tutormoments_sample', 'oatutor_sample'):
            for record in self.document(source)['records']:
                for entry in record['entries']:
                    validator.validate(entry['event'])

    def test_only_two_real_source_samples_and_profiles_are_provided(self):
        self.assertEqual({file.name for file in (PACKAGE_ROOT / 'samples').iterdir() if file.is_file()},
                         {'tutormoments-real-transcripts.jsonl', 'oatutor-real-participants.csv'})
        self.assertEqual({file.name for file in (PACKAGE_ROOT / 'profiles').iterdir() if file.is_file()},
                         {'tutormoments.json', 'oatutor.json', 'explicit-assistance-events.json'})

    def test_published_coded_intervals_are_measured_without_new_observation_events(self):
        result = p.run(self.root)
        combined = Path(result['output_dir'])
        measurement = json.loads((combined / 'scaffolding_measurement.json').read_text())
        self.assertEqual(measurement['status'], 'available')
        self.assertEqual(measurement['totals'], {'intervals':10, 'annotation_rows':60, 'sessions':2, 'providers':1,
                                               'action_includes_scaffolding':{'numerator':9, 'denominator':10}})
        self.assertEqual(sum(cell['count'] for cell in measurement['matrix']), 10)
        self.assertEqual(sum(interval['annotation_rows'] for interval in measurement['intervals']), 60)
        self.assertTrue(any(item['dataset'] == 'oatutor' and item['records'] == 12 for item in measurement['exclusions']))
        self.assertEqual(result['observations'], 322)
        with (combined / 'scaffolding_intervals.csv').open(newline='') as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 10)
        self.assertTrue(all('interval_provenance_json' in row for row in rows))
        with (combined / 'scaffolding_matrix.csv').open(newline='') as handle:
            self.assertEqual(sum(int(row['deduplicated_intervals']) for row in csv.DictReader(handle)), 10)

    def test_measurement_artifacts_and_companion_hash_are_bound_to_completion_marker(self):
        result = p.run(self.root)
        combined = Path(result['output_dir'])
        complete = json.loads((combined / 'COMPLETE.json').read_text())
        for name in ('scaffolding_measurement.json', 'scaffolding_intervals.csv', 'scaffolding_matrix.csv'):
            self.assertEqual(complete['files_sha256'][name], hashlib.sha256((combined / name).read_bytes()).hexdigest())
        self.assertEqual(complete['scaffolding_evidence']['evidence_sha256'], p.SCAFFOLDING_EVIDENCE_SHA256)

    def test_edited_transcript_input_cannot_inherit_published_interval_measurements(self):
        path = self.root / 'samples/tutormoments-real-transcripts.jsonl'
        path.write_bytes(path.read_bytes() + b'\n')
        result = p.run(self.root)
        measurement = json.loads((Path(result['output_dir']) / 'scaffolding_measurement.json').read_text())
        self.assertEqual(measurement['status'], 'unmeasured')
        self.assertEqual(measurement['totals']['intervals'], 0)
        self.assertEqual(measurement['totals']['action_includes_scaffolding'], {'numerator':0,'denominator':0})
        self.assertTrue(measurement['exclusions'])

    def test_oatutor_only_is_unmeasured_instead_of_zero_scaffolding(self):
        config = self.manifest()
        config['datasets'] = [dataset for dataset in config['datasets'] if dataset['platform'] == 'oatutor']
        self.save(config)
        result = p.run(self.root)
        measurement = json.loads((Path(result['output_dir']) / 'scaffolding_measurement.json').read_text())
        self.assertEqual(measurement['status'], 'unmeasured')
        self.assertEqual(len(measurement['intervals']), 0)
        self.assertEqual(measurement['exclusions'][0]['dataset'], 'oatutor')
        self.assertEqual(result['observations'], 12)

    def test_tampered_annotation_excerpt_or_companion_is_rejected(self):
        path = self.root / 'provenance/tutormoments-real-ground-truth.jsonl'
        original = path.read_bytes(); path.write_bytes(original + b'\n')
        with self.assertRaisesRegex(ValueError, 'annotation excerpt hash mismatch'):
            p.run(self.root)
        path.write_bytes(original)
        evidence = self.root / 'provenance/scaffolding-evidence.json'
        evidence.write_bytes(evidence.read_bytes() + b'\n')
        with self.assertRaisesRegex(ValueError, 'exact pinned published annotation companion'):
            p.run(self.root)

    def test_repeated_sessions_do_not_multiply_source_coded_intervals(self):
        p.run(self.root)
        document = self.document()
        profile = json.loads((self.root / 'profiles/tutormoments.json').read_text())
        evidence = json.loads((self.root / 'provenance/scaffolding-evidence.json').read_text())
        run = {'profile':profile, 'sourceKind':'verified_public_sample','sourceVerified':True,
               'sourceHash':profile['source']['sampleSha256'],'records':document['records']}
        measurement = measure_scaffolding([run, run], evidence)
        self.assertEqual(measurement['totals']['intervals'], 10)
        self.assertEqual(measurement['totals']['annotation_rows'], 60)
        self.assertEqual(measurement['totals']['sessions'], 2)
        self.assertTrue(any('Repeated' in item['reason'] for item in measurement['exclusions']))

    def test_changed_observed_text_cannot_inherit_source_codes_despite_copied_provenance(self):
        p.run(self.root)
        document = self.document()
        event = document['records'][0]['entries'][0]['event']
        event['data']['dialogue']['text'] = 'Changed text'
        event['data']['raw_source_fields']['turn']['text'] = 'Changed text'
        profile = json.loads((self.root / 'profiles/tutormoments.json').read_text())
        evidence = json.loads((self.root / 'provenance/scaffolding-evidence.json').read_text())
        run = {'profile':profile, 'sourceKind':'verified_public_sample','sourceVerified':True,
               'sourceHash':profile['source']['sampleSha256'],'records':document['records']}
        measurement = measure_scaffolding([run], evidence)
        self.assertEqual(measurement['totals']['sessions'], 1)
        self.assertEqual(measurement['totals']['intervals'], 6)

    def test_boolean_turn_number_does_not_equal_original_numeric_turn_number(self):
        p.run(self.root)
        document = self.document()
        event = document['records'][0]['entries'][0]['event']
        event['data']['dialogue']['turn_number'] = True
        event['data']['raw_source_fields']['turn']['turn_number'] = True
        profile = json.loads((self.root / 'profiles/tutormoments.json').read_text())
        evidence = json.loads((self.root / 'provenance/scaffolding-evidence.json').read_text())
        run = {'profile':profile, 'sourceKind':'verified_public_sample','sourceVerified':True,
               'sourceHash':profile['source']['sampleSha256'],'records':document['records']}
        measurement = measure_scaffolding([run], evidence)
        self.assertEqual(measurement['totals']['sessions'], 1)
        self.assertEqual(measurement['totals']['intervals'], 6)


if __name__ == '__main__':
    unittest.main()
