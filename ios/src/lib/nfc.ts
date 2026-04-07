import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';

let started = false;

async function ensureStarted() {
  if (!started) {
    await NfcManager.start();
    started = true;
  }
}

export async function readNfcToken(): Promise<string> {
  await ensureStarted();
  await NfcManager.requestTechnology(NfcTech.Ndef);
  const tag = await NfcManager.getTag();
  const record = tag?.ndefMessage?.[0];
  if (!record) throw new Error('No NDEF record found');
  const payload = Ndef.text.decodePayload(new Uint8Array(record.payload));
  if (!payload) throw new Error('Empty NFC payload');
  return payload.trim();
}

export async function writeNfcToken(token: string): Promise<void> {
  await ensureStarted();
  await NfcManager.requestTechnology(NfcTech.Ndef);
  try {
    const bytes = Ndef.encodeMessage([Ndef.textRecord(token)]);
    if (!bytes) throw new Error('Failed to encode NDEF message');
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export async function cancelNfc() {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {}
}
