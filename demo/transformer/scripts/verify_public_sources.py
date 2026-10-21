"""Verify exact public excerpts; --fetch independently rechecks pinned originals.

Does not discover, regenerate, fill or infer any learner values. A changed
publisher file fails closed rather than silently updating the demonstration.
"""
from pathlib import Path
import argparse
import hashlib
import json
import urllib.request
from build_scaffolding_evidence import build as verify_scaffolding_evidence

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def verify(fetch=False):
    results = []
    for name in ('tutormoments', 'oatutor'):
        provenance = json.loads((DIST / 'provenance' / (name + '.json')).read_text())
        sample = (DIST / 'samples' / provenance['sample_file']['name']).read_bytes()
        assert sha(sample) == provenance['sample_file']['sha256'], name + ': sample hash changed'
        sample_lines = sample.splitlines(keepends=True)
        body = sample_lines if name == 'tutormoments' else sample_lines[1:]
        assert len(body) == len(provenance['records'])
        for line, record in zip(body, provenance['records']):
            assert sha(line) == record['line_sha256'], name + ': excerpt record changed'
        result = {'source': name, 'sample_sha256': sha(sample), 'exact_excerpt_records': len(body), 'original_retrieved': False}
        if fetch:
            original = urllib.request.urlopen(provenance['source_file']['download_url'], timeout=120).read(50_000_001)
            assert len(original) <= 50_000_000, 'source exceeds expected bounded retrieval size'
            assert sha(original) == provenance['source_file']['sha256'], name + ': original file hash changed'
            lines = original.splitlines(keepends=True)
            excerpt = (lines[0] if name == 'oatutor' else b'') + b''.join(lines[r['source_line_1_based'] - 1] for r in provenance['records'])
            assert excerpt == sample, name + ': sample is not the documented exact original rows'
            result['original_retrieved'] = True
            result['original_sha256'] = sha(original)
        results.append(result)
    results.append({'source': 'tutormoments_scaffolding_annotations',
                    'verification': verify_scaffolding_evidence(fetch=fetch, check=True)})
    return results

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    print(json.dumps(verify(parser.parse_args().fetch), indent=2))
