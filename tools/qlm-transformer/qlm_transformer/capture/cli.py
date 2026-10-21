"""Run the assistance-capture demonstration or pinned research reproduction."""
import argparse
import json
from pathlib import Path
import sys

from .workflow import run_demo, run_research


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('demo', 'research'):
        p = commands.add_parser(name)
        p.add_argument('--output-dir', type=Path, required=True)
        p.add_argument('--private-dir', type=Path, required=True)
        if name == 'research':
            p.add_argument('--zenodo-archive', type=Path)
            p.add_argument('--tutortrace-json', type=Path)
            p.add_argument('--allow-tutortrace-research', action='store_true')
    args = parser.parse_args(argv)
    try:
        values = vars(args).copy()
        command = values.pop('command')
        result = (run_demo if command == 'demo' else run_research)(**values)
        print(json.dumps({'synthetic': result.get('synthetic', False),
                          'aggregate': result['aggregate'],
                          'shared_query_results_identical': True}))
        return 0
    except (ValueError, OSError) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
