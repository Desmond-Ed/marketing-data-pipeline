import { hubspotFetch } from './client.js';

const PROPERTIES = [
  'email', 'lifecyclestage', 'createdate', 'lastmodifieddate',
  'lead_source', 'lead_campaign', 'signup_date',
];

export async function* extractContacts(cfg, { fetchImpl } = {}) {
  let after;
  do {
    const url = new URL(cfg.hubspotBase + cfg.contactsPath);
    url.searchParams.set('limit', '100');
    url.searchParams.set('properties', PROPERTIES.join(','));
    if (after) url.searchParams.set('after', after);
    const page = await hubspotFetch(url.toString(), {}, { token: cfg.hubspotToken, fetchImpl });
    yield page.results ?? [];
    after = page.paging?.next?.after;
  } while (after);
}