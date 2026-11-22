import contextlib,io,json,os,pathlib,types,unittest
from unittest.mock import patch
import run as r

PRIVATE='raw-secret-device-name-at-private-path'
UID='AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'
FOREIGN='com.example.'+PRIVATE
SELECT=('simctl','list','-j','devices',r.probe.RUNTIME)
HELP=('simctl','help','list')
HELP_SAMPLE='Usage: simctl list [-j | --json] [devices|devicetypes|runtimes|pairs] [<search term>|available]'
PINNED={'runtimes':[{'identifier':r.probe.RUNTIME,'isAvailable':True,
          'version':r.probe.RUNTIME_VERSION,'buildversion':r.probe.RUNTIME_BUILD,
          'supportedDeviceTypes':[{'identifier':r.probe.DEVICE}]}],
        'devicetypes':[{'identifier':r.probe.DEVICE}]}

def doc(groups):return json.dumps({'devices':groups})
def row(**kw):return {'udid':UID,'name':PRIVATE,'state':'Shutdown',**kw}

class Tests(unittest.TestCase):
 def env(self):
  return {'GITHUB_SHA':'a'*40,'GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_EVENT_NAME':'workflow_dispatch',
          'GITHUB_REF':r.REF,'GITHUB_JOB':'dual_boot','DEVELOPER_DIR':r.probe.XCODE,
          'SNAPSCORE_DUAL_BOOT_STARTED_NS':str(r.time.monotonic_ns())}
 def execute(self,selected,help=HELP_SAMPLE,*,env=None,profile=b'15032385536\n4\n',sdkbuild='23E252',pins=PINNED):
  calls=[]
  def command(*args, **kw):
   calls.append((args,kw))
   if args==('--sdk','iphonesimulator','--show-sdk-version'):return '26.4'
   if args==('--sdk','iphonesimulator','--show-sdk-build-version'):return sdkbuild
   if args==('xcodebuild','-version'):return '\n'.join(r.probe.XCODE_ID)
   if args[:3]==('simctl','list','-j') and len(args)==4:return json.dumps({args[3]:pins[args[3]]})
   value=selected if args==SELECT else help if args==HELP else None
   if isinstance(value,BaseException):raise value
   if value is None:raise AssertionError(args)
   return value
  with patch.dict(os.environ,self.env() if env is None else env,clear=True), \
       patch.object(r.probe,'job_context',return_value=(pathlib.Path('/synthetic'),'marker')), \
       patch.object(r.probe,'command',side_effect=command), \
       patch.object(r.probe,'free_space',return_value={'runner_temp_free_bytes':150000000000}), \
       patch.object(r.subprocess,'run',return_value=types.SimpleNamespace(stdout=profile)), \
       patch.object(r.probe,'preflight') as preflight,patch.object(r.probe,'cleanup') as cleanup, \
       patch.object(r.probe,'device_set_baseline') as fs:
   result=r.run()
   for mock in (preflight,cleanup,fs):mock.assert_not_called()
  return result,calls

 def test_read_order_and_no_mutating_or_broad_commands(self):
  out,trace=self.execute(doc({r.probe.RUNTIME:[row()]}),HELP_SAMPLE+'\n'+PRIVATE)
  self.assertEqual([x[0] for x in trace],[('--sdk','iphonesimulator','--show-sdk-version'),
     ('--sdk','iphonesimulator','--show-sdk-build-version'),('xcodebuild','-version'),
     ('simctl','list','-j','runtimes'),('simctl','list','-j','devicetypes'),SELECT,HELP])
  self.assertLessEqual(trace[-2][1]['timeout'],15)
  self.assertLessEqual(trace[-1][1]['timeout'],5)
  self.assertEqual(trace[-1][1]['help_text'],True)
  self.assertTrue(out['catalogPinsVerified'])
  self.assertFalse(out['catalogVerified'] or out['deviceMutationsRequested'] or out['capacityQualified'])
  self.assertEqual(out['status'],'BLOCKED')
  self.assertEqual(out['selectedList']['classification'],'TARGET_GROUP_VALID_NONEMPTY')
  self.assertGreaterEqual(out['selectedList']['elapsedSeconds'],0)
  self.assertEqual(out['helpList']['genericSearchAdvertised'],True)
  self.assertEqual(out['helpList']['availableFilterAdvertised'],True)
  self.assertEqual(out['helpList']['explicitRuntimeIdentifierAdvertised'],False)
  self.assertNotIn(PRIVATE,json.dumps(out))
  self.assertNotIn(UID,json.dumps(out))

 def test_empty_target_vs_no_match_vs_broad_rows(self):
  for groups, expected, has_target, foreign_rows, count in (
    ({},'EMPTY_GROUP_MAP',False,False,'0'),
    ({r.probe.RUNTIME:[]},'TARGET_GROUP_EMPTY',True,False,'1'),
    ({FOREIGN:[]},'TARGET_GROUP_ABSENT',False,False,'1'),
    ({FOREIGN:[row()]},'TARGET_GROUP_ABSENT',False,True,'1'),
    ({r.probe.RUNTIME:[],FOREIGN:[]},'EXTRA_GROUPS_RETURNED',True,False,'2-4'),
    ({r.probe.RUNTIME:[row()],FOREIGN:[row()]},'EXTRA_GROUPS_RETURNED',True,True,'2-4'),
  ):
   with self.subTest(expected=expected):
    value=r.selected_shape(doc(groups))
    self.assertEqual((value['classification'],value['targetGroupPresent'],value['foreignGroupHasRows'],
      value['runtimeGroupCount']),(expected,has_target,foreign_rows,count))
    self.assertNotIn(PRIVATE,json.dumps(value))
    self.assertNotIn(r.probe.RUNTIME,json.dumps(value))
    self.assertNotIn(UID,json.dumps(value))

 def test_json_shape_and_bad_rows_are_distinct_redacted_enums(self):
  wrap=lambda rows:doc({r.probe.RUNTIME:rows})
  for raw,expected in (
    (PRIVATE,'JSON_INVALID'), ('{"devices":NaN}','JSON_INVALID'),
    ('x'*(r.JSON_CAP+1),'JSON_OVERSIZE'),
    ('{"devices":{},"devices":{}}','JSON_DUPLICATE_KEY'),
    ('{"devices":{},"'+PRIVATE+'":[]}', 'TOP_LEVEL_UNEXPECTED'),
    ('{"devices":[]}','DEVICES_NOT_GROUPED'),
    (wrap({}),'TARGET_ROWS_NOT_ARRAY'), (wrap([row()]*257),'TARGET_ROW_LIMIT_EXCEEDED'),
    (wrap([PRIVATE]),'TARGET_ROW_NOT_OBJECT'), (wrap([row(udid=UID.lower())]),'TARGET_UUID_CASE_DRIFT'),
    (wrap([row(udid=PRIVATE)]),'TARGET_UUID_INVALID'), (wrap([row(),row()]),'TARGET_UUID_DUPLICATE'),
    (wrap([row(state=None)]),'TARGET_NAME_OR_STATE_INVALID'),
  ):
   self.assertEqual(r.selected_shape(raw)['classification'],expected)
   self.assertNotIn(PRIVATE,json.dumps(r.selected_shape(raw)))
  extra=r.selected_shape(json.dumps({'devices':{},PRIVATE:'opaque private value'}))
  self.assertFalse(extra['topLevelDevicesOnly'])
  self.assertIsNone(extra['targetGroupPresent'])
  self.assertIsNone(extra['runtimeGroupCount'])
  self.assertNotIn('opaque private value',json.dumps(extra))

 def test_help_only_emits_literal_bools_and_never_raw_words(self):
  for sample,cls,generic,available,exact in (
   (HELP_SAMPLE,'HELP_USAGE_OBSERVED',True,True,False),
   ('Usage: simctl list [devices|devicetypes|runtimes] [<runtime identifier>]\n'+PRIVATE,
     'HELP_USAGE_OBSERVED',False,False,True),
   ('Usage: simctl list [devices|devicetypes|runtimes] [available]\nExample: runtime identifier '+PRIVATE,
     'HELP_USAGE_OBSERVED',False,True,False),
   (PRIVATE,'HELP_USAGE_UNRECOGNIZED',None,None,None),
   (HELP_SAMPLE+'\n'+HELP_SAMPLE,'HELP_USAGE_UNRECOGNIZED',None,None,None),
   ('z'*(r.HELP_CAP+1),'HELP_OVERSIZE',None,None,None),
  ):
   result=r.help_shape(sample)
   self.assertEqual(tuple(result.values()),(cls,generic,available,exact))
   self.assertNotIn(PRIVATE,json.dumps(result))

 def test_separate_timeout_nonzero_and_untrusted_errors(self):
  out,trace=self.execute(r.probe.GateError(PRIVATE,'COMMAND_TIMEOUT'),r.probe.GateError(PRIVATE,'COMMAND_NONZERO'))
  self.assertEqual(out['selectedList']['classification'],'COMMAND_TIMEOUT')
  self.assertEqual(out['helpList']['classification'],'COMMAND_NONZERO')
  self.assertEqual([x[0] for x in trace][-2:],[SELECT,HELP])
  self.assertNotIn(PRIVATE,json.dumps(out))
  out,trace=self.execute(r.probe.GateError(PRIVATE,'INTERRUPTED'))
  self.assertEqual(out['primaryFailure'],{'stage':'catalog-runtime-devices','code':'INTERRUPTED'})
  self.assertEqual(trace[-1][0],SELECT)
  self.assertEqual(r.probe.reason(r.probe.GateError(PRIVATE,'PRIVATE_STRING'),'secret','secret'),
                   {'stage':'completion','code':'UNKNOWN'})

 def test_pins_capacity_and_transport_fail_without_shape_calls(self):
  bad_pins={'runtimes':PINNED['runtimes'],'devicetypes':[]}
  for opts,stage,code in (
   ({'profile':b'7516192768\n3\n'},'memory-readback','INTEL_CAPACITY_PROFILE_MISMATCH'),
   ({'sdkbuild':'23E999'},'sdk-readback','SDK_MISMATCH'),
   ({'pins':bad_pins},'catalog-device-type','DEVICE_TYPE_MISSING'),
   ({'env':self.env()|{'SNAPSCORE_DUAL_BOOT_STARTED_NS':'0'}},'transport-admission','TRANSPORT_BUDGET_EXHAUSTED'),
  ):
   result,trace=self.execute('never',**opts)
   self.assertEqual(result['primaryFailure'],{'stage':stage,'code':code})
   self.assertNotIn(SELECT,[x[0] for x in trace])
   self.assertNotIn(HELP,[x[0] for x in trace])

 def test_help_cannot_block_past_shared_catalog_budget(self):
  now=[0.]
  def clock():return now[0]
  calls=[]
  def command(*argv, **kw):
   calls.append(argv)
   now[0]=46.
   return doc({r.probe.RUNTIME:[],FOREIGN:[row()]})
  with patch.object(r.time,'monotonic',side_effect=clock), \
       patch.object(r.probe,'validate_catalog_pins'),patch.object(r.probe,'command',side_effect=command):
   out=r.assess(r.probe.Diagnostic())
  self.assertEqual(calls,[SELECT])
  self.assertEqual(out['helpList']['classification'],'CATALOG_DEADLINE')
  self.assertEqual(set(out['helpList']),{'classification','elapsedSeconds'})
  self.assertTrue(out['selectedList']['foreignGroupHasRows'])
  self.assertNotIn(PRIVATE,json.dumps(out))
  self.assertNotIn(UID,json.dumps(out))

 def test_wrong_ref_no_host(self):
  with patch.dict(os.environ,self.env()|{'GITHUB_REF':'refs/heads/main'},clear=True), \
       patch.object(r.probe,'job_context') as context:
   with self.assertRaises(r.probe.GateError):r.run()
   context.assert_not_called()

 def test_success_diagnostic_is_exit_78_even_if_result_fields_attempt_to_say_pass(self):
  with patch.object(r,'run',return_value={'status':'PASS'}),patch.object(r.signal,'signal'):
   buf=io.StringIO()
   with contextlib.redirect_stdout(buf):
    self.assertEqual(r.main(),78)

 def test_successful_help_can_be_on_stderr_but_normal_device_data_cannot(self):
  retval=types.SimpleNamespace(returncode=0,stdout='public shape',stderr='usage on stderr')
  with patch.object(r.probe,'device_home',return_value=pathlib.Path('/a/b/c/d/Home')), \
       patch.object(r.probe.subprocess,'run',return_value=retval):
   self.assertEqual(r.probe.command(*HELP,help_text=True),'public shape\nusage on stderr')
   self.assertEqual(r.probe.command(*SELECT),'public shape')

 def test_workflow_scope_and_ancestry(self):
  txt=(pathlib.Path(__file__).parents[2]/'.github/workflows/e2e-ios-sim.yml').read_text()
  for expected in (r.REF,r.probe.XCODE,'macos-26-intel','timeout-minutes: 8',
    "toJSON(github.event.repository.private) == 'false'",'RUNNER_ARCH:-','X64','RUNNER_ENVIRONMENT:-',
    '82eaa972593356fc79ceaf0d64217d62a4b6eb6b','SNAPSCORE_DUAL_BOOT_STARTED_NS="$started_ns"',
    'https://github.com/augsmog/QuickScore.git','--no-recurse-submodules'):
   self.assertIn(expected,txt)
  for forbidden in ('pull_request:','push:','upload-artifact','secrets.','npm ','brew ','sudo ','self-hosted'):
   self.assertNotIn(forbidden,txt)

if __name__=='__main__':unittest.main()
