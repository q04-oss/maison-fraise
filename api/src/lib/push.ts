import { logger } from './logger';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// TODO: check notification_prefs before sending
export async function sendPushNotification(pushToken: string, payload: PushPayload): Promise<void> {
  if (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken[')) {
    logger.warn('Skipping push — not an Expo token (prefix: ' + pushToken.slice(0, 8) + '...)');
    return;
  }

  const message = {
    to: pushToken,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  };

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error('Push notification failed', { status: res.status, body: text });
  }
}
