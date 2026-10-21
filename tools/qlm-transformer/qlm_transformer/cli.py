import argparse
import csv
import hashlib
import io
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from importlib import resources
from .core import PLATFORMS, transform, verify
from .ai import conditions_template, verify_conditions
from .ai_profile.code.learnlog_ai import _unique_object

def _finite_float(token):
    value = float(token)
    if not math.isfinite(value):
        raise ValueError('nonfinite JSON number')
    return value

def strict_json(text):
    return json.loads(text, object_pairs_hook=_unique_object,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('non-JSON numeric constant')),
                      parse_float=_finite_float)

def load_json(path):
    return strict_json(path.read_text(encoding='utf-8-sig'))

def load_object(path):
    value = load_json(path)
    if not isinstance(value, dict):
        raise ValueError('JSON object required')
    return value

def load_rows(path, *, source_bytes=None):
    # Parse exactly the snapshot whose bytes are committed to the output header.
    text = (path.read_bytes() if source_bytes is None else source_bytes).decode('utf-8-sig')
    if path.suffix.lower() == '.csv':
        with io.StringIO(text, newline='') as stream:
            reader = csv.DictReader(stream)
            if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
                raise ValueError('CSV requires unique column headers')
            rows = list(reader)
            if any(None in row for row in rows):
                raise ValueError('CSV row contains more values than columns')
            return rows
    if path.suffix.lower() == '.jsonl':
        return [strict_json(line) for line in text.splitlines() if line.strip()]
    rows = strict_json(text)
    if not isinstance(rows, list):
        raise ValueError('JSON input must be an array of row objects')
    return rows

def init_demo(output_dir):
    """Export packaged synthetic examples without requiring a source checkout."""
    source = resources.files('qlm_transformer').joinpath('resources')
    payloads = []
    for group in ('profiles', 'examples'):
        for item in sorted(source.joinpath(group).iterdir(), key=lambda p: p.name):
            if item.is_file() and item.name.endswith('.json'):
                payloads.append((Path(group) / item.name, item.read_bytes()))
    if not payloads:
        raise ValueError('packaged demonstration resources unavailable')
    # An existing destination could contain user data; never overwrite it.
    output_dir.mkdir(parents=True, exist_ok=False)
    for relative, content in payloads:
        destination = output_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
    (output_dir / 'README.txt').write_text(
        'QLM Transformer synthetic demonstration resources.\n'
        'No live vendor integration or real learner data is represented.\n'
        'See the package README and THIRD_PARTY_NOTICES for scope and licensing.\n',
        encoding='utf-8')
    return len(payloads)

def main(argv=None):
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest='command', required=True)
    convert = commands.add_parser('convert')
    convert.add_argument('--platform', choices=PLATFORMS, required=True)
    convert.add_argument('--input', type=Path, required=True)
    convert.add_argument('--profile', type=Path, required=True)
    convert.add_argument('--tenant', required=True)
    convert.add_argument('--output', type=Path, required=True)
    convert.add_argument('--imported-at')
    convert.add_argument('--checkpoint', type=Path)
    convert.add_argument('--ai-context', type=Path,
                         help='Explicit profile v0.1.0 context; input scope.session is mapped raw session ID')
    convert.add_argument('--assessment-template', type=Path,
                         help='Create all16 unreviewed sidecar (single-record input only)')
    convert.add_argument('--synthetic', action='store_true', help='Label generated sidecar as synthetic')
    check = commands.add_parser('verify')
    check.add_argument('input', type=Path)
    check.add_argument('--checkpoint', type=Path)
    check.add_argument('--assessment', type=Path)
    conditions = commands.add_parser('conditions', help='Create all16 unreviewed condition sidecar')
    conditions.add_argument('input', type=Path)
    conditions.add_argument('--record-id')
    conditions.add_argument('--created')
    conditions.add_argument('--output', type=Path, required=True)
    conditions.add_argument('--synthetic', action='store_true')
    demo = commands.add_parser('init-demo', help='Copy packaged synthetic examples and profiles')
    demo.add_argument('--output-dir', type=Path, required=True,
                      help='New directory; existing destinations are never overwritten')
    args = parser.parse_args(argv)
    try:
        if args.command == 'init-demo':
            print(json.dumps({'synthetic_files': init_demo(args.output_dir)}))
        elif args.command == 'convert':
            # Secret from environment, never command-line arguments or output.
            key = bytes.fromhex(os.environ.get('QLM_PSEUDONYM_KEY', ''))
            source_bytes = args.input.read_bytes()
            doc = transform(load_rows(args.input, source_bytes=source_bytes), args.platform,
                            load_object(args.profile), key, args.tenant,
                            args.imported_at or datetime.now(timezone.utc).isoformat(),
                            hashlib.sha256(source_bytes).hexdigest(),
                            ai_context=load_object(args.ai_context) if args.ai_context else None)
            heads = verify(doc)
            report = conditions_template(doc, created=doc['records'][0]['header']['created'],
                                         synthetic=args.synthetic) if args.assessment_template else None
            args.output.write_text(json.dumps(doc, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
            if args.checkpoint:
                args.checkpoint.write_text(json.dumps(heads, indent=2)+'\n', encoding='utf-8')
            if report is not None:
                args.assessment_template.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
            print(json.dumps({'records':len(doc['records']), 'entries':sum(len(r['entries']) for r in doc['records'])}))
        elif args.command == 'conditions':
            report = conditions_template(load_object(args.input), record_id=args.record_id,
                                         created=args.created or datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
                                         synthetic=args.synthetic)
            args.output.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
            print(json.dumps({'assessment_count':16, 'reviewed_count':0}))
        else:
            doc = load_object(args.input)
            heads = verify(doc, load_object(args.checkpoint) if args.checkpoint else None)
            result = {'integrity':'hash_consistent_unsigned', 'authenticity':'not_established',
                      'records':len(heads), 'checkpoint_checked':bool(args.checkpoint)}
            if args.assessment:
                result['conditions'] = verify_conditions(doc, load_object(args.assessment))
            print(json.dumps(result))
    except (ValueError, KeyError, TypeError, OSError, csv.Error) as exc:
        # JSON Schema errors can embed rejected data; keep CLI errors value-free.
        print('Transformation failed ('+type(exc).__name__+'): input or configuration validation failed.', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
