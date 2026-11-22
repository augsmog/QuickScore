"""Single supplemental Android checkpoint. No gate/scale acceptance or fallback capture."""
import time, os, hashlib, json, pathlib, re, struct, subprocess, xml.etree.ElementTree as ET, zlib

PACKAGE = 'com.scoresnap.app'
class Failure(Exception):
    def __init__(self, phase): self.phase = phase

def digest(data): return hashlib.sha256(data).hexdigest()

def scene(xml, expected):
    if len(xml) > 2_000_000 or b'<!' in xml: raise Failure('scene-xml')
    try: root = ET.fromstring(xml)
    except ET.ParseError: raise Failure('scene-xml') from None
    targets = {'home': ('home-new-contest',), 'setup': ('contest-step-setup', 'contest-continue')}
    if expected not in targets: raise Failure('scene-name')
    nodes = list(root.iter('node'))
    if any(n.get('package') not in ('', None, PACKAGE) for n in nodes): raise Failure('scene-foreign')
    found = []
    for selector in targets[expected]:
        matches = [n for n in nodes if n.get('resource-id') in (selector, PACKAGE+':id/'+selector)]
        if len(matches) != 1: raise Failure('scene-target')
        n = matches[0]
        m = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', n.get('bounds',''))
        if not m or n.get('enabled') != 'true': raise Failure('scene-target')
        l,t,r,b = map(int,m.groups())
        if r <= l or b <= t: raise Failure('scene-target')
        found.append((l,t,r,b))
    # Positive markers alone must not accept an exposed background scene.
    foreign = 'contest-step-setup' if expected == 'home' else 'home-new-contest'
    if any(n.get('resource-id','').split('/')[-1] == foreign for n in nodes): raise Failure('scene-mixed')
    return found

def png_dimensions(data, raw=False):
    if len(data)>20_000_000 or not data.startswith(b'\x89PNG\r\n\x1a\n'): raise Failure('screenshot-png')
    pos=8; kinds=[]; dimensions=None; compressed=[]; channels=None
    while pos<len(data):
        if pos+12>len(data): raise Failure('screenshot-png')
        size=struct.unpack('>I',data[pos:pos+4])[0]; kind=data[pos+4:pos+8]; end=pos+12+size
        if end>len(data): raise Failure('screenshot-png')
        payload=data[pos+8:pos+8+size]
        if zlib.crc32(kind+payload)&0xffffffff != struct.unpack('>I',data[end-4:end])[0]: raise Failure('screenshot-png')
        kinds.append(kind)
        if kind==b'IHDR':
            if len(kinds)!=1 or size!=13: raise Failure('screenshot-png')
            dimensions=struct.unpack('>II',payload[:8])
            depth,color,compression,filtering,interlace=payload[8:]
            if depth!=8 or color not in (2,6) or (compression,filtering,interlace)!=(0,0,0) or any(not 1<=v<=10000 for v in dimensions): raise Failure('screenshot-png')
            channels=3 if color==2 else 4
        if kind==b'IDAT': compressed.append(payload)
        pos=end
        if kind==b'IEND': break
    if pos!=len(data) or kinds.count(b'IHDR')!=1 or b'IDAT' not in kinds or not kinds or kinds[-1]!=b'IEND': raise Failure('screenshot-png')
    expected=dimensions[1]*(1+dimensions[0]*channels)
    if expected>64_000_000: raise Failure('screenshot-png')
    try:
        decoder=zlib.decompressobj(); decoded=decoder.decompress(b''.join(compressed),expected+1)
        if len(decoded)!=expected or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail: raise Failure('screenshot-png')
    except zlib.error: raise Failure('screenshot-png') from None
    return (dimensions,channels,decoded) if raw else dimensions

