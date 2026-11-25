import { google } from 'googleapis';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const REPORTS = [
  {
    title: 'Leads by day',
    query: (cfg) => `
      SELECT signup_date, lead_source, leads
      FROM \`${cfg.projectId}.${cfg.dataset}.rpt_leads_by_source_daily\`
      ORDER BY signup_date, lead_source`,
    headers: ['signup_date', 'lead_source', 'leads'],
    columns: [
      { key: 'signup_date', type: 'date' },
      { key: 'lead_source', type: 'string' },
      { key: 'leads', type: 'number' },
    ],
  },
  {
    title: 'Funnel',
    query: (cfg) => `
      SELECT lifecycle_stage, stage_order, lead_source, contacts
      FROM \`${cfg.projectId}.${cfg.dataset}.rpt_funnel\`
      ORDER BY stage_order, lead_source`,
    headers: ['lifecycle_stage', 'stage_order', 'lead_source', 'contacts'],
    columns: [
      { key: 'lifecycle_stage', type: 'string' },
      { key: 'stage_order', type: 'number' },
      { key: 'lead_source', type: 'string' },
      { key: 'contacts', type: 'number' },
    ],
  },
  {
    title: 'Pipeline runs',
    query: (cfg) => `
      SELECT started_at, snapshot_date, status, rows_extracted, rows_loaded, rows_rejected, duration_ms
      FROM \`${cfg.projectId}.${cfg.dataset}.pipeline_runs\`
      ORDER BY started_at DESC
      LIMIT 100`,
    headers: [
      'started_at',
      'snapshot_date',
      'status',
      'rows_extracted',
      'rows_loaded',
      'rows_rejected',
      'duration_ms',
    ],
    columns: [
      { key: 'started_at', type: 'timestamp' },
      { key: 'snapshot_date', type: 'date' },
      { key: 'status', type: 'string' },
      { key: 'rows_extracted', type: 'number' },
      { key: 'rows_loaded', type: 'number' },
      { key: 'rows_rejected', type: 'number' },
      { key: 'duration_ms', type: 'number' },
    ],
  },
];

function createSheetsClient() {
  const auth = new google.auth.GoogleAuth({ scopes: [SHEETS_SCOPE] });
  return google.sheets({ version: 'v4', auth });
}

function unwrap(value) {
  if (value && typeof value === 'object' && 'value' in value) return value.value;
  return value;
}

function dateSerial(value, type) {
  const raw = unwrap(value);
  if (raw === null || raw === undefined || raw === '') return null;

  const date = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${type} value returned from BigQuery`);
  }
  const serial = date.getTime() / 86_400_000 + 25_569;
  return type === 'date' ? Math.floor(serial) : serial;
}

function cellValue(value, type) {
  const raw = unwrap(value);
  if (raw === null || raw === undefined || raw === '') {
    return { userEnteredValue: { stringValue: '' } };
  }
  if (type === 'date' || type === 'timestamp') {
    const serial = dateSerial(raw, type);
    return { userEnteredValue: { numberValue: serial } };
  }
  if (type === 'number') {
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new Error('Invalid numeric value returned from BigQuery');
    return { userEnteredValue: { numberValue: number } };
  }
  return { userEnteredValue: { stringValue: String(raw) } };
}

function reportRows(report, rows) {
  return [
    report.headers.map((value) => ({ userEnteredValue: { stringValue: value } })),
    ...rows.map((row) => report.columns.map(({ key, type }) => cellValue(row[key], type))),
  ];
}

function reportRequests(report, sheetId, rows) {
  const data = reportRows(report, rows);
  const requests = [
    {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          startColumnIndex: 0,
          endColumnIndex: report.headers.length,
        },
        rows: [],
        fields: 'userEnteredValue',
      },
    },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: data.map((values) => ({ values })),
        fields: 'userEnteredValue',
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: 'userEnteredFormat.textFormat.bold',
      },
    },
  ];

  report.columns.forEach(({ type }, columnIndex) => {
    if (type !== 'date' && type !== 'timestamp') return;
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          startColumnIndex: columnIndex,
          endColumnIndex: columnIndex + 1,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: type === 'date' ? 'DATE' : 'DATE_TIME',
              pattern: type === 'date' ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm:ss',
            },
          },
        },
        fields: 'userEnteredFormat.numberFormat',
      },
    });
  });

  return requests;
}

export async function publishReports({ bq, cfg, createSheets = createSheetsClient }) {
  if (!cfg.reportSheetId) throw new Error('Missing REPORT_SHEET_ID');

  const queryResults = await Promise.all(
    REPORTS.map(async (report) => {
      const [rows] = await bq.query({ query: report.query(cfg), location: cfg.location });
      return { report, rows };
    }),
  );
  const sheets = createSheets();
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId: cfg.reportSheetId,
    fields: 'sheets.properties(sheetId,title)',
  });
  const sheetIds = new Map(
    (data.sheets ?? []).map(({ properties }) => [properties.title, properties.sheetId]),
  );

  const requests = [];
  for (const { report, rows } of queryResults) {
    const sheetId = sheetIds.get(report.title);
    if (sheetId === undefined) {
      throw new Error(`Google spreadsheet is missing the "${report.title}" tab`);
    }
    requests.push(...reportRequests(report, sheetId, rows));
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: cfg.reportSheetId,
    requestBody: { requests },
  });

  return Object.fromEntries(queryResults.map(({ report, rows }) => [report.title, rows.length]));
}
