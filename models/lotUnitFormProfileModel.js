'use strict';

const { resolveLotUnitFormProfile } = require('../services/lotUnitFormProfileResolver');
const { normalizeSubmittedLotFormRules } = require('../services/lotUnitFormRuleEditor');

const MAXIMUM_LOT_ANCESTRY_DEPTH = 100;

function getDefaultConnection() {
  return require('./db').pool;
}

class LotUnitFormProfileDataError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LotUnitFormProfileDataError';
    this.code = code;
  }
}

function mapRuleRow(row) {
  return Object.freeze({
    ruleId: Number(row.lot_unit_form_field_rule_id),
    lotId: Number(row.lot_id),
    fieldKey: String(row.field_key),
    visibilityMode: String(row.visibility_mode),
    requirementMode: String(row.requirement_mode),
    createdByUserId: row.created_by_user_id === null ? null : Number(row.created_by_user_id),
    updatedByUserId: row.updated_by_user_id === null ? null : Number(row.updated_by_user_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function normalizeLotId(lotId) {
  const normalized = Number(lotId);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new LotUnitFormProfileDataError('Lot ID must be a positive integer.', 'INVALID_LOT_ID');
  }

  return normalized;
}

async function getLotLineage(lotId, connection = null) {
  const db = connection || getDefaultConnection();
  const normalizedLotId = normalizeLotId(lotId);
  const [rows] = await db.query(
    `
      WITH RECURSIVE lot_ancestry AS (
        SELECT
          l.lot_id,
          l.parent_lot_id,
          l.name,
          0 AS ancestry_depth,
          CAST(CONCAT('/', l.lot_id, '/') AS CHAR(2048)) AS ancestry_path,
          0 AS cycle_detected
        FROM lots l
        WHERE l.lot_id = ?

        UNION ALL

        SELECT
          parent.lot_id,
          parent.parent_lot_id,
          parent.name,
          child.ancestry_depth + 1,
          CONCAT(child.ancestry_path, parent.lot_id, '/'),
          CASE
            WHEN child.ancestry_path LIKE CONCAT('%/', parent.lot_id, '/%') THEN 1
            ELSE 0
          END
        FROM lots parent
        JOIN lot_ancestry child
          ON parent.lot_id = child.parent_lot_id
        WHERE child.cycle_detected = 0
          AND child.ancestry_depth < ?
      )
      SELECT
        lot_id,
        parent_lot_id,
        name,
        ancestry_depth,
        cycle_detected
      FROM lot_ancestry
      ORDER BY ancestry_depth ASC
    `,
    [normalizedLotId, MAXIMUM_LOT_ANCESTRY_DEPTH]
  );

  if (rows.length === 0) {
    throw new LotUnitFormProfileDataError(`Lot ${normalizedLotId} was not found.`, 'LOT_NOT_FOUND');
  }

  if (rows.some((row) => Number(row.cycle_detected) === 1)) {
    throw new LotUnitFormProfileDataError(
      `Lot ${normalizedLotId} belongs to a cyclic lot hierarchy.`,
      'LOT_HIERARCHY_CYCLE'
    );
  }

  const lastRow = rows[rows.length - 1];

  if (Number(lastRow.ancestry_depth) >= MAXIMUM_LOT_ANCESTRY_DEPTH && lastRow.parent_lot_id !== null) {
    throw new LotUnitFormProfileDataError(
      `Lot ${normalizedLotId} exceeds the supported ancestry depth.`,
      'LOT_HIERARCHY_TOO_DEEP'
    );
  }

  return rows
    .slice()
    .reverse()
    .map((row) => Object.freeze({
      lotId: Number(row.lot_id),
      parentLotId: row.parent_lot_id === null ? null : Number(row.parent_lot_id),
      name: String(row.name || `Lot ${row.lot_id}`)
    }));
}

async function listRulesForLotLineage(lineage, connection = null) {
  const db = connection || getDefaultConnection();
  const lotIds = lineage.map((lot) => normalizeLotId(lot.lotId));

  if (lotIds.length === 0) {
    return [];
  }

  const placeholders = lotIds.map(() => '?').join(', ');
  const [rows] = await db.query(
    `
      SELECT
        lot_unit_form_field_rule_id,
        lot_id,
        field_key,
        visibility_mode,
        requirement_mode,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      FROM lot_unit_form_field_rules
      WHERE lot_id IN (${placeholders})
      ORDER BY FIELD(lot_id, ${placeholders}), field_key
    `,
    [...lotIds, ...lotIds]
  );

  return rows.map(mapRuleRow);
}

async function listRulesForLot(lotId, connection = null) {
  const db = connection || getDefaultConnection();
  const normalizedLotId = normalizeLotId(lotId);
  const [rows] = await db.query(
    `
      SELECT
        lot_unit_form_field_rule_id,
        lot_id,
        field_key,
        visibility_mode,
        requirement_mode,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      FROM lot_unit_form_field_rules
      WHERE lot_id = ?
      ORDER BY field_key
    `,
    [normalizedLotId]
  );

  return rows.map(mapRuleRow);
}

function normalizeUserId(userId) {
  const normalized = Number(userId);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new LotUnitFormProfileDataError('User ID must be a positive integer.', 'INVALID_USER_ID');
  }

  return normalized;
}

async function saveRulesWithinTransaction(db, lotId, directRules, userId) {
  const normalizedLotId = normalizeLotId(lotId);
  const normalizedUserId = normalizeUserId(userId);
  const normalizedRules = normalizeSubmittedLotFormRules({
    visibilityModes: Object.fromEntries(
      directRules.map((rule) => [rule.fieldKey, rule.visibilityMode])
    ),
    requirementModes: Object.fromEntries(
      directRules.map((rule) => [rule.fieldKey, rule.requirementMode])
    )
  });
  const [lotRows] = await db.query(
    'SELECT lot_id FROM lots WHERE lot_id = ? FOR UPDATE',
    [normalizedLotId]
  );

  if (lotRows.length === 0) {
    throw new LotUnitFormProfileDataError(`Lot ${normalizedLotId} was not found.`, 'LOT_NOT_FOUND');
  }

  const lineage = await getLotLineage(normalizedLotId, db);
  const existingRules = await listRulesForLotLineage(lineage, db);
  const combinedRules = [
    ...existingRules.filter((rule) => rule.lotId !== normalizedLotId),
    ...normalizedRules.map((rule) => ({
      lotId: normalizedLotId,
      ...rule
    }))
  ];
  const profile = resolveLotUnitFormProfile({ lineage, rules: combinedRules });
  const fieldKeys = normalizedRules.map((rule) => rule.fieldKey);

  if (fieldKeys.length === 0) {
    await db.query(
      'DELETE FROM lot_unit_form_field_rules WHERE lot_id = ?',
      [normalizedLotId]
    );
  } else {
    const placeholders = fieldKeys.map(() => '?').join(', ');
    await db.query(
      `DELETE FROM lot_unit_form_field_rules WHERE lot_id = ? AND field_key NOT IN (${placeholders})`,
      [normalizedLotId, ...fieldKeys]
    );

    const valuePlaceholders = normalizedRules.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const values = normalizedRules.flatMap((rule) => [
      normalizedLotId,
      rule.fieldKey,
      rule.visibilityMode,
      rule.requirementMode,
      normalizedUserId,
      normalizedUserId
    ]);

    await db.query(
      `
        INSERT INTO lot_unit_form_field_rules (
          lot_id,
          field_key,
          visibility_mode,
          requirement_mode,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES ${valuePlaceholders}
        ON DUPLICATE KEY UPDATE
          visibility_mode = VALUES(visibility_mode),
          requirement_mode = VALUES(requirement_mode),
          updated_by_user_id = VALUES(updated_by_user_id),
          updated_at = CURRENT_TIMESTAMP
      `,
      values
    );
  }

  return Object.freeze({
    savedRuleCount: normalizedRules.length,
    profile
  });
}

async function replaceRulesForLot(lotId, directRules, userId, connection = null) {
  if (connection) {
    return saveRulesWithinTransaction(connection, lotId, directRules, userId);
  }

  const pool = getDefaultConnection();
  const db = await pool.getConnection();

  try {
    await db.beginTransaction();
    const result = await saveRulesWithinTransaction(db, lotId, directRules, userId);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

async function getEffectiveUnitFormProfileForLot(lotId, connection = null) {
  const lineage = await getLotLineage(lotId, connection);
  const rules = await listRulesForLotLineage(lineage, connection);

  return resolveLotUnitFormProfile({ lineage, rules });
}

async function listAllLotIds(connection = null) {
  const db = connection || getDefaultConnection();
  const [rows] = await db.query('SELECT lot_id FROM lots ORDER BY lot_id');
  return rows.map((row) => Number(row.lot_id));
}

module.exports = {
  LotUnitFormProfileDataError,
  getEffectiveUnitFormProfileForLot,
  getLotLineage,
  listAllLotIds,
  listRulesForLot,
  listRulesForLotLineage,
  replaceRulesForLot
};