class Android:
    def __init__(self, serial, component):
        if not re.fullmatch(r'emulator-\d+',serial): raise Failure('device-input')
        if component != PACKAGE+'/.MainActivity': raise Failure('component-input')
        self.serial,self.component=serial,component
    def run(self, *args):
        # Never include raw stderr/stdout in failure receipts. No shell, retries,
        # global adb restart, permission grants, clearing data or arbitrary flow.
        try:
            p=subprocess.run(['adb','-s',self.serial,*args],capture_output=True,timeout=25)
        except (OSError,subprocess.TimeoutExpired): raise Failure('command') from None
        if p.returncode or len(p.stdout)>20_000_000: raise Failure('command')
        return p.stdout
    def installed(self):
        paths=self.run('shell','pm','path',PACKAGE).decode('ascii','strict').strip().splitlines()
        if len(paths)!=1 or not re.fullmatch(r'package:/data/app/[A-Za-z0-9_+=/.-]+/base.apk',paths[0]): raise Failure('installed-apk')
        # Device sha256 readback does not pull or persist app binaries.
        value=self.run('shell','sha256sum',paths[0][8:]).decode('ascii','strict').split()
        if len(value)!=2 or not re.fullmatch('[0-9a-f]{64}',value[0]): raise Failure('installed-apk')
        return value[0]
    def identity(self):
        boot=self.run('shell','cat','/proc/sys/kernel/random/boot_id').strip()
        if not re.fullmatch(rb'[0-9a-f-]{36}',boot): raise Failure('device-identity')
        return digest(boot)
    def foreground(self):
        windows=self.run('shell','dumpsys','window','windows').decode('utf8','strict')
        displays=self.run('shell','dumpsys','window','displays').decode('utf8','strict')
        activity=self.run('shell','dumpsys','activity','activities').decode('utf8','strict')
        top=re.findall(r'mTopFocusedDisplayId=(\d+)',windows)
        if top!=['0']: raise Failure('foreground-display')
        blocks=re.split(r'Display: mDisplayId=(\d+)',displays)
        chosen=[blocks[i+1] for i in range(1,len(blocks),2) if blocks[i]=='0']
        if len(chosen)!=1: raise Failure('foreground-display')
        focus=re.findall(r'mCurrentFocus=Window\{[^\n}]*?\s(com\.[\w.]+/[\w.$]+)\}',chosen[0])
        resumed=re.findall(r'mResumedActivity: ActivityRecord\{[^\n}]*?\s(com\.[\w.]+/[\w.$]+)\s',activity)
        if focus!=[self.component] or resumed!=[self.component]: raise Failure('foreground-target')
    def hierarchy(self):
        # Task-specific hierarchy file only, no raw hierarchy persisted on host.
        self.run('shell','uiautomator','dump','/data/local/tmp/snapscore-checkpoint.xml')
        return self.run('exec-out','cat','/data/local/tmp/snapscore-checkpoint.xml')
    def screenshot(self): return self.run('exec-out','screencap','-p')

def geometry_projection(xml):
    """Preserve native frames/ancestry; never persist input text, package data or labels.
    Scene verification consumed the original bytes separately. Resource IDs are
    restricted to app test IDs; generated IDs disambiguate repeated native rows.
    """
    if len(xml)>2_000_000 or b'<!' in xml: raise Failure('geometry-xml')
    try: root=ET.fromstring(xml)
    except ET.ParseError: raise Failure('geometry-xml') from None
    count=0
    def walk(n):
        nonlocal count
        if n.tag!='node': return [x for c in n for x in walk(c)]
        count+=1
        if count>10000 or n.get('package') not in (None,'',PACKAGE): raise Failure('geometry-node')
        attrs={k:n.get(k) for k in ('bounds','clickable','scrollable','enabled','selected','checked','focused') if n.get(k) is not None}
        rid=n.get('resource-id','').removeprefix(PACKAGE+':id/')
        attrs['resource-id']='native-'+str(count)
        result={'attributes':attrs,'children':[x for c in n for x in walk(c)]}
        if re.fullmatch(r'(?:contest|home|paywall|rounds|tournament|team)-[A-Za-z0-9_-]{1,80}',rid): result['sourceResourceId']=rid
        # A text-presence bit retains text role without retaining any user value.
        result['hasText']=bool(n.get('text') or n.get('content-desc'))
        return [result]
    return walk(root)

