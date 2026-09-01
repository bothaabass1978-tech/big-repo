// Renders every material as a 2x2 tiled block into one contact sheet.
import { chromium } from 'playwright';
import { join } from 'node:path';
import { ROOT } from './load.mjs';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file://' + join(ROOT, 'nacht_der_untoten.html'));
await page.waitForTimeout(3500);
const sheet = await page.evaluate(() => {
  const Z = window.__Z;
  const keys = Z.Tex.KEYS;
  const CELL = 128, COLS = 8, PAD = 22;
  const rows = Math.ceil(keys.length / COLS);
  const c = document.createElement('canvas');
  c.width = COLS * (CELL + 8); c.height = rows * (CELL + PAD);
  const x = c.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
  keys.forEach((k, i) => {
    const cx = (i % COLS) * (CELL + 8) + 4, cy = Math.floor(i / COLS) * (CELL + PAD) + PAD - 4;
    const m = Z.Tex.materials[k];
    if (m && m.canvas) {
      // draw 2x2 tiled so seams and repetition are obvious
      x.drawImage(m.canvas, cx, cy, CELL / 2, CELL / 2);
      x.drawImage(m.canvas, cx + CELL / 2, cy, CELL / 2, CELL / 2);
      x.drawImage(m.canvas, cx, cy + CELL / 2, CELL / 2, CELL / 2);
      x.drawImage(m.canvas, cx + CELL / 2, cy + CELL / 2, CELL / 2, CELL / 2);
    }
    x.fillStyle = '#9c9'; x.font = '10px monospace';
    x.fillText(k.slice(0, 20), cx, cy - 4);
  });
  return c.toDataURL('image/png');
});
const fs = await import('node:fs');
fs.writeFileSync(join(ROOT, 'production/qa/evidence/textures-contact-sheet.png'),
  Buffer.from(sheet.split(',')[1], 'base64'));
console.log('wrote contact sheet');
await browser.close();
