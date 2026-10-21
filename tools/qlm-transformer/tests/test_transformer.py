import copy
import json
import unittest
from pathlib import Path
from qlm_transformer.core import transform, verify, digest, subject_id, timestamp
ROOT=Path(__file__).resolve().parents[1]
KEY=b'k'*32
TIME='2026-10-08T20:00:00Z'
class Tests(unittest.TestCase):
    def make(self, platform='khan_academy', event=False):
        stem='explicit_events' if event else platform
        return transform(json.loads((ROOT/'examples'/f'{stem}.json').read_text()),platform,json.loads((ROOT/'profiles'/f'{stem}.json').read_text()),KEY,'demo',TIME,'a'*64)
    def test_all_five(self):
        for p in ('khan_academy','mathia','ixl','dreambox','aleks'):
            with self.subTest(platform=p):
                doc=self.make(p); self.assertTrue(verify(doc))
                self.assertEqual(doc['records'][0]['entries'][0]['event']['name'],'qlm_import:summary_observed')
                self.assertNotIn('demo-student-001',json.dumps(doc))
    def test_events(self):
        doc=self.make(event=True)
        self.assertEqual([e['event']['name'] for e in doc['records'][0]['entries']],['assist:help_requested','assist:scaffold_provided','qlm_import:response_observed'])
        verify(doc)
    def test_tamper(self):
        doc=self.make(); doc['records'][0]['entries'][0]['event']['data']['assistance']='none'
        with self.assertRaises(ValueError): verify(doc)
    def test_header_tamper(self):
        doc=self.make(); doc['records'][0]['header']['source_platform']='other'
        with self.assertRaises(ValueError): verify(doc)
    def test_tail_removal_checkpoint(self):
        doc=self.make(event=True); checkpoint=verify(doc)
        doc['records'][0]['entries'].pop()
        verify(doc) # Hash chain alone cannot detect tail deletion.
        with self.assertRaises(ValueError): verify(doc,checkpoint)
    def test_redaction(self):
        doc=self.make(); entry=doc['records'][0]['entries'][0]
        del entry['event']; entry['redacted']=True; verify(doc)
    def test_isolation(self):
        self.assertNotEqual(subject_id('ixl','a','1',KEY),subject_id('ixl','b','1',KEY))
    def test_timezone(self):
        self.assertEqual(timestamp('2026-10-08T12:00:00-07:00'),'2026-10-08T19:00:00Z')
        with self.assertRaises(ValueError): timestamp('2026-10-08')
    def test_unknown_kind(self):
        p=json.loads((ROOT/'profiles/explicit_events.json').read_text())
        with self.assertRaises(ValueError): transform([{'student_id':'1','time':TIME,'kind':'mystery'}],'ixl',p,KEY,'demo',TIME,'a'*64)
    def test_empty(self):
        with self.assertRaises(ValueError): transform([],'ixl',{'fields':{'subject_id':'id'}},KEY,'demo',TIME,'a'*64)
    def test_salts(self):
        a=self.make(); b=self.make()
        self.assertNotEqual(a['records'][0]['entries'][0]['event']['salt'],b['records'][0]['entries'][0]['event']['salt'])
    def test_rfc8785(self):
        self.assertEqual(digest({'z':1.0,'a':2}),digest({'a':2,'z':1}))
    def test_custom_platform_requires_explicit_whitelist_and_matching_profile(self):
        profile={'platform':'uci_student_performance','fields':{'subject_id':'id'}}
        rows=[{'id':'1'}]
        with self.assertRaises(ValueError):
            transform(rows,'uci_student_performance',profile,KEY,'demo',TIME,'a'*64)
        doc=transform(rows,'uci_student_performance',profile,KEY,'demo',TIME,'a'*64,
                      custom_platforms=('uci_student_performance',))
        self.assertEqual(doc['records'][0]['header']['source_platform'],'uci_student_performance')
        profile['platform']='other'
        with self.assertRaises(ValueError):
            transform(rows,'uci_student_performance',profile,KEY,'demo',TIME,'a'*64,
                      custom_platforms=('uci_student_performance',))
    def test_normative_draft_header_hash_vector(self):
        header={'created':'2026-10-07T14:00:00Z','hash_alg':'sha-256',
                'producer':{'name':'example-sim','version':'1.4.0'},
                'record_id':'66a921d7-55be-4589-afcc-84ea4d2c26ef',
                'subject':'L-fdda6e0e3413590a303a3737d4176389'}
        self.assertEqual(digest(header),'dcfc869849b6088bb8cba0761987f4fa90a181335e20a95b120bb0e8dfcd5556')
    def test_normative_draft_entry_hash_vector(self):
        value={'event_hash':'1b878146c3e51d20d0411979dc7fbac81da5fd088469a725b9afcf8395c2a518',
               'prev_hash':'ff3f6b48ed7a77379e68a08f6a0c2bfa71bdc757671ceb88d905e5d307638433',
               'record_hash':'dcfc869849b6088bb8cba0761987f4fa90a181335e20a95b120bb0e8dfcd5556',
               'seq':2,'time':'2026-10-07T14:01:10Z'}
        self.assertEqual(digest(value),'ac64c6867336279286d1837e60312b56b106978d648db62360f211306d65b6e5')
if __name__=='__main__': unittest.main()
