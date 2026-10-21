"""Release regressions for strict inputs and installed demonstration resources."""
import contextlib
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from qlm_transformer import verify
from qlm_transformer import cli

ROOT = Path(__file__).resolve().parents[1]


class ReleaseCLITests(unittest.TestCase):
    def test_float_overflow_is_rejected_at_any_json_depth(self):
        for value in ('1e400', '-1e400', '[{"id":1e400}]', '{"ignored":{"x":1e400}}'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                cli.strict_json(value)

    def test_valid_finite_numbers_and_duplicate_keys(self):
        self.assertEqual(cli.strict_json('{"x":1.5,"id":42}'), {'x': 1.5, 'id': 42})
        with self.assertRaises(ValueError):
            cli.strict_json('{"id":"first","id":"second"}')

    def test_malformed_verify_input_has_controlled_value_free_error(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'input.json'
            for value in ('[]', '1', '"PRIVATE_SENTINEL"', '{"records":42}'):
                path.write_text(value, encoding='utf-8')
                errors = io.StringIO()
                with contextlib.redirect_stderr(errors):
                    self.assertEqual(cli.main(['verify', str(path)]), 1)
                self.assertNotIn('Traceback', errors.getvalue())
                self.assertNotIn('PRIVATE_SENTINEL', errors.getvalue())

    def test_input_snapshot_digest_survives_source_change_after_parsing(self):
        # Simulate a file replacement between parsing and transformation. The
        # digest must identify exactly the bytes that yielded the imported rows.
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            source, profile, output = [base / n for n in ('input.json', 'profile.json', 'out.json')]
            original = b'[{"id":"original-learner","score":7}]'
            source.write_bytes(original)
            profile.write_text(json.dumps({'fields': {'subject_id': 'id'},
                                           'metrics': {'reported_score': 'score'}}), encoding='utf-8')
            read_rows = cli.load_rows
            def replace_source(path, *, source_bytes=None):
                rows = read_rows(path, source_bytes=source_bytes)
                path.write_bytes(b'[{"id":"different-learner","score":99}]')
                return rows
            args = ['convert', '--platform', 'ixl', '--input', str(source), '--profile', str(profile),
                    '--tenant', 'synthetic-release-test', '--output', str(output),
                    '--imported-at', '2026-10-16T00:00:00Z']
            with patch.dict(os.environ, {'QLM_PSEUDONYM_KEY': '61' * 32}), \
                 patch.object(cli, 'load_rows', side_effect=replace_source), \
                 contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(cli.main(args), 0)
            doc = json.loads(output.read_text())
            verify(doc)
            self.assertEqual(doc['records'][0]['header']['source_sha256'], hashlib.sha256(original).hexdigest())
            metrics = doc['records'][0]['entries'][0]['event']['data']['reported_metrics']
            self.assertEqual(metrics['reported_score'], 7)

    def test_csv_snapshot_parsing_and_jsonl_overflow(self):
        self.assertEqual(cli.load_rows(Path('unused.csv'), source_bytes=b'\xef\xbb\xbfid,score\r\n1,7\r\n'),
                         [{'id': '1', 'score': '7'}])
        with self.assertRaises(ValueError):
            cli.load_rows(Path('unused.jsonl'), source_bytes=b'{"id":"ok"}\n{"id":1e400}\n')

    def test_oversized_csv_field_has_controlled_error_and_no_output(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            source, profile, output = [base / n for n in ('input.csv', 'profile.json', 'out.json')]
            source.write_text('id,score\nlearner,' + 'x' * (csv.field_size_limit() + 1), encoding='utf-8')
            profile.write_text('{"fields":{"subject_id":"id"},"metrics":{"score":"score"}}', encoding='utf-8')
            errors = io.StringIO()
            with patch.dict(os.environ, {'QLM_PSEUDONYM_KEY': '61' * 32}), contextlib.redirect_stderr(errors):
                self.assertEqual(cli.main(['convert', '--platform', 'ixl', '--input', str(source),
                                          '--profile', str(profile), '--tenant', 'synthetic-release-test',
                                          '--output', str(output)]), 1)
            self.assertNotIn('Traceback', errors.getvalue())
            self.assertFalse(output.exists())

    def test_init_demo_exports_synthetic_inputs_without_overwriting(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / 'demo'
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(cli.main(['init-demo', '--output-dir', str(destination)]), 0)
            self.assertEqual(json.loads((destination / 'profiles/mathia.json').read_text()),
                             json.loads((ROOT / 'profiles/mathia.json').read_text()))
            self.assertTrue((destination / 'examples/ai_context.json').is_file())
            self.assertIn('synthetic', (destination / 'README.txt').read_text())
            marker = destination / 'existing-user-file.txt'
            marker.write_text('keep', encoding='utf-8')
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(cli.main(['init-demo', '--output-dir', str(destination)]), 1)
            self.assertEqual(marker.read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()
