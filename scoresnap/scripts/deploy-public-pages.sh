#!/bin/sh
# Static support and privacy site.
# Project name is snapscore-site. snapscore.pages.dev already serves a different Vite app.
# CNAME target: snapscore-site.pages.dev
# This script does not change DNS and does not upload unless called with "deploy".
set -eu
project=snapscore-site
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
echo "Project: $project"
echo "CNAME target: ${project}.pages.dev"
echo "Create once: npx wrangler pages project create $project --production-branch main"
echo "Deploy: npx wrangler pages deploy $root/site --project-name $project --branch main"
if [ "${1:-}" != "deploy" ]; then
  exit 0
fi
cd "$root"
npx wrangler pages deploy site --project-name "$project" --branch main
