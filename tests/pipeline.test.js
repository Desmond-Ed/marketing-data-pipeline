import { afterEach, describe, it, expect, vi } from 'vitest';
import { runPipeline } from '../src/run.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runPipeline', () => {
  it('does not initialize or call BigQuery during a dry run', async () => {
    vi.stubEnv('DRY_RUN', '1');
    const createBigQuery = vi.fn(() => {
      throw new Error('BigQuery must not be initialized during a dry run');
    });
    const extract = vi.fn(async function* () {
      yield [{ id: '1', properties: { email: 'test@example.com' } }];
    });
    const load = vi.fn();
    const buildModels = vi.fn();
    const logger = vi.fn();

    const run = await runPipeline({
      cfg: { projectId: 'test-project', dataset: 'test', location: 'US' },
      createBigQuery,
      extract,
      load,
      buildModels,
      logger,
    });

    expect(run.status).toBe('success');
    expect(run.rows_extracted).toBe(1);
    expect(run.rows_loaded).toBe(0);
    expect(createBigQuery).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(buildModels).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith('info', 'dry_run_complete');
  });
});
