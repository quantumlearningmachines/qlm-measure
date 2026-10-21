#!/usr/bin/env python3
"""Embed the versioned JSON definitions for offline browser verification.

The JSON files are the machine-readable source of truth. This copies their
objects into the browser module; it never changes the hand-written validators
or pooling rules. Use --check in a release to detect stale embedded copies.
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'dist/research-semantics.mjs'
DEFINITIONS = (
    ('ASSISTANCE_CONTEXT_PROFILE', 'assistance-context-v0.1.0.json', 'export const IMPORT_EVENT_SCHEMA'),
    ('IMPORT_EVENT_SCHEMA', 'research-import-v2.json', 'export const LIFECYCLE_EVENT_SCHEMA'),
    ('LIFECYCLE_EVENT_SCHEMA', 'assistance-lifecycle-v1.json', '\n\nfunction deepFreeze'),
)


def rendered(text):
    for name, filename, next_marker in DEFINITIONS:
        start = text.index('export const ' + name + ' =')
        end = text.index(next_marker, start)
        value = json.loads((ROOT / 'dist/schemas' / filename).read_text(encoding='utf-8'))
        text = text[:start] + 'export const ' + name + ' = ' + json.dumps(value, indent=2) + ';\n' + text[end:]
    return text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    original = MODULE.read_text(encoding='utf-8')
    updated = rendered(original)
    if args.check:
        if updated != original:
            raise SystemExit('Embedded semantic definitions are stale; run scripts/build_semantic_definitions.py')
        print('Embedded semantic definitions match all three JSON source files.')
    else:
        MODULE.write_text(updated, encoding='utf-8')
        print('Embedded semantic definitions refreshed.')


if __name__ == '__main__':
    main()
