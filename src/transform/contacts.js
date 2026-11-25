import { createHash } from 'node:crypto';

const SOURCE_ALIASES = {
  google: 'google', 'google ads': 'google', adwords: 'google',
  facebook: 'facebook', fb: 'facebook', meta: 'facebook',
  instagram: 'instagram', ig: 'instagram',
  linkedin: 'linkedin', li: 'linkedin',
  email: 'email', newsletter: 'email',
  organic: 'organic', direct: 'direct',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeSource(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return 'unknown';
  return SOURCE_ALIASES[key] ?? 'other';
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(/^\d+$/.test(String(value)) ? Number(value) : value);
  return Number.isNaN(d.getTime()) ? null : d;
}
const toDate = (v) => parseDate(v)?.toISOString().slice(0, 10) ?? null;
const toIso = (v) => parseDate(v)?.toISOString() ?? null;

export function transformContacts(records, { snapshotDate, extractedAt }) {
  const rows = [];
  const rejects = [];
  const seen = new Set();

  for (const rec of records) {
    const p = rec.properties ?? {};
    const reject = (reason) =>
      rejects.push({ snapshot_date: snapshotDate, contact_id: String(rec.id), reason, extracted_at: extractedAt });

    const email = String(p.email ?? '').trim().toLowerCase();
    if (!email) { reject('missing_email'); continue; }
    if (!EMAIL_RE.test(email)) { reject('invalid_email'); continue; }
    if (seen.has(email)) { reject('duplicate_email'); continue; }
    seen.add(email);

    rows.push({
      snapshot_date: snapshotDate,
      contact_id: String(rec.id),
      email_hash: createHash('sha256').update(email).digest('hex'),
      email_domain: email.split('@')[1],
      lifecycle_stage: p.lifecyclestage || 'unknown',
      lead_source: normalizeSource(p.lead_source),
      lead_campaign: String(p.lead_campaign ?? '').trim().toLowerCase() || 'unknown',
      signup_date: toDate(p.signup_date) ?? toDate(p.createdate),
      created_at: toIso(p.createdate),
      extracted_at: extractedAt,
    });
  }
  return { rows, rejects };
}