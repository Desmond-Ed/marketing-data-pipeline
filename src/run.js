import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BigQuery } from '@google-cloud/bigquery';
import { getConfig } from './config.js';
import { extractContacts } from './hubspot/extract.js';
import { transformContacts } from './transform/contacts.js';
import { loadNdjson } from './bigquery/load.js';
import { runModels } from './bigquery/model.js';
import { CONTACT_SCHEMA, REJECT_SCHEMA, RUN_SCHEMA } from './bigquery/schemas.js';
import { log } from './logger.js';

const MAX_REJECT_RATE = 0.2;

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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function runPipeline({
  cfg = getConfig(),
  dryRun = process.env.DRY_RUN === '1',
  createBigQuery = (config) => new BigQuery({ projectId: config.projectId, location: config.location }),
  extract = extractContacts,
  load = loadNdjson,
  buildModels = runModels,
  logger = log,
  now = () => new Date(),
} = {}) {
  const started = now();
  const startedAt = started.toISOString();
  const snapshotDate = startedAt.slice(0, 10);
  const runId = randomUUID();
  const run = {
    run_id: runId,
    started_at: startedAt,
    snapshot_date: snapshotDate,
    status: 'success',
    rows_extracted: 0,
    rows_loaded: 0,
    rows_rejected: 0,
    error: null,
  };
  let bq;
  let dataset;
  let runsTable;
  let runLogError;

  logger('info', 'run_start', { runId, snapshotDate, dryRun });

  try {
    if (!dryRun) {
      bq = createBigQuery(cfg);
      dataset = bq.dataset(cfg.dataset);
      [dataset] = await dataset.get({ autoCreate: true });
      await ensureTable(dataset, 'contacts', CONTACT_SCHEMA, 'snapshot_date');
      await ensureTable(dataset, 'contact_rejects', REJECT_SCHEMA, 'snapshot_date');
      runsTable = await ensureTable(dataset, 'pipeline_runs', RUN_SCHEMA);
    }

    const records = [];
    for await (const page of extract(cfg)) records.push(...page);
    run.rows_extracted = records.length;
    if (records.length === 0) throw new Error('Quality gate: extracted 0 records');

    const { rows, rejects } = transformContacts(records, {
      snapshotDate,
      extractedAt: startedAt,
    });
    run.rows_rejected = rejects.length;
    const rejectRate = rejects.length / records.length;
    logger('info', 'transform_done', {
      extracted: records.length,
      valid: rows.length,
      rejected: rejects.length,
    });
    if (rejectRate > MAX_REJECT_RATE) {
      throw new Error(`Quality gate: reject rate ${(rejectRate * 100).toFixed(1)}% is above the limit`);
    }

    if (dryRun) {
      logger('info', 'dry_run_complete');
    } else {
      const partition = snapshotDate.replaceAll('-', '');
      run.rows_loaded = await load({
        table: dataset.table(`contacts$${partition}`),
        rows,
        schema: CONTACT_SCHEMA,
        mode: 'replace',
      });
      await load({
        table: dataset.table(`contact_rejects$${partition}`),
        rows: rejects,
        schema: REJECT_SCHEMA,
        mode: 'replace',
      });
      await buildModels({ bq, cfg });
    }
  } catch (error) {
    run.status = 'failed';
    run.error = errorMessage(error).slice(0, 500);
    logger('error', 'run_failed', { runId, error: run.error });
  } finally {
    const finishedAt = now();
    run.finished_at = finishedAt.toISOString();
    run.duration_ms = finishedAt.getTime() - started.getTime();
    logger('info', 'run_finished', { ...run });

    if (!dryRun) {
      try {
        if (!runsTable) {
          if (!bq) bq = createBigQuery(cfg);
          if (!dataset) dataset = bq.dataset(cfg.dataset);
          runsTable = await ensureTable(dataset, 'pipeline_runs', RUN_SCHEMA);
        }
        await load({
          table: runsTable,
          rows: [run],
          schema: RUN_SCHEMA,
          mode: 'append',
        });
      } catch (error) {
        runLogError = error;
        logger('error', 'run_log_failed', { error: errorMessage(error) });
      }
    }
  }

  if (runLogError) throw runLogError;
  if (run.status === 'failed') throw new Error(run.error);
  return run;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPipeline().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
