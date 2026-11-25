-- sqlfluff:dialect:bigquery
-- project/dataset placeholders are rendered before this SQL is executed.
CREATE OR REPLACE TABLE `{{project}}.{{dataset}}.rpt_leads_by_source_daily` AS
SELECT
  signup_date,
  lead_source,
  COUNT(*) AS leads
FROM `{{project}}.{{dataset}}.contacts`
WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM `{{project}}.{{dataset}}.contacts`)
  AND signup_date IS NOT NULL
GROUP BY signup_date, lead_source;