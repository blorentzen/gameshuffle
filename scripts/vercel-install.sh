#!/usr/bin/env bash
# Inject GITHUB_TOKEN into CascadeDS dependency URLs so Vercel can
# authenticate against the private repo over HTTPS (not SSH).
set -euo pipefail

sed -i "s|https://github.com/blorentzen/cascadeds.git|https://${GITHUB_TOKEN}@github.com/blorentzen/cascadeds.git|g" package.json package-lock.json
sed -i "s|ssh://git@github.com/blorentzen/cascadeds.git|https://${GITHUB_TOKEN}@github.com/blorentzen/cascadeds.git|g" package-lock.json

npm install
