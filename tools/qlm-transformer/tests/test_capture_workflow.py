import json
from pathlib import Path
import tempfile
import unittest

from qlm_transformer.capture.workflow import directories, run_demo, run_research


class CaptureWorkflowTests(unittest.TestCase):
    def test_demo_preserves_stages_unknowns_and_sql_parity(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = run_demo(output_dir=root/'public', private_dir=root/'private')
            self.assertTrue(result['synthetic'])
            self.assertEqual(result['captured_records'], 3)
            self.assertEqual(result['aggregate']['assistance_request_observations'], 2)
            self.assertEqual(len(result['aggregate']['by_source_scope']), 2)
            self.assertIsNone(result['actual_request_total'])
            self.assertIsNone(result['request_rate'])
            self.assertTrue(result['replay_idempotent'])
            rows = json.loads((root/'public/SQL_RESULTS.json').read_text())['representations']
            self.assertEqual(rows['direct_capture']['query_rows'], rows['recovered_xapi']['query_rows'])
            self.assertEqual(rows['direct_capture']['query_rows'], rows['recovered_caliper']['query_rows'])
            total = next(r for r in rows['direct_capture']['query_rows'] if r['grouping']=='total')
            self.assertEqual(total['available_displayed_observations'], 1)
            self.assertIsNone(total['actual_request_total'])
            self.assertEqual((root/'private').stat().st_mode & 0o777, 0o700)
            self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in (root/'private').iterdir()))

    def test_public_private_boundaries_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for public, private in ((root, root), (root, root/'inside'), (root/'inside', root)):
                with self.assertRaises(ValueError): directories(public, private)
            (root/'public').mkdir(); (root/'public/keep.txt').write_text('retain me')
            with self.assertRaises(ValueError): directories(root/'public', root/'private')
            self.assertEqual((root/'public/keep.txt').read_text(), 'retain me')

    def test_research_requires_opt_in_and_pins_before_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); fake = root/'input.json'; fake.write_text('{}')
            with self.assertRaises(ValueError):
                run_research(output_dir=root/'public', private_dir=root/'private', tutortrace_json=fake)
            with self.assertRaises(ValueError):
                run_research(output_dir=root/'public', private_dir=root/'private', tutortrace_json=fake, allow_tutortrace_research=True)
            self.assertFalse((root/'public').exists())


if __name__ == '__main__': unittest.main()
