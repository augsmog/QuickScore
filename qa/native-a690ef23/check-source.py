#!/usr/bin/env python3
import pathlib,subprocess,json
root=pathlib.Path(__file__).resolve().parents[2]
base='a690ef23e67a255408028d81e57d40e09778c3eb'
tree='ba833845c2f2cfbacdecc3ee847e74c4fcfd90b7'
allowed=['scoresnap/e2e/device-layout/lib/native-scripts.test.mjs','scoresnap/e2e/device-layout/scripts/run-android-compact.sh','scoresnap/e2e/device-layout/scripts/run-ios-sim.sh']
def validate(app_sha,app_tree,changed,dirty,origin,checkout_root):
 if app_sha!=base or app_tree!=tree:raise ValueError('APP_SOURCE_OR_TREE_MISMATCH')
 if dirty:raise ValueError('DIRTY_HARNESS_CHECKOUT')
 if origin not in ['https://github.com/augsmog/QuickScore.git','https://github.com/augsmog/QuickScore']:raise ValueError('CHECKOUT_ORIGIN_MISMATCH')
 if pathlib.Path(checkout_root).resolve()!=root:raise ValueError('CHECKOUT_ROOT_MISMATCH')
 if any(not(p.startswith('qa/native-a690ef23/') or p in allowed) for p in changed):raise ValueError('UNEXPECTED_APP_OR_WORKFLOW_CHANGE')
def main():
 def git(*a):return subprocess.check_output(['git','-C',str(root),*a]).decode().strip()
 paths=git('ls-tree','-r','--name-only',base).splitlines()
 changed=git('diff',base,'--name-only').splitlines()
 validate(git('rev-parse',base),git('rev-parse',base+'^{tree}'),changed,git('status','--porcelain'),git('remote','get-url','origin'),git('rev-parse','--show-toplevel'))
 assert git('rev-parse',base+':.github')==git('rev-parse','HEAD:.github')
 assert not git('diff',base,'--',':(exclude)qa/native-a690ef23/**',*[':(exclude)'+p for p in allowed])
 print(json.dumps({'appSourceSha':base,'appSourceTree':tree,'integrationHead':git('rev-parse','HEAD'),'checkoutRoot':str(root),'origin':git('remote','get-url','origin'),'inheritedPathsChecked':len(paths),'workflowAndBuildInputsUnchanged':True}))
if __name__=='__main__':main()
