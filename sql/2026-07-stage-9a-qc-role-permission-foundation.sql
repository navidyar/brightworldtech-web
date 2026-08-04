INSERT INTO roles (
  code,
  name,
  description,
  is_active
)
VALUES (
  'qc',
  'Quality Control',
  'Read-only access to Units across technicians for quality-control review. QC does not grant Unit production, editing, completion, approval, lifecycle, deletion, or request-review authority.',
  1
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = 1;
