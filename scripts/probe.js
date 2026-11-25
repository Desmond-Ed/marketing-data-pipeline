import { getConfig } from '../src/config.js';

const cfg = getConfig();
const body = {
  name: 'lead_source',
  label: 'Lead Source (pipeline)',
  type: 'string',
  fieldType: 'text',
  groupName: 'contactinformation',
};
const variants = [
  ['/crm/v3/properties/contacts', body],
  ['/crm/v3/properties/contacts', { ...body, options: [] }],
  ['/crm/properties/2026-09/contacts', { ...body, options: [] }],
];

for (const [path, b] of variants) {
  const res = await fetch(cfg.hubspotBase + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.hubspotToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(b),
  });
  const text = await res.text();
  console.log(path, Object.keys(b).join(','), '->', res.status, text.slice(0, 500));
}