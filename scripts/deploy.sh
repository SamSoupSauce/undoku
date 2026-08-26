#!/usr/bin/env bash
set -e

echo "🔨 Running universal build pipeline..."
node scripts/build.js

echo "🚀 Deploying static assets from site_dist/ to 'deploy' branch..."
cd site_dist
git init -b deploy
git config user.name "$(git -C .. config user.name || echo 'undoku-deploy-bot')"
git config user.email "$(git -C .. config user.email || echo 'bot@undoku.local')"
git add -A
git commit -m "deploy: static site build $(date -u +'%Y-%m-%d %H:%M:%SZ')"
git remote add origin "$(git -C .. remote get-url origin)"
git push -f origin deploy
cd ..
rm -rf site_dist

echo "✅ Successfully deployed to origin/deploy!"
