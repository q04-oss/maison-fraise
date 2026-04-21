import { Resend } from 'resend';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

export const resend = new Resend(process.env.RESEND_API_KEY);

// Returns the user's fraise.chat address if verified, otherwise their Apple email
export async function resolveEmailAddress(appleEmail: string): Promise<string> {
  try {
    const [user] = await db.select({ fraise_chat_email: users.fraise_chat_email })
      .from(users)
      .where(eq(users.email, appleEmail));
    return user?.fraise_chat_email ?? appleEmail;
  } catch {
    return appleEmail;
  }
}

const FROM = 'Box Fraise <orders@fraise.chat>';
const REPLY_TO = 'hello@fraise.chat';

const CHOCOLATE_LABELS: Record<string, string> = {
  guanaja_70: 'Guanaja 70%',
  caraibe_66: 'Caraïbe 66%',
  jivara_40: 'Jivara 40%',
  ivoire_blanc: 'Ivoire Blanc',
};

const FINISH_LABELS: Record<string, string> = {
  plain: 'Plain',
  fleur_de_sel: 'Fleur de Sel',
  or_fin: 'Or Fin',
};

function formatSlot(date: string, time: string): string {
  const d = new Date(date + 'T00:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} at ${time}`;
}

function row(label: string, value: string): string {
  return `
  <tr>
    <td style="padding:14px 0;border-bottom:1px solid #2A2A2E;">
      <p style="margin:0 0 5px;font-size:10px;color:#8A8A8E;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">${label}</p>
      <p style="margin:0;font-size:15px;color:#F2F2F7;font-family:Georgia,'Times New Roman',serif;">${value}</p>
    </td>
  </tr>`;
}

function baseTemplate(content: string, heading: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Box Fraise</title>
</head>
<body style="margin:0;padding:0;background:#111113;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111113;padding:48px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#0C0C0E;padding:32px 36px 28px;border-radius:14px 14px 0 0;border-bottom:1px solid #2A2A2E;">
              <p style="margin:0 0 8px;color:#C9973A;font-size:10px;letter-spacing:3px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Box Fraise</p>
              <p style="margin:0;color:#F2F2F7;font-size:26px;font-style:italic;line-height:1.3;font-family:Georgia,'Times New Roman',serif;">${heading}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#1A1A1C;padding:32px 36px 36px;border-radius:0 0 14px 14px;">
              ${content}
              <p style="margin:28px 0 0;font-size:11px;color:#5A5A5E;letter-spacing:0.3px;border-top:1px solid #2A2A2E;padding-top:20px;font-family:'Courier New',Courier,monospace;">
                Box Fraise &nbsp;·&nbsp; Marché Atwater, Montréal &nbsp;·&nbsp; <a href="https://fraise.chat" style="color:#C9973A;text-decoration:none;">fraise.chat</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendOrderConfirmation(params: {
  to: string;
  varietyName: string;
  chocolate: string | null;
  finish: string | null;
  quantity: number;
  isGift: boolean;
  totalCents: number;
  slotDate?: string;
  slotTime?: string;
}) {
  const { to, varietyName, chocolate, finish, quantity, isGift, totalCents, slotDate, slotTime } = params;
  const resolvedTo = await resolveEmailAddress(to);
  const total = (totalCents / 100).toFixed(2);
  const slot = slotDate && slotTime ? formatSlot(slotDate, slotTime) : null;

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${row('Strawberry', varietyName)}
      ${chocolate ? row('Chocolate', CHOCOLATE_LABELS[chocolate] ?? chocolate) : ''}
      ${finish ? row('Finish', FINISH_LABELS[finish] ?? finish) : ''}
      ${row('Quantity', String(quantity))}
      ${isGift ? row('Gift', 'Handwritten note included') : ''}
      ${slot ? row('Collection', slot) : ''}
    </table>

    <!-- Total card — amber on dark -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#C9973A;border-radius:12px;padding:18px 22px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0;font-size:10px;color:rgba(12,12,14,0.55);letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Total</p>
              </td>
              <td align="right">
                <p style="margin:0;font-size:22px;color:#0C0C0E;font-style:italic;font-family:Georgia,'Times New Roman',serif;">CA$${total}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:14px;color:rgba(242,242,247,0.5);line-height:1.8;font-family:Georgia,'Times New Roman',serif;">
      We'll dip your strawberries fresh when you arrive. Come to the chocolate counter at Marché Atwater — we'll have them ready.
    </p>
  `;

  await resend.emails.send({
    from: FROM,
    to: resolvedTo,
    replyTo: REPLY_TO,
    subject: `Your ${varietyName} — confirmed.`,
    html: baseTemplate(content, 'Order confirmed.'),
  });
}

export async function sendOrderReady(params: {
  to: string;
  varietyName: string;
  quantity: number;
  slotTime: string;
}) {
  const { to, varietyName, quantity, slotTime } = params;
  const resolvedTo = await resolveEmailAddress(to);

  const content = `
    <p style="margin:0 0 28px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      ${quantity}× <strong style="color:#F2F2F7;">${varietyName}</strong> — freshly dipped and waiting for you at the chocolate counter, Marché Atwater.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #2A2A2E;">
          <p style="margin:0 0 5px;font-size:10px;color:#8A8A8E;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Your slot</p>
          <p style="margin:0;font-size:15px;color:#F2F2F7;font-family:Georgia,'Times New Roman',serif;">${slotTime}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 0;">
          <p style="margin:0 0 5px;font-size:10px;color:#8A8A8E;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Where</p>
          <p style="margin:0;font-size:15px;color:#F2F2F7;font-family:Georgia,'Times New Roman',serif;">Marché Atwater · 138 Av. Atwater, Montréal</p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:rgba(242,242,247,0.38);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      Strawberries are best enjoyed within the hour. We look forward to seeing you.
    </p>
  `;

  await resend.emails.send({
    from: FROM,
    to: resolvedTo,
    replyTo: REPLY_TO,
    subject: 'Your order is ready.',
    html: baseTemplate(content, 'Your order is ready.'),
  });
}

export async function sendOrderQueued(params: {
  to: string;
  varietyName: string;
  chocolate: string | null;
  finish: string | null;
  quantity: number;
  totalCents: number;
}) {
  const { to, varietyName, chocolate, finish, quantity, totalCents } = params;
  const resolvedTo = await resolveEmailAddress(to);
  const total = (totalCents / 100).toFixed(2);
  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      Your order is in the queue. We'll notify you as soon as enough demand comes in to make your batch. Your card won't be charged until then.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${row('Strawberry', varietyName)}
      ${chocolate ? row('Chocolate', CHOCOLATE_LABELS[chocolate] ?? chocolate) : ''}
      ${finish ? row('Finish', FINISH_LABELS[finish] ?? finish) : ''}
      ${row('Quantity', String(quantity))}
      ${row('Amount held', `CA$${total}`)}
    </table>
    <p style="margin:0;font-size:13px;color:rgba(242,242,247,0.38);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      If your batch doesn't fill within 7 days, your hold will be released and you won't be charged.
    </p>
  `;
  await resend.emails.send({
    from: FROM, to: resolvedTo, replyTo: REPLY_TO,
    subject: `You're in the queue — ${varietyName}`,
    html: baseTemplate(content, 'You\'re in the queue.'),
  });
}

export async function sendBatchTriggered(params: {
  to: string;
  varietyName: string;
  chocolate: string | null;
  finish: string | null;
  quantity: number;
  totalCents: number;
  deliveryDate: string;
  locationName: string;
}) {
  const { to, varietyName, chocolate, finish, quantity, totalCents, deliveryDate, locationName } = params;
  const resolvedTo = await resolveEmailAddress(to);
  const total = (totalCents / 100).toFixed(2);
  const d = new Date(deliveryDate + 'T12:00:00');
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dateStr = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      Your batch is confirmed. Your card has been charged and your strawberries will be ready for collection on <strong style="color:#F2F2F7;">${dateStr}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${row('Strawberry', varietyName)}
      ${chocolate ? row('Chocolate', CHOCOLATE_LABELS[chocolate] ?? chocolate) : ''}
      ${finish ? row('Finish', FINISH_LABELS[finish] ?? finish) : ''}
      ${row('Quantity', String(quantity))}
      ${row('Collection', `${dateStr} · ${locationName}`)}
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#C9973A;border-radius:12px;padding:18px 22px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><p style="margin:0;font-size:10px;color:rgba(12,12,14,0.55);letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Total charged</p></td>
              <td align="right"><p style="margin:0;font-size:22px;color:#0C0C0E;font-style:italic;font-family:Georgia,'Times New Roman',serif;">CA$${total}</p></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:rgba(242,242,247,0.38);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      We'll have them freshly dipped and ready. See you then.
    </p>
  `;
  await resend.emails.send({
    from: FROM, to: resolvedTo, replyTo: REPLY_TO,
    subject: `Your batch is confirmed — ready ${dateStr}`,
    html: baseTemplate(content, 'Batch confirmed.'),
  });
}

export async function sendBatchReady(params: {
  to: string;
  varietyName: string;
  chocolate: string | null;
  finish: string | null;
  quantity: number;
  deliveryDate: string;
  locationName: string;
}) {
  const { to, varietyName, chocolate, finish, quantity, deliveryDate, locationName } = params;
  const resolvedTo = await resolveEmailAddress(to);
  const d = new Date(deliveryDate + 'T12:00:00');
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dateStr = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      Your strawberries are freshly dipped and ready for collection at <strong style="color:#F2F2F7;">${locationName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${row('Strawberry', varietyName)}
      ${chocolate ? row('Chocolate', CHOCOLATE_LABELS[chocolate] ?? chocolate) : ''}
      ${finish ? row('Finish', FINISH_LABELS[finish] ?? finish) : ''}
      ${row('Quantity', String(quantity))}
      ${row('Location', locationName)}
      ${row('Ready date', dateStr)}
    </table>
    <p style="margin:0;font-size:13px;color:rgba(242,242,247,0.38);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      Strawberries are best enjoyed fresh. Pick up within 3 days.
    </p>
  `;
  await resend.emails.send({
    from: FROM, to: resolvedTo, replyTo: REPLY_TO,
    subject: `Your strawberries are ready — ${locationName}`,
    html: baseTemplate(content, 'Ready for pickup.'),
  });
}

export async function sendOrderCancelled(params: {
  to: string;
  varietyName: string;
  quantity: number;
}) {
  const { to, varietyName, quantity } = params;
  const resolvedTo = await resolveEmailAddress(to);
  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      Your queued order for ${quantity}× <strong style="color:#F2F2F7;">${varietyName}</strong> didn't fill within 7 days. Your payment hold has been released — no charge was made.
    </p>
    <p style="margin:0;font-size:13px;color:rgba(242,242,247,0.38);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      You're welcome to order again any time.
    </p>
  `;
  await resend.emails.send({
    from: FROM, to: resolvedTo, replyTo: REPLY_TO,
    subject: `Order cancelled — ${varietyName}`,
    html: baseTemplate(content, 'Order not filled.'),
  });
}

export async function sendContractOffer(params: {
  to: string;
  businessName: string;
  neighbourhood: string | null;
  startsAt: Date;
  endsAt: Date;
}) {
  const { to, businessName, neighbourhood, startsAt, endsAt } = params;
  const resolvedTo = await resolveEmailAddress(to);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const fmt = (d: Date) => `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      You've been offered a placement at <strong style="color:#F2F2F7;">${businessName}</strong>${neighbourhood ? ` in ${neighbourhood}` : ''}. Open the app to accept or decline.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${row('Placement', businessName)}
      ${row('Starts', fmt(startsAt))}
      ${row('Ends', fmt(endsAt))}
    </table>
    <p style="margin:0;font-size:13px;color:rgba(242,242,247,0.38);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      Reply to this email with any questions.
    </p>
  `;
  await resend.emails.send({
    from: FROM, to: resolvedTo, replyTo: REPLY_TO,
    subject: `Placement offer — ${businessName}`,
    html: baseTemplate(content, 'You\'ve been placed.'),
  });
}

export async function sendNominationReceived(params: {
  to: string;
  nominatorName: string;
  popupName: string;
  popupDate: string | null;
}) {
  const { to, nominatorName, popupName, popupDate } = params;
  const resolvedTo = await resolveEmailAddress(to);
  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      <strong style="color:#F2F2F7;">${nominatorName}</strong> nominated you for <strong style="color:#F2F2F7;">${popupName}</strong>${popupDate ? ` on ${popupDate}` : ''}. Open the app to see the full nomination.
    </p>
    <p style="margin:0;font-size:13px;color:rgba(242,242,247,0.38);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      Nominations reflect the community's interest in having you at a Box Fraise event.
    </p>
  `;
  await resend.emails.send({
    from: FROM, to: resolvedTo, replyTo: REPLY_TO,
    subject: `You've been nominated — ${popupName}`,
    html: baseTemplate(content, 'You\'ve been nominated.'),
  });
}

export async function sendAuditionResult(params: {
  to: string;
  popupName: string;
  passed: boolean;
}) {
  const { to, popupName, passed } = params;
  const resolvedTo = await resolveEmailAddress(to);
  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      ${passed
        ? `<strong style="color:#F2F2F7;">${popupName}</strong> has been approved. You can now start inviting guests through the app.`
        : `<strong style="color:#F2F2F7;">${popupName}</strong> wasn't approved for this cycle. We'll be in touch if something changes.`
      }
    </p>
  `;
  await resend.emails.send({
    from: FROM, to: resolvedTo, replyTo: REPLY_TO,
    subject: passed ? `${popupName} — approved.` : `${popupName} — not approved.`,
    html: baseTemplate(content, passed ? 'Your popup passed.' : 'Audition result.'),
  });
}

export async function sendDailySummary(to: string, params: {
  orderCount: number;
  rsvpCount: number;
  lowStockVarieties: { name: string; stock_remaining: number }[];
}) {
  const { orderCount, rsvpCount, lowStockVarieties } = params;

  const lowStockRows = lowStockVarieties.length > 0
    ? lowStockVarieties.map(v => row(v.name, `${v.stock_remaining} remaining`)).join('')
    : '<tr><td style="padding:14px 0;"><p style="margin:0;font-size:15px;color:#F2F2F7;font-family:Georgia,\'Times New Roman\',serif;">All varieties adequately stocked.</p></td></tr>';

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${row('Orders today', String(orderCount))}
      ${row('Paid RSVPs today', String(rsvpCount))}
    </table>

    <p style="margin:0 0 12px;font-size:10px;color:#8A8A8E;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Low stock (≤ 3)</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${lowStockRows}
    </table>

    <p style="margin:0;font-size:13px;color:rgba(242,242,247,0.38);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      Generated automatically at 08:00 by Box Fraise.
    </p>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: 'Box Fraise — Daily Summary',
    html: baseTemplate(content, 'Daily summary.'),
  });
}

export async function sendTipReceived(params: {
  to: string;
  amount_cents: number;
  popup_name: string;
  tipper_name?: string;
}) {
  const { to, amount_cents, popup_name, tipper_name } = params;
  const resolvedTo = await resolveEmailAddress(to);
  const amount = (amount_cents / 100).toFixed(2);
  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${row('Amount', `CA$${amount}`)}
      ${row('Popup', popup_name)}
      ${tipper_name ? row('From', tipper_name) : ''}
    </table>
    <p style="margin:0;font-size:13px;color:rgba(242,242,247,0.38);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      Thank you for your presence at Box Fraise.
    </p>
  `;
  await resend.emails.send({
    from: FROM,
    to: resolvedTo,
    replyTo: REPLY_TO,
    subject: 'You received a tip',
    html: baseTemplate(content, `You received a CA$${amount} tip.`),
  });
}

export async function sendRsvpConfirmed(params: {
  to: string;
  popupName: string;
  popupDate: string | null;
  feeCents: number;
}) {
  const { to, popupName, popupDate, feeCents } = params;
  const resolvedTo = await resolveEmailAddress(to);
  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      You're confirmed for <strong style="color:#F2F2F7;">${popupName}</strong>${popupDate ? ` on ${popupDate}` : ''}.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${row('Event', popupName)}
      ${popupDate ? row('Date', popupDate) : ''}
      ${feeCents > 0 ? row('Entry', `CA$${(feeCents / 100).toFixed(2)}`) : ''}
    </table>
    <p style="margin:0;font-size:13px;color:rgba(242,242,247,0.38);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      We look forward to seeing you. Check the app for event details.
    </p>
  `;
  await resend.emails.send({
    from: FROM, to: resolvedTo, replyTo: REPLY_TO,
    subject: `You're in — ${popupName}`,
    html: baseTemplate(content, 'RSVP confirmed.'),
  });
}

