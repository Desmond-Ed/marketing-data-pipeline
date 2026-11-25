import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// mode: 'replace' overwrites the target (use with a partition decorator), 'append' adds rows.
export async function loadNdjson({ table, rows, schema, mode }) {
  if (rows.length === 0) return 0;
  const dir = await mkdtemp(path.join(tmpdir(), 'mdp-'));
  const file = path.join(dir, 'rows.ndjson');
  try {
    await writeFile(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const [job] = await table.load(file, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      schema,
      writeDisposition: mode === 'replace' ? 'WRITE_TRUNCATE' : 'WRITE_APPEND',
    });
    const errors = job.status?.errors ?? [];
    if (errors.length > 0) {
      throw new Error(`BigQuery load errors: ${JSON.stringify(errors).slice(0, 400)}`);
    }
    return Number(job.statistics?.load?.outputRows ?? rows.length);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}