const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Running Undoku Universal Build Pipeline...');

const rootDir = path.resolve(__dirname, '..');
const sharedEnginePath = path.join(rootDir, 'shared', 'engine.js');
const webEnginePath = path.join(rootDir, 'web', 'engine.js');
const siteDistDir = path.join(rootDir, 'site_dist');

// 1. Bundle shared engine to web/engine.js
console.log('📦 Bundling shared engine into web/engine.js...');
fs.copyFileSync(sharedEnginePath, webEnginePath);

// 2. Build Astro Starlight Wiki
console.log('🔨 Building Astro Starlight Wiki...');
try {
  execSync('npm --prefix wiki run build', { stdio: 'inherit', cwd: rootDir });
} catch (err) {
  console.error('❌ Failed to build wiki:', err.message);
  process.exit(1);
}

// 3. Assemble static deployment bundle into site_dist/
console.log('📦 Assembling static deployment bundle (site_dist/)...');
fs.rmSync(siteDistDir, { recursive: true, force: true });
fs.mkdirSync(siteDistDir, { recursive: true });

// Copy Web App & Bundled Engine
fs.copyFileSync(path.join(rootDir, 'web', 'index.html'), path.join(siteDistDir, 'index.html'));
fs.copyFileSync(webEnginePath, path.join(siteDistDir, 'engine.js'));

// Copy PWA Manifest & Offline Service Worker
const manifestPath = path.join(rootDir, 'web', 'manifest.webmanifest');
if (fs.existsSync(manifestPath)) {
  fs.copyFileSync(manifestPath, path.join(siteDistDir, 'manifest.webmanifest'));
}

const swPath = path.join(rootDir, 'web', 'sw.js');
if (fs.existsSync(swPath)) {
  fs.copyFileSync(swPath, path.join(siteDistDir, 'sw.js'));
}

// Copy PWA Icons
const iconsDir = path.join(rootDir, 'web', 'icons');
if (fs.existsSync(iconsDir)) {
  fs.cpSync(iconsDir, path.join(siteDistDir, 'icons'), { recursive: true });
}

// Copy Wiki documentation
const wikiDistDir = path.join(rootDir, 'wiki', 'dist');
if (fs.existsSync(wikiDistDir)) {
  const destWikiDir = path.join(siteDistDir, 'wiki');
  fs.cpSync(wikiDistDir, destWikiDir, { recursive: true });
}

// 4. Copy Web Assets to Android App Assets (if directory exists)
const androidAssetsDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets');
if (fs.existsSync(androidAssetsDir)) {
  console.log('📱 Syncing Web Bundle to Android assets (android/app/src/main/assets/)...');
  fs.copyFileSync(path.join(rootDir, 'web', 'index.html'), path.join(androidAssetsDir, 'index.html'));
  fs.copyFileSync(webEnginePath, path.join(androidAssetsDir, 'engine.js'));
  if (fs.existsSync(manifestPath)) {
    fs.copyFileSync(manifestPath, path.join(androidAssetsDir, 'manifest.webmanifest'));
  }
}

// Write .nojekyll for static hosts (GitHub Pages)
fs.writeFileSync(path.join(siteDistDir, '.nojekyll'), '');

console.log('✅ Undoku build completed successfully! Static bundle assembled in site_dist/');
