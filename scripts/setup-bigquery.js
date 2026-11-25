import { BigQuery } from '@google-cloud/bigquery';
import { getConfig } from '../src/config.js';
import { CONTACT_SCHEMA, REJECT_SCHEMA, RUN_SCHEMA } from '../src/bigquery/schemas.js';

const cfg = getConfig();
const bq = new BigQuery({ projectId: cfg.projectId, location: cfg.location });

async function ensureTable(dataset, id, schema, partitionField) {
  const table = dataset.table(id);
  const [exists] = await table.exists();
  if (exists) { console.log(`exists: ${id}`); return; }
  await dataset.createTable(id, {
    schema,
    ...(partitionField && { timePartitioning: { type: 'DAY', field: partitionField } }),
  });
  console.log(`created: ${id}`);
}

const [dataset] = await bq.dataset(cfg.dataset, { location: cfg.location }).get({ autoCreate: true });
await ensureTable(dataset, 'contacts', CONTACT_SCHEMA, 'snapshot_date');
await ensureTable(dataset, 'contact_rejects', REJECT_SCHEMA, 'snapshot_date');
await ensureTable(dataset, 'pipeline_runs', RUN_SCHEMA);