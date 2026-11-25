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

  it('counts accepted contact rows separately from reject rows', async () => {
    const table = { exists: vi.fn().mockResolvedValue([true]) };
    const dataset = {
      get: vi.fn(),
      table: vi.fn(() => table),
    };
    dataset.get.mockResolvedValue([dataset]);
    const bq = { dataset: vi.fn(() => dataset), query: vi.fn() };
    const load = vi.fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    const extract = vi.fn(async function* () {
      yield [
        { id: '1', properties: { email: 'one@example.com' } },
        { id: '2', properties: { email: 'two@example.com' } },
        { id: '3', properties: { email: 'three@example.com' } },
        { id: '4', properties: { email: 'four@example.com' } },
        { id: '5', properties: {} },
      ];
    });
    const publish = vi.fn();

    const run = await runPipeline({
      cfg: {
        projectId: 'test-project',
        dataset: 'test',
        location: 'US',
        reportSheetId: 'test-sheet',
      },
      dryRun: false,
      createBigQuery: () => bq,
      extract,
      load,
      buildModels: vi.fn(),
      publish,
      logger: vi.fn(),
    });

    expect(run.rows_loaded).toBe(4);
    expect(run.rows_rejected).toBe(1);
    expect(load).toHaveBeenCalledTimes(3);
    expect(publish).toHaveBeenCalledWith({
      bq,
      cfg: expect.objectContaining({ reportSheetId: 'test-sheet' }),
    });
    expect(load.mock.invocationCallOrder[2]).toBeLessThan(publish.mock.invocationCallOrder[0]);
  });

  it('clears same-day partitions when a loaded table has no rows', async () => {
    const table = { exists: vi.fn().mockResolvedValue([true]) };
    const dataset = {
      get: vi.fn(),
      table: vi.fn(() => table),
    };
    dataset.get.mockResolvedValue([dataset]);
    const bq = { dataset: vi.fn(() => dataset), query: vi.fn() };
    const clear = vi.fn();
    const extract = vi.fn(async function* () {
      yield [
        { id: '1', properties: { email: 'one@example.com' } },
        { id: '2', properties: { email: 'two@example.com' } },
        { id: '3', properties: { email: 'three@example.com' } },
        { id: '4', properties: { email: 'four@example.com' } },
        { id: '5', properties: { email: 'five@example.com' } },
      ];
    });

    await runPipeline({
      cfg: { projectId: 'test-project', dataset: 'test', location: 'US' },
      dryRun: false,
      createBigQuery: () => bq,
      extract,
      load: vi.fn(),
      clear,
      buildModels: vi.fn(),
      logger: vi.fn(),
      now: () => new Date('2026-11-25T12:00:00.000Z'),
    });

    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(expect.objectContaining({
      tableName: 'contact_rejects',
      snapshotDate: '2026-11-25',
    }));
  });
});
