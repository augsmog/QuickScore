"""Hosted Apple Silicon hardware/backend admission only. No app build or product SQL."""
from __future__ import annotations
import hashlib
import http.client
import json
import os
import pathlib
import platform
import pwd
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid

SOURCE = "c828ebf5ef7372c19db9c73f8cb1adb04d157406"
TREE = "8d2b59b9c2f814fbc54684973fa8e9ddfd2badc3"
REF = "refs/heads/qa/snapscore-c828-hosted-arm64-join-admission"
LOCK = "c5b3f1118136771158e579dbe1533fa2cc3ec1aea89966bfbd015464bb825a88"
MANIFEST = "0e679994e17b35654fc5cde7fda56a81bd06c683843f4a721fa141812fae53a1"
ARCHIVE = "fe87a5f9781d5423dbd5ebba2d5a6e1a541d01754d14941c574952e5695eaab0"
CLI_HASH = "89838b26049c0672f9609aaf46455c89a46d351f852e313c0c5ae6b3abcbdf9d"
CLI_URL = "https://github.com/supabase/cli/releases/download/v2.122.0/supabase_2.122.0_darwin_arm64.tar.gz"
DEV = "/Applications/Xcode_26.4.1.app/Contents/Developer"
RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-4"
DEVICE = "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro"
UDID = re.compile(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}")
SHA = re.compile(r"[a-f0-9]{40}")
FLOOR = 12 * 1024**3
BUILD_BUDGET = 24 * 1024**3   # admission cannot assert two builds fit below this
BASE_CONFIG = """project_id = "snapscore-join-admission"
[experimental]
stack = true
[local.services]
default = { version = "bundled" }
[api]
enabled = true
port = 54321
[db]
major_version = 17
port = 54322
[db.migrations]
enabled = false
[db.seed]
enabled = false
[realtime]
enabled = true
[auth]
enabled = true
site_url = "http://127.0.0.1:54321"
enable_signup = true
enable_anonymous_sign_ins = true
[auth.email]
enable_signup = true
enable_confirmations = false
"""

class Blocked(Exception): pass

def need(ok, code):
    if not ok: raise Blocked(code)

def digest(p):
    with p.open("rb") as f: return hashlib.file_digest(f, "sha256").hexdigest()

def reason(e):
    return str(e) if isinstance(e, Blocked) and re.fullmatch(r"[A-Z0-9_]+", str(e)) else "UNEXPECTED_FAILURE"

def cmd(args, env, seconds, code, *, accepted=(0,), discard=False):
    try:
        r = subprocess.run(args, env=env, timeout=seconds, stdin=subprocess.DEVNULL,
                           stdout=subprocess.DEVNULL if discard else subprocess.PIPE,
                           stderr=subprocess.DEVNULL, check=False)
    except subprocess.TimeoutExpired: raise Blocked(code + "_TIMEOUT") from None
    need(r.returncode in accepted and (discard or len(r.stdout) <= 1024**2), code)
    return "" if discard else r.stdout.decode().strip()

def git(repo, env, *args):
    return cmd(["/usr/bin/git","--no-optional-locks","-C",str(repo),*args],env,20,"SOURCE_BINDING")

def bind(harness, product, env, shell):
    h, t = (env.get(k,"") for k in ("EXPECTED_HARNESS_SHA","EXPECTED_HARNESS_TREE"))
    need(SHA.fullmatch(h) and SHA.fullmatch(t) and h == env.get("GITHUB_SHA") and
         git(harness,shell,"rev-parse","HEAD") == h and
         git(harness,shell,"rev-parse","HEAD^{tree}") == t and not git(harness,shell,"status","--porcelain"),
         "HARNESS_BINDING")
    need(git(product,shell,"rev-parse","HEAD") == SOURCE and
         git(product,shell,"rev-parse","HEAD^{tree}") == TREE and not git(product,shell,"status","--porcelain"),
         "SOURCE_BINDING")
    return h,t

def listener_rows(env):
    # Mac runner user only; native service processes must use the invoking non-root uid.
    raw = cmd(["/usr/sbin/lsof","-a","-u",str(os.getuid()),"-iTCP","-sTCP:LISTEN","-nP","-Fpn"],
              env,12,"SOCKET_INVENTORY",accepted=(0,1))
    result=set(); pid=None
    for line in raw.splitlines():
        if re.fullmatch(r"p[1-9][0-9]*",line): pid=int(line[1:]); continue
        if re.fullmatch(r"f[0-9]+[a-z]?",line): continue
        need(pid and re.fullmatch(r"n\S+:[0-9]+",line),"SOCKET_INVENTORY")
        result.add((pid,line[1:]))
    return result

