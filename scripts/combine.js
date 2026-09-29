const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'web', 'src');
const outHtmlPath = path.join(rootDir, 'web', 'index.html');

function combine() {
  const startTime = Date.now();
  const htmlTemplatePath = path.join(srcDir, 'index.html');
  const stylesPath = path.join(srcDir, 'styles.css');
  const appJsPath = path.join(srcDir, 'app.js');

  if (!fs.existsSync(htmlTemplatePath)) {
    console.error(`❌ Missing ${htmlTemplatePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(stylesPath)) {
    console.error(`❌ Missing ${stylesPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(appJsPath)) {
    console.error(`❌ Missing ${appJsPath}`);
    process.exit(1);
  }

  let html = fs.readFileSync(htmlTemplatePath, 'utf8');
  const css = fs.readFileSync(stylesPath, 'utf8');
  const js = fs.readFileSync(appJsPath, 'utf8');

  // Replace link rel="stylesheet" with inline <style>
  html = html.replace(
    /<link\s+rel=["']stylesheet["']\s+href=["']styles\.css["']\s*\/?>/i,
    `<style>\n${css}\n</style>`
  );

  // Keep app.js as an external file; sync to web/app.js
  const outAppJsPath = path.join(rootDir, 'web', 'app.js');
  fs.writeFileSync(outAppJsPath, js, 'utf8');

  // Normalize relative engine.js script tag for root web/ directory
  html = html.replace(
    /<script\s+src=["']\.\.\/engine\.js["']><\/script>/i,
    `<script src="engine.js"></script>`
  );

  fs.writeFileSync(outHtmlPath, html, 'utf8');
  const elapsed = Date.now() - startTime;
  console.log(`📦 [combine] Combined web/src into web/index.html (${(html.length / 1024).toFixed(1)} KB in ${elapsed}ms)`);
}

if (process.argv.includes('--watch')) {
  combine();
  console.log(`👀 Watching ${srcDir} for changes...`);
  let debounceTimeout = null;
  fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      console.log(`🔄 Change detected in ${filename}, recompiling web/index.html...`);
      try {
        combine();
      } catch (err) {
        console.error(`❌ Error recompiling:`, err.message);
      }
    }, 100);
  });
} else {
  combine();
}

module.exports = { combine };
