import unittest,subprocess,signal,io
from unittest.mock import patch,Mock
from hosted import memory_budget,gradle_args,run_process
class Resources(unittest.TestCase):
 def test_budget_and_release_lint_preserved(self):
  self.assertEqual(memory_budget('MemAvailable: 8388608 kB')['metaspaceMiB'],1024)
  for raw in ['', 'MemAvailable: 8388607 kB']:
   with self.assertRaises(ValueError):memory_budget(raw)
  args=gradle_args();self.assertIn(':app:assembleRelease',args);self.assertIn('--max-workers=2',args);self.assertIn('--no-parallel',args)
  self.assertIn('-Dorg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8',args)
  self.assertFalse(any('exclude' in a or a=='-x' or 'lint' in a for a in args))
 def test_owned_process_timeout_bounded(self):
  p=Mock(pid=123456);p.wait.side_effect=[subprocess.TimeoutExpired('synthetic',1),0]
  with patch('hosted.subprocess.Popen',return_value=p) as launch,patch('hosted.os.killpg') as kill:
   with self.assertRaises(subprocess.TimeoutExpired):run_process(['synthetic'],{},'.',io.BytesIO(),1)
   kill.assert_called_once_with(123456,signal.SIGKILL);self.assertEqual(p.wait.call_args.kwargs,{'timeout':10});self.assertTrue(launch.call_args.kwargs['start_new_session'])
 def test_success_does_not_kill(self):
  with patch('hosted.subprocess.Popen',return_value=Mock(wait=Mock(return_value=0))),patch('hosted.os.killpg') as kill:
   self.assertEqual(run_process(['synthetic'],{},'.',io.BytesIO(),1),0);kill.assert_not_called()
 def test_gradle_stop_failure_preserves_build_failure(self):
  import tempfile,pathlib,json
  from hosted import build_release
  for build_fails in (True,False):
   with tempfile.TemporaryDirectory() as d,patch('hosted.memory_budget',return_value={'metaspaceMiB':1024}),patch('hosted.run_process',side_effect=subprocess.TimeoutExpired('stop',30)) as stop:
    app=pathlib.Path(d);env={'GRADLE_USER_HOME':str(app/'private-gradle')}
    def cmd(*args):
     if build_fails:raise RuntimeError('BUILD_FIRST')
    with self.assertRaisesRegex(RuntimeError,'BUILD_FIRST' if build_fails else 'GRADLE_CLEANUP_INCOMPLETE'):build_release(app,app,env,cmd)
    self.assertEqual(stop.call_args.args[0],['bash','./gradlew','--stop']);self.assertEqual(stop.call_args.args[1],env);self.assertEqual(stop.call_args.args[-1],30)
    self.assertFalse(json.loads((app/'gradle-cleanup.json').read_text())['stopSucceeded'])