def backend_sockets(rows, old):
    new=rows-old
    need(new and all(re.fullmatch(r"(?:127\.0\.0\.1|\[::1\]|::1):[0-9]+", address)
                     for _,address in new), "BACKEND_NON_LOOPBACK")
    need({"127.0.0.1:54321","127.0.0.1:54322"}.issubset({a for _,a in new}),"BACKEND_ENDPOINT_OWNERSHIP")
    return new

def endpoint_check(start):
    need(start.get("runtime") == "native" and start.get("env",{}).get("API_URL") == "http://127.0.0.1:54321",
         "BACKEND_ENDPOINT")
    ep=start.get("endpoints",{})
    need(type(ep) is dict and ep and all(type(v) is dict and v.get("address") in {"127.0.0.1","::1"}
                                        for v in ep.values()),"BACKEND_NON_LOOPBACK")
    # Credentials never leave the disposable runtime; no status or endpoint payload is printed.
    keyset=start["env"]
    need(all(isinstance(keyset.get(k),str) and keyset[k] for k in ("ANON_KEY","SERVICE_ROLE_KEY")) and
         keyset["ANON_KEY"] != keyset["SERVICE_ROLE_KEY"],"BACKEND_DISPOSABLE_KEYS")

def health():
    c=http.client.HTTPConnection("127.0.0.1",54321,timeout=8)
    try:
        c.request("GET","/auth/v1/health")
        r=c.getresponse()
        need(r.status == 200,"BACKEND_AUTH_HEALTH")
    finally: c.close()

def sim(env, *args, sec=25, code="SIMCTL"):
    return cmd(["/usr/bin/xcrun","simctl",*args],env,sec,code)

def inventory(env, seconds=25):
    devices=json.loads(sim(env,"list","-j","devices",sec=seconds,code="SIM_INVENTORY"))
    groups=devices.get("devices")
    need(type(groups) is dict and RUNTIME in groups,"SIM_INVENTORY")
    rows={}
    for rt, group in groups.items():
        need(type(group) is list and len(rows)+len(group)<=256,"SIM_INVENTORY")
        for row in group:
            u=row.get("udid")
            need(isinstance(u,str) and UDID.fullmatch(u) and u not in rows and
                 all(isinstance(row.get(k),str) and row[k] for k in ("name","state")),"SIM_INVENTORY")
            rows[u]=(rt,row)
    return rows

def owned(rows, uid, name, absent=False):
    names=[u for u,(_,r) in rows.items() if r["name"] == name]
    if absent and uid not in rows and not names: return None
    need(names == [uid] and uid in rows and rows[uid][0] == RUNTIME and
         rows[uid][1].get("deviceTypeIdentifier") == DEVICE,"SIM_OWNERSHIP")
    return rows[uid][1]

def verify_pair(rows, pair, want):
    need(len(pair) == 2 and len(set(pair.values())) == 2,"SIM_PAIR")
    for uid,name in pair.items(): need(owned(rows,uid,name)["state"] == want,"SIM_PAIR_STATE")
    need(all(u in pair or r["state"] == "Shutdown" for u,(_,r) in rows.items()),"UNOWNED_SIM_ACTIVE")

def clean_sim(env, home, uid, name):
    row=owned(inventory(env, seconds=5),uid,name)
    if row["state"] != "Shutdown":
        try: sim(env,"shutdown",uid,sec=15,code="SIM_SHUTDOWN")
        except Blocked as e:
            if reason(e) not in {"SIM_SHUTDOWN","SIM_SHUTDOWN_TIMEOUT"}: raise
        for _ in range(7):
            if owned(inventory(env, seconds=5),uid,name)["state"]=="Shutdown": break
            time.sleep(1)
        else: raise Blocked("SIM_SHUTDOWN")
    sim(env,"delete",uid,sec=20,code="SIM_DELETE")
    path=home/"Library/Developer/CoreSimulator/Devices"/uid
    good=0
    for _ in range(6):
        good = good+1 if owned(inventory(env, seconds=5),uid,name,absent=True) is None and not os.path.lexists(path) else 0
        if good==2: return
        time.sleep(1)
    raise Blocked("SIM_DELETE_READBACK")

