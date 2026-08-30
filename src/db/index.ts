import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
  db: ReturnType<typeof drizzle<typeof schema>> | undefined;
};

function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalForDb.pgClient) {
    globalForDb.pgClient = postgres(process.env.DATABASE_URL, {
      max: 10,
      prepare: false,
    });
  }
  if (!globalForDb.db) {
    globalForDb.db = drizzle(globalForDb.pgClient, { schema });
  }
  return globalForDb.db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_t, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
