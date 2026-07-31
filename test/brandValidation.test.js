import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateVKN,
  validateTCKN,
  validateTurkishTaxId,
  validateIban,
  step3Schema,
} from '../lib/brandValidation.js';

describe('validateVKN', () => {
  test('accepts a valid 10-digit VKN', () => {
    assert.equal(validateVKN('1234567890'), true);
  });

  test('rejects a wrong check digit', () => {
    assert.equal(validateVKN('1234567891'), false);
  });

  test('rejects the wrong length', () => {
    assert.equal(validateVKN('123456789'), false);
  });

  test('rejects non-digit input', () => {
    assert.equal(validateVKN('12345abcde'), false);
  });
});

describe('validateTCKN', () => {
  test('accepts a valid 11-digit TCKN', () => {
    assert.equal(validateTCKN('12345678950'), true);
  });

  test('rejects a leading zero', () => {
    assert.equal(validateTCKN('02345678900'), false);
  });

  test('rejects a wrong 10th digit', () => {
    assert.equal(validateTCKN('12345678900'), false);
  });

  test('rejects a wrong 11th digit', () => {
    assert.equal(validateTCKN('12345678951'), false);
  });

  test('rejects the wrong length', () => {
    assert.equal(validateTCKN('1234567895'), false);
  });
});

describe('validateTurkishTaxId', () => {
  test('dispatches a 10-digit value to VKN', () => {
    assert.equal(validateTurkishTaxId('1234567890'), true);
  });

  test('dispatches an 11-digit value to TCKN', () => {
    assert.equal(validateTurkishTaxId('12345678950'), true);
  });

  test('rejects a 9-digit value', () => {
    assert.equal(validateTurkishTaxId('123456789'), false);
  });

  test('rejects non-numeric input', () => {
    assert.equal(validateTurkishTaxId('not-a-tax-id'), false);
  });
});

describe('validateIban', () => {
  test('accepts a valid Turkish IBAN', () => {
    assert.equal(validateIban('TR330006100519786457841326'), true);
  });

  test('accepts the same IBAN with spaces', () => {
    assert.equal(validateIban('TR33 0006 1005 1978 6457 8413 26'), true);
  });

  test('accepts lowercase input', () => {
    assert.equal(validateIban('tr330006100519786457841326'), true);
  });

  test('rejects a tampered checksum', () => {
    assert.equal(validateIban('TR330006100519786457841327'), false);
  });

  test('rejects a malformed country/check-digit prefix', () => {
    assert.equal(validateIban('1R330006100519786457841326'), false);
  });
});

describe('step3Schema (E.164 phone)', () => {
  const base = { full_name: 'Test Rep', email: 'rep@example.com', role: 'primary' };

  test('accepts a properly formatted international number', () => {
    const result = step3Schema.safeParse({ ...base, phone_number: '+905551234567' });
    assert.equal(result.success, true);
  });

  test('rejects a number missing the country code plus sign', () => {
    const result = step3Schema.safeParse({ ...base, phone_number: '05551234567' });
    assert.equal(result.success, false);
  });

  test('rejects a leading zero right after the plus sign', () => {
    const result = step3Schema.safeParse({ ...base, phone_number: '+0901234567' });
    assert.equal(result.success, false);
  });
});
