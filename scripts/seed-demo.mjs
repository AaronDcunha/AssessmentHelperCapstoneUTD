import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.length > 2) throw new Error('Use db:seed:preview or db:seed:signups:preview to preview seed data.');
if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
const database = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)) throw new Error('Demo seeding requires local PostgreSQL.');

for (const [label, args] of [
  ['Basic demo data', ['prisma/seed.mjs']],
  ['Ten demo signups', ['--import', './scripts/server-loader.mjs', 'prisma/seed-signups.mjs']],
]) {
  console.log(`\n${label}`);
  const result = spawnSync(process.execPath, args, { cwd: root, env: process.env, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`${label} failed. Earlier successful steps are retained; fix the error and rerun. No database reset was performed.`);
    process.exit(result.status ?? 1);
  }
}
