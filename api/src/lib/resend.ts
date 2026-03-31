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

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Maison Fraise</title>
</head>
<body style="margin:0;padding:0;background:#E8E0D0;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#E8E0D0;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#1C3A2A;padding:36px 40px;border-radius:14px 14px 0 0;">
              <p style="margin:0;color:rgba(255,255,255,0.45);font-size:11px;letter-spacing:3px;text-transform:uppercase;">Maison Fraise</p>
              <p style="margin:8px 0 0;color:#E8E0D0;font-size:28px;font-style:italic;line-height:1.2;">Marché Atwater</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#EDE6D8;padding:36px 40px;border-radius:0 0 14px 14px;">
              ${content}
              <p style="margin:32px 0 0;font-size:12px;color:#888880;border-top:1px solid #D0C8B8;padding-top:24px;">
                Maison Fraise · Marché Atwater, Montréal · <a href="https://fraise.maison" style="color:#1C3A2A;">fraise.maison</a>
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
    <p style="margin:0 0 6px;color:#888880;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Order confirmed</p>
    <p style="margin:0 0 28px;color:#1a1a1a;font-size:24px;font-style:italic;">${varietyName}</p>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #D0C8B8;">
          <span style="font-size:11px;color:#888880;letter-spacing:1.5px;text-transform:uppercase;">Chocolate</span><br/>
          <span style="font-size:15px;color:#1a1a1a;">${CHOCOLATE_LABELS[chocolate] ?? chocolate}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #D0C8B8;">
          <span style="font-size:11px;color:#888880;letter-spacing:1.5px;text-transform:uppercase;">Finish</span><br/>
          <span style="font-size:15px;color:#1a1a1a;">${FINISH_LABELS[finish] ?? finish}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #D0C8B8;">
          <span style="font-size:11px;color:#888880;letter-spacing:1.5px;text-transform:uppercase;">Quantity</span><br/>
          <span style="font-size:15px;color:#1a1a1a;">${quantity}</span>
        </td>
      </tr>
      ${isGift ? `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #D0C8B8;">
          <span style="font-size:11px;color:#888880;letter-spacing:1.5px;text-transform:uppercase;">Gift</span><br/>
          <span style="font-size:15px;color:#1a1a1a;">Handwritten note included</span>
        </td>
      </tr>` : ''}
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #D0C8B8;">
          <span style="font-size:11px;color:#888880;letter-spacing:1.5px;text-transform:uppercase;">Collection</span><br/>
          <span style="font-size:15px;color:#1a1a1a;">${slot}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;">
          <span style="font-size:11px;color:#888880;letter-spacing:1.5px;text-transform:uppercase;">Total</span><br/>
          <span style="font-size:20px;color:#1C3A2A;font-style:italic;">CA$${total}</span>
        </td>
      </tr>
    </table>

    <p style="margin:28px 0 0;font-size:14px;color:#444;line-height:1.7;">
      We'll dip your strawberries fresh when you arrive. Come to the chocolate counter at Marché Atwater — we'll have them ready.
    </p>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `Your ${varietyName} — confirmed.`,
    html: baseTemplate(content),
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
    <p style="margin:0 0 6px;color:#888880;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Ready for collection</p>
    <p style="margin:0 0 28px;color:#1a1a1a;font-size:24px;font-style:italic;">Your order is ready.</p>

    <p style="margin:0 0 24px;font-size:16px;color:#1a1a1a;line-height:1.7;">
      ${quantity}× <strong>${varietyName}</strong> — freshly dipped and waiting for you at the chocolate counter, Marché Atwater.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #D0C8B8;">
          <span style="font-size:11px;color:#888880;letter-spacing:1.5px;text-transform:uppercase;">Your slot</span><br/>
          <span style="font-size:15px;color:#1a1a1a;">${slotTime}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;">
          <span style="font-size:11px;color:#888880;letter-spacing:1.5px;text-transform:uppercase;">Where</span><br/>
          <span style="font-size:15px;color:#1a1a1a;">Marché Atwater · 138 Av. Atwater, Montréal</span>
        </td>
      </tr>
    </table>

    <p style="margin:28px 0 0;font-size:13px;color:#888880;line-height:1.7;">
      Strawberries are best enjoyed within the hour. We look forward to seeing you.
    </p>
  `;

  await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: 'Your order is ready.',
    html: baseTemplate(content),
  });
}
