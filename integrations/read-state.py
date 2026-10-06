#!/usr/bin/env python3
"""Read shared vocabulary from GitHub; cache locally. Never write learning events."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

CACHE = Path(__file__).resolve().with_name('state.json')
GH = 'gh'
ENDPOINT = 'repos/jackieoliver/french-weave-data/contents/state.json?ref=main'
TTL = 15 * 60


def validate(state):
    if not isinstance(state, dict) or type(state.get('stage')) is not int or state['stage'] not in range(1, 6):
        raise ValueError('Invalid stage')
    if not isinstance(state.get('version'), str) or not 1 <= len(state['version']) <= 100:
        raise ValueError('Invalid version')
    words = state.get('words')
    if not isinstance(words, list) or not 1 <= len(words) <= 10000:
        raise ValueError('Invalid word list')
    seen = set()
    for word in words:
        if not isinstance(word, dict) or word.get('status') not in ('active', 'shaky', 'known'):
            raise ValueError('Invalid word status')
        for key in ('fr', 'en', 'hint'):
            value = word.get(key)
            if not isinstance(value, str) or not value.strip() or len(value) > 200 or any(ord(c) < 32 for c in value):
                raise ValueError('Invalid word text')
        if word['fr'] in seen:
            raise ValueError('Duplicate word')
        seen.add(word['fr'])
    return {'version': state['version'], 'stage': state['stage'],
            'words': [{k: w[k] for k in ('fr', 'en', 'hint', 'status')} for w in words]}


def read_state(cache=CACHE, force=False):
    previous = None
    try:
        previous = validate(json.loads(cache.read_text()))
        age = time.time() - cache.stat().st_mtime
        if not force and 0 <= age < TTL:
            return previous
    except (OSError, ValueError):
        pass
    try:
        result = subprocess.run(
            [GH, 'api', '--hostname', 'github.com', '--method', 'GET', ENDPOINT,
             '--header', 'Accept: application/vnd.github.raw+json'],
            capture_output=True, text=True, timeout=15, check=True)
        state = validate(json.loads(result.stdout))
        cache.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', dir=cache.parent, delete=False) as file:
                temporary = Path(file.name)
                json.dump(state, file, ensure_ascii=False, indent=2)
                file.write('\n')
            os.replace(temporary, cache)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        return state
    except (OSError, ValueError, subprocess.SubprocessError):
        # Do not print gh output: authentication diagnostics may contain sensitive data.
        print('French Weave: refresh unavailable; using last good cache.' if previous else
              'French Weave: no valid state available; use Stage 1 fallback words.', file=sys.stderr)
        if previous is None:
            raise RuntimeError('No shared vocabulary available') from None
        return previous


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Bypass the 15-minute cache')
    args = parser.parse_args()
    try:
        print(json.dumps(read_state(force=args.refresh), ensure_ascii=False))
    except RuntimeError:
        sys.exit(1)
