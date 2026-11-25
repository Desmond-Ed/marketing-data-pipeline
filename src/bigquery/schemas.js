export const CONTACT_SCHEMA = {
  fields: [
    { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'contact_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'email_hash', type: 'STRING' },
    { name: 'email_domain', type: 'STRING' },
    { name: 'lifecycle_stage', type: 'STRING' },
    { name: 'lead_source', type: 'STRING' },
    { name: 'lead_campaign', type: 'STRING' },
    { name: 'signup_date', type: 'DATE' },
    { name: 'created_at', type: 'TIMESTAMP' },
    { name: 'extracted_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  ],
};

export const REJECT_SCHEMA = {
  fields: [
    { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'contact_id', type: 'STRING' },
    { name: 'reason', type: 'STRING' },
    { name: 'extracted_at', type: 'TIMESTAMP' },
  ],
};

export const RUN_SCHEMA = {
  fields: [
    { name: 'run_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'started_at', type: 'TIMESTAMP' },
    { name: 'finished_at', type: 'TIMESTAMP' },
    { name: 'snapshot_date', type: 'DATE' },
    { name: 'status', type: 'STRING' },
    { name: 'rows_extracted', type: 'INT64' },
    { name: 'rows_loaded', type: 'INT64' },
    { name: 'rows_rejected', type: 'INT64' },
    { name: 'duration_ms', type: 'INT64' },
    { name: 'error', type: 'STRING' },
  ],
};