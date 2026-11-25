# Marketing Data Pipeline

A Node.js pipeline that extracts HubSpot CRM contacts, validates and deduplicates them, and loads privacy-minimized records into Google BigQuery for reporting.

## Verified status

- 11 Vitest tests pass.
- HubSpot pagination and retries are covered by unit tests.
- Manual GitHub Actions pipeline runs have loaded 287 contacts and recorded 15 rejected contacts in BigQuery.
- GitHub Actions CI and the daily pipeline workflow are configured.

## Architecture

HubSpot Contacts API -> Node.js extraction and transformation -> partitioned BigQuery tables -> BigQuery SQL reports

- `contacts`: accepted contacts with a SHA-256 email hash, domain, lifecycle stage, source, campaign, and dates.
- `contact_rejects`: missing, invalid, or duplicate email rejection reasons.
- `pipeline_runs`: append-only execution metadata and quality gate outcomes.
- `rpt_leads_by_source_daily` and `rpt_funnel`: SQL reporting tables.

## Requirements

- Node.js 20 or newer
- A HubSpot private app token
- A Google Cloud project with BigQuery access
- A Google service account for GitHub Actions

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

The pipeline runs on manual dispatch and daily at `05:15 UTC`.

## Quality and privacy

- Extraction fails if no source records are returned.
- Transformation fails if more than 20% of records are rejected.
- Raw email addresses are not stored; hashes are pseudonymized, not anonymous.
- Contacts and rejects use daily BigQuery partitions.
- The pipeline uses synthetic/test contacts and should not process unauthorized personal data.

## Limitations

- No verified Looker Studio dashboard is currently published.
- The full HubSpot result set is collected in memory.
- Existing BigQuery schemas are not automatically migrated.
- HubSpot and Google Cloud credentials are external prerequisites.
