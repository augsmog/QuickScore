import contextlib,io,json,signal,subprocess,unittest,tempfile,pathlib
from unittest.mock import Mock,patch
from hosted import preflight,REQ,GRADLE_RELEASE_TIMEOUT_S,release_progress,run_process
class Preflight(unittest.TestCase):
 def test_one_failure_lists_exact_requirements(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaisesRegex(ValueError,'ANDROID_PREFLIGHT_MISSING:.*adb.*android-36.*exactly one'):preflight(d,{},'')
 def test_existing_sdk_one_emulator(self):
  with tempfile.TemporaryDirectory() as d:
   for f in REQ:p=pathlib.Path(d)/f;p.parent.mkdir(parents=True,exist_ok=True);p.touch()
   tools={t:'/synthetic/'+t for t in ['node','npm','java','adb']}
   self.assertEqual(preflight(d,tools,'emulator-5554\tdevice\n'),'emulator-5554')
   with self.assertRaises(ValueError):preflight(d,tools,'emulator-5554\tdevice\nemulator-5556\tdevice')

class ReleaseTimeout(unittest.TestCase):
 def test_timeout_does_not_turn_progress_into_success(self):
  with tempfile.TemporaryDirectory() as d:
   d=pathlib.Path(d);log=d/'gradle-release.log';receipt=d/'gradle-progress.json'
   log.write_text('untrusted log not for receipt: /private/synthetic/input\n'
                  '> Task :expo:lintVitalAnalyzeRelease\n'
                  '> Task :app:buildCMakeRelWithDebInfo[x86_64]\n'
                  '> Task :bad /private/synthetic/skip\n')
   wait=Mock(side_effect=[subprocess.TimeoutExpired(['gradle'],30),
                          subprocess.TimeoutExpired(['gradle'],30),-9])
   proc=Mock(pid=42,wait=wait)
   with log.open('ab') as stream, contextlib.redirect_stdout(io.StringIO()) as output, \
        patch('hosted.subprocess.Popen',return_value=proc), patch('hosted.os.killpg') as killpg, \
        patch('hosted.time.monotonic',side_effect=[0,0,30,30,GRADLE_RELEASE_TIMEOUT_S]):
    with self.assertRaises(subprocess.TimeoutExpired) as fail:
     run_process(['gradle'],{},d,stream,GRADLE_RELEASE_TIMEOUT_S,release_progress(log,receipt))
   self.assertEqual(fail.exception.timeout,1200)
   killpg.assert_called_once_with(42,signal.SIGKILL)
   self.assertIn('"status": "running"',output.getvalue())
   self.assertNotIn('/private/',output.getvalue())
   self.assertEqual(json.loads(receipt.read_text()),
      {'phase':'gradle-release','status':'timeout','elapsedSeconds':1200,
       'timeoutSeconds':1200,'recentTasks':[':expo:lintVitalAnalyzeRelease',':app:buildCMakeRelWithDebInfo[x86_64]']})

 def test_nonzero_keeps_failure_and_never_terminates_other_processes(self):
  events=[]
  with patch('hosted.subprocess.Popen',return_value=Mock(wait=Mock(return_value=1))), \
       patch('hosted.time.monotonic',side_effect=[0,0,7]), patch('hosted.os.killpg') as killpg:
   code=run_process(['gradle'],{},None,None,GRADLE_RELEASE_TIMEOUT_S,lambda *item:events.append(item))
  self.assertEqual(code,1)
  self.assertEqual(events,[('failed',7,1200)])
  killpg.assert_not_called()

class UnmonitoredWait(unittest.TestCase):
 def test_single_wait_never_reads_progress_clock(self):
  proc=Mock(wait=Mock(return_value=0))
  with patch('hosted.subprocess.Popen',return_value=proc), patch('hosted.time.monotonic',side_effect=AssertionError('unmonitored clock')), patch('hosted.os.killpg') as kill:
   self.assertEqual(run_process(['synthetic'],{},None,None,17),0)
  proc.wait.assert_called_once_with(17)
  kill.assert_not_called()

 def test_timeout_preserves_original_exception_and_owned_cleanup(self):
  error=subprocess.TimeoutExpired(['synthetic'],17)
  proc=Mock(pid=42,wait=Mock(side_effect=[error,-9]))
  with patch('hosted.subprocess.Popen',return_value=proc), patch('hosted.time.monotonic',side_effect=AssertionError('unmonitored clock')), patch('hosted.os.killpg') as kill:
   with self.assertRaises(subprocess.TimeoutExpired) as caught:run_process(['synthetic'],{},None,None,17)
  self.assertIs(caught.exception,error)
  kill.assert_called_once_with(42,signal.SIGKILL)
  self.assertEqual(proc.wait.call_args_list,[unittest.mock.call(17),unittest.mock.call(timeout=10)])
