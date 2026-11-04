#!/usr/bin/env python3
"""Collect a sanitized, read-only App Store Connect 1.0 readiness snapshot."""
import json, os, re, sys, hashlib, base64
from pathlib import Path
sys.path.insert(0, '/workspace/aos-state/scripts')
from asc_api import call, APP

OUT = Path('/workspace/aos-state/snapscore/submit-readiness-20261104')
OUT.mkdir(parents=True, exist_ok=True)
VERSION_ID = '8e659917-44dc-421e-85ea-b7014351e365'
SUBSCRIPTIONS = [
    ('Pro Annual', '6828962896', 'SnapScore'),
    ('Pro Monthly', '6828974108', 'SnapScore'),
    ('TD Annual', '6828959474', 'SnapScore'),
    ('TD Monthly', '6828962048', 'SnapScore'),
]

def get(path):
    status, payload = call('GET', path)
    if status != 200:
        raise RuntimeError(f'GET {path} returned HTTP {status}: {json.dumps(payload)[:400]}')
    return payload

def one(payload):
    value = payload.get('data')
    return value[0] if isinstance(value, list) and value else value

def redacted_review(attrs):
    return {
        'contactFirstNamePresent': bool(attrs.get('contactFirstName')),
        'contactLastNamePresent': bool(attrs.get('contactLastName')),
        'contactPhonePresent': bool(attrs.get('contactPhone')),
        'contactEmailPresent': bool(attrs.get('contactEmail')),
        'demoAccountRequired': attrs.get('demoAccountRequired'),
        'demoAccountNamePresent': bool(attrs.get('demoAccountName')),
        'demoAccountPasswordPresent': bool(attrs.get('demoAccountPassword')),
        'notesPresent': bool(attrs.get('notes')),
        'notesLength': len(attrs.get('notes') or ''),
    }

version_response = get(f'/v1/apps/{APP}/appStoreVersions?filter[versionString]=1.0&filter[platform]=IOS&include=build,appStoreReviewDetail')
version = one(version_response)
if not version or version.get('id') != VERSION_ID:
    raise RuntimeError('App Store version 1.0 identity changed; review before proceeding')
review_id = version['relationships']['appStoreReviewDetail']['data']['id']
# Use the documented relationship path; data remains in memory only long enough to redact.
review_data = get(f'/v1/appStoreVersions/{VERSION_ID}/appStoreReviewDetail')
review = one(review_data)

app_info_response = get(f'/v1/apps/{APP}/appInfos?include=primaryCategory,secondaryCategory,ageRatingDeclaration,appInfoLocalizations')
app_info = one(app_info_response)
app_localizations = get(f'/v1/appStoreVersions/{VERSION_ID}/appStoreVersionLocalizations?include=appScreenshotSets&limit=50')
localization = one(app_localizations)
policy_matches = re.findall(r'https?://[^\s)]+/privacy/?', localization['attributes'].get('description') or '')
version_submission = get(f'/v1/apps/{APP}/appStoreVersions?filter[versionString]=1.0&filter[platform]=IOS&include=appStoreVersionSubmission')
review_submissions = get(f'/v1/apps/{APP}/reviewSubmissions?limit=50')
price_schedule = get(f'/v1/apps/{APP}/appPriceSchedule')
base_territory = get(f'/v1/appPriceSchedules/{APP}/baseTerritory')
manual_prices = get(f'/v1/appPriceSchedules/{APP}/manualPrices?limit=200')
price_points = get(f'/v1/apps/{APP}/appPricePoints?filter[territory]=USA&limit=200')
def price_key(encoded):
    try:
        token = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
        return token.get('p')
    except Exception:
        return None
manual_price = next((x for x in manual_prices.get('data', []) if price_key(x['id']) is not None), None)
price_point = next((x for x in price_points.get('data', []) if manual_price and price_key(x['id']) == price_key(manual_price['id'])), None)

screenshot_sets = localization.get('relationships', {}).get('appScreenshotSets', {}).get('data', [])
screenshots_by_set = {x['id']: x for x in app_localizations.get('included', []) if x.get('type') == 'appScreenshotSets'}
screenshots = []
for ss in screenshot_sets:
    p = get(f"/v1/appScreenshotSets/{ss['id']}/appScreenshots?limit=50")
    screenshots.append({'setId': ss['id'], 'displayType': screenshots_by_set.get(ss['id'], {}).get('attributes', {}).get('screenshotDisplayType'), 'screenshots': [
        {'id': x['id'], 'fileName': x.get('attributes', {}).get('fileName'),
         'assetDeliveryState': x.get('attributes', {}).get('assetDeliveryState', {}).get('state')}
        for x in p.get('data', [])]})

