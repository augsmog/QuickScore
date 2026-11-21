#!/usr/bin/env python3
import pathlib,subprocess,json,hashlib
root=pathlib.Path(__file__).resolve().parents[2]
base='580b437574997ca25c7e389f416547cb4c2e00be'
def git(*a):return subprocess.check_output(['git','-C',str(root),*a]).decode().strip()
# Verify every inherited tracked path, not just app/src. Tests live outside all app build inputs.
paths=git('ls-tree','-r','--name-only',base).splitlines()
changed=git('diff',base,'--name-only','--',*[p for p in ['.'] if p]).splitlines()
allowed=['scoresnap/e2e/device-layout/scripts/run-android-compact.sh','scoresnap/e2e/device-layout/scripts/run-ios-sim.sh']
assert all(p.startswith('qa/native-580b437/') or p in allowed for p in changed),changed
# Test entrypoints may differ; every other inherited file remains exact.
assert git('rev-parse',base+':.github')==git('rev-parse','HEAD:.github')
assert not git('diff',base,'--',':(exclude)qa/native-580b437/**',*[':(exclude)'+p for p in allowed])
print(json.dumps({'appSourceSha':base,'integrationHead':git('rev-parse','HEAD'),'scoresnapTree':git('rev-parse',base+':scoresnap'),'inheritedPathsUnchanged':len(paths),'workflowAndBuildInputsUnchanged':True}))
