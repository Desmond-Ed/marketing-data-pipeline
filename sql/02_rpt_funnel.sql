CREATE OR REPLACE TABLE `{{project}}.{{dataset}}.rpt_funnel` AS
SELECT
  lifecycle_stage,
  CASE lifecycle_stage
    WHEN 'subscriber' THEN 1
    WHEN 'lead' THEN 2
    WHEN 'marketingqualifiedlead' THEN 3
    WHEN 'salesqualifiedlead' THEN 4
    WHEN 'opportunity' THEN 5
    WHEN 'customer' THEN 6
    ELSE 99
  END AS stage_order,
  lead_source,
  COUNT(*) AS contacts
FROM `{{project}}.{{dataset}}.contacts`
WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM `{{project}}.{{dataset}}.contacts`)
GROUP BY lifecycle_stage, stage_order, lead_source;