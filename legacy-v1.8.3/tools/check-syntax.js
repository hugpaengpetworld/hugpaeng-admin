const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const childProcess = require('node:child_process');

const sourceDir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(sourceDir).filter((name) => name.endsWith('.gs')).sort();
const combined = files.map((name) => fs.readFileSync(path.join(sourceDir, name), 'utf8')).join('\n');

new vm.Script(combined, { filename: 'apps-script-combined.gs' });

for (const name of fs.readdirSync(sourceDir).filter((item) => item.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(sourceDir, name), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter((script) => !script.includes('<?'));
  scripts.forEach((script, index) => {
    new vm.Script(script, { filename: `${name}#script-${index + 1}` });
  });
}

const cloudflareRoot = path.join(__dirname, '..', 'cloudflare-web');
const workerFile = path.join(cloudflareRoot, 'src', 'worker.js');
childProcess.execFileSync(process.execPath, ['--check', workerFile], { stdio: 'inherit' });

for (const htmlFile of [
  path.join(cloudflareRoot, 'public', 'index.html'),
  path.join(cloudflareRoot, 'public', 'admin', 'index.html')
]) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  if (html.includes('google.script.run') || html.includes('<?')) {
    throw new Error(`${htmlFile} contains Apps Script-only code`);
  }
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]);
  scripts.forEach((script, index) => {
    new vm.Script(script, { filename: `${path.basename(htmlFile)}#script-${index + 1}` });
  });
}

console.log(`Syntax OK: ${files.length} Apps Script files, Cloudflare Worker, and inline client scripts`);
