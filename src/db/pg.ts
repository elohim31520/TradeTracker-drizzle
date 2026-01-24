import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../pgSchema/index';
import 'dotenv/config';

const connectionString = process.env.PG_URL;

if (!connectionString) {
  throw new Error("PG_URL environment variable is required");
}

const client = postgres(connectionString, {
  max: 20,
  onnotice: (notice) => console.log(notice),
});

export const db = drizzle(client, {
  schema,
  logger: true
});