import 'dotenv/config';
import { db } from './index';
import { businesses } from './schema';
import { isNotNull } from 'drizzle-orm';

async function run() {
  const rows = await db.select({ id: businesses.id, name: businesses.name, contact: businesses.contact })
    .from(businesses)
    .where(isNotNull(businesses.contact));
  rows.forEach(r => console.log(r.id, JSON.stringify(r.contact), r.name));
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
