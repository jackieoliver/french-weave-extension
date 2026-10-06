"""Offline checks; uses temporary caches and mocked GitHub responses only."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('reader', Path(__file__).with_name('read-state.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
state = {'version': 'fixture-1', 'stage': 1, 'words': [
    {'fr': 'et', 'en': 'and', 'hint': 'ay', 'status': 'active'}
]}

with tempfile.TemporaryDirectory() as directory:
    cache = Path(directory) / 'state.json'
    response = subprocess.CompletedProcess([], 0, stdout=json.dumps(state))
    with patch.object(reader.subprocess, 'run', return_value=response) as fetch:
        assert reader.read_state(cache) == state
        argv = fetch.call_args.args[0]
        assert argv[argv.index('--method') + 1] == 'GET'
        assert 'jackieoliver/french-weave-data/contents/state.json?ref=main' in argv[-3]
        assert reader.read_state(cache) == state
        assert fetch.call_count == 1
    print('PASS mocked response parsing, read-only endpoint, fresh cache avoids network')

    updated = dict(state, version='test-update', stage=2)
    os.utime(cache, (time.time() - 1000,) * 2)
    with patch.object(reader.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=json.dumps(updated))):
        assert reader.read_state(cache) == updated
        assert json.loads(cache.read_text()) == updated
    print('PASS expired cache refresh propagates updated stage')

    before = cache.read_bytes()
    stamp = cache.stat().st_mtime_ns
    for failure in [OSError('offline'), subprocess.TimeoutExpired('gh', 15)]:
        with patch.object(reader.subprocess, 'run', side_effect=failure), contextlib.redirect_stderr(io.StringIO()):
            assert reader.read_state(cache, force=True) == updated
        assert cache.read_bytes() == before and cache.stat().st_mtime_ns == stamp
    with patch.object(reader.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout='{"stage": true}')), contextlib.redirect_stderr(io.StringIO()):
        assert reader.read_state(cache, force=True) == updated
    assert cache.read_bytes() == before
    print('PASS offline, timeout and invalid remote data preserve last good state')

    with patch.object(reader.subprocess, 'run', side_effect=OSError('offline')), contextlib.redirect_stderr(io.StringIO()):
        try:
            reader.read_state(Path(directory) / 'missing.json')
            raise AssertionError('Must report no valid state')
        except RuntimeError:
            pass
    print('PASS missing cache plus offline reports unavailable state')

    many = dict(state, words=[dict(fr=f'word{i}', en='example', hint='example', status='known') for i in range(200)])
    assert len(reader.validate(many)['words']) == 200
    accented = dict(state, words=[dict(fr=f, en='example', hint='example', status='active') for f in ('ou', 'où')])
    assert len(reader.validate(accented)['words']) == 2
    print('PASS retains known lists above 150 and distinguishes accents')

    for bad in [dict(state, stage=True), dict(state, words=[]),
                dict(state, words=state['words'] + [state['words'][0]])]:
        try:
            reader.validate(bad)
            raise AssertionError('Must reject invalid state')
        except ValueError:
            pass
    print('PASS rejects invalid stage, empty list and duplicate words')
print('All shared-list checks passed.')
