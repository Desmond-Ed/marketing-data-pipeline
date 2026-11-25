import { describe, it, expect, vi } from 'vitest';
import { publishReports } from '../src/reports/sheets.js';

const cfg = {
  projectId: 'test-project',
  dataset: 'marketing',
  location: 'US',
  reportSheetId: 'test-sheet',
};

function makeSheets(titles = ['Leads by day', 'Funnel', 'Pipeline runs']) {
  return {
    spreadsheets: {
      get: vi.fn().mockResolvedValue({
        data: {
          sheets: titles.map((title, sheetId) => ({ properties: { title, sheetId } })),
        },
      }),
      batchUpdate: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeBigQuery({ leads = [], funnel = [], runs = [] } = {}) {
  return {
    query: vi.fn(async ({ query }) => {
      if (query.includes('rpt_leads_by_source_daily')) return [leads];
      if (query.includes('rpt_funnel')) return [funnel];
      if (query.includes('pipeline_runs')) return [runs];
      throw new Error('Unexpected report query');
    }),
  };
}

describe('publishReports', () => {
  it('publishes typed aggregate report data in one spreadsheet batch', async () => {
    const bq = makeBigQuery({
      leads: [{ signup_date: { value: '2026-11-25' }, lead_source: 'google', leads: '3' }],
      funnel: [{ lifecycle_stage: 'lead', stage_order: 2, lead_source: 'google', contacts: '3' }],
      runs: [{
        started_at: { value: '2026-11-25T05:15:00Z' },
        snapshot_date: { value: '2026-11-25' },
        status: 'success',
        rows_extracted: '3',
        rows_loaded: '3',
        rows_rejected: '0',
        duration_ms: '1200',
      }],
    });
    const sheets = makeSheets();
    const counts = await publishReports({ bq, cfg, createSheets: () => sheets });

    expect(counts).toEqual({ 'Leads by day': 1, Funnel: 1, 'Pipeline runs': 1 });
    expect(bq.query).toHaveBeenCalledTimes(3);
    expect(sheets.spreadsheets.batchUpdate).toHaveBeenCalledTimes(1);

    const { requestBody } = sheets.spreadsheets.batchUpdate.mock.calls[0][0];
    const leadWrite = requestBody.requests.find(
      (request) => request.updateCells?.start?.sheetId === 0,
    );
    expect(leadWrite.updateCells.rows[1].values[0].userEnteredValue.numberValue).toBe(46_351);
    expect(leadWrite.updateCells.rows[1].values[1].userEnteredValue.stringValue).toBe('google');
    expect(leadWrite.updateCells.rows[1].values[2].userEnteredValue.numberValue).toBe(3);
    expect(JSON.stringify(requestBody)).not.toContain('email_hash');
    expect(JSON.stringify(requestBody)).not.toContain('contact_id');
  });

  it('clears stale report rows and retains headers when query results are empty', async () => {
    const bq = makeBigQuery();
    const sheets = makeSheets();

    const counts = await publishReports({ bq, cfg, createSheets: () => sheets });

    expect(counts).toEqual({ 'Leads by day': 0, Funnel: 0, 'Pipeline runs': 0 });
    const { requestBody } = sheets.spreadsheets.batchUpdate.mock.calls[0][0];
    expect(requestBody.requests.filter((request) => request.updateCells?.rows?.length === 0))
      .toHaveLength(3);
  });

  it('surfaces spreadsheet API errors', async () => {
    const bq = makeBigQuery();
    const sheets = makeSheets();
    sheets.spreadsheets.batchUpdate.mockRejectedValue(new Error('Sheets API unavailable'));

    await expect(publishReports({ bq, cfg, createSheets: () => sheets }))
      .rejects.toThrow('Sheets API unavailable');
  });

  it('fails explicitly when a configured report tab is missing', async () => {
    const bq = makeBigQuery();
    const sheets = makeSheets(['Leads by day', 'Funnel']);

    await expect(publishReports({ bq, cfg, createSheets: () => sheets }))
      .rejects.toThrow('missing the "Pipeline runs" tab');
    expect(sheets.spreadsheets.batchUpdate).not.toHaveBeenCalled();
  });
});
