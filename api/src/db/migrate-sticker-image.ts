import 'dotenv/config';
import { db } from './index';
import { sql } from 'drizzle-orm';

async function run() {
  await db.execute(sql`
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS sticker_image_url TEXT;
  `);
  console.log('sticker_image_url column added');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
