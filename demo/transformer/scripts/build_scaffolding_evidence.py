"""Build/verify a pinned published annotation companion; never generate new labels.

Run `python scripts/build_scaffolding_evidence.py --fetch` to independently fetch
and verify all three publisher files, extract exact original JSONL lines, and
rebuild the companion. Without --fetch, existing exact excerpts are checked.
"""
from pathlib import Path
import argparse
import collections
import hashlib
import json
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'dist'
REVISION='3bb0c104d65e29facffca7ba864ef10fa22d0e78'
BASE=f'https://huggingface.co/datasets/allenai/tutormoments-preview/resolve/{REVISION}/'
PROFILE='qlm.tutormoments.source-coded-intervals.v1'
TURN_FIELDS=('turn_number','start_seconds','end_seconds','role','text')
FILES={
 'transcripts.jsonl':{'sha256':'34b5d4483302593043f3d9be3bf37f1cde6cba5b031fd2d20d75a15d5498f276','bytes':38117914,'lines':[366,435],'excerpt':'tutormoments-real-transcripts.jsonl','excerpt_sha256':'7df51fda0fff9c454ba14a33a0d2964d5e94b2556eff1d3897ec4f41373c8a66'},
 'ground_truth.jsonl':{'sha256':'9735b8c83575098dfac6928d1ff32a0aa283700651598ab9a7757879d6edcfda','bytes':11131708,'lines':[157,190],'excerpt':'tutormoments-real-ground-truth.jsonl','excerpt_sha256':'cbfa7af79ce6145517003c931ff7dd3aba0bad656df1fc22bf940c8cdb203fa6'},
 'annotations.jsonl':{'sha256':'8a7adc65b8c63a78950a278eda5e4feaa5a093bab02d964bad1027468e18914f','bytes':10255887,'lines':[218,268,278,312,316,393,403,490,505,632,716,732,747,756],'excerpt':'tutormoments-real-human-annotations.jsonl','excerpt_sha256':'d2551b3b2073d6630de6d2908a28295b75e6df92c67af8f2c9e85bf37c2eb85b'},
}
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):
    # Source fixture contains no nonintegral numbers; JS serialization agrees.
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def read_excerpt(name,fetch=False,source_dir=None,check=False):
    spec=FILES[name]
    path=DIST/'samples'/spec['excerpt']
    if fetch or source_dir:
        if source_dir:raw=(Path(source_dir)/name).read_bytes()
        else:
            with urllib.request.urlopen(BASE+name,timeout=120)as response:raw=response.read(spec['bytes']+1)
        assert len(raw)==spec['bytes'] and sha(raw)==spec['sha256'],name+': original changed'
        lines=raw.splitlines(keepends=True)
        selected=b''.join(lines[n-1]for n in spec['lines'])
        assert sha(selected)==spec['excerpt_sha256'],name+': excerpt changed'
        if name!='transcripts.jsonl' and not check:path.write_bytes(selected)
        else:assert path.read_bytes()==selected,'Bundled fixture differs from pinned source'
    raw=path.read_bytes()
    assert sha(raw)==spec['excerpt_sha256'],name+': local excerpt changed'
    lines=raw.splitlines(keepends=True)
    assert len(lines)==len(spec['lines'])
    return[(line,json.loads(b),b)for line,b in zip(spec['lines'],lines)]
