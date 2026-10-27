import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

for (const directory of ['src', 'demo', 'scripts', 'tests']) {
  for (const file of await readdir(directory)) {
    if (!/\.m?js$/.test(file)) continue;
    const path = join(directory, file);
    const lines = (await readFile(path, 'utf8')).split('\n').length;
    if (lines >= 300) throw new Error(`${path}: exceeds the module size limit.`);
    const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('PASS: JavaScript syntax and module sizes.');
