import { describe, it, expect } from 'vitest';
import { normalizeSource, transformContacts } from '../src/transform/contacts.js';

const ctx = { snapshotDate: '2026-11-25', extractedAt: '2026-11-25T05:00:00.000Z' };
const rec = (id, properties) => ({ id, properties });

describe('normalizeSource', () => {
  it('maps aliases and trims whitespace', () => {
    expect(normalizeSource(' FB ')).toBe('facebook');
    expect(normalizeSource('Google Ads')).toBe('google');
  });
  it('handles empty and unmapped values', () => {
    expect(normalizeSource('')).toBe('unknown');
    expect(normalizeSource(undefined)).toBe('unknown');
    expect(normalizeSource('tiktok')).toBe('other');
  });
});

describe('transformContacts', () => {
  it('rejects missing, invalid and duplicate emails with reasons', () => {
    const { rows, rejects } = transformContacts(
      [
        rec('1', { email: 'a@example.com' }),
        rec('2', {}),
        rec('3', { email: 'not-an-email' }),
        rec('4', { email: 'A@example.com' }),
      ],
      ctx,
    );
    expect(rows).toHaveLength(1);
    expect(rejects.map((r) => r.reason)).toEqual(['missing_email', 'invalid_email', 'duplicate_email']);
  });

  it('stores a hash and domain, never the raw email', () => {
    const { rows } = transformContacts([rec('1', { email: 'a@example.com' })], ctx);
    expect(rows[0].email_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0].email_domain).toBe('example.com');
    expect(JSON.stringify(rows[0])).not.toContain('a@example.com');
  });

  it('fills defaults and falls back to createdate for signup_date', () => {
    const { rows } = transformContacts(
      [rec('1', { email: 'a@example.com', createdate: '2026-11-20T10:00:00.000Z' })],
      ctx,
    );
    expect(rows[0].lead_source).toBe('unknown');
    expect(rows[0].lead_campaign).toBe('unknown');
    expect(rows[0].lifecycle_stage).toBe('unknown');
    expect(rows[0].signup_date).toBe('2026-11-20');
  });
});