export async function sendGiftNotification(params: {
  to: string;
  senderName: string;
  giftType: 'digital' | 'physical' | 'bundle';
  claimToken: string;
  businessName?: string;
}) {
  const { to, senderName, giftType, claimToken, businessName } = params;
  const TESTFLIGHT = 'https://testflight.apple.com/join/zJG1Wc5Y';
  const claimUrl = `https://fraise.box/claim/${claimToken}`;

  const stickerLabel = businessName ? `a ${businessName} sticker` : 'a strawberry sticker';
  const giftLabel = giftType === 'digital'
    ? `a digital ${stickerLabel}`
    : giftType === 'physical'
    ? `a physical ${stickerLabel} pack`
    : `a digital + physical ${stickerLabel} bundle`;

  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      <strong style="color:#F2F2F7;">${senderName}</strong> sent you ${giftLabel} on Box Fraise.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#C9973A;border-radius:12px;padding:20px 24px;">
          <p style="margin:0 0 6px;font-size:10px;color:rgba(12,12,14,0.55);letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Your claim code</p>
          <p style="margin:0;font-size:28px;color:#0C0C0E;font-family:'Courier New',Courier,monospace;letter-spacing:4px;">${claimToken}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 20px;font-size:14px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      Download the beta, create an account, and enter your code to claim your gift.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding-bottom:12px;">
          <a href="${TESTFLIGHT}" style="display:block;background:#F2F2F7;border-radius:10px;padding:16px 22px;text-decoration:none;text-align:center;">
            <span style="font-size:10px;color:#1A1A1C;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Download Box Fraise Beta →</span>
          </a>
        </td>
      </tr>
      <tr>
        <td>
          <a href="${claimUrl}" style="display:block;background:#1A1A1C;border:1px solid #2A2A2E;border-radius:10px;padding:16px 22px;text-decoration:none;text-align:center;">
            <span style="font-size:10px;color:#8A8A8E;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Or claim on web →</span>
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:12px;color:rgba(242,242,247,0.25);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      This gift was sent by someone you know. Box Fraise is a local discovery platform — fraise.box
    </p>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `${senderName} sent you a sticker`,
    html: baseTemplate(content, 'You received a gift.'),
  });
}

