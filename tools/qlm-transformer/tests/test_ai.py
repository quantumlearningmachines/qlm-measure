"""Hash, scope, missingness and authored-review mutation tests."""
from copy import deepcopy
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest

from qlm_transformer import transform, verify, conditions_template, verify_conditions
from qlm_transformer.core import digest
from qlm_transformer.ai_profile.code import learnlog_ai as profile
from qlm_transformer.cli import load_rows, main

ROOT = Path(__file__).resolve().parents[1]
TIME = '2026-10-11T18:00:00Z'
KEY = b'k' * 32


class AITests(unittest.TestCase):
    def setUp(self):
        self.rows = profile.load_json(ROOT / 'examples/ai_events.json')
        self.mapping = profile.load_json(ROOT / 'profiles/ai_events.json')
        self.context = profile.load_json(ROOT / 'examples/ai_context.json')

    def make(self):
        return transform(self.rows, 'mathia', self.mapping, KEY, 'synthetic-school',
                         TIME, 'a' * 64, ai_context=self.context)

    def template(self, doc):
        return conditions_template(doc, created=TIME, synthetic=True)

    def rehash(self, doc):
        for record in doc['records']:
            rh = digest(record['header']); prev = rh
            for entry in record['entries']:
                if 'event' in entry:
                    entry['event_hash'] = digest(entry['event'])
                entry['prev_hash'] = prev
                entry['entry_hash'] = digest(dict(record_hash=rh, **{
                    k: entry[k] for k in ('seq', 'time', 'event_hash', 'prev_hash')}))
                prev = entry['entry_hash']

    def reviewed(self, doc, report, cid, result='indeterminate'):
        a = report['assessments'][int(cid[1:])-1]
        a.pop('pending_reason')
        a.update(review_status='reviewed', result=result,
                 rationale='Test-only human-authored judgment.',
                 assessor={'id':'synthetic-reviewer', 'kind':'synthetic_fixture_author'},
                 method={'id':'synthetic-review', 'version':'1', 'description':'Test-only manual review.',
                         'validation_status':'unvalidated_example'},
                 review_coverage={'reviewed_seq':[1,2,3], 'reviewed_content':'full_available_events',
                                  'reviewed_components':['header.ai_context','event_data'],
                                  'coverage_evidence':[], 'limitations':[]},
                 evidence=[], unresolved_information=[{'reason':'outside_observation',
                         'detail':'External assistance is not observed.'}])
        return a

    def entry_ref(self, doc, seq):
        r = doc['records'][0]
        return {'kind':'entry', 'record_id':r['header']['record_id'],
                'record_hash':digest(r['header']), 'seq':seq,
                'entry_hash':r['entries'][seq-1]['entry_hash']}

    def test_context_copied_and_session_pseudonymized(self):
        original = deepcopy(self.context)
        doc = self.make()
        self.assertEqual(self.context, original)
        self.assertNotIn('synthetic-session-001', json.dumps(doc))
        self.assertEqual(doc['records'][0]['header']['ai_context']['policy']['permission'], 'permitted')
        self.assertEqual(doc['records'][0]['entries'][1]['event']['instrument']['source'], 'model')
        verify(doc)

    def test_all16_remain_unreviewed_without_results(self):
        doc = self.make(); report = self.template(doc)
        self.assertEqual([a['condition_id'] for a in report['assessments']], list(profile.CONDITION_IDS))
        self.assertTrue(all(a['review_status']=='unreviewed' and 'result' not in a for a in report['assessments']))
        self.assertEqual(verify_conditions(doc, report)['reviewed_count'], 0)

    def test_summary_cannot_be_given_event_observation_context(self):
        self.mapping['mode']='summary'
        with self.assertRaises(ValueError): self.make()

    def test_missing_activity_version_rejected(self):
        self.mapping['fields'].pop('activity_version')
        with self.assertRaises(ValueError): self.make()

    def test_mixed_activity_or_session_rejected(self):
        for key in ('task','task_version','session'):
            with self.subTest(key=key):
                original = self.rows[1][key]; self.rows[1][key]='other'
                with self.assertRaises(ValueError): self.make()
                self.rows[1][key]=original

    def test_context_does_not_claim_beyond_available_entries(self):
        self.context['observation']['scope']['last_seq']=999999999
        with self.assertRaises(ValueError): self.make()

    def test_policy_scope_mismatch_rejected(self):
        self.context['policy']['scope']['activity_id']='other'
        with self.assertRaises(ValueError): self.make()

    def test_context_tamper_rejected(self):
        doc=self.make(); doc['records'][0]['header']['ai_context']['policy']['permission']='prohibited'
        with self.assertRaises(ValueError): verify(doc)

    def test_recommitted_event_binding_mismatch_rejected(self):
        doc=self.make(); doc['records'][0]['entries'][0]['event']['ai_context']['stage']='assessment'
        self.rehash(doc)
        with self.assertRaises(ValueError): verify(doc)

    def test_model_provenance_must_be_explicit(self):
        self.mapping['scaffold_instrument'].pop('config_hash')
        with self.assertRaises(ValueError): self.make()

    def test_raw_content_and_reveals_answer_require_types(self):
        for key,value in [('help_text', {'not':'text'}),('reveals_answer','yes')]:
            with self.subTest(key=key):
                original=self.rows[1][key]; self.rows[1][key]=value
                with self.assertRaises(ValueError): self.make()
                self.rows[1][key]=original

    def test_sidecar_missing_or_duplicate_condition_rejected(self):
        doc=self.make(); report=self.template(doc)
        report['assessments'].pop()
        with self.assertRaises(ValueError): verify_conditions(doc,report)
        report=self.template(doc); report['assessments'][0]['condition_id']='C02'
        with self.assertRaises(ValueError): verify_conditions(doc,report)

    def test_unreviewed_cannot_have_result(self):
        doc=self.make(); report=self.template(doc); report['assessments'][0]['result']='supported_absent'
        with self.assertRaises(ValueError): verify_conditions(doc,report)

    def test_reviewed_unknown_is_distinct_from_unreviewed(self):
        doc=self.make(); report=self.template(doc); self.reviewed(doc,report,'C16')
        self.assertEqual(verify_conditions(doc,report)['reviewed_count'],1)
        self.assertNotIn('result',report['assessments'][0])

    def test_nonreporting_needs_actually_reviewed_source(self):
        doc=self.make(); report=self.template(doc); a=self.reviewed(doc,report,'C12')
        a['unresolved_information']=[{'reason':'not_reported_after_review','detail':'No statement found.'}]
        with self.assertRaises(ValueError): verify_conditions(doc,report)

    def test_record_hash_and_entry_references_resolve(self):
        doc=self.make(); report=self.template(doc); a=self.reviewed(doc,report,'C12')
        a['evidence']=[self.entry_ref(doc,2)]; a['evidence'][0]['entry_hash']='b'*64
        with self.assertRaises(ValueError): verify_conditions(doc,report)

    def test_difference_needs_comparator(self):
        doc=self.make(); report=self.template(doc); a=self.reviewed(doc,report,'C14','supported_present')
        a['evidence']=[self.entry_ref(doc,2)]
        with self.assertRaises(ValueError): verify_conditions(doc,report)

    def test_c01_not_inferred_from_import_row_order(self):
        doc=self.make(); report=self.template(doc); a=self.reviewed(doc,report,'C01','supported_present')
        a['evidence']=[self.entry_ref(doc,2)]
        with self.assertRaisesRegex(ValueError,'chronology'): verify_conditions(doc,report)

    def test_assessment_permission_not_inferred_from_learning_policy(self):
        doc=self.make(); report=self.template(doc); a=self.reviewed(doc,report,'C06','supported_present')
        a['evidence']=[self.entry_ref(doc,2)]
        with self.assertRaises(ValueError): verify_conditions(doc,report)

    def test_violation_cannot_be_concluded_from_policy_only(self):
        self.context['phase']=self.context['policy']['phase']='assessment'
        self.context['policy']['permission']='prohibited'
        doc=self.make(); report=self.template(doc); a=self.reviewed(doc,report,'C07','supported_present')
        a['evidence']=[{'kind':'context', 'record_id':a['scope']['record_id'],
                        'record_hash':a['scope']['record_hash'],'context_id':self.context['context_id'],
                        'path':'/ai_context/policy'}]
        with self.assertRaisesRegex(ValueError,'observed model assistance'): verify_conditions(doc,report)

    def test_restricted_policy_does_not_establish_violation(self):
        self.context['phase']=self.context['policy']['phase']='assessment'
        self.context['policy']['permission']='restricted'
        doc=self.make(); report=self.template(doc); a=self.reviewed(doc,report,'C07','supported_present')
        a['evidence']=[self.entry_ref(doc,2)]
        with self.assertRaisesRegex(ValueError,'restricted-rule'): verify_conditions(doc,report)

    def test_violation_requires_software_actor_for_model_assistance(self):
        self.context['phase']=self.context['policy']['phase']='assessment'
        self.context['policy']['permission']='prohibited'
        self.mapping['scaffold_actor']['kind']='human'
        doc=self.make(); report=self.template(doc); a=self.reviewed(doc,report,'C07','supported_present')
        a['evidence']=[self.entry_ref(doc,2)]
        with self.assertRaisesRegex(ValueError,'observed model assistance'): verify_conditions(doc,report)

    def test_external_absence_rejected(self):
        doc=self.make(); report=self.template(doc); a=self.reviewed(doc,report,'C07','supported_absent')
        a.update(absence_basis='Test-only invalid claim.'); a['scope']['domain']='external_assistance'
        a['evidence']=[self.entry_ref(doc,2)]
        with self.assertRaises(ValueError): verify_conditions(doc,report)

    def test_huge_assessment_scope_rejected(self):
        doc=self.make(); report=self.template(doc); report['assessments'][0]['scope']['last_seq']=9007199254740991
        with self.assertRaises(ValueError): verify_conditions(doc,report)

    def test_ai_redaction_preserves_integrity_but_blocks_review(self):
        doc=self.make(); report=self.template(doc); entry=doc['records'][0]['entries'][1]
        entry.pop('event'); entry['redacted']=True
        verify(doc)
        with self.assertRaises(ValueError): verify_conditions(doc,report)

    def test_boolean_sequence_rejected_even_after_recommit(self):
        doc=self.make(); doc['records'][0]['entries'][0]['seq']=True; self.rehash(doc)
        with self.assertRaises(ValueError): verify(doc)

    def test_multi_record_template_requires_selection(self):
        second=deepcopy(self.rows)
        for row in second: row['student_id']='second-student'
        self.rows.extend(second); doc=self.make()
        with self.assertRaises(ValueError): self.template(doc)
        report=conditions_template(doc,doc['records'][1]['header']['record_id'],created=TIME)
        verify_conditions(doc,report)

    def test_strict_json_loader_rejects_duplicate_keys_and_nonfinite_numbers(self):
        with tempfile.TemporaryDirectory() as d:
            for text in ['[{"id":1,"id":2}]','[{"id":NaN}]','[{"id":Infinity}]']:
                path=Path(d)/'rows.json'; path.write_text(text)
                with self.assertRaises(ValueError): load_rows(path)
            path=Path(d)/'rows.jsonl'; path.write_text('{"id":1,"id":2}\n')
            with self.assertRaises(ValueError): load_rows(path)

    def test_cli_verifies_sidecar_and_checkpoint(self):
        with redirect_stdout(io.StringIO()) as output:
            rc=main(['verify',str(ROOT/'examples/ai_events.learnlog.json'),
                     '--checkpoint',str(ROOT/'examples/ai_events.heads.json'),
                     '--assessment',str(ROOT/'examples/ai_events.assessment.json')])
        self.assertEqual(rc,0)
        self.assertEqual(json.loads(output.getvalue())['conditions']['reviewed_count'],0)

    def test_cli_errors_do_not_echo_rejected_values(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'bad.json'; path.write_text('{"secret_learner_name":"x"}')
            with redirect_stderr(io.StringIO()) as output:
                rc=main(['verify',str(path)])
            self.assertEqual(rc,1); self.assertNotIn('secret_learner_name',output.getvalue())


if __name__=='__main__': unittest.main()
