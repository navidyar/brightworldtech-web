DROP TABLE IF EXISTS unit_qc_checks;

UPDATE roles
SET
  name = 'QC',
  description = 'Read-only access to Units across technicians for quality-control review. QC does not grant Unit production, editing, completion, approval, lifecycle, deletion, or request-review authority.'
WHERE code = 'qc';