export async function sendOutreachNotification(params: {
  to: string;
  senderName: string;
  giftType: 'digital' | 'physical' | 'bundle';
  claimToken: string;
  businessName: string;
}) {
  const { to, senderName, giftType, claimToken, businessName } = params;
  const TESTFLIGHT = 'https://testflight.apple.com/join/zJG1Wc5Y';
  const claimUrl = `https://fraise.box/claim/${claimToken}`;

  const stickerLabel = giftType === 'digital' ? 'a digital sticker'
    : giftType === 'physical' ? 'a physical sticker pack'
    : 'a digital + physical sticker bundle';

  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      Someone named <strong style="color:#F2F2F7;">${senderName}</strong> sent ${businessName} ${stickerLabel} through Box Fraise — and thought you might want to know about us.
    </p>

    <p style="margin:0 0 24px;font-size:15px;color:rgba(242,242,247,0.55);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      Box Fraise is a local discovery platform — a small, early community of people who care about independent shops, cafés, and studios. We think ${businessName} would be a great fit.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#C9973A;border-radius:12px;padding:20px 24px;">
          <p style="margin:0 0 6px;font-size:10px;color:rgba(12,12,14,0.55);letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Your sticker claim code</p>
          <p style="margin:0;font-size:28px;color:#0C0C0E;font-family:'Courier New',Courier,monospace;letter-spacing:4px;">${claimToken}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 20px;font-size:14px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      Download the app to claim your sticker and see what Box Fraise is about. No pressure — just a hello from the community.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding-bottom:12px;">
          <a href="${TESTFLIGHT}" style="display:block;background:#F2F2F7;border-radius:10px;padding:16px 22px;text-decoration:none;text-align:center;">
            <span style="font-size:10px;color:#1A1A1C;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Download Box Fraise →</span>
          </a>
        </td>
      </tr>
      <tr>
        <td>
          <a href="${claimUrl}" style="display:block;background:#1A1A1C;border:1px solid #2A2A2E;border-radius:10px;padding:16px 22px;text-decoration:none;text-align:center;">
            <span style="font-size:10px;color:#8A8A8E;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Or claim on web →</span>
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:12px;color:rgba(242,242,247,0.25);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      Box Fraise — fraise.box
    </p>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `${senderName} sent ${businessName} a sticker`,
    html: baseTemplate(content, 'Someone thinks you\'d be a good fit.'),
  });
}

