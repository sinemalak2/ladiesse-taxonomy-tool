// Encrypts Shopify access tokens before they touch the DB. No secrets
// manager exists in this stack (see schema comment on
// brand_platform_connections.access_token_ref) — AES-256-GCM with a key
// held only in the environment is the agreed substitute. Never returned to
// any client response; only ever decrypted server-side right before an
// outbound Shopify API call.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // bytes, standard for GCM

function getKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256');
  }
  return key;
}

// Stored format: "<iv-hex>:<authTag-hex>:<ciphertext-hex>" — three
// colon-separated hex strings, so the ciphertext round-trips through a
// plain TEXT column without any encoding ambiguity.
export function encryptToken(plaintext) {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptToken(stored) {
  const key = getKey();
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted token');
  const [ivHex, authTagHex, ciphertextHex] = parts;

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(), // throws if the auth tag doesn't verify — tampering detection
  ]);
  return plaintext.toString('utf8');
}
