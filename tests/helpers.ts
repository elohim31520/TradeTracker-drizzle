import { db } from '../src/db/pg'
import { sql } from 'drizzle-orm';
import { users, admins } from '../src/db/schema'

export async function cleanup() {
  await db.execute(sql`TRUNCATE TABLE ${users}, ${admins} RESTART IDENTITY CASCADE`);
}


export async function closeConnection() {

}