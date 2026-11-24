// Runs every test file in order and reports which passed.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = ['cards.test.mjs', 'sql.test.mjs', 'demo.test.mjs', 'supabase-flow.test.mjs'];
const results = [];
for (const file of files){
  console.log(`\n── ${file}`);
  const started = Date.now();
  const { status } = spawnSync(process.execPath, [path.join(here, file)], { stdio: 'inherit' });
  results.push({ file, ok: status === 0, seconds: ((Date.now() - started) / 1000).toFixed(1) });
}
console.log('\n── summary');
for (const r of results) console.log(`${r.ok ? 'pass' : 'FAIL'}  ${r.file}  (${r.seconds} s)`);
process.exit(results.every(r => r.ok) ? 0 : 1);
