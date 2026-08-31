// Loads a subset of src/game modules into a plain Node context (no DOM).
// Used by the headless validation scripts.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export function loadModules(names) {
  const src = names.map((f) => readFileSync(join(ROOT, 'src', 'game', f), 'utf8')).join('\n')
    + '\nreturn Z;';
  return new Function(src)();
}
