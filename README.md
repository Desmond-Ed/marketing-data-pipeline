# Marketing Data Pipeline

A Node.js pipeline that extracts HubSpot CRM contacts, validates and deduplicates them, and loads privacy-minimized records into Google BigQuery for reporting.

## Project status

- 16 Vitest tests pass.
- HubSpot pagination and retries are covered by unit tests.
- Manual GitHub Actions pipeline runs have loaded 287 contacts and recorded 15 rejected contacts in BigQuery.
- A GitHub Actions run on 2026-11-25 successfully published 208 leads-by-day rows, 50 funnel rows, and 8 pipeline-run rows to the configured Google Sheet.
- The project owner confirmed that the three separate Looker Studio reports display data.
- GitHub Actions CI passes. The daily workflow is configured for 05:15 UTC, but the first automatically scheduled run has not yet been observed; recent pipeline runs were manual.
- [Open the Leads by signup date Looker Studio report](https://datastudio.google.com/reporting/f517ada2-4800-4078-92be-2926c07fe757). This is one of the three separate reports, not a combined dashboard.

## Architecture

HubSpot Contacts API -> Node.js extraction and transformation -> partitioned BigQuery tables -> BigQuery SQL reports -> Google Sheets -> Looker Studio

- `contacts`: accepted contacts with a SHA-256 email hash, domain, lifecycle stage, source, campaign, and dates.
- `contact_rejects`: missing, invalid, or duplicate email rejection reasons.
- `pipeline_runs`: append-only execution metadata and quality gate outcomes.
- `rpt_leads_by_source_daily` and `rpt_funnel`: SQL reporting tables.

## Requirements

- Node.js 20 or newer
- A HubSpot private app token
- A Google Cloud project with BigQuery access
- A Google service account for GitHub Actions
- A Google spreadsheet with the report tabs, shared with the service account

## Local setup

```powershell
npm ci
Copy-Item .env.example .env
```

Configure `.env` with a HubSpot token and BigQuery project ID. Keep `.env` and service-account keys out of Git.

```powershell
npm run setup:bq
npm test
npm run pipeline
```

Use a dry run before a normal load:

```powershell
$env:DRY_RUN='1'
npm run pipeline
Remove-Item Env:DRY_RUN
```

A dry run reads HubSpot but makes no BigQuery calls.

## GitHub Actions

Configure:

- Secret `HUBSPOT_TOKEN`
- Secret `GCP_SA_KEY`
- Variable `GCP_PROJECT_ID`
- Optional variable `REPORT_SHEET_ID` to publish aggregate reports to Sheets

Create these spreadsheet tabs before configuring `REPORT_SHEET_ID`: `Leads by day`, `Funnel`, and `Pipeline runs`. Enable the Google Sheets API in the same project and share the spreadsheet with the service account email. If `REPORT_SHEET_ID` is unset, the existing BigQuery pipeline runs without Sheets publishing.

The pipeline runs on manual dispatch and daily at `05:15 UTC`. When Sheets publishing is configured, a publishing failure fails the workflow after the BigQuery run has been logged.

## Quality and privacy

- Extraction fails if no source records are returned.
- Transformation fails if more than 20% of records are rejected.
- Raw email addresses are not stored; hashes are pseudonymized, not anonymous.
- Contacts and rejects use daily BigQuery partitions.
- Sheets receives aggregate report fields only; raw emails, email hashes, HubSpot IDs, and error text are excluded.
- The pipeline uses synthetic/test contacts and should not process unauthorized personal data.

## Limitations

- Google BigQuery Sandbox has a 10 GiB lifetime storage quota and tables/partitions expire after 60 days; it is not suitable for durable production retention.
- No public Looker Studio dashboard link is recorded.
- The full HubSpot result set is collected in memory.
- Existing BigQuery schemas are not automatically migrated.
- HubSpot and Google Cloud credentials are external prerequisites.
