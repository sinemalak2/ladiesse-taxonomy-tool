// Session helpers for the brand-facing onboarding wizard. Mirrors lib/auth.js
// (same Web Crypto approach, works in both Edge middleware and Node routes)
// but signs a brandId instead of an email, under a distinct cookie name —
// so a stolen staff session can't be replayed as a brand session or vice
// versa, even though both share AUTH_SECRET.

export const BRAND_SESSION_COOKIE_NAME = 'ladiesse_brand_session';
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

export async function createBrandSessionToken(brandId) {
  const key = await getKey();
  const expires = Date.now() + SESSION_TTL_MS;
  const payloadBytes = encoder.encode(`${brandId}|${expires}`);
  const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);
  return `${toBase64Url(payloadBytes)}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyBrandSessionToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payloadPart, signaturePart] = token.split('.');
  try {
    const key = await getKey();
    const payloadBytes = fromBase64Url(payloadPart);
    const signatureBytes = fromBase64Url(signaturePart);
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);
    if (!valid) return null;

    const [brandId, expiresStr] = new TextDecoder().decode(payloadBytes).split('|');
    if (Date.now() > Number(expiresStr)) return null;
    return { brandId };
  } catch {
    return null;
  }
}
