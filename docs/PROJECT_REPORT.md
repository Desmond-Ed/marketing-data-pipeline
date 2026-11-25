# Project report and agent handoff

**Last checked:** 2026-11-25
**Repository:** `Desmond-Ed/marketing-data-pipeline`
**Source baseline:** `main` at `17677c1` (`feat: complete BigQuery marketing pipeline`)
**Purpose:** Give a new coding agent a ground-up, evidence-based understanding of the project and its actual state.

## 1. What this project is

This is a small Node.js ETL pipeline that extracts HubSpot contact records, validates and transforms them, loads them to Google BigQuery, and builds reporting tables with BigQuery SQL. The intended downstream consumer is a Looker Studio marketing and pipeline-health dashboard. The supplied build guide also describes scheduled GitHub Actions runs.

The project is designed around fake/test contact data. It minimizes stored personal information by not loading raw email addresses, uses BigQuery load jobs rather than streaming inserts, and replaces a daily partition so reruns are generally repeatable.

The implemented local data flow is:

```text
HubSpot Contacts API
  -> paginated extraction with retry handling
  -> validation, normalization, email hashing, and reject collection
  -> BigQuery contacts and contact_rejects daily partitions
  -> CREATE OR REPLACE BigQuery reporting models
  -> pipeline_runs execution record and structured terminal logs
```

## 2. Current state: implemented versus planned

### Verified implemented

- Local configuration through dotenv and required HubSpot token / Google Cloud project settings.
- HubSpot contacts extraction with pagination and retry handling for HTTP 429 and 5xx responses.
- Contact transformation, source normalization, validation, deduplication, and reject reasons.
- BigQuery schemas and table initialization for `contacts`, `contact_rejects`, and `pipeline_runs`.
- NDJSON BigQuery load jobs and SQL model execution.
- Two BigQuery SQL report models.
- Vitest unit tests for contact transformation, HubSpot retry behavior, and pagination (all use mock responses; no live API calls).
- A successful authenticated end-to-end run was observed on 2026-11-25: **302 records extracted, 15 rejected, and both SQL models built**. The terminal reported `rows_loaded: 302`; in the current runner this is the combined number of valid contact rows and reject rows (287 + 15), not 302 accepted contacts.
- `npm run setup:bq` succeeded and reported that all three base tables already existed.
- The last recorded test run passed: **2 test files, 9 tests**.

### Not present or not yet verified

- No checked-in `README.md`, `.github/workflows/` CI workflow, or scheduled pipeline workflow was found at the last review.
- No Looker Studio dashboard URL, screenshots, or verified dashboard deployment is recorded in this repository.
- The supplied guide's `DRY_RUN=1` flow and 20% reject-rate/empty-extract quality gates are **not implemented** in `src/run.js`.
- The guide's deployment, CI, schedule, dashboard, fresh-clone, and final application checkpoints are future work unless independently verified.
- The build guide is user-provided context and is not checked into the repository.

Never report any of these planned items as shipped without checking the repository and, where applicable, the external service.

## 3. Repository map

| Path | Responsibility |
|---|---|
| `src/run.js` | Pipeline orchestrator: config, table setup, extract, transform, daily loads, models, run logging, terminal summary. |
| `src/config.js` | Loads dotenv and provides required/optional HubSpot and BigQuery configuration. |
| `src/logger.js` | Emits structured JSON log lines to stdout. |
| `src/hubspot/client.js` | Shared HubSpot HTTP client, bearer-token authentication, retries/backoff, and API error formatting. |
| `src/hubspot/extract.js` | Requests contact properties in pages of 100 and follows HubSpot's `after` cursor. |
| `src/transform/contacts.js` | Validates email, rejects missing/invalid/duplicate email rows, normalizes sources, and creates minimized contact rows. |
| `src/bigquery/schemas.js` | BigQuery schemas for contacts, rejects, and run metadata. |
| `src/bigquery/load.js` | Writes temporary NDJSON and starts BigQuery load jobs, with append or replace disposition. |
| `src/bigquery/model.js` | Reads sorted `.sql` files, renders project/dataset placeholders, and submits each query to BigQuery. |
| `scripts/setup-bigquery.js` | Creates the dataset if necessary and ensures the three base tables exist. It does not update schemas of existing tables. |
| `scripts/seed-hubspot.js` | Creates HubSpot custom properties and synthetic contacts. This is a mutating script. |
| `scripts/probe.js` | Sends experimental property-creation POST requests to HubSpot. This is mutating despite its name. |
| `sql/01_rpt_leads_by_source_daily.sql` | Creates/replaces daily lead counts by signup date and normalized source. |
| `sql/02_rpt_funnel.sql` | Creates/replaces contact counts by lifecycle stage and lead source. |
| `tests/contacts.test.js` | Unit tests for source normalization and contact transformation. |
| `package.json` / `package-lock.json` | Scripts, runtime requirement, and dependency lock. |
| `.env.example` | Safe template for local settings. Never put real keys or machine-specific credential paths here. |
| `.gitignore` | Ignores `node_modules/`, `.env`, common key files, and `tmp/`. |