def build(fetch=False,source_dir=None,check=False):
    inputs={name:read_excerpt(name,fetch,source_dir,check)for name in FILES}
    sources={}
    for name,spec in FILES.items():
        b=(DIST/'samples'/spec['excerpt']).read_bytes()
        sources[name]={'url':BASE+name,'sha256':spec['sha256'],'size_bytes':spec['bytes'],'sample_url':'https://transformer.quantumlearningmachines.com/samples/'+spec['excerpt'],'sample_sha256':sha(b),'sample_size_bytes':len(b),'source_lines_1_based':spec['lines'],'selection':'Exact complete original JSONL lines including original newline bytes; unchanged.'}
    transcripts={};windows=[];matched=0
    for line,t,_ in inputs['transcripts.jsonl']:
        turns=[{k:turn[k]for k in TURN_FIELDS}for turn in t['turns']]
        transcripts[t['transcript_id']]={'id':t['transcript_id'],'provider':t['source'],'source_file_line_1_based':line,'source_record_sha256':sha(canonical(t).encode()),'turns':turns}
    for line,g,b in inputs['ground_truth.jsonl']:
        assert g['conversation_id']in transcripts
        groups=collections.defaultdict(list)
        for idx,m in enumerate(g['key_moments']):
            if m['annotation_type']=='scaffolding':groups[(m['turn_start'],m['turn_end'])].append((idx,m))
        for (start,end),rows in sorted(groups.items()):
            labels={k:{m[k]for _,m in rows}for k in ('situation_label_agg','action_direction_agg')}
            assert all(len(v)==1 for v in labels.values()),'Conflicting published aggregate labels'
            annotations=[]
            for idx,m in rows:
                matches=[]
                for hl,h,_ in inputs['annotations.jsonl']:
                    if h['transcript_id']!=g['conversation_id']or h['annotator_id']!=m['annotator_id']:continue
                    for hi,hm in enumerate(h['turn_annotations']):
                        if hm['turn_number_start']==start and hm['turn_number_end']==end and all(hm.get(k)==m[k]for k in ('situation','action','result')):
                            matches.append({'source_line_1_based':hl,'turn_annotation_index_0_based':hi,'interface_version':h['interface_version']})
                assert matches,'Derived SAR text lacks exact raw-human-source match'
                matched+=1
                annotations.append({'annotator_id':m['annotator_id'],'situation':m['situation'],'action':m['action'],'result':m['result'],'ground_truth_key_moment_index_0_based':idx,'human_annotation_matches':matches})
            tid=g['conversation_id'];turns=transcripts[tid]['turns']
            assert len([t for t in turns if start<=t['turn_number']<=end])==end-start+1
            windows.append({'id':f'{tid}:scaffolding:{start}-{end}','transcript_id':tid,'turn_start':start,'turn_end':end,'need':next(iter(labels['situation_label_agg'])),'action':next(iter(labels['action_direction_agg'])),'annotation_rows':len(rows),'annotations':annotations,'ground_truth_source_line_1_based':line,'ground_truth_source_line_sha256':sha(b)})
    assert len(windows)==10 and matched==60
    evidence={'measurement_profile':PROFILE,'dataset':'tutormoments','provider':'tutoring_provider_a','dataset_url':'https://huggingface.co/datasets/allenai/tutormoments-preview','revision':REVISION,'license':'CC-BY-4.0','license_url':'https://creativecommons.org/licenses/by/4.0/','attribution':'TutorMoments-Preview, Albert Zhang and colleagues, Allen Institute for AI and collaborators (2026).','label_origin':'Published source hybrid LLM-assisted labels over human situation/action/result commentary. QLM ran no new classifier.','human_text_verification':{'matched_scaffolding_rows':matched,'raw_human_pass_records':len(inputs['annotations.jsonl']),'method':'Each included situation/action/result string matches the pinned raw human annotation record exactly by transcript, annotator and turn span.'},'sources':sources,'transcripts':list(transcripts.values()),'windows':windows,'limitations':[
      'Two purposively selected sessions from one anonymized provider; this is cross-session aggregation, not cross-product validation.',
      'Published categorical labels are subjective and LLM-assisted; faithful transformation does not establish their semantic accuracy or learning effectiveness.',
      'The denominator is distinct exact-span coded intervals, not learners, hints, unique help events or independent observations; some intervals overlap or are nested.',
      'Repeated annotation rows and interface passes are preserved but do not add interval counts or independent votes.',
      'Uncoded turns and sources without compatible annotations are unmeasured, not zero assistance.',
      'A scaffolding or both action label is not itself a learning gain, appropriate help, over-scaffolding or an effectiveness score.',
      'Human commentary may refer to context outside its highlighted span; inspect the surrounding dialogue.',
      'Transcripts represent real human sessions machine-transcribed by the publisher using Gemini 2.5 Pro; original recordings are not independently verified here.',
      'Annotations are a companion layer; they add no observed utterance or assistance events to the Learnlog records.',
    ]}
    output=json.dumps(evidence,ensure_ascii=False,indent=2)+'\n'
    module='// Generated from pinned public excerpts by scripts/build_scaffolding_evidence.py.\nexport const SCAFFOLDING_EVIDENCE = '+output.rstrip()+';\nexport default SCAFFOLDING_EVIDENCE;\n'
    for path,content in [(DIST/'provenance'/'scaffolding-evidence.json',output),(DIST/'scaffolding-evidence.mjs',module)]:
        if check:assert path.read_bytes()==content.encode(),str(path)+': generated evidence differs'
        else:path.write_text(content)
    return {'measurement_profile':PROFILE,'intervals':len(windows),'annotation_rows':matched,'sessions':len(transcripts),'all_originals_verified':bool(fetch or source_dir),'evidence_sha256':sha(output.encode())}
def verify(fetch=False):
    return build(fetch=fetch,check=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--fetch',action='store_true');parser.add_argument('--source-dir');parser.add_argument('--check',action='store_true');args=parser.parse_args();print(json.dumps(build(args.fetch,args.source_dir,args.check),indent=2))