def capture(device, binding, expected, output, final_source_check=lambda: None, scene_check=scene, image_observer=None, evidence_observer=None):
    """Caller supplies independently verified builder binding; this is NOT build proof.
    Required scale and reviewer admission are deliberately left to separate gate work.
    """
    if set(binding)!={'source_sha','source_tree','apk_sha256','pixel_size'}: raise Failure('binding')
    for k,n in [('source_sha',40),('source_tree',40),('apk_sha256',64)]:
        if not re.fullmatch('[0-9a-f]{'+str(n)+'}',binding[k]): raise Failure('binding')
    size=binding['pixel_size']
    if not isinstance(size,list) or len(size)!=2 or any(type(n)!=int or not 1<=n<=10000 for n in size): raise Failure('binding')
    out=pathlib.Path(output)
    if out.exists(): raise Failure('output-exists')
    initial=device.identity()
    if device.installed()!=binding['apk_sha256']: raise Failure('installed-apk')
    device.foreground(); os_before=getattr(device,'observation',None); before=device.hierarchy(); bounds=scene_check(before,expected)
    before_ns=time.monotonic_ns();screenshot_start=time.monotonic_ns()
    image=device.screenshot();screenshot_end=time.monotonic_ns()
    if png_dimensions(image)!=tuple(size): raise Failure('screenshot-viewport')
    if any(l<0 or t<0 or r>size[0] or b>size[1] for l,t,r,b in bounds): raise Failure('scene-viewport')
    device.foreground(); os_after=getattr(device,'observation',None); after=device.hierarchy(); scene_check(after,expected)
    after_ns=time.monotonic_ns()
    if before!=after: raise Failure('scene-changed')
    if os_before!=os_after: raise Failure('os-activity-changed')
    if device.identity()!=initial or device.installed()!=binding['apk_sha256']: raise Failure('identity-changed')
    receipt={**binding,'captureTimes':{'beforeNs':before_ns,'screenshotStartNs':screenshot_start,'screenshotEndNs':screenshot_end,'afterNs':after_ns},'captureMonotonicNs':time.monotonic_ns(),'bootIdentitySha256':initial,'job':{k:os.environ.get(k) for k in ('GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB')},'scene':expected,'screenshot_sha256':digest(image),'hierarchy_sha256':digest(before),
             'osBefore':os_before,'osAfter':os_after,'status':'SUPPLEMENTAL_ONLY','scale_admission':'UNRUN','native_gate':'INCOMPLETE'}
    if evidence_observer is not None: receipt['checkpointEvidence']=evidence_observer(before,os_before)
    if image_observer is not None: receipt['rounds_observation']=image_observer(before,image,binding)
    projection={'rawHierarchySha256':digest(before),'roots':geometry_projection(before)}
    geometry=json.dumps(projection,sort_keys=True).encode()
    receipt['geometry_sha256']=digest(geometry)
    final_source_check()
    out.mkdir(mode=0o700)
    (out/'capture.png').write_bytes(image)
    (out/'geometry.json').write_bytes(geometry)
    (out/'receipt.json').write_text(json.dumps(receipt,sort_keys=True)+'\n')
    return receipt

def verify_inputs(repo, apk, binding):
    def git(*args):
        try:
            p=subprocess.run(['git','-C',str(repo),*args],capture_output=True,timeout=10,check=True)
            return p.stdout.decode('ascii').strip()
        except (OSError,ValueError,subprocess.SubprocessError): raise Failure('source') from None
    if git('rev-parse','HEAD')!=binding.get('source_sha') or git('rev-parse','HEAD^{tree}')!=binding.get('source_tree') or git('status','--porcelain'):
        raise Failure('source')
    h=hashlib.sha256(); total=0
    with open(apk,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):
            total+=len(block)
            if total>512*1024*1024: raise Failure('apk-size')
            h.update(block)
    if not total or h.hexdigest()!=binding.get('apk_sha256'): raise Failure('apk-digest')

def main():
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    for key in ('repo','apk','binding','serial','output'): p.add_argument('--'+key,required=True)
    p.add_argument('--scene',choices=['home','setup'],required=True)
    args=p.parse_args()
    try:
        b=json.loads(pathlib.Path(args.binding).read_text())
        verify_inputs(args.repo,args.apk,b)
        r=capture(Android(args.serial,PACKAGE+'/.MainActivity'),b,args.scene,args.output,
                  final_source_check=lambda: verify_inputs(args.repo,args.apk,b))
        print(json.dumps({'status':r['status'],'scene':r['scene'],'native_gate':'INCOMPLETE'}))
        return 0
    except Failure as e:
        print(json.dumps({'status':'FAILED','phase':e.phase,'native_gate':'INCOMPLETE'}));return 1
    except (OSError,ValueError,KeyError,TypeError):
        print(json.dumps({'status':'FAILED','phase':'input-or-readback','native_gate':'INCOMPLETE'}));return 1

if __name__=='__main__': raise SystemExit(main())
