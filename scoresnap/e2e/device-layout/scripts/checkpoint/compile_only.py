"""Hosted-only compile diagnostic: no emulator, install, launch or artifact export."""
import json,os,pathlib,re,tempfile
import gate_android as gate
PARENT='547e167bea6fd3ed54cae3b9e90e98efc5c1e8de'
TREE='9edfcd75c457322d2af5fb8be950570fe23f4df2'
REF='refs/heads/qa/snapscore-main-android-compile'
PREFIX='scoresnap/e2e/device-layout/scripts/checkpoint/'
PATHS=sorted(['.github/workflows/device-layout-gate.yml',PREFIX+'compile_only.py',PREFIX+'test_compile_only.py'])
def preflight(repo,env):
 if env.get('GITHUB_EVENT_NAME')!='workflow_dispatch' or env.get('GITHUB_REF')!=REF:raise gate.b.Failure('compile-route')
 identity=gate.ingress(repo,env,{})
 if gate.read(['git','show','-s','--format=%P','HEAD'],repo)!=PARENT or gate.read(['git','rev-parse',PARENT+'^{tree}'],repo)!=TREE:raise gate.b.Failure('compile-parent')
 if sorted(gate.read(['git','diff','--name-only',PARENT,'HEAD'],repo).splitlines())!=PATHS:raise gate.b.Failure('compile-scope')
 return identity

def run(repo,env):
 harness=preflight(repo,env)
 # Compile the immutable fixture, not a synthetic claim about equal commit IDs.
 source={'checkoutSha':PARENT,'checkoutTree':TREE}
 with tempfile.TemporaryDirectory(prefix='snapscore-compile-',dir=env['RUNNER_TEMP']) as tmp:
  private=pathlib.Path(tmp)
  apk,binding,recipe=gate.build(repo,private/'source',private,source)
  if binding['source_sha']!=PARENT or binding['source_tree']!=TREE or not re.fullmatch('[0-9a-f]{64}',binding['apk_sha256']) or gate.b.digest(apk.read_bytes())!=binding['apk_sha256']:raise gate.b.Failure('compile-binding')
  proof=recipe.get('offlineNetwork',{})
  if proof.get('internetPermissionPresent') is not False or proof.get('scope')!='offline-supplemental-only' or proof.get('releaseParity') is not False:raise gate.b.Failure('compile-network-proof')
  if preflight(repo,env)!=harness:raise gate.b.Failure('compile-source-drift')
  # Explicit allowlist; no SDK logs, environment, paths or APK bytes emitted.
  receipt={'status':'COMPILED_OFFLINE_FIXTURE','harnessSha':harness['checkoutSha'],'harnessTree':harness['checkoutTree'],'sourceSha':PARENT,'sourceTree':TREE,'apkSha256':binding['apk_sha256'],'apkBytes':apk.stat().st_size,'internetPermissionPresent':False,'generatedOverlaySha256':proof['generatedOverlaySha256'],'recipeSha256':recipe['recipeSha256'],'lockSha256':recipe['lockSha256'],'nativeExecuted':False,'installed':False,'deviceGate':'UNRUN','joinGate':'UNRUN','releaseAcceptance':False}
 return receipt

def main():
 repo=pathlib.Path(__file__).resolve().parents[5]
 try:receipt=run(repo,os.environ);status=0
 except Exception as e:
  receipt={'status':'BLOCKED','reason':e.phase if isinstance(e,gate.b.Failure) else 'compile-input-or-tool-failure','nativeExecuted':False,'releaseAcceptance':False};status=1
 print(json.dumps(receipt,sort_keys=True));return status
if __name__=='__main__':raise SystemExit(main())
