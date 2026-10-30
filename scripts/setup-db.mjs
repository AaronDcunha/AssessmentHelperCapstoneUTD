import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (process.argv.length > 2) throw new Error('Usage: npm run db:setup');
if (process.env.NODE_ENV === 'production') throw new Error('Demo database setup is disabled in production');
if (!existsSync('.env')) throw new Error('Create .env from .env.example and configure the PostgreSQL password and DATABASE_URL first.');
loadEnvFile('.env');
if (process.env.NODE_ENV === 'production') throw new Error('Demo database setup is disabled in production');
const url = new URL(process.env.DATABASE_URL || 'invalid:');
if (!['postgresql:', 'postgres:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) {
  throw new Error('db:setup requires a local PostgreSQL DATABASE_URL.');
}
if (!process.env.POSTGRES_PASSWORD || process.env.POSTGRES_PASSWORD === 'replace_with_random_hex_password') {
  throw new Error('Set POSTGRES_PASSWORD in .env and use the matching password in DATABASE_URL.');
}
if (decodeURIComponent(url.password) !== process.env.POSTGRES_PASSWORD
    || decodeURIComponent(url.username) !== process.env.POSTGRES_USER
    || decodeURIComponent(url.pathname.slice(1)) !== process.env.POSTGRES_DB
    || (url.port || '5432') !== (process.env.POSTGRES_PORT || '5432')
    || (url.searchParams.get('schema') || 'public') !== 'public') {
  throw new Error('DATABASE_URL must match the PostgreSQL user/password/database/port in .env and use schema=public.');
}
function run(label, command, args) {
  console.log(`\n${label}`);
  const result = spawnSync(command, args, {cwd:root,env:process.env,stdio:'inherit',shell:false});
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed. No later steps were run. Existing databases are never automatically reset; review the error before retrying.`);
}
try {
  console.log('Checking PostgreSQL connection...');
  const connectionUrl = new URL(url);
  connectionUrl.searchParams.delete('schema');
  const client = new pg.Client({connectionString:connectionUrl.toString(),connectionTimeoutMillis:5000});
  try {
    await client.connect();
    await client.query('SELECT 1');
  } catch {
    throw new Error('Cannot connect to PostgreSQL. Start the database yourself using docker compose up -d --wait postgres (or your Docker app), then retry. If it is already running, check the database credentials in .env. No migrations or seed steps were run.');
  } finally {
    await client.end().catch(() => {});
  }
  run('Applying checked-in database migrations...',process.execPath,['node_modules/prisma/build/index.js','migrate','deploy']);
  run('Checking that the database matches the current schema...',process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--exit-code']);
  run('Populating demo data and ten signup fixtures...',process.execPath,['scripts/seed-demo.mjs']);
  console.log('\nDatabase setup complete. Run npx prisma studio to inspect it. Sample logins: prisma/demo-accounts.txt');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
