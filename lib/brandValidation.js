// Shared validation for the brand onboarding wizard — used both client-side
// (instant feedback) and server-side (source of truth, per-step API routes
// re-validate everything the client already checked). Pure functions are
// exported individually so they can be unit tested and reused inside the
// zod .refine() calls below.

import { z } from 'zod';

// Powers of two for VKN digit positions 0-8 (2^(9-i)), precomputed to avoid
// floating-point Math.pow surprises — all integers well under Number.MAX_SAFE_INTEGER.
const VKN_POWERS = [512, 256, 128, 64, 32, 16, 8, 4, 2];

// Turkish company tax ID (Vergi Kimlik No), exactly 10 digits.
export function validateVKN(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{10}$/.test(s)) return false;
  const d = s.split('').map(Number);

  let total = 0;
  for (let i = 0; i < 9; i++) {
    const t1 = (d[i] + (9 - i)) % 10;
    let t2 = (t1 * VKN_POWERS[i]) % 9;
    if (t2 === 0 && t1 !== 0) t2 = 9;
    total += t2;
  }
  const checkDigit = (10 - (total % 10)) % 10;
  return checkDigit === d[9];
}

// Turkish individual ID (TC Kimlik No), exactly 11 digits.
export function validateTCKN(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{11}$/.test(s)) return false;
  const d = s.split('').map(Number);
  if (d[0] === 0) return false;

  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8];
  const evenSum = d[1] + d[3] + d[5] + d[7];
  // JS `%` can return negative results for a negative left operand (e.g.
  // -3 % 10 === -3) — the `+ 10) % 10` wraps that back into 0-9.
  const expectedD9 = ((7 * oddSum - evenSum) % 10 + 10) % 10;
  if (expectedD9 !== d[9]) return false;

  const first10Sum = d.slice(0, 10).reduce((a, b) => a + b, 0);
  const expectedD10 = first10Sum % 10;
  return expectedD10 === d[10];
}

// Dispatches to VKN (company, 10 digits) or TCKN (individual, 11 digits)
// based on length. Anything else is invalid.
export function validateTurkishTaxId(value) {
  const s = String(value ?? '').trim();
  if (/^\d{10}$/.test(s)) return validateVKN(s);
  if (/^\d{11}$/.test(s)) return validateTCKN(s);
  return false;
}

// ISO 7064 mod97-10 IBAN checksum. Works for any country's IBAN, not just
// Turkish ones — Turkish IBANs (TR + 24 digits, 26 chars total) are just
// the case this wizard actually needs.
export function validateIban(rawValue) {
  const iban = String(rawValue ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(iban)) return false;
  if (iban.length < 5 || iban.length > 34) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let numeric = '';
  for (const ch of rearranged) {
    if (ch >= '0' && ch <= '9') {
      numeric += ch;
    } else {
      // A=10, B=11, ..., Z=35 ('A'.charCodeAt(0) === 65, 65-55===10)
      numeric += String(ch.charCodeAt(0) - 55);
    }
  }

  let remainder = 0;
  for (const digitChar of numeric) {
    remainder = (remainder * 10 + Number(digitChar)) % 97;
  }
  return remainder === 1;
}

function boolMustBeTrue(message) {
  return z
    .boolean()
    .refine((v) => v === true, { message });
}

export const CATEGORY_OPTIONS = [
  'Ready-to-Wear',
  'Accessories',
  'Shoes',
  'Bags',
  'Art Tees',
  'Home Goods',
  'Other',
];

export const step1Schema = z.object({
  agreed_to_start: z.literal(true),
});

export const step2Schema = z.object({
  brand_name: z.string().trim().min(2, 'Required').max(100),
  category: z.enum(CATEGORY_OPTIONS),
  website_url: z
    .string()
    .trim()
    .regex(/^https?:\/\//, 'Must start with http:// or https://')
    .optional()
    .or(z.literal('')),
  instagram_handle: z
    .string()
    .trim()
    .transform((s) => s.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, ''))
    .refine((s) => s === '' || /^[\w.]{1,30}$/.test(s), 'Invalid Instagram handle')
    .optional()
    .or(z.literal('')),
});

export const step3Schema = z.object({
  full_name: z.string().trim().min(2, 'Required').max(100),
  phone_number: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, 'Use E.164 format with country code, e.g. +905551234567'),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  role: z.enum(['primary', 'billing', 'operations', 'other']).default('primary'),
});

export const step4Schema = z.object({
  legal_company_name: z.string().trim().min(2, 'Required').max(150),
  legal_address: z.string().trim().min(10, 'Enter the full address').max(500),
  tax_id: z
    .string()
    .trim()
    .refine(validateTurkishTaxId, 'Invalid VKN (10 digits) or TC Kimlik No (11 digits)'),
  tax_office: z.string().trim().min(2, 'Required').max(80),
  trade_registry_no: z.string().trim().max(30).optional().or(z.literal('')),
});

export const step5Schema = z.object({
  warehouse_address: z.string().trim().min(10, 'Enter the full address').max(500),
  avg_processing_days: z.coerce.number().int().min(1).max(14),
  shipping_carrier: z.string().trim().min(1, 'Required').max(100),
});

export const step6Schema = z.object({
  account_holder_name: z.string().trim().min(2, 'Required').max(200),
  iban: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, '').toUpperCase())
    .refine(validateIban, 'Invalid IBAN (checksum failed)'),
  bank_name: z.string().trim().min(2, 'Required').max(100),
});

export const step7Schema = z.object({
  signed_by_name: z.string().trim().min(2, 'Enter your full legal name').max(200),
  agreed_to_contract: boolMustBeTrue('You must agree to the contract to continue'),
});

export const step8Schema = z.object({
  platform: z.enum(['shopify']),
  shop_domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+\.myshopify\.com$/, 'Must be a valid .myshopify.com domain'),
});

export const STEP_SCHEMAS = {
  1: step1Schema,
  2: step2Schema,
  3: step3Schema,
  4: step4Schema,
  5: step5Schema,
  6: step6Schema,
  7: step7Schema,
  8: step8Schema,
};
