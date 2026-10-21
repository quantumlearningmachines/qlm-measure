-- Product-agnostic query: native-format parsing belongs in reviewed adapters.
-- This counts released observations, not actual help totals or unique actions.
-- A SQL NULL for an unavailable stage is intentionally not the number zero.
WITH records AS (
  SELECT scope,
         json_extract(payload_json, '$.assistance.label') AS native_label,
         json_extract(payload_json, '$.assistance.lifecycle.state') AS lifecycle_state,
         json_extract(payload_json, '$.assistance.lifecycle.value') AS lifecycle_value,
         json_extract(payload_json, '$.capture.coverage.state') AS coverage_state,
         json_extract(payload_json, '$.provenance.mapping_review.state') AS mapping_review_state
  FROM captures
), groups AS (
  SELECT 'source_native_label' AS grouping, scope, native_label,
         count(*) AS released_observations,
         sum(lifecycle_state = 'observed' AND lifecycle_value = 'requested')
           AS recorded_help_request_observations,
         sum(lifecycle_state != 'observed') AS unresolved_lifecycle_observations,
         sum(coverage_state = 'unknown') AS unknown_coverage_observations,
         sum(mapping_review_state = 'not_reviewed') AS unreviewed_mapping_observations,
         sum(lifecycle_state = 'observed' AND lifecycle_value = 'generated') AS observed_generated_records,
         sum(lifecycle_state = 'observed' AND lifecycle_value = 'displayed') AS observed_displayed_records
  FROM records GROUP BY scope, native_label
  UNION ALL
  SELECT 'total', NULL, NULL, count(*),
         coalesce(sum(lifecycle_state = 'observed' AND lifecycle_value = 'requested'), 0),
         coalesce(sum(lifecycle_state != 'observed'), 0),
         coalesce(sum(coverage_state = 'unknown'), 0),
         coalesce(sum(mapping_review_state = 'not_reviewed'), 0),
         coalesce(sum(lifecycle_state = 'observed' AND lifecycle_value = 'generated'), 0),
         coalesce(sum(lifecycle_state = 'observed' AND lifecycle_value = 'displayed'), 0)
  FROM records
)
SELECT grouping, scope, native_label, released_observations,
       recorded_help_request_observations, unresolved_lifecycle_observations,
       unknown_coverage_observations, unreviewed_mapping_observations,
       CASE WHEN observed_generated_records > 0 THEN observed_generated_records ELSE NULL END
         AS available_generated_observations,
       CASE WHEN observed_displayed_records > 0 THEN observed_displayed_records ELSE NULL END
         AS available_displayed_observations,
       NULL AS actual_request_total,
       NULL AS request_rate,
       NULL AS request_to_display_rate,
       NULL AS learning_effect
FROM groups
ORDER BY CASE grouping WHEN 'source_native_label' THEN 0 ELSE 1 END,
         scope, native_label;
