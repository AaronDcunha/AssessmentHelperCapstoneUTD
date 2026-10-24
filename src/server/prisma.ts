import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalPrisma = globalThis as typeof globalThis & { configurationPrisma?: PrismaClient };

export function getPrisma() {
  if (globalPrisma.configurationPrisma) return globalPrisma.configurationPrisma;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const url = new URL(process.env.DATABASE_URL);
  const schema = url.searchParams.get("schema") || "public";
  url.searchParams.delete("schema");
  const adapter = new PrismaPg({ connectionString: url.toString(), max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }, { schema });
  const prisma = new PrismaClient({ adapter });
  globalPrisma.configurationPrisma = prisma;
  return prisma;
}
