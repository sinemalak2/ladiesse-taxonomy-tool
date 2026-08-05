// Shared session helpers for the login gate. Runs in both the Edge
// middleware and Node API routes, so it only uses Web Crypto (`crypto.subtle`,
// `btoa`/`atob`), not Node's `crypto` module.

export const SESSION_COOKIE_NAME = 'ladiesse_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const encoder = new TextEncoder();

async function getKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isAllowedEmail(email) {
  const allowed = (process.env.SITE_ALLOWED_EMAIL || 'sinem@ladiesse.com').toLowerCase();
  return typeof email === 'string' && email.toLowerCase().trim() === allowed;
}

export async function createSessionToken(email) {
  const key = await getKey();
  const expires = Date.now() + SESSION_TTL_MS;
  const payloadBytes = encoder.encode(`${email}|${expires}`);
  const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);
  return `${toBase64Url(payloadBytes)}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payloadPart, signaturePart] = token.split('.');
  try {
    const key = await getKey();
    const payloadBytes = fromBase64Url(payloadPart);
    const signatureBytes = fromBase64Url(signaturePart);
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);
    if (!valid) return null;

    const [email, expiresStr] = new TextDecoder().decode(payloadBytes).split('|');
    if (Date.now() > Number(expiresStr)) return null;
    return { email };
  } catch {
    return null;
  }
}
