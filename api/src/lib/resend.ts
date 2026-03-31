import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Maison Fraise <orders@fraise.maison>';
const REPLY_TO = 'austin@fraise.maison';

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
  <title>Maison Fraise</title>
</head>
<body style="margin:0;padding:0;background:#111113;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111113;padding:48px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#0C0C0E;padding:32px 36px 28px;border-radius:14px 14px 0 0;border-bottom:1px solid #2A2A2E;">
              <p style="margin:0 0 8px;color:#C9973A;font-size:10px;letter-spacing:3px;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Maison Fraise</p>
              <p style="margin:0;color:#F2F2F7;font-size:26px;font-style:italic;line-height:1.3;font-family:Georgia,'Times New Roman',serif;">${heading}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#1A1A1C;padding:32px 36px 36px;border-radius:0 0 14px 14px;">
              ${content}
              <p style="margin:28px 0 0;font-size:11px;color:#5A5A5E;letter-spacing:0.3px;border-top:1px solid #2A2A2E;padding-top:20px;font-family:'Courier New',Courier,monospace;">
                Maison Fraise &nbsp;·&nbsp; Marché Atwater, Montréal &nbsp;·&nbsp; <a href="https://fraise.maison" style="color:#C9973A;text-decoration:none;">fraise.maison</a>
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
  chocolate: string;
  finish: string;
  quantity: number;
  isGift: boolean;
  totalCents: number;
  slotDate: string;
  slotTime: string;
}) {
  const { to, varietyName, chocolate, finish, quantity, isGift, totalCents, slotDate, slotTime } = params;
  const total = (totalCents / 100).toFixed(2);
  const slot = formatSlot(slotDate, slotTime);

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${row('Strawberry', varietyName)}
      ${row('Chocolate', CHOCOLATE_LABELS[chocolate] ?? chocolate)}
      ${row('Finish', FINISH_LABELS[finish] ?? finish)}
      ${row('Quantity', String(quantity))}
      ${isGift ? row('Gift', 'Handwritten note included') : ''}
      ${row('Collection', slot)}
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
    to,
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
    to,
    replyTo: REPLY_TO,
    subject: 'Your order is ready.',
    html: baseTemplate(content, 'Your order is ready.'),
  });
}
