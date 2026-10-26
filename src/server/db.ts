import pg from "pg";

const globalDb = globalThis as typeof globalThis & { accountPool?: pg.Pool };

// Prisma's legacy timestamp-without-zone columns contain UTC. Encode/parse them
// explicitly instead of depending on the Windows/server process time zone.
export function facultySqlPool(pool: pg.Pool) {
  const query = (connection: pg.Pool | pg.PoolClient) => <Row extends pg.QueryResultRow>(sql: string, values: unknown[] = []) => connection.query<Row>({
    text: sql, values: values.map(value => value instanceof Date ? value.toISOString() : value),
    types: { getTypeParser: (oid: number, format?: string) => oid === 1114 ? (value: string) => new Date(`${value.replace(" ", "T")}Z`)
      : oid === 1082 ? (value: string) => new Date(`${value}T00:00:00Z`) : pg.types.getTypeParser(oid, format as "text") },
  });
  return { query: query(pool), async connect() { const client = await pool.connect(); return { query: query(client), release: () => client.release() }; } };
}

function rawPool() {
  if (globalDb.accountPool) return globalDb.accountPool;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for account login.");
  const url = new URL(process.env.DATABASE_URL);
  if ((url.searchParams.get("schema") || "public") !== "public") {
    throw new Error("Account queries currently require schema=public.");
  }
  url.searchParams.delete("schema");
  const pool = new pg.Pool({ connectionString: url.toString(), max: 10,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, options: "-c timezone=UTC" });
  pool.on("error", () => console.error("An idle database connection failed."));
  globalDb.accountPool = pool;
  return pool;
}

export function getPool() { return facultySqlPool(rawPool()); }
