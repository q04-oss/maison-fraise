import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { resend } from '../lib/resend';
import { requireUser } from '../lib/auth';
import { sendPushNotification } from '../lib/push';
import crypto from 'crypto';

const router = Router();

const FROM = 'Box Fraise <hello@fraise.chat>';

// ─── Boot-time migration ──────────────────────────────────────────────────────
db.execute(sql`
  CREATE TABLE IF NOT EXISTS business_proposals (
    id serial PRIMARY KEY,
    proposed_by_user_id integer NOT NULL REFERENCES users(id),
    proposed_by_name text,
    business_name text NOT NULL,
    business_address text,
    business_type text NOT NULL DEFAULT 'partner',
    business_email text,
    instagram_handle text,
    note text,
    claim_token text UNIQUE NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    claimed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`).catch(() => {});

// ─── Submit a proposal ────────────────────────────────────────────────────────

// POST /api/proposals
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { business_name, business_address, business_type, business_email, instagram_handle, note } = req.body;

  if (!business_name?.trim()) {
    res.status(400).json({ error: 'business_name required' }); return;
  }

  try {
    // Get proposer's display name
    const userRows = await db.execute(sql`SELECT display_name FROM users WHERE id = ${userId} LIMIT 1`);
    const proposerName: string = (((userRows as any).rows ?? userRows)[0] as any)?.display_name ?? 'someone';

    const claimToken = crypto.randomBytes(20).toString('hex');

    await db.execute(sql`
      INSERT INTO business_proposals
        (proposed_by_user_id, proposed_by_name, business_name, business_address,
         business_type, business_email, instagram_handle, note, claim_token)
      VALUES
        (${userId}, ${proposerName}, ${business_name.trim()},
         ${business_address?.trim() ?? null}, ${business_type ?? 'partner'},
         ${business_email?.trim() ?? null}, ${instagram_handle?.trim() ?? null},
         ${note?.trim() ?? null}, ${claimToken})
    `);

    // Send email to the business if an email was provided
    if (business_email?.trim()) {
      const claimUrl = `${process.env.API_BASE_URL ?? 'https://api.fraise.chat'}/proposal/${claimToken}`;
      await resend.emails.send({
        from: FROM,
        to: business_email.trim(),
        replyTo: 'hello@fraise.chat',
        subject: `${proposerName} thinks ${business_name.trim()} belongs on Box Fraise`,
        html: proposalEmail({ proposerName, businessName: business_name.trim(), note: note?.trim() ?? null, claimUrl }),
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/proposals — proposals submitted by the current user
router.get('/', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db.execute(sql`
      SELECT id, business_name, business_address, business_type,
             instagram_handle, status, created_at
      FROM business_proposals
      WHERE proposed_by_user_id = ${userId}
      ORDER BY created_at DESC
    `);
    res.json((rows as any).rows ?? rows);
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// ─── Claim landing page (for the business) ───────────────────────────────────

// GET /proposal/:token — HTML landing page
router.get('/claim/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const rows = await db.execute(sql`
      SELECT bp.id, bp.business_name, bp.business_address, bp.proposed_by_name,
             bp.note, bp.status, bp.instagram_handle
      FROM business_proposals bp
      WHERE bp.claim_token = ${token}
      LIMIT 1
    `);
    const proposal = ((rows as any).rows ?? rows)[0] as any;
    if (!proposal) { res.status(404).send('<h1>Not found</h1>'); return; }

    res.send(claimPage(proposal));
  } catch { res.status(500).send('<h1>Error</h1>'); }
});

// POST /api/proposals/claim/:token — business expresses interest
router.post('/claim/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  const { contact_email, contact_name } = req.body;
  try {
    const rows = await db.execute(sql`
      UPDATE business_proposals
      SET status = 'interested', claimed_at = now()
      WHERE claim_token = ${token} AND status = 'pending'
      RETURNING business_name, proposed_by_name, proposed_by_user_id
    `);
    const updated = ((rows as any).rows ?? rows)[0] as any;
    if (!updated) { res.status(404).json({ error: 'not_found' }); return; }

    // Push the proposer — fire and forget
    if (updated.proposed_by_user_id) {
      db.execute(sql`SELECT push_token FROM users WHERE id = ${updated.proposed_by_user_id} LIMIT 1`)
        .then(r => {
          const token = (((r as any).rows ?? r)[0] as any)?.push_token;
          if (token) sendPushNotification(token, {
            title: `${updated.business_name} is interested`,
            body: `Your nomination was noticed — they want to be on Box Fraise.`,
            data: { screen: 'proposals' },
          }).catch(() => {});
        }).catch(() => {});
    }

    // Notify the team
    await resend.emails.send({
      from: FROM,
      to: 'hello@fraise.chat',
      subject: `${updated.business_name} is interested in Box Fraise`,
      html: `<p><strong>${updated.business_name}</strong> clicked the claim link from ${updated.proposed_by_name}'s proposal.</p>
             ${contact_name ? `<p>Contact: ${contact_name}</p>` : ''}
             ${contact_email ? `<p>Email: ${contact_email}</p>` : ''}`,
    }).catch(() => {});

    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'internal_error' }); }
});

// ─── Email template ───────────────────────────────────────────────────────────

function proposalEmail({ proposerName, businessName, note, claimUrl }: {
  proposerName: string;
  businessName: string;
  note: string | null;
  claimUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Box Fraise</title>
</head>
<body style="margin:0;padding:0;background:#FAF9F7;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;padding:60px 32px;">
    <p style="margin:0 0 48px;font-size:12px;letter-spacing:2px;color:#8A8A8E;font-family:'Courier New',Courier,monospace;text-transform:uppercase;">Box Fraise</p>

    <h1 style="margin:0 0 24px;font-size:28px;font-weight:normal;color:#1C1C1E;line-height:1.3;">
      ${proposerName} thinks ${businessName} belongs here.
    </h1>

    <p style="margin:0 0 20px;font-size:16px;color:#3A3A3C;line-height:1.7;">
      Box Fraise is a platform for independent businesses that have something worth tasting. We connect curious people with places that care about what they make.
    </p>

    ${note ? `<p style="margin:0 0 20px;font-size:15px;color:#6A6A6E;line-height:1.7;font-style:italic;border-left:2px solid #E5E1DA;padding-left:16px;">"${note}"<br><span style="font-size:12px;font-family:'Courier New',Courier,monospace;font-style:normal;">— ${proposerName}</span></p>` : ''}

    <p style="margin:0 0 32px;font-size:16px;color:#3A3A3C;line-height:1.7;">
      Being on Box Fraise starts with the social layer — your business appears on the map, people can save you to their curated city guides, and your regulars can show you off to their network.
    </p>

    <a href="${claimUrl}" style="display:inline-block;background:#1C1C1E;color:#FAF9F7;text-decoration:none;padding:14px 28px;font-size:12px;letter-spacing:1.5px;font-family:'Courier New',Courier,monospace;text-transform:uppercase;">
      See what this means for ${businessName}
    </a>

    <p style="margin:48px 0 0;font-size:12px;color:#8A8A8E;line-height:1.6;">
      You received this because ${proposerName} nominated you. No obligation — this is just an introduction.<br>
      Questions? Reply to this email or write to <a href="mailto:hello@fraise.chat" style="color:#8A8A8E;">hello@fraise.chat</a>
    </p>
  </div>
</body>
</html>`;
}

// ─── Claim landing page HTML ──────────────────────────────────────────────────

function claimPage(proposal: any): string {
  const claimed = proposal.status !== 'pending';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${proposal.business_name} — Box Fraise</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,serif;background:#FAF9F7;color:#1C1C1E;padding:0 24px}
    .wrap{max-width:560px;margin:0 auto;padding:80px 0 120px}
    .brand{font-size:12px;letter-spacing:2px;color:#8A8A8E;text-transform:uppercase;font-family:'Courier New',monospace;margin-bottom:60px}
    h1{font-size:32px;font-weight:normal;margin-bottom:16px;line-height:1.3}
    .sub{font-size:16px;color:#6A6A6E;line-height:1.7;margin-bottom:32px}
    .note{font-style:italic;color:#6A6A6E;border-left:2px solid #E5E1DA;padding-left:16px;margin-bottom:32px;font-size:15px;line-height:1.7}
    .note span{display:block;font-style:normal;font-size:11px;font-family:'Courier New',monospace;margin-top:8px;color:#8A8A8E}
    label{display:block;font-size:10px;letter-spacing:1.5px;font-family:'Courier New',monospace;text-transform:uppercase;color:#8A8A8E;margin-bottom:6px;margin-top:20px}
    input{width:100%;padding:12px;border:1px solid #E5E1DA;background:#fff;font-family:Georgia,serif;font-size:15px;color:#1C1C1E;outline:none}
    input:focus{border-color:#1C1C1E}
    button{margin-top:24px;background:#1C1C1E;color:#FAF9F7;border:none;padding:14px 28px;font-size:11px;letter-spacing:1.5px;font-family:'Courier New',monospace;text-transform:uppercase;cursor:pointer}
    .done{font-size:16px;color:#3A3A3C;line-height:1.7;padding:24px;border:1px solid #E5E1DA;background:#fff}
  </style>
</head>
<body>
<div class="wrap">
  <div class="brand">Box Fraise</div>
  <h1>${proposal.business_name}</h1>
  ${claimed
    ? `<div class="done">We've received your response and will be in touch shortly. Thank you.</div>`
    : `<p class="sub">${proposal.proposed_by_name} nominated you for Box Fraise — a platform for independent businesses worth discovering.</p>
       ${proposal.note ? `<p class="note">"${proposal.note}"<span>— ${proposal.proposed_by_name}</span></p>` : ''}
       <p class="sub">If you're interested in being on the map, leave your details and we'll reach out.</p>
       <form method="POST">
         <label>Your name</label>
         <input type="text" name="contact_name" placeholder="Name" />
         <label>Best email to reach you</label>
         <input type="email" name="contact_email" placeholder="email@example.com" required />
         <button type="submit">I'm interested</button>
       </form>`
  }
</div>
</body>
</html>`;
}

export default router;

// @final-audit
