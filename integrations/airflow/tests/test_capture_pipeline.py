import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from qlm_airflow.capture_pipeline import execute


class CapturePipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); (self.root/'config').mkdir()
        self.manifest = self.root/'config/demo.json'
        self.manifest.write_text(json.dumps({'schema':'qlm-capture-airflow-1','mode':'synthetic'}))

    def test_retry_reuses_verified_artifacts_and_has_bounded_xcom(self):
        first = execute(self.root, 'config/demo.json', 'run-1')
        again = execute(self.root, 'config/demo.json', 'run-1')
        self.assertFalse(first['reused']); self.assertTrue(again['reused'])
        self.assertEqual(first['recorded_request_observations'],2)
        self.assertEqual(set(first), {'artifact_directory','synthetic','recorded_request_observations','shared_query_results_identical','reused'})
        path=self.root/first['artifact_directory']/'public/aggregate.public.json'
        path.write_text('{}')
        with self.assertRaisesRegex(ValueError,'changed'): execute(self.root,'config/demo.json','run-1')

    def test_mapping_code_change_cannot_reuse_prior_completion(self):
        execute(self.root,'config/demo.json','run-2')
        with patch('qlm_airflow.capture_pipeline.implementation_digest', return_value='changed'):
            with self.assertRaisesRegex(ValueError,'different configuration'):
                execute(self.root,'config/demo.json','run-2')

    def test_paths_and_configuration_are_bounded(self):
        for manifest, run_id in (('../escape','run'),('config/demo.json','../escape')):
            with self.assertRaises(ValueError): execute(self.root,manifest,run_id)
        self.manifest.write_text(json.dumps({'schema':'qlm-capture-airflow-1','mode':'synthetic','token':'bad'}))
        with self.assertRaises(ValueError): execute(self.root,'config/demo.json','run')
        self.assertFalse((self.root/'outputs').exists())

    def test_incomplete_output_is_not_overwritten(self):
        folder=self.root/'outputs/capture-run';folder.mkdir(parents=True)
        (folder/'keep').write_text('do not replace')
        with self.assertRaisesRegex(ValueError,'no completion'):
            execute(self.root,'config/demo.json','run')
        self.assertEqual((folder/'keep').read_text(),'do not replace')

    def test_research_opt_in_precedes_even_source_hash_reads(self):
        self.manifest.write_text(json.dumps({'schema':'qlm-capture-airflow-1','mode':'research',
                                           'tutortrace_json':'inputs/not-opened.json'}))
        with patch('qlm_airflow.capture_pipeline.implementation_digest', return_value='synthetic-implementation'), \
             patch('qlm_airflow.capture_pipeline.file_hash') as read:
            with self.assertRaisesRegex(ValueError,'before reading'):
                execute(self.root,'config/demo.json','run')
            read.assert_not_called()


if __name__=='__main__': unittest.main()
