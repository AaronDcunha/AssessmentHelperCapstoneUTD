// Apply migrations to a disposable local schema and exercise real account authentication.
import "../../scripts/server-loader.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
const { PrismaClient } = await import("../../src/generated/prisma/client.ts");
const { authenticateDatabase } = await import("../../src/server/database-auth.ts");
const { bootstrapAdmin } = await import("../../scripts/admin-bootstrap.mjs");

const url = new URL(process.env.DATABASE_URL);
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
url.searchParams.delete("schema");
const schema = "bootstrap_test_" + randomUUID().replaceAll("-", "");
const base = new pg.Pool({ connectionString: url.href });
const migrations = new pg.Pool({ connectionString: url.href, options: "-c search_path=" + schema });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }, { schema }) });
let created = false;

try {
  await base.query("CREATE SCHEMA " + schema);
  created = true;
  const root = new URL("../../prisma/migrations/", import.meta.url);
  const folders = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory());
  for (const folder of folders.sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = (await readFile(new URL(`${folder.name}/migration.sql`, root), "utf8"))
      .replace('CREATE SCHEMA IF NOT EXISTS "public";', "").replace(/\bpublic\./g, schema + ".").replace(/"public"\./g, '"' + schema + '".');
    await migrations.query(sql);
  }

  const password = randomBytes(1).toString("hex").slice(0, 1);
  const input = { name: "Aaron D'Cunha", email: "first@example.test", password };
  await db.appUser.create({ data: { fullName: "Existing User", username: "existing", email: "existing@example.test" } });
  await assert.rejects(bootstrapAdmin(db, { ...input, email: "EXISTING@example.test" }), /already belongs/);
  const concurrent = await Promise.allSettled([
    bootstrapAdmin(db, input),
    bootstrapAdmin(db, { ...input, name: "Bri O'Neil", email: "other@example.test" }),
  ]);
  const winners = concurrent.filter(result => result.status === "fulfilled");
  assert.equal(winners.length, 1);
  const { username } = winners[0].value;
  assert.equal(username, concurrent[0].status === "fulfilled" ? "aaron_dcunha" : "bri_oneil");
  const session = await authenticateDatabase({ username, password }, db);
  assert(session?.roles.includes("Admin"));
  assert(session.permissions.includes("users.manage") && session.permissions.includes("cycles.manage"));
  assert.equal(await authenticateDatabase({ username, password: "incorrect" }, db), null);
  await assert.rejects(bootstrapAdmin(db, { ...input, name: "Retry Admin", email: "retry@example.test" }), /active Admin already exists/);
  assert.equal(await db.appUser.count({ where: { userRoles: { some: { role: { roleName: "Admin" } } } } }), 1);
  assert.equal(await db.course.count(), 0);
  assert.equal(await db.loginCredential.count(), 1);
  console.log("Passed migrated schema, real authentication, Admin grants, duplicate identity, concurrent runs, and repeat-run protection.");
} finally {
  await db.$disconnect();
  await migrations.end();
  if (created) await base.query("DROP SCHEMA " + schema + " CASCADE");
  await base.end();
}
