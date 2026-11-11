#!/usr/bin/env bash
set -euo pipefail

npx playwright install chromium

probe_chromium() {
  node -e 'const { chromium } = require("playwright"); (async () => { const browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); await page.goto("about:blank"); await browser.close(); })().catch(error => { console.error(error); process.exit(1); });'
}

if probe_chromium; then
  echo "Chromium launch probe passed; install-deps skipped."
  exit 0
fi

echo "Chromium launch probe failed; installing system dependencies."
delays=(20 60 120)
for attempt in 1 2 3 4; do
  if npx playwright install-deps chromium && probe_chromium; then
    echo "Chromium launch probe passed after install-deps attempt $attempt."
    exit 0
  fi
  if (( attempt <= 3 )); then
    delay="${delays[$((attempt - 1))]}"
    echo "Chromium dependency attempt $attempt failed; retrying in ${delay}s."
    sleep "$delay"
  fi
done

echo "INFRA: chromium deps unavailable (apt)" >&2
exit 1
