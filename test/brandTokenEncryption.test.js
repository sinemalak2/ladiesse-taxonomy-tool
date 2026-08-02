import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

describe('encryptToken / decryptToken', () => {
  before(() => {
    // A fixed 32-byte key so failures are reproducible, not randomly flaky.
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  });

  test('round-trips a plaintext token', async () => {
    const { encryptToken, decryptToken } = await import('../lib/brandTokenEncryption.js');
    const plaintext = 'shpat_abcdef1234567890';
    const encrypted = encryptToken(plaintext);
    assert.notEqual(encrypted, plaintext);
    assert.equal(decryptToken(encrypted), plaintext);
  });

  test('stored format is iv:authTag:ciphertext hex', async () => {
    const { encryptToken } = await import('../lib/brandTokenEncryption.js');
    const encrypted = encryptToken('some-token');
    const parts = encrypted.split(':');
    assert.equal(parts.length, 3);
    assert.equal(parts[0].length, 24); // 12-byte IV as hex
    assert.equal(parts[1].length, 32); // 16-byte GCM auth tag as hex
  });

  test('rejects a tampered ciphertext', async () => {
    const { encryptToken, decryptToken } = await import('../lib/brandTokenEncryption.js');
    const encrypted = encryptToken('some-token');
    const [iv, authTag, ciphertext] = encrypted.split(':');
    const tamperedLastChar = ciphertext.slice(0, -1) + (ciphertext.slice(-1) === '0' ? '1' : '0');
    const tampered = `${iv}:${authTag}:${tamperedLastChar}`;
    assert.throws(() => decryptToken(tampered));
  });

  test('throws when TOKEN_ENCRYPTION_KEY is missing', async () => {
    const { encryptToken } = await import('../lib/brandTokenEncryption.js');
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    try {
      assert.throws(() => encryptToken('x'), /TOKEN_ENCRYPTION_KEY is not set/);
    } finally {
      process.env.TOKEN_ENCRYPTION_KEY = original;
    }
  });
});
