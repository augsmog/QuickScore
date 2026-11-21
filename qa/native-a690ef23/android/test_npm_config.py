import unittest,tempfile,pathlib,subprocess,os,json
from hosted import clean_npm_configs
class NpmConfig(unittest.TestCase):
 def test_network_free_real_config_load(self):
  with tempfile.TemporaryDirectory() as d:
   home=pathlib.Path(d)/'home';home.mkdir()
   # Synthetic hostile HOME config must not be inherited. No real secrets read.
   (home/'.npmrc').write_text('registry=https://invalid.example.test/\n')
   env={'PATH':os.environ['PATH'],'HOME':str(home),'NPM_CONFIG_OFFLINE':'true',**clean_npm_configs(home)}
   self.assertNotEqual(env['NPM_CONFIG_USERCONFIG'],env['NPM_CONFIG_GLOBALCONFIG'])
   for key in ['NPM_CONFIG_USERCONFIG','NPM_CONFIG_GLOBALCONFIG']:
    p=pathlib.Path(env[key]);self.assertEqual(p.read_bytes(),b'');self.assertEqual(p.stat().st_mode & 0o777,0o600)
   r=subprocess.run(['npm','config','get','registry'],env=env,cwd=d,capture_output=True,text=True,timeout=20)
   self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip(),'https://registry.npmjs.org/');self.assertNotIn('double-loading',r.stderr)
 def test_existing_files_not_overwritten(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'npm-user.rc';p.write_text('synthetic sentinel')
   with self.assertRaises(FileExistsError):clean_npm_configs(d)
   self.assertEqual(p.read_text(),'synthetic sentinel')
