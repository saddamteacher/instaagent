import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export type Db = PrismaClient;

export function createDb(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) throw new Error("DATABASE_URL o'rnatilmagan");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const g = globalThis as unknown as { __jarvisgramDb?: Db };

/** Jarayon bo'yicha yagona klient (Next.js dev hot-reload uchun globalThis'da saqlanadi). */
export function getDb(): Db {
  g.__jarvisgramDb ??= createDb();
  return g.__jarvisgramDb;
}
