import 'dotenv/config';
import { db } from './index';
import { sql } from 'drizzle-orm';

async function run() {
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_credit_cents INTEGER NOT NULL DEFAULT 0;
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER REFERENCES users(id),
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL,
      type TEXT NOT NULL,
      stripe_payment_intent_id TEXT UNIQUE,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log('credit tables ready');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
