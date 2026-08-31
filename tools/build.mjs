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
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`built ${OUT}`);
console.log(`  modules: ${files.length}  source lines: ${totalLines}  size: ${kb} KB`);
for (const f of files) {
  const n = readFileSync(join(SRC, f), 'utf8').split('\n').length;
  console.log(`    ${f.padEnd(28)} ${String(n).padStart(6)} lines`);
}
