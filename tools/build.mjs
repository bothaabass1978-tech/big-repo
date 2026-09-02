#!/usr/bin/env node
// Bundles src/game/*.js + src/shell/index.template.html into ONE standalone .html
// No external assets, no dependencies, no network. Everything inlined.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src', 'game');
const OUT = join(ROOT, 'nacht_der_untoten.html');

const files = readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
if (!files.length) { console.error('no source files'); process.exit(1); }

let bundle = '';
let totalLines = 0;
for (const f of files) {
  const src = readFileSync(join(SRC, f), 'utf8');
  const lines = src.split('\n').length;
  totalLines += lines;
  bundle += `\n/* ============================ ${f} (${lines} lines) ============================ */\n`;
  bundle += src.replace(/\r\n/g, '\n');
  bundle += '\n';
}

// Guard: nothing may reach outside the file.
const forbidden = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/\bimport\s*\(/, 'dynamic import()'],
  [/<script[^>]+src=/i, 'external script tag'],
  [/https?:\/\/(?!www\.w3\.org)/, 'external URL'],
  [/new\s+Worker\s*\(/, 'Worker with external URL'],
];
for (const [re, name] of forbidden) {
  const m = bundle.match(re);
  if (m) { console.error(`BUILD FAIL: forbidden external reference (${name}): ${m[0]}`); process.exit(1); }
}

const tpl = readFileSync(join(ROOT, 'src', 'shell', 'index.template.html'), 'utf8');
if (!tpl.includes('/*__GAME_BUNDLE__*/')) { console.error('template missing bundle marker'); process.exit(1); }
const html = tpl.replace('/*__GAME_BUNDLE__*/', () => bundle);

writeFileSync(OUT, html);

// Second target: the same game as body content only, for hosts that supply
// their own document skeleton (Claude artifacts wrap the file in doctype/html/
// head/body at publish time, so shipping our own would nest a document).
// Same bundle, same behaviour — only the wrapper differs.
const ART = join(ROOT, 'nacht_der_untoten.artifact.html');
const headOpen = html.indexOf('<head>');
const headClose = html.indexOf('</head>');
const bodyOpen = html.indexOf('<body>');
const bodyClose = html.lastIndexOf('</body>');
if (headOpen < 0 || headClose < 0 || bodyOpen < 0 || bodyClose < 0) {
  console.error('build: cannot locate head/body in the shell to make the artifact variant');
  process.exit(1);
}
// Keep <title> and <style> from the head — the wrapper's head has neither of
// ours — and drop <meta charset>/<meta viewport>, which the wrapper supplies.
const headInner = html.slice(headOpen + 6, headClose)
  .replace(/<meta[^>]*>\s*/g, '')
  .trim();
const bodyInner = html.slice(bodyOpen + 6, bodyClose).trim();
const artifact = headInner + '\n' + bodyInner + '\n';
writeFileSync(ART, artifact);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`built ${OUT}`);
console.log(`built ${ART}  (${(Buffer.byteLength(artifact) / 1024).toFixed(1)} KB, body content only)`);
console.log(`  modules: ${files.length}  source lines: ${totalLines}  size: ${kb} KB`);
for (const f of files) {
  const n = readFileSync(join(SRC, f), 'utf8').split('\n').length;
  console.log(`    ${f.padEnd(28)} ${String(n).padStart(6)} lines`);
}