// @final-audit

export async function sendCreditNotification(params: {
  to: string;
  senderName: string;
  amountDollars: string;
  claimToken: string;
  note?: string;
}) {
  const { to, senderName, amountDollars, claimToken, note } = params;
  const TESTFLIGHT = 'https://testflight.apple.com/join/zJG1Wc5Y';
  const claimUrl = `https://fraise.box/claim-credit/${claimToken}`;

  const noteHtml = note
    ? `<p style="margin:0 0 24px;font-size:15px;color:rgba(242,242,247,0.45);font-style:italic;line-height:1.75;font-family:Georgia,'Times New Roman',serif;">"${note}"</p>`
    : '';

  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      <strong style="color:#F2F2F7;">${senderName}</strong> sent you <strong style="color:#F2F2F7;">CA$${amountDollars}</strong> in Box Fraise credit.
    </p>

    ${noteHtml}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#C9973A;border-radius:12px;padding:20px 24px;">
          <p style="margin:0 0 6px;font-size:10px;color:rgba(12,12,14,0.55);letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Your claim code</p>
          <p style="margin:0;font-size:28px;color:#0C0C0E;font-family:'Courier New',Courier,monospace;letter-spacing:4px;">${claimToken}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 16px;font-size:14px;color:rgba(242,242,247,0.45);line-height:1.75;font-family:'Courier New',Courier,monospace;">
      Credit applies automatically toward orders, stickers, and more in the app.
    </p>

    <a href="${TESTFLIGHT}" style="display:inline-block;background:transparent;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:12px 24px;font-family:'Courier New',Courier,monospace;font-size:11px;color:rgba(242,242,247,0.6);text-decoration:none;letter-spacing:1.5px;text-transform:uppercase;">Get the app →</a>
    <p style="margin:16px 0 0;font-size:12px;color:rgba(242,242,247,0.25);font-family:'Courier New',Courier,monospace;">Or claim at: ${claimUrl}</p>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `${senderName} sent you CA$${amountDollars} on Box Fraise`,
    html: baseTemplate(content, `CA$${amountDollars} is waiting for you.`),
  });
}

export async function sendBusinessDonationNotification(params: {
  to: string;
  businessName: string;
  amountDollars: string;
  yourEmail: string;
}) {
  const { to, businessName, amountDollars, yourEmail } = params;

  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:rgba(242,242,247,0.65);line-height:1.75;font-family:Georgia,'Times New Roman',serif;">
      Someone on Box Fraise sent <strong style="color:#F2F2F7;">${businessName}</strong> a donation of <strong style="color:#F2F2F7;">CA$${amountDollars}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#C9973A;border-radius:12px;padding:20px 24px;">
          <p style="margin:0 0 6px;font-size:10px;color:rgba(12,12,14,0.55);letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">To collect your funds</p>
          <p style="margin:0;font-size:16px;color:#0C0C0E;font-family:'Courier New',Courier,monospace;line-height:1.6;">Send an Interac e-transfer request to<br><strong>${yourEmail}</strong></p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:rgba(242,242,247,0.4);line-height:1.75;font-family:'Courier New',Courier,monospace;letter-spacing:0.2px;">
      Funds are held by Box Fraise and released upon request. If you have questions, reply to this email.
    </p>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `CA$${amountDollars} waiting for ${businessName}`,
    html: baseTemplate(content, 'Someone supports you.'),
  });
}
