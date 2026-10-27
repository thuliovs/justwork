import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDatabase = globalThis as unknown as {
  databaseClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDatabase.databaseClient ?? postgres(databaseUrl, { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.databaseClient = client;
}

export const db = drizzle(client, { schema });

export async function closeDatabase() {
  await client.end();
}
