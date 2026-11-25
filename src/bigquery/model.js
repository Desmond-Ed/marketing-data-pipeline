import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { log } from '../logger.js';

export async function runModels({ bq, cfg, dir = 'sql' }) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = (await readFile(path.join(dir, file), 'utf8'))
      .replaceAll('{{project}}', cfg.projectId)
      .replaceAll('{{dataset}}', cfg.dataset);
    await bq.query({ query: sql, location: cfg.location });
    log('info', 'model_built', { file });
  }
}