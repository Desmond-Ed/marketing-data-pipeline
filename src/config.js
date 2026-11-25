import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getConfig() {
  return {
    hubspotToken: required('HUBSPOT_TOKEN'),
    hubspotBase: process.env.HUBSPOT_BASE_URL ?? 'https://api.hubapi.com',
    contactsPath: process.env.HUBSPOT_CONTACTS_PATH ?? '/crm/v3/objects/contacts',
    projectId: required('GCP_PROJECT_ID'),
    dataset: process.env.BQ_DATASET ?? 'marketing',
    location: process.env.BQ_LOCATION ?? 'US',
  };
}