## 4. Runtime, dependencies, and commands

- JavaScript ES modules (`"type": "module"`).
- Node.js `>=20` (the package declares this in `package.json`).
- Runtime dependencies: `@google-cloud/bigquery`, `dotenv`.
- Test dependency: `vitest`.
- There is no configured build, lint, or type-check command.

Run commands from the repository root:

```powershell
npm ci
npm test
npm run setup:bq
npm run pipeline
```

Defined package scripts:

| Command | Effect |
|---|---|
| `npm test` | Runs `vitest run`. |
| `npm run setup:bq` | Ensures the BigQuery dataset and three base tables exist. |
| `npm run pipeline` | Runs `node src/run.js`; this contacts HubSpot and BigQuery and writes data. |
| `npm run seed` | Runs `scripts/seed-hubspot.js`; this creates synthetic HubSpot properties and contacts. |

There is **no dry-run mode** in the current implementation. Do not promise that `DRY_RUN=1 npm run pipeline` is safe or read-only.

## 5. Configuration and credentials

`src/config.js` loads dotenv. Required settings:

- `HUBSPOT_TOKEN`
- `GCP_PROJECT_ID`

Optional settings and defaults:

- `HUBSPOT_BASE_URL` → `https://api.hubapi.com`
- `HUBSPOT_CONTACTS_PATH` → `/crm/v3/objects/contacts`
- `BQ_DATASET` → `marketing`
- `BQ_LOCATION` → `US`
- `GOOGLE_APPLICATION_CREDENTIALS` is consumed by Google authentication libraries; it must point to a valid credential JSON file if using a service-account key.

Local setup:

1. Copy `.env.example` to `.env`.
2. Set the HubSpot private-app token and BigQuery project ID locally.
3. Configure Google Application Default Credentials, or set `GOOGLE_APPLICATION_CREDENTIALS` to a valid service-account JSON file.
4. Ensure the BigQuery identity has permissions to create/load/query the required dataset and tables.
5. Keep `.env` and service-account keys outside version control. Never paste their contents into agent context, logs, or documentation.

An earlier run failed because the credential environment variable pointed to a directory, then to a non-credential file. It was subsequently corrected locally and `npm run setup:bq` succeeded. The actual local `.env` is ignored and deliberately not recorded in this report.

## 6. Pipeline behavior, step by step

1. `src/run.js` loads dotenv, obtains config, creates a BigQuery client, and captures a UTC timestamp/date and UUID run ID.
2. It creates the dataset if needed, then ensures `contacts`, `contact_rejects`, and `pipeline_runs` exist. `contacts` and `contact_rejects` are day-partitioned on `snapshot_date` when newly created.
3. `extractContacts()` requests 100 contacts per page with email, lifecycle stage, creation/modification timestamps, and custom marketing properties. It follows the API paging cursor.
4. `hubspotFetch()` adds the bearer token and JSON content type. It retries 429 and 5xx responses up to five retries, preferring `Retry-After`, otherwise using capped exponential delay plus jitter. Other HTTP failures throw an error with a bounded response body.
5. `transformContacts()`:
   - Lowercases and validates email.
   - Rejects missing email, invalid email, and duplicate email (duplicate comparison is case-insensitive due to normalization).
   - Hashes accepted email with SHA-256 and stores its domain, not the raw address.
   - Normalizes known source aliases (for example `Google Ads` → `google`, `FB` → `facebook`); blank values become `unknown`, unrecognized values become `other`.
   - Uses explicit `signup_date` or falls back to HubSpot `createdate`.
6. Accepted contacts and rejects are loaded to date-decorated BigQuery partitions with `WRITE_TRUNCATE`; this replaces that partition on successful non-empty loads. Run metadata is appended to `pipeline_runs`.
7. `runModels()` reads `.sql` files alphabetically, substitutes `{{project}}` and `{{dataset}}`, and executes them in BigQuery.
8. The program logs JSON status/count information and throws after recording a pipeline failure.

### Current metric semantics

`rows_extracted` is source records fetched. `rows_rejected` is transformed rejects. `rows_loaded` currently sums the accepted-contact load count **and** reject load count. If consumers expect `rows_loaded` to mean accepted contacts only, the implementation/reporting contract needs to be changed deliberately and tested.

## 7. BigQuery data model

### `contacts`

Day-partitioned by `snapshot_date` on creation. Fields:

