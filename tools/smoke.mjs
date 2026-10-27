// Corre test/smoke.cjs dentro de Electron (npm run smoke). SHOT=archivo.png guarda una captura.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const electron = createRequire(import.meta.url)('electron');
const smoke = fileURLToPath(new URL('../test/smoke.cjs', import.meta.url));
const env = { ...process.env, NODE_OPTIONS: '' };
const r = spawnSync(electron, [smoke], { stdio: ['ignore', 'pipe', 'inherit'], env, encoding: 'utf8' });
process.stdout.write(r.stdout ?? '');
process.exit(r.status ?? 1);
