import pg from "pg";

const globalDb = globalThis as typeof globalThis & { accountPool?: pg.Pool };

export function getPool() {
  if (globalDb.accountPool) return globalDb.accountPool;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for account login.");
  const url = new URL(process.env.DATABASE_URL);
  if ((url.searchParams.get("schema") || "public") !== "public") {
    throw new Error("Account queries currently require schema=public.");
  }
  url.searchParams.delete("schema");
  const pool = new pg.Pool({ connectionString: url.toString(), max: 10,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  pool.on("error", () => console.error("An idle database connection failed."));
  globalDb.accountPool = pool;
  return pool;
}