subscription_rows = []
subscription_raw = []
for label, sid, group in SUBSCRIPTIONS:
    detail = one(get(f'/v1/subscriptions/{sid}'))
    loc = get(f'/v1/subscriptions/{sid}/subscriptionLocalizations?limit=50')
    shot_payload = get(f'/v1/subscriptions/{sid}/appStoreReviewScreenshot')
    sub_version = one(get(f'/v1/subscriptions/{sid}/versions'))
    attrs = detail.get('attributes', {})
    localizations = loc.get('data', [])
    shot = one(shot_payload)
    subscription_rows.append({
        'label': label,
        'id': sid,
        'name': attrs.get('name'),
        'productId': attrs.get('productId'),
        'state': attrs.get('state'),
        'group': group,
        'groupId': '22529638',
        'localizations': [{'locale': x.get('attributes', {}).get('locale'), 'state': x.get('attributes', {}).get('state')} for x in localizations],
        'reviewScreenshotPresent': bool(shot),
        'reviewScreenshotDeliveryState': (shot or {}).get('attributes', {}).get('assetDeliveryState', {}).get('state'),
        'subscriptionVersionState': (sub_version or {}).get('attributes', {}).get('state'),
        'versionReviewSubmissionAttached': False,
        'attachableByCurrentState': attrs.get('state') == 'READY_TO_SUBMIT',
    })
    # Persist only relevant fields; excludes reviewNote and any user or credential fields.
    subscription_raw.append({
        'type': detail.get('type'), 'id': sid,
        'attributes': {k: attrs.get(k) for k in ('name','productId','state','subscriptionPeriod','groupLevel')},
        'localizations': [{'id': x.get('id'), 'locale': x.get('attributes', {}).get('locale'), 'state': x.get('attributes', {}).get('state')} for x in localizations],
        'reviewScreenshot': None if not shot else {'id': shot['id'], 'assetDeliveryState': shot.get('attributes', {}).get('assetDeliveryState', {}).get('state')},
        'subscriptionVersion': None if not sub_version else {'id': sub_version.get('id'), 'state': sub_version.get('attributes', {}).get('state')},
    })

raw = {
    'snapshotDate': '2026-11-04',
    'method': 'scripts/asc_api.py call("GET", path) only',
    'app': {'id': APP, 'name': one(get(f'/v1/apps/{APP}')).get('attributes', {}).get('name'), 'contentRightsDeclaration': one(get(f'/v1/apps/{APP}')).get('attributes', {}).get('contentRightsDeclaration')},
    'appStoreVersion': {'id': version['id'], 'attributes': version.get('attributes'), 'buildId': version.get('relationships', {}).get('build', {}).get('data', {}).get('id')},
    'versionBuildIncluded': [
        {'id': x.get('id'), 'type': x.get('type'), 'attributes': {k: x.get('attributes', {}).get(k) for k in ('version','uploadedDate','processingState','expired')}}
        for x in version_response.get('included', []) if x.get('type') == 'builds'],
    'appStoreReviewDetail': redacted_review(review.get('attributes', {})),
    'appInfo': {'id': app_info.get('id'), 'attributes': app_info.get('attributes'), 'categories': {
        'primary': app_info.get('relationships', {}).get('primaryCategory', {}).get('data'),
        'secondary': app_info.get('relationships', {}).get('secondaryCategory', {}).get('data')},
        'ageRatingDeclarationId': app_info.get('relationships', {}).get('ageRatingDeclaration', {}).get('data', {}).get('id'),
        'localizations': [{'locale': x.get('attributes', {}).get('locale'), 'name': x.get('attributes', {}).get('name'), 'privacyPolicyUrl': x.get('attributes', {}).get('privacyPolicyUrl')} for x in app_info_response.get('included', []) if x.get('type') == 'appInfoLocalizations']},
    'appStoreVersionLocalization': {'id': localization.get('id'), 'locale': localization.get('attributes', {}).get('locale'), 'privacyPolicyUrl': policy_matches[0] if policy_matches else None, 'reviewNotesPresent': bool(review.get('attributes', {}).get('notes')), 'reviewNotesLength': len(review.get('attributes', {}).get('notes') or '')},
    'appStoreScreenshots': screenshots,
    'reviewSubmission': {'count': len(review_submissions.get('data', [])), 'versionSubmissionRelationship': version_submission.get('data', [{}])[0].get('relationships', {}).get('appStoreVersionSubmission', {}).get('data')},
    'appPrice': {'baseTerritory': one(base_territory).get('id'), 'scheduleId': one(price_schedule).get('id'), 'manualPriceEntryPresent': bool(manual_price), 'manualPricePoint': None if not price_point else {'id': price_point['id'], 'customerPrice': price_point.get('attributes', {}).get('customerPrice'), 'proceeds': price_point.get('attributes', {}).get('proceeds')}},
    'subscriptions': subscription_raw,
}
raw_path = OUT / 'raw-sanitized.json'
raw_path.write_text(json.dumps(raw, indent=2, sort_keys=True) + '\n')
sha = hashlib.sha256(raw_path.read_bytes()).hexdigest()
(OUT / 'SHA256SUMS').write_text(f'{sha}  raw-sanitized.json\n')
print(json.dumps({'output': str(OUT), 'rawSha256': sha, 'versionState': version['attributes'].get('appStoreState'), 'build': raw['versionBuildIncluded'], 'subscriptions': subscription_rows, 'review': raw['appStoreReviewDetail'], 'privacyPolicyUrl': policy_matches[0] if policy_matches else None, 'categories': raw['appInfo']['categories'], 'ageRating': app_info.get('attributes', {}).get('appStoreAgeRating'), 'contentRights': call('GET', f'/v1/apps/{APP}')[1].get('data', {}).get('attributes', {}).get('contentRightsDeclaration'), 'price': raw['appPrice']}, indent=2))
