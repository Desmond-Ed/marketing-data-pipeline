# Agent instructions

Before changing this repository, read [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md) for the architecture, setup, current implementation status, and known gaps. Treat source code and package scripts as authoritative when they differ from the original build guide or this report.

## Project-specific guidance

- This is a Node.js ES-module pipeline integrating HubSpot with Google BigQuery. SQL in `sql/` is BigQuery SQL; run it through `npm run pipeline`, not SQL Server.
- Keep credentials and real contact data out of source, logs, tests, and commits. `.env` is local and ignored; never read it into responses or copy its values into tracked files.
- The pipeline is intended for fake/test contacts. `npm run seed` and `scripts/probe.js` make mutating HubSpot API calls; do not run them unless explicitly requested and the target account is confirmed safe.
- `DRY_RUN=1` (PowerShell: `$env:DRY_RUN='1'; npm run pipeline`) extracts and transforms, then exits before any BigQuery client is created or any BigQuery write/query runs. It still makes read requests to HubSpot and enforces the empty-extract and 20% reject-rate quality gates.
- Preserve daily partition replacement and email minimization. A SHA-256 email hash is pseudonymous, not anonymous.
- The pipeline GitHub Actions workflow is manual-only until the cron schedule is explicitly enabled after credentials are configured and a successful manual run is verified.
- Run `npm test` for code changes. There is no build or lint script; keep JavaScript compatible with the declared Node.js `>=20` runtime.
- Update `docs/PROJECT_REPORT.md` when architecture, commands, deployment status, observed metrics, or known limitations materially change. Do not mark roadmap items complete without verifying them.
