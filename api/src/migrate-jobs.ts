import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  await sql`
    CREATE TABLE IF NOT EXISTS job_postings (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      title TEXT NOT NULL,
      description TEXT,
      pay_cents INTEGER NOT NULL,
      pay_type TEXT NOT NULL DEFAULT 'hourly',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS job_applications (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES job_postings(id),
      applicant_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'applied',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(job_id, applicant_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS job_interviews (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL REFERENCES job_applications(id),
      scheduled_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS job_ledger_entries (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL REFERENCES job_applications(id) UNIQUE,
      employer_statement TEXT,
      candidate_statement TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  console.log('job tables created');
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
