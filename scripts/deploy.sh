#!/usr/bin/env bash
set -e

echo "🔨 Building Astro Starlight Wiki..."
npm --prefix wiki run build

echo "📦 Assembling static deployment bundle (Root Game + /wiki/ Documentation)..."
rm -rf site_dist
mkdir -p site_dist
cp web/index.html site_dist/index.html
mkdir -p site_dist/wiki
cp -r wiki/dist/* site_dist/wiki/
touch site_dist/.nojekyll

echo "🚀 Deploying static assets to 'deploy' branch..."
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
