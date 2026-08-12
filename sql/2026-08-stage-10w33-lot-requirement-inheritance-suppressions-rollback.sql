-- Stage 10W33 rollback.
-- This removes child requirement-inheritance suppression choices. Direct Lot
-- requirements and Unit form overrides are not changed.
DROP TABLE IF EXISTS lot_requirement_inheritance_suppressions;
