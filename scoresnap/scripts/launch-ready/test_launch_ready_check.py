"""Offline acceptance of the frozen gate; fixture values are never live proof."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).parent
SHA = 'a' * 40
NOW = '2026-11-18T20:00:00+00:00'


def module():
    spec = importlib.util.spec_from_file_location('gate', ROOT / 'launch_ready_check.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def fixture(tmp_path):
    manifest = json.loads((ROOT / 'LAUNCH-READY.json').read_text())
    bundle = {'rows': {}, 'board': {'observed_at': NOW, 'issues': []}}
    for row in manifest['rows']:
        facts = copy.deepcopy(row['requires'])
        if row.get('graded'):
            digest = 'b' * 64
            facts.update(artifact_sha256=digest,
                         grade={'verdict': 'PASS', 'artifact_sha256': digest},
                         verifier={'verdict': 'PASS', 'artifact_sha256': digest,
                                   'company': 'anthropic', 'builder_company': 'openai'})
        receipt = {'rc_sha': SHA, 'observed_at': NOW,
                   'source': 'https://github.com/augsmog/QuickScore/actions/runs/1',
                   'facts': facts}
        path = tmp_path / (row['id'] + '.json')
        path.write_text(json.dumps(receipt))
        bundle['rows'][row['id']] = {'path': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    return manifest, bundle


def run(tmp_path, manifest=None, bundle=None):
    if manifest is None:
        manifest, bundle = fixture(tmp_path)
    return module().evaluate(manifest, bundle, tmp_path, SHA, NOW)


def edit(tmp_path, bundle, row, change):
    path = tmp_path / bundle['rows'][row]['path']
    obj = json.loads(path.read_text()); change(obj)
    path.write_text(json.dumps(obj))
    bundle['rows'][row]['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()


def test_all_pass(tmp_path):
    result = run(tmp_path)
    assert result['ready'] is True
    assert result['remaining'] == []
    assert len(result['rows']) == 12


def test_no_evidence_is_unknown_and_nonzero(tmp_path):
    p = subprocess.run([sys.executable, str(ROOT / 'launch_ready_check.py'), '--rc-sha', SHA,
                        '--now', NOW], capture_output=True, text=True)
    assert p.returncode == 1
    result = json.loads(p.stdout)
    assert len(result['remaining']) == 12
    assert all(r['status'] == 'UNKNOWN' for r in result['rows'])


def test_unmapped_duplicate_or_changed_requirement_fails(tmp_path):
    manifest, bundle = fixture(tmp_path)
    for change in ('unmapped', 'duplicate', 'weakened'):
        altered = copy.deepcopy(manifest)
        if change == 'unmapped': altered['rows'][0]['command'] = ''
        elif change == 'duplicate': altered['rows'][1]['id'] = 'LR-1'
        else: altered['rows'][0]['requires'] = {}
        result = run(tmp_path, altered, bundle)
        assert not result['ready']
        assert result['configuration_errors']


def test_sha_missing_proof_and_tampering_fail(tmp_path):
    manifest, bundle = fixture(tmp_path)
    edit(tmp_path, bundle, 'LR-1', lambda r: r.update(rc_sha='c' * 40))
    edit(tmp_path, bundle, 'LR-3', lambda r: r['facts'].pop('verifier'))
    (tmp_path / 'LR-4.json').write_text('{}')
    result = run(tmp_path, manifest, bundle)
    assert set(result['remaining']) == {'LR-1', 'LR-3', 'LR-4'}


def test_false_assertion_fails_not_unknown(tmp_path):
    manifest, bundle = fixture(tmp_path)
    edit(tmp_path, bundle, 'LR-12', lambda r: r['facts'].update(open_p0_children=1))
    assert run(tmp_path, manifest, bundle)['rows'][-1]['status'] == 'FAIL'


def test_graded_receipts_must_bind_same_artifact_cross_company(tmp_path):
    manifest, bundle = fixture(tmp_path)
    edit(tmp_path, bundle, 'LR-3', lambda r: r['facts']['verifier'].update(artifact_sha256='c'*64))
    edit(tmp_path, bundle, 'LR-5', lambda r: r['facts']['verifier'].update(company='openai'))
    assert set(run(tmp_path, manifest, bundle)['remaining']) == {'LR-3', 'LR-5'}


def test_stale_live_future_invalid_and_immutable_receipts(tmp_path):
    manifest, bundle = fixture(tmp_path)
    edit(tmp_path, bundle, 'LR-2', lambda r: r.update(observed_at='2026-11-16T00:00:00+00:00'))
    edit(tmp_path, bundle, 'LR-4', lambda r: r.update(observed_at='2026-11-19T00:00:00+00:00'))
    edit(tmp_path, bundle, 'LR-8', lambda r: r.update(observed_at='not-a-date'))
    edit(tmp_path, bundle, 'LR-10', lambda r: r.update(observed_at='2026-11-01T00:00:00+00:00'))
    result = run(tmp_path, manifest, bundle)
    assert set(result['remaining']) == {'LR-2', 'LR-4', 'LR-8'}
    assert {'kind': 'stale_row', 'row': 'LR-2'} in result['alarms']


def test_seeded_dead_blocker_and_stale_row(tmp_path):
    manifest, bundle = fixture(tmp_path)
    bundle['board']['issues'] = [
        {'id': 'AUG-1', 'blocked': True, 'priority': 2, 'state': 'Todo', 'blocker': {'id': 'AUG-2', 'state': 'Done'},
         'owner': 'E2E', 'wake': 'CI green'},
        {'id': 'AUG-3', 'blocked': True, 'priority': 2, 'state': 'Todo', 'owner': '', 'wake': ''}]
    edit(tmp_path, bundle, 'LR-8', lambda r: r.update(observed_at='2026-11-16T00:00:00+00:00'))
    result = run(tmp_path, manifest, bundle)
    assert {'kind': 'dead_blocker', 'issue': 'AUG-1'} in result['alarms']
    assert {'kind': 'dead_blocker', 'issue': 'AUG-3'} in result['alarms']
    assert {'kind': 'stale_row', 'row': 'LR-8'} in result['alarms']


def test_missing_board_not_clean(tmp_path):
    manifest, bundle = fixture(tmp_path)
    del bundle['board']
    result = run(tmp_path, manifest, bundle)
    assert result['board_status'] == 'UNKNOWN'
    assert not result['ready']


def test_bad_sha_and_path_escape_fail(tmp_path):
    manifest, bundle = fixture(tmp_path)
    bundle['rows']['LR-1']['path'] = '../outside.json'
    assert 'LR-1' in run(tmp_path, manifest, bundle)['remaining']
    result = module().evaluate(manifest, bundle, tmp_path, 'main', NOW)
    assert not result['ready'] and result['configuration_errors']


def test_open_p0_cannot_hide_behind_zero_fact(tmp_path):
    manifest, bundle = fixture(tmp_path)
    bundle['board']['issues'] = [{'id': 'AUG-99', 'priority': 1, 'state': 'Todo', 'blocked': False}]
    result = run(tmp_path, manifest, bundle)
    assert result['rows'][-1]['status'] == 'FAIL'
    assert result['remaining'] == ['LR-12']


def test_cli_all_pass_and_unmapped(tmp_path):
    manifest, bundle = fixture(tmp_path)
    evidence = tmp_path / 'bundle.json'; evidence.write_text(json.dumps(bundle))
    cmd = [sys.executable, str(ROOT / 'launch_ready_check.py'), '--rc-sha', SHA,
           '--now', NOW, '--evidence', str(evidence)]
    assert subprocess.run(cmd, capture_output=True).returncode == 0
    manifest['rows'][4]['command'] = ''
    path = tmp_path / 'manifest.json'; path.write_text(json.dumps(manifest))
    assert subprocess.run(cmd + ['--manifest', str(path)], capture_output=True).returncode == 1


def test_duplicate_json_key_and_boolean_integer_are_not_proof(tmp_path):
    manifest, bundle = fixture(tmp_path)
    edit(tmp_path, bundle, 'LR-2', lambda r: r['facts'].update(is_anonymous=1))
    path = tmp_path / 'LR-3.json'
    path.write_text('{"rc_sha":"a", "rc_sha":"b"}')
    bundle['rows']['LR-3']['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    result = run(tmp_path, manifest, bundle)
    assert result['rows'][1]['status'] == 'FAIL'
    assert result['rows'][2]['status'] == 'UNKNOWN'
