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

// Copy Wiki documentation
const wikiDistDir = path.join(rootDir, 'wiki', 'dist');
if (fs.existsSync(wikiDistDir)) {
  const destWikiDir = path.join(siteDistDir, 'wiki');
  fs.cpSync(wikiDistDir, destWikiDir, { recursive: true });
}

// Copy SVG Vector Exports if present
const exportsDir = path.join(rootDir, 'exports');
if (fs.existsSync(exportsDir)) {
  const destExportsDir = path.join(siteDistDir, 'exports');
  fs.cpSync(exportsDir, destExportsDir, { recursive: true });
}

// Write .nojekyll for static hosts (GitHub Pages)
fs.writeFileSync(path.join(siteDistDir, '.nojekyll'), '');

console.log('✅ Undoku build completed successfully! Static bundle assembled in site_dist/');
