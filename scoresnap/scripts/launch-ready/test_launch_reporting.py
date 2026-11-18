"""Reporting contract tests; fixture rows are not launch evidence."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).parent
SHA = 'a' * 40


def module(name):
    path = ROOT / (name + '.py')
    assert path.exists(), f'missing implementation: {path.name}'
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def result(passes=0, at='2026-11-18T20:00:00+00:00'):
    rows = [{'id': f'LR-{i}', 'status': 'PASS' if i <= passes else 'UNKNOWN',
             'reason': 'receipt checked' if i <= passes else 'missing evidence'} for i in range(1, 13)]
    return {'schema': 'snapscore-launch-ready-result/1', 'definition': 'SS-LAUNCH-READY-FROZEN-20261118',
            'target': '2026-11-24', 'rc_sha': SHA, 'as_of': at, 'rows': rows,
            'ready': passes == 12, 'configuration_errors': [],
            'remaining': [r['id'] for r in rows if r['status'] != 'PASS']}


def test_unknown_is_failure_and_supersedes_stale_progress():
    text = module('launch_report').render(result())
    assert 'FAIL' in text and '12/12 remaining' in text
    assert 'UNKNOWN counts as FAIL' in text
    assert 'supersedes' in text and 'Progress: 34/79' in text
    assert 'unavailable' in text and SHA in text
    assert '2026-11-24' in text and '| LR-12 | UNKNOWN |' in text


def test_trend_uses_same_rc_and_definition_and_actual_elapsed_days():
    old = result(2, '2026-11-16T20:00:00+00:00')
    wrong = result(0, '2026-11-17T20:00:00+00:00'); wrong['rc_sha'] = 'b' * 40
    current = result(6)
    text = module('launch_report').render(current, [old, wrong])
    assert '2.00 rows/day' in text and '2026-11-21' in text
    assert 'within target' in text


def test_zero_progress_regression_future_and_other_definition_have_no_projection():
    for prior in [result(6, '2026-11-17T20:00:00+00:00'),
                  result(7, '2026-11-17T20:00:00+00:00'), result(0, '2026-11-19T20:00:00+00:00')]:
        assert 'Projected completion: unavailable' in module('launch_report').render(result(6), [prior])
    prior = result(0, '2026-11-17T20:00:00+00:00'); prior['definition'] = 'different'
    assert 'Projected completion: unavailable' in module('launch_report').render(result(6), [prior])


def test_malformed_row_set_or_inconsistent_ready_is_rejected():
    for change in ['duplicate', 'missing', 'ready', 'remaining', 'timestamp', 'target']:
        r = result()
        if change == 'duplicate': r['rows'][1]['id'] = 'LR-1'
        if change == 'missing': r['rows'].pop()
        if change == 'ready': r['ready'] = True
        if change == 'remaining': r['remaining'] = []
        if change == 'timestamp': r['as_of'] = '2026-11-18'
        if change == 'target': r['target'] = '2026-12-31'
        try:
            module('launch_report').render(r)
        except ValueError:
            pass
        else:
            raise AssertionError(change)


def test_cli_writes_report_even_for_failed_gate(tmp_path):
    source = tmp_path / 'result.json'; source.write_text(json.dumps(result()))
    out = tmp_path / 'report.md'
    command = [sys.executable, str(ROOT / 'launch_report.py'), str(source), '--out', str(out)]
    p = subprocess.run(command, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    assert '12/12 remaining' in out.read_text()


def test_collection_missing_credentials_does_not_call_vendors(tmp_path):
    collector = module('collect_launch_evidence')
    calls = []
    def forbidden(*a, **kw):
        calls.append(a); raise AssertionError('unexpected credentialed call')
    data = collector.collect(SHA, {}, run=forbidden, get=forbidden, linear=None)
    assert not calls
    assert set(data['providers']) == {'github', 'linear', 'eas', 'asc'}
    assert all(v['status'] == 'UNKNOWN' for v in data['providers'].values())
    assert 'rows' not in data  # observations cannot invent graded receipts


def test_collection_readonly_allowlisted_calls_and_sanitized_failures():
    collector = module('collect_launch_evidence')
    commands, urls = [], []
    def run(args):
        commands.append(args)
        if args[0] == 'gh':
            return {'workflow_runs': [{'name': 'Web smoke', 'head_sha': SHA, 'head_branch': 'main',
                    'status': 'completed', 'conclusion': 'success', 'id': 7, 'html_url': 'https://github.com/augsmog/QuickScore/actions/runs/7'}]}
        return {'id': '12345678-1234-1234-1234-123456789abc', 'status': 'FINISHED',
                'gitCommitHash': SHA, 'appVersion': '1.0.1', 'metadata': {'secret': 'never-save'}}
    def get(url, token):
        urls.append(url)
        raise RuntimeError('SECRET never echo provider errors')
    env = {'GH_TOKEN': 'hidden', 'EXPO_TOKEN': 'hidden', 'AOS_EAS_BUILD_ID': '12345678-1234-1234-1234-123456789abc',
           'AOS_ASC_BUILD_ID': '12345', 'ASC_BEARER_TOKEN': 'hidden'}
    data = collector.collect(SHA, env, run=run, get=get, linear=None)
    assert commands[0][:4] == ['gh', 'api', '--method', 'GET']
    assert commands[1][:2] == ['eas', 'build:view']
    assert urls == ['https://api.appstoreconnect.apple.com/v1/builds/12345']
    assert data['providers']['asc']['status'] == 'UNKNOWN'
    assert 'SECRET' not in json.dumps(data) and 'never-save' not in json.dumps(data)


def test_invalid_ids_or_malformed_payload_fail_closed_without_network():
    collector = module('collect_launch_evidence')
    calls = []
    data = collector.collect(SHA, {'EXPO_TOKEN': 'x', 'AOS_EAS_BUILD_ID': '--other-command',
                                 'ASC_BEARER_TOKEN': 'x', 'AOS_ASC_BUILD_ID': '../users'},
                             run=lambda args: calls.append(args), get=lambda *a: calls.append(a))
    assert not calls
    assert data['providers']['eas']['status'] == data['providers']['asc']['status'] == 'UNKNOWN'
    data = collector.collect(SHA, {'GH_TOKEN': 'x'}, run=lambda args: {})
    assert data['providers']['github']['status'] == 'UNKNOWN'


def test_workflow_runs_main_daily_and_keeps_reporting_after_gate_failure():
    workflow = ROOT.parents[2] / '.github/workflows/launch-ready.yml'
    assert workflow.exists(), 'missing CI workflow'
    text = workflow.read_text()
    assert 'branches: [main]' in text and 'schedule:' in text and 'cron:' in text
    assert 'test_launch_ready_check.py' in text and 'test_launch_reporting.py' in text
    assert '--seed-missing-command' in text
    assert 'if: always()' in text and 'actions/upload-artifact@' in text
    assert 'continue-on-error: true' not in text
    assert 'commentCreate' not in text  # daily publication belongs to existing box alarm consumer


def test_unavailable_provider_removes_dependent_receipts_only():
    sys.path.insert(0, str(ROOT))
    runner = module('run_launch_gate')
    bundle = {'rows': {rid: {'path': rid + '.json'} for rid in [f'LR-{i}' for i in range(1, 13)]}}
    collection = {'providers': {p: {'status': 'OBSERVED'} for p in runner.PROVIDER_ROWS}}
    collection['providers']['eas']['status'] = 'UNKNOWN'
    safe, missing = runner.apply_availability(bundle, collection)
    assert 'LR-4' not in safe['rows'] and 'LR-4' in bundle['rows']
    assert 'eas' in missing['LR-4'] and 'LR-12' not in safe['rows']
    assert 'LR-3' in safe['rows'] and len(safe['rows']) == 10


def test_seeded_missing_command_returns_named_configuration_failure(tmp_path):
    assert (ROOT / 'launch_ready_check.py').exists(), 'AUG-1269 checker dependency not integrated'
    p = subprocess.run([sys.executable, str(ROOT / 'run_launch_gate.py'), '--rc-sha', SHA,
                        '--out-dir', str(tmp_path), '--seed-missing-command'], capture_output=True, text=True)
    assert p.returncode == 1, p.stderr
    value = json.loads((tmp_path / 'result.json').read_text())
    assert value['configuration_errors'] and not value['ready']
    assert (tmp_path / 'report.md').is_file()


def test_linear_snapshot_rejects_partial_or_wrong_parent():
    c = module('collect_launch_evidence')
    def query(text):
        assert text.lstrip().startswith('query') and 'mutation' not in text
        return {'data': {'issue': {'identifier': 'AUG-496', 'children': {
            'nodes': [], 'pageInfo': {'hasNextPage': True}}}}}
    assert c.collect(SHA, {}, linear=query)['providers']['linear']['status'] == 'UNKNOWN'


def test_clean_current_readbacks_preserve_receipts_but_new_failure_invalidates_them():
    sys.path.insert(0, str(ROOT))
    runner = module('run_launch_gate')
    bundle = {'rows': {rid: {'path': rid + '.json'} for rid in [f'LR-{i}' for i in range(1, 13)]}}
    runs = [{'id': i, 'name': name, 'head_branch': 'main', 'status': 'completed', 'conclusion': 'success'}
            for i, name in enumerate(['Schema drift', 'Pro shipping config guard', 'iOS boot smoke', 'Tournament E2E', 'Web smoke'], 1)]
    providers = {name: {'status': 'OBSERVED', 'data': data} for name, data in {
        'github': {'runs': runs}, 'linear': {'children': []},
        'eas': {'status': 'FINISHED', 'appVersion': '1.0.1', 'appBuildVersion': '32'},
        'asc': {'processingState': 'VALID', 'version': '32'}}.items()}
    safe, missing = runner.apply_availability(bundle, {'providers': providers})
    assert safe == bundle and missing == {}
    providers['github']['data']['runs'].append(dict(runs[-1], id=9, conclusion='failure'))
    providers['asc']['data']['version'] = '31'
    safe, missing = runner.apply_availability(bundle, {'providers': providers})
    assert set(missing) == {'LR-4', 'LR-12'}
    assert 'LR-4' not in safe['rows'] and 'LR-12' not in safe['rows']


def test_collector_rejects_eas_other_sha_and_handles_helper_missing_credentials():
    c = module('collect_launch_evidence')
    env = {'EXPO_TOKEN': 'x', 'AOS_EAS_BUILD_ID': '12345678-1234-1234-1234-123456789abc'}
    def no_token(query):
        raise SystemExit('missing credential (not printed)')
    data = c.collect(SHA, env, linear=no_token, run=lambda args: {
        'id': env['AOS_EAS_BUILD_ID'], 'status': 'FINISHED', 'gitCommitHash': 'b' * 40})
    assert data['providers']['eas']['status'] == data['providers']['linear']['status'] == 'UNKNOWN'
