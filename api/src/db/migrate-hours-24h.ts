/**
 * Migrate all ambiguous hours strings to explicit 24h format.
 * Run with: DATABASE_URL=<railway_url> npx tsx src/db/migrate-hours-24h.ts
 *
 * Strings that already use HH:MM (20:00) or explicit PM/AM markers are
 * already handled at display-time by formatHours24 in the iOS app.
 * This script fixes the ones that use plain numbers like "7–3" (7am–3pm).
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

const REPLACEMENTS: [string, string][] = [
  // Coffee shops / daytime
  ['Daily 7–3',                              'Daily 7–15'],
  ['Daily 8–3',                              'Daily 8–15'],
  ['Daily 8–4',                              'Daily 8–16'],
  ['Daily 8–5',                              'Daily 8–17'],
  ['Daily 9–7',                              'Daily 9–19'],
  ['Daily 12–10',                            'Daily 12–22'],
  ['Fri & Sun 10–4 · Sat 9–4 · Mon–Thu Closed',
   'Fri & Sun 10–16 · Sat 9–16 · Mon–Thu Closed'],
  ['Mon–Fri 7–3 · Closed holidays',          'Mon–Fri 7–15 · Closed holidays'],
  ['Mon–Fri 7–4 · Sat–Sun Closed',           'Mon–Fri 7–16 · Sat–Sun Closed'],
  ['Mon–Fri 7–5 · Sat 8–5 · Sun & Holidays 8–4',
   'Mon–Fri 7–17 · Sat 8–17 · Sun & Holidays 8–16'],
  ['Mon–Sat 9:30–6 · Sun 9:30–5',            'Mon–Sat 9–18 · Sun 9–17'],
  ['Mon–Sat 9–6 · Sun 9–5',                  'Mon–Sat 9–18 · Sun 9–17'],
  ['Mon–Fri 10–6 · Sat 10–5 · Sun 11–5',     'Mon–Fri 10–18 · Sat 10–17 · Sun 11–17'],
  ['Mon–Fri 11–10 · Sat 10–10 · Sun 10–9',   'Mon–Fri 11–22 · Sat 10–22 · Sun 10–21'],
  ['Mon–Fri 7:30–8 · Sat 9–4 · Sun Closed',  'Mon–Fri 7–20 · Sat 9–16 · Sun Closed'],
  ['Mon–Fri 9–6 · Sat–Sun 9–5 · Holidays 9–4',
   'Mon–Fri 9–18 · Sat–Sun 9–17 · Holidays 9–16'],
  ['Sat 8–3 · Sun 11–3',                     'Sat 8–15 · Sun 11–15'],
  ['Tues–Fri 8:00–3:00 · Sat–Sun 9:00–3:00 · Mon Closed',
   'Tues–Fri 8–15 · Sat–Sun 9–15 · Mon Closed'],
  ['Tue–Wed & Fri 7:30–3 · Thu 7:30–2 · Sat 9–2 · Mon & Sun Closed',
   'Tue–Wed & Fri 7–15 · Thu 7–14 · Sat 9–14 · Mon & Sun Closed'],
  ['Tue–Wed & Fri 10–6 · Thu 11–7 · Sat 10–5 · Sun 11–4 · Mon Closed · By appointment',
   'Tue–Wed & Fri 10–18 · Thu 11–19 · Sat 10–17 · Sun 11–16 · Mon Closed · By appointment'],
  ['Tue 9–6 · Wed–Fri 10–8 · Sat 10–6 · Mon & Sun Closed',
   'Tue 9–18 · Wed–Fri 10–20 · Sat 10–18 · Mon & Sun Closed'],
  ['Mon–Wed 10–6 · Thu 11–8 · Fri–Sat 11–6 · Sun & Holidays Closed',
   'Mon–Wed 10–18 · Thu 11–20 · Fri–Sat 11–18 · Sun & Holidays Closed'],
  ['Mon–Wed 10–6 · Thurs & Fri 10–7 · Sat 10–6 · Sun Closed',
   'Mon–Wed 10–18 · Thurs & Fri 10–19 · Sat 10–18 · Sun Closed'],
  ['Mon–Wed 11–6 · Thu–Sat 10–6 · Sun 12–5',
   'Mon–Wed 11–18 · Thu–Sat 10–18 · Sun 12–17'],
  ['Mon–Wed 11–6 · Thu–Sat 10–6 · Sun Closed',
   'Mon–Wed 11–18 · Thu–Sat 10–18 · Sun Closed'],

  // Restaurants / bars (afternoon/evening openings)
  ['Wed–Thu 3–10 · Fri–Sat 3–11 · Sun–Tue Closed',
   'Wed–Thu 15–22 · Fri–Sat 15–23 · Sun–Tue Closed'],
  ['Tue–Thu 3–10 · Fri–Sat 12–11 · Sun 12–10 · Mon Closed',
   'Tue–Thu 15–22 · Fri–Sat 12–23 · Sun 12–22 · Mon Closed'],
  ['Tue–Wed 11–6:30 · Thu–Fri 10–7 · Sat–Sun 9–7 · Mon Closed',
   'Tue–Wed 11–18 · Thu–Fri 10–19 · Sat–Sun 9–19 · Mon Closed'],
  ['Mon–Thu 11–10 · Fri–Sat 11–11 · Sun 4–10',
   'Mon–Thu 11–22 · Fri–Sat 11–23 · Sun 16–22'],
  ['Sun–Thu 11–10 · Fri–Sat 11–11',           'Sun–Thu 11–22 · Fri–Sat 11–23'],
  ['Tue–Sun 11–11 · Mon Closed',              'Tue–Sun 11–23 · Mon Closed'],

  // Seasonal
  ['Oct–Apr 11–9 daily · May–Sep 11–10 daily',
   'Oct–Apr 11–21 daily · May–Sep 11–22 daily'],
];

async function run() {
  let updated = 0;
  for (const [from, to] of REPLACEMENTS) {
    const result = await sql`
      UPDATE businesses SET hours = ${to} WHERE hours = ${from}
    `;
    const count = result.count ?? 0;
    if (count > 0) {
      console.log(`  ✓ ${count}×  "${from}" → "${to}"`);
      updated += count;
    }
  }
  console.log(`\nDone. ${updated} row(s) updated.`);
  await sql.end();
}

run().catch(e => { console.error(e); process.exit(1); });
