import { getConfig } from '../src/config.js';
import { hubspotFetch } from '../src/hubspot/client.js';

const cfg = getConfig();
const post = (path, body) =>
  hubspotFetch(cfg.hubspotBase + path, { method: 'POST', body: JSON.stringify(body) }, { token: cfg.hubspotToken });

const PROPS = [
  { name: 'lead_source', label: 'Lead Source (pipeline)', type: 'string', fieldType: 'text' },
  { name: 'lead_campaign', label: 'Lead Campaign (pipeline)', type: 'string', fieldType: 'text' },
  { name: 'signup_date', label: 'Signup Date (pipeline)', type: 'date', fieldType: 'date' },
];

const SOURCES = ['google', 'Google Ads', 'facebook', 'FB', 'instagram', 'linkedin', 'email', 'newsletter', 'organic', 'direct', '', 'tiktok'];
const CAMPAIGNS = ['black-friday', 'spring-launch', 'webinar-q4', 'retargeting', 'brand-search', ''];
const STAGES = ['subscriber', 'lead', 'lead', 'lead', 'marketingqualifiedlead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

for (const prop of PROPS) {
  try {
    await post('/crm/v3/properties/contacts', { ...prop, groupName: 'contactinformation' });
    console.log(`created property ${prop.name}`);
  } catch (err) {
    if (!String(err.message).includes(' 409 ')) throw err;
    console.log(`property exists: ${prop.name}`);
  }
}

const contacts = Array.from({ length: 300 }, (_, i) => ({
  properties: {
    firstname: `Test${i}`,
    ...(i % 20 === 0 ? {} : { email: `test.lead${i}@example.com` }), // 5% have no email
    lifecyclestage: pick(STAGES),
    lead_source: pick(SOURCES),
    lead_campaign: pick(CAMPAIGNS),
    signup_date: daysAgo(Math.floor(Math.random() * 45)),
  },
}));

for (let i = 0; i < contacts.length; i += 100) {
  await post('/crm/v3/objects/contacts/batch/create', { inputs: contacts.slice(i, i + 100) });
  console.log(`seeded ${Math.min(i + 100, contacts.length)} of ${contacts.length}`);
}