def admit(harness, product, env):
    rec={"stage":"host","status":"BLOCKED","productSha":SOURCE,"productTree":TREE,
         "appBuilt":False,"joinAccepted":False,"releaseVerdict":False,
         "backendVerified":False,"twoOwnedBooted":False,"cleanupVerified":False}
    pair={}; creating_unverified=False; backend_attempt=False; root=None
    old=set(); started_rows=set(); cli=None; se={}; cwd=None; errs=[]
    try:
        need(platform.system()=="Darwin" and platform.machine()=="arm64" and os.getuid()!=0 and
             (env.get("GITHUB_REPOSITORY"),env.get("GITHUB_EVENT_NAME"),env.get("GITHUB_REF"),
              env.get("RUNNER_ENVIRONMENT"),env.get("RUNNER_OS"),env.get("RUNNER_ARCH")) ==
             ("augsmog/QuickScore","workflow_dispatch",REF,"github-hosted","macOS","ARM64"),"HOST_SCOPE")
        base=pathlib.Path(env.get("RUNNER_TEMP","")).resolve(strict=True)
        home=pathlib.Path(pwd.getpwuid(os.getuid()).pw_dir).resolve(strict=True)
        need(base.is_dir() and not base.is_relative_to(harness) and not base.is_relative_to(product),"INVALID_ROOT")
        native={"PATH":"/usr/bin:/bin:/usr/sbin:/sbin","HOME":str(home),"DEVELOPER_DIR":DEV,"LC_ALL":"C","CI":"1"}
        rec["harnessSha"],rec["harnessTree"]=bind(harness,product,env,native)
        assets=pathlib.Path(__file__).resolve().parent
        lock=assets/"supabase.lock"; man=assets/"handoff-manifest.json"
        need(digest(lock)==LOCK and digest(man)==MANIFEST,"PINNED_INPUT")
        for f in json.loads(man.read_text())["sqlOrdered"]:
            needle=product/f["path"]
            need(needle.is_file() and not needle.is_symlink() and digest(needle)==f["sha256"],"PRODUCT_SQL_BINDING")
        rec["freeBytesBefore"]=shutil.disk_usage(base).free
        need(rec["freeBytesBefore"]>=BUILD_BUDGET,"DISK_ADMISSION")
        rec["stage"]="device-inventory"
        sdk=cmd(["/usr/bin/xcrun","--sdk","iphonesimulator","--show-sdk-build-version"],native,15,"SDK")
        need(sdk=="23E252","SDK")
        runtimes=json.loads(sim(native,"list","-j","runtimes",sec=60,code="SIM_RUNTIME"))["runtimes"]
        rt=[r for r in runtimes if r.get("identifier")==RUNTIME]
        need(len(rt)==1 and rt[0].get("version")=="26.4.1" and rt[0].get("buildversion")=="23E254a" and
             rt[0].get("isAvailable") is True and any(x.get("identifier")==DEVICE for x in rt[0].get("supportedDeviceTypes",[])),
             "SIM_RUNTIME")
        initial=inventory(native)
        need(all(r["state"]=="Shutdown" for _,r in initial.values()),"UNOWNED_SIM_ACTIVE")
        old=listener_rows(native)
        need(not any(a.rsplit(":",1)[-1] in {"54321","54322"} for _,a in old),"BACKEND_PORT_BUSY")
        rec["stage"]="private-cli"
        root=pathlib.Path(tempfile.mkdtemp(prefix="snapscore-join-admission-",dir=base))
        for name in ("home","state","tmp","project"): (root/name).mkdir(mode=0o700)
        se={**native,"HOME":str(root/"home"),"SUPABASE_HOME":str(root/"state"),"TMPDIR":str(root/"tmp"),
            "SUPABASE_EXPERIMENTAL_STACK":"1","DO_NOT_TRACK":"1","SUPABASE_TELEMETRY_DISABLED":"1",
            "SUPABASE_NO_UPDATE_NOTIFIER":"1"}
        cwd=root/"project"
        cfg=cwd/"supabase"
        cfg.mkdir(mode=0o700)
        (cfg/"config.toml").write_text(BASE_CONFIG)
        shutil.copyfile(lock,cfg/"supabase.lock")
        ar=root/"cli.tar.gz"; cli=root/"supabase"
        cmd(["/usr/bin/curl","--fail","--silent","--location","--max-time","65","--proto","=https",
             "--max-filesize","60000000","--output",str(ar),CLI_URL],se,70,"CLI_DOWNLOAD",discard=True)
        need(digest(ar)==ARCHIVE,"CLI_ARCHIVE_PIN")
        with cli.open("xb") as dest:
            # Exact single member; archive checksum verified before extraction.
            r=subprocess.run(["/usr/bin/tar","-xOzf",str(ar),"supabase"],env=se,stdin=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL,stdout=dest,timeout=25,check=False)
        need(r.returncode==0 and digest(cli)==CLI_HASH,"CLI_BINARY_PIN")
        cli.chmod(0o700)
        need(cmd([str(cli),"--version"],se,10,"CLI_VERSION")=="2.122.0","CLI_VERSION")
        stem=[str(cli),"--workdir",str(cwd),"--output-format","json","stack"]
        rec["stage"]="native-backend"
        need(shutil.disk_usage(base).free>=FLOOR,"DISK_FLOOR")
        backend_attempt=True
        stock=json.loads(cmd([*stem,"start","--runtime","native","--frozen","--eager",
                              "--exclude","storage,functions,studio,mail,analytics,pooler"],se,250,"STOCK_NATIVE_START"))
        endpoint_check(stock)
        started_rows=listener_rows(native)-old
        backend_sockets(started_rows,set())
        health()
        rec["backendVerified"]=True
        rec["stage"]="two-owned-sims"
        fresh_rows=inventory(native)
        need(fresh_rows==initial,"SIM_INVENTORY_DRIFT")
        nonce=uuid.uuid4().hex
        for actor in ("host","guest"):
            name=f"snapscore-join-{actor}-{nonce}"
            need(all(row["name"]!=name for _,row in fresh_rows.values()),"SIM_NAME_COLLISION")
            creating_unverified=True
            uid=sim(native,"create",name,DEVICE,RUNTIME,sec=35,code="SIM_CREATE")
            need(UDID.fullmatch(uid) and uid not in fresh_rows and uid not in pair,"SIM_UUID_FRESHNESS")
            pair[uid]=name; creating_unverified=False
            fresh_rows=inventory(native)
            need(owned(fresh_rows,uid,name)["state"]=="Shutdown","SIM_PAIR_STATE")
        verify_pair(fresh_rows,pair,"Shutdown")
        for uid,name in pair.items():
            need(owned(inventory(native),uid,name)["state"]=="Shutdown","SIM_PAIR_STATE")
            sim(native,"boot",uid,sec=40,code="SIM_BOOT_START")
        for uid in pair: sim(native,"bootstatus",uid,sec=125,code="SIM_BOOT_WAIT")
        verify_pair(inventory(native),pair,"Booted")
        rec["twoOwnedBooted"]=True
        health()
        rec["freeBytesAfterBoot"]=shutil.disk_usage(base).free
        need(rec["freeBytesAfterBoot"]>=BUILD_BUDGET,"DISK_DUAL_BUILD")
        bind(harness,product,env,native)
        rec["stage"]="admission-complete"
    except Exception as e:
        rec["reason"]=reason(e)
    finally:
        for uid,name in reversed(list(pair.items())):
            try: clean_sim(native,home,uid,name)
            except Exception as e: errs.append(reason(e))
        if creating_unverified: errs.append("SIM_CREATE_UNVERIFIED")
        if backend_attempt:
            try:
                stem=[str(cli),"--workdir",str(cwd),"--output-format","json","stack"]
                cmd([*stem,"destroy","--yes"],se,60,"BACKEND_DESTROY",discard=True)
                listed=json.loads(cmd([*stem,"list"],se,15,"BACKEND_INVENTORY"))
                need(listed==[] or listed=={"stacks":[]},"BACKEND_REMAINS")
                remaining=listener_rows(native)-old
                need(not remaining,"BACKEND_OR_SIM_SOCKET_REMAINS")
            except Exception as e: errs.append(reason(e))
        if root is not None:
            try:
                shutil.rmtree(root)
                need(not os.path.lexists(root),"SCRATCH_REMAINS")
            except Exception as e: errs.append(reason(e))
        rec["cleanupVerified"]=not errs
        if errs: rec["cleanupReasons"]=errs
    if rec["stage"]=="admission-complete" and not errs: rec["status"]="ADMISSION_ONLY"
    return rec

def main():
    def stop(*_): raise Blocked("JOB_INTERRUPTED")
    for sig in (signal.SIGTERM,signal.SIGINT): signal.signal(sig,stop)
    out=admit(*(pathlib.Path(a).resolve(strict=True) for a in sys.argv[1:3]),dict(os.environ))
    print(json.dumps(out,sort_keys=True))
    return 0 if out["status"]=="ADMISSION_ONLY" else 78

if __name__=="__main__": raise SystemExit(main())
