import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { BigQuery } from '@google-cloud/bigquery';
import { getConfig } from './config.js';
import { extractContacts } from './hubspot/extract.js';
import { transformContacts } from './transform/contacts.js';
import { loadNdjson } from './bigquery/load.js';
import { runModels } from './bigquery/model.js';
import { CONTACT_SCHEMA, REJECT_SCHEMA, RUN_SCHEMA } from './bigquery/schemas.js';
import { log } from './logger.js';

const cfg = getConfig();
const bq = new BigQuery({ projectId: cfg.projectId, location: cfg.location });

async function ensureTable(dataset, id, schema, partitionField) {
  const table = dataset.table(id);
  const [exists] = await table.exists();
  if (!exists) {
    await dataset.createTable(id, {
      schema,
      ...(partitionField && { timePartitioning: { type: 'DAY', field: partitionField } }),
    });
  }
  return table;
}

async function main() {
  const started = Date.now();
  const startedAt = new Date().toISOString();
  const snapshotDate = startedAt.slice(0, 10);
  const runId = randomUUID();
  let runStatus = 'success';
  let runError = null;
  let rowsExtracted = 0;
  let rowsLoaded = 0;
  let rowsRejected = 0;

  const [dataset] = await bq.dataset(cfg.dataset, { location: cfg.location }).get({ autoCreate: true });
  await ensureTable(dataset, 'contacts', CONTACT_SCHEMA, 'snapshot_date');
  await ensureTable(dataset, 'contact_rejects', REJECT_SCHEMA, 'snapshot_date');
  const runsTable = await ensureTable(dataset, 'pipeline_runs', RUN_SCHEMA);

  try {
    const records = [];
    for await (const page of extractContacts(cfg)) {
      records.push(...page);
    }
    rowsExtracted = records.length;

    const transformed = transformContacts(records, {
      snapshotDate,
      extractedAt: startedAt,
    });
    rowsRejected = transformed.rejects.length;

    const partitionSuffix = snapshotDate.replaceAll('-', '');
    rowsLoaded =
      (await loadNdjson({
        table: dataset.table(`contacts$${partitionSuffix}`),
        rows: transformed.rows,
        schema: CONTACT_SCHEMA,
        mode: 'replace',
      })) +
      (await loadNdjson({
        table: dataset.table(`contact_rejects$${partitionSuffix}`),
        rows: transformed.rejects,
        schema: REJECT_SCHEMA,
        mode: 'replace',
      }));

    await runModels({ bq, cfg });
  } catch (error) {
    runStatus = 'failed';
    runError = error instanceof Error ? error.message : String(error);
  } finally {
    await loadNdjson({
      table: runsTable,
      rows: [{
        run_id: runId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        snapshot_date: snapshotDate,
        status: runStatus,
        rows_extracted: rowsExtracted,
        rows_loaded: rowsLoaded,
        rows_rejected: rowsRejected,
        duration_ms: Date.now() - started,
        error: runError,
      }],
      schema: RUN_SCHEMA,
      mode: 'append',
    });
  }

  log(runStatus === 'success' ? 'info' : 'error', 'pipeline_finished', {
    run_id: runId,
    status: runStatus,
    rows_extracted: rowsExtracted,
    rows_loaded: rowsLoaded,
    rows_rejected: rowsRejected,
  });

  if (runStatus === 'failed') throw new Error(runError);
}

await main();