- `snapshot_date` (required DATE)
- `contact_id` (required STRING)
- `email_hash` (STRING; SHA-256 of normalized email)
- `email_domain` (STRING)
- `lifecycle_stage` (STRING)
- `lead_source` (STRING)
- `lead_campaign` (STRING)
- `signup_date` (DATE)
- `created_at` (TIMESTAMP)
- `extracted_at` (required TIMESTAMP)

No raw email is included. Hashing is pseudonymization, not guaranteed anonymization; email hashes may be guessable if an attacker can test candidate addresses.

### `contact_rejects`

Day-partitioned by `snapshot_date` on creation. Contains `snapshot_date`, HubSpot `contact_id`, `reason`, and `extracted_at`. Current reject reasons are `missing_email`, `invalid_email`, and `duplicate_email`.

### `pipeline_runs`

Append-only run records with `run_id`, start/finish timestamps, snapshot date, status, extracted/loaded/rejected counts, duration, and error string.

### Reporting tables

- `rpt_leads_by_source_daily`: counts contacts by `signup_date` and `lead_source`, using the latest available `snapshot_date`; rows with no signup date are excluded.
- `rpt_funnel`: counts contacts by lifecycle stage and lead source, using the latest available snapshot; it assigns a display order to known lifecycle stages.

The SQL uses BigQuery backticks and GoogleSQL syntax. It is not SQL Server SQL. Raw template SQL contains placeholders; `src/bigquery/model.js` renders them at runtime.

## 8. Important operational limitations and risks

1. **Empty input is not a quality failure.** The current runner has no empty-extract check or reject-rate threshold.
2. **Zero-row loads are skipped.** `loadNdjson()` returns immediately for empty arrays. If a date partition previously had rows and a later same-day run has zero rows for that table, the old partition is not cleared by the skipped load.
3. **Run logging has a boundary.** Dataset/table setup occurs before the main `try/finally`; setup/auth failures can exit without a `pipeline_runs` row. A failure while writing the run record can also obscure the original processing failure.
4. **Existing schemas are not migrated.** The setup script only creates missing tables; schema changes require a deliberate migration or table recreation plan.
5. **Full extraction each run.** The runner collects all HubSpot pages into memory before transformation; suitable for the current small demo, not necessarily large data volumes.
6. **Same-day reruns overwrite.** The contacts/rejects tables use daily partition replacement to avoid normal duplicate accumulation. Verify zero-row behavior before asserting strict idempotency for all cases.
7. **Raw IDs and domains remain.** Email addresses are removed, but HubSpot contact IDs and email domains are still potentially sensitive or identifying.
8. **Mutating helper scripts.** `npm run seed` adds properties and contacts. `scripts/probe.js` sends property-creation POST requests. Only use them with an explicitly approved test account.
9. **External prerequisites.** Real execution requires valid HubSpot credentials/scopes, valid Google credentials, and BigQuery permissions/billing or sandbox access. Do not substitute SQL Server for BigQuery to work around SQL dialect errors.
10. **No deployment proof in the repository.** Scheduled jobs, CI, dashboard sharing, and public links are not confirmed by the present files.

## 9. Suggested next steps from the supplied build guide

Treat this as a roadmap, not a statement of current functionality:

1. Decide and implement the quality contract: empty extracts, maximum reject ratio, and whether `rows_loaded` means accepted contacts or all table rows.
2. Add a dry-run mode only if it can guarantee no BigQuery writes and still report clear outcomes.
3. Fix and test empty partition replacement behavior so same-day reruns cannot leave stale data.
4. Add CI for `npm ci` and `npm test`.
5. Add a manually triggered/scheduled workflow only after secrets, permissions, concurrency, and recovery behavior are configured.
6. Build and verify Looker Studio data sources/dashboard; document a public URL only if intentionally published.
7. Add a README with architecture, verified run results, privacy/cost/retention limits, and quick start. Do not invent dashboard URLs, scheduled-run metrics, or success rates.
8. Run a fresh-clone verification and scan both current files and Git history for exposed credentials before sharing the repository.

The supplied guide has example snippets that differ from the checked-in implementation. In particular, its dry-run and quality-gate behavior is aspirational, and one example imports `bigquery/models.js` while the actual module is `src/bigquery/model.js`. Prefer the code in this repository, then update the guide/report intentionally.

## 10. Agent working conventions

- Inspect the relevant source and current Git status before editing; preserve unrelated user changes.
- Keep edits surgical and use existing patterns (ES modules, Vitest, BigQuery SDK, structured JSON logs).
- For changes to transform/API/pipeline behavior, add or update focused tests; validate with `npm test`.
- Never run a live write operation (HubSpot seed/probe, pipeline, or BigQuery setup) without authorization and valid intended credentials.
- Keep secrets out of documentation and responses. Do not inspect or reveal the local `.env` or service-account JSON.
- Update this handoff when a meaningful behavior or milestone changes. Clearly distinguish verified implementation, externally observed behavior, and plans.
