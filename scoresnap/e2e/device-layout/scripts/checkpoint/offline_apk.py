"""Generated Release-only network denial. Never edit tracked app configuration."""
import pathlib,xml.etree.ElementTree as ET,re,hashlib
ANDROID='http://schemas.android.com/apk/res/android';TOOLS='http://schemas.android.com/tools'
PERMISSION='android.permission.INTERNET'
def overlay(android):
 android=pathlib.Path(android)
 path=android/'app/src/release/AndroidManifest.xml'
 if path.exists():raise ValueError('offline-release-overlay-already-present')
 path.parent.mkdir(parents=True,exist_ok=True)
 data=('<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="'+ANDROID+'" xmlns:tools="'+TOOLS+'">\n'+''.join('<'+tag+' android:name="'+PERMISSION+'" tools:node="remove" />\n' for tag in ('uses-permission','uses-permission-sdk-23'))+'</manifest>\n').encode()
 path.write_bytes(data)
 return hashlib.sha256(data).hexdigest()
def verify_permissions(output,package):
 # aapt dump permissions must contain the exact package and parseable records.
 lines=output.splitlines()
 if not lines or lines[0]!="package: "+package:raise ValueError('apk-permission-package-unproven')
 for line in lines[1:]:
  if not line.strip():continue
  m=re.fullmatch(r"uses-permission(?:-sdk-23)?: name='([^']+)'(?: maxSdkVersion='\d+')?",line)
  if not m:raise ValueError('apk-permission-shape-unproven')
  if m[1]==PERMISSION:raise ValueError('apk-internet-not-denied')
 return {'internetPermissionPresent':False,'scope':'offline-supplemental-only','releaseParity':False}
