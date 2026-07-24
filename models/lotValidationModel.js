'use strict';

const { pool } = require('./db');
const lotModel = require('./lotModel');
const lotValidationOverrideModel = require('./lotValidationOverrideModel');
const {
  buildUnitSnapshots,
  evaluateUnitSnapshot
} = require('../services/lotRequirementEvaluator');
const {
  applyManagementAcceptance,
  buildRequirementSignature
} = require('../services/lotValidationOverridePolicy');

const UNIT_LIMIT = 250;

function buildPlaceholders(values) {
  return values.map(() => '?').join(', ');
}

async function listBaseUnitRowsForLot(lotId, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT
        u.unit_id,
        u.asset_number,
        u.lot_id,
        u.unit_category_config_value_id,
        unit_category.code AS unit_category_code,
        COALESCE(unit_category.label, unit_category.code) AS unit_category_label,
        u.manufacturer_id,
        manufacturer.name AS manufacturer_name,
        u.unit_model_id,
        unit_model.model_name,
        unit_model.model_number,
        CONCAT_WS(
          ' · ',
          manufacturer.name,
          unit_model.model_name,
          NULLIF(unit_model.model_number, '')
        ) AS model_display_label,
        u.processor_model_id,
        processor_brand.name AS processor_brand_name,
        processor_model.processor_family,
        processor_model.model_code AS processor_model_code,
        CONCAT_WS(
          ' · ',
          processor_brand.name,
          NULLIF(processor_model.processor_family, ''),
          processor_model.model_code
        ) AS processor_display_label,
        u.ram_gb,
        u.ram_type_config_value_id,
        ram_type.code AS ram_type_code,
        COALESCE(ram_type.label, ram_type.code) AS ram_type_label,
        u.storage_gb,
        u.storage_type_config_value_id,
        storage_type.code AS storage_type_code,
        COALESCE(storage_type.label, storage_type.code) AS storage_type_label,
        u.created_at,
        u.updated_at,
        latest_lot_history.unit_lot_history_id AS latest_lot_history_id,
        latest_lot_history.moved_at AS latest_lot_moved_at
      FROM units u
      LEFT JOIN unit_lot_history latest_lot_history
        ON latest_lot_history.unit_lot_history_id = (
          SELECT MAX(history_lookup.unit_lot_history_id)
          FROM unit_lot_history history_lookup
          WHERE history_lookup.unit_id = u.unit_id
        )
      LEFT JOIN config_values unit_category
        ON unit_category.config_value_id = u.unit_category_config_value_id
      LEFT JOIN manufacturers manufacturer
        ON manufacturer.manufacturer_id = u.manufacturer_id
      LEFT JOIN unit_models unit_model
        ON unit_model.unit_model_id = u.unit_model_id
      LEFT JOIN processor_models processor_model
        ON processor_model.processor_model_id = u.processor_model_id
      LEFT JOIN processor_brands processor_brand
        ON processor_brand.processor_brand_id = processor_model.processor_brand_id
      LEFT JOIN config_values ram_type
        ON ram_type.config_value_id = u.ram_type_config_value_id
      LEFT JOIN config_values storage_type
        ON storage_type.config_value_id = u.storage_type_config_value_id
      WHERE u.lot_id = ?
      ORDER BY u.created_at DESC, u.unit_id DESC
      LIMIT ?
    `,
    [Number(lotId), UNIT_LIMIT]
  );

  return rows;
}

async function listIdentifierRowsForUnits(unitIds, connection = pool) {
  if (unitIds.length === 0) {
    return [];
  }

  const [rows] = await connection.query(
    `
      SELECT
        ui.unit_id,
        ui.identifier_value,
        ui.is_primary,
        identifier_type.code AS identifier_type_code,
        COALESCE(identifier_type.label, identifier_type.code) AS identifier_type_label
      FROM unit_identifiers ui
      JOIN config_values identifier_type
        ON identifier_type.config_value_id = ui.identifier_type_config_value_id
      WHERE ui.unit_id IN (${buildPlaceholders(unitIds)})
      ORDER BY
        ui.unit_id,
        ui.is_primary DESC,
        identifier_type.sort_order,
        ui.unit_identifier_id DESC
    `,
    unitIds
  );

  return rows;
}

async function listMemoryRowsForUnits(unitIds, connection = pool) {
  if (unitIds.length === 0) {
    return [];
  }

  const [rows] = await connection.query(
    `
      SELECT
        memory.unit_id,
        memory.size_gb,
        memory.ram_type_config_value_id,
        ram_type.code AS ram_type_code,
        COALESCE(ram_type.label, ram_type.code) AS ram_type_label
      FROM unit_memory_modules memory
      LEFT JOIN config_values ram_type
        ON ram_type.config_value_id = memory.ram_type_config_value_id
      WHERE memory.unit_id IN (${buildPlaceholders(unitIds)})
        AND memory.is_current = 1
      ORDER BY memory.unit_id, memory.slot_label, memory.unit_memory_module_id
    `,
    unitIds
  );

  return rows;
}

async function listStorageRowsForUnits(unitIds, connection = pool) {
  if (unitIds.length === 0) {
    return [];
  }

  const [rows] = await connection.query(
    `
      SELECT
        storage.unit_id,
        storage.size_gb,
        storage.storage_type_config_value_id,
        storage_type.code AS storage_type_code,
        COALESCE(storage_type.label, storage_type.code) AS storage_type_label
      FROM unit_storage_devices storage
      LEFT JOIN config_values storage_type
        ON storage_type.config_value_id = storage.storage_type_config_value_id
      WHERE storage.unit_id IN (${buildPlaceholders(unitIds)})
        AND storage.is_current = 1
      ORDER BY storage.unit_id, storage.slot_label, storage.unit_storage_device_id
    `,
    unitIds
  );

  return rows;
}

async function listTechnicianRowsForUnits(unitIds, connection = pool) {
  if (unitIds.length === 0) {
    return [];
  }

  const placeholders = buildPlaceholders(unitIds);
  const [rows] = await connection.query(
    `
      SELECT
        technician_activity.unit_id,
        technician_activity.user_id,
        technician_activity.first_name,
        technician_activity.last_name,
        technician_activity.activity_type,
        technician_activity.activity_at
      FROM (
        SELECT
          completion.unit_id,
          completion.completed_by_user_id AS user_id,
          user.first_name,
          user.last_name,
          'completion' AS activity_type,
          completion.completed_at AS activity_at
        FROM unit_work_completions completion
        JOIN users user
          ON user.user_id = completion.completed_by_user_id
        WHERE completion.unit_id IN (${placeholders})

        UNION ALL

        SELECT
          work_session.unit_id,
          work_session.tech_user_id AS user_id,
          user.first_name,
          user.last_name,
          'work_session' AS activity_type,
          COALESCE(work_session.ended_at, work_session.started_at) AS activity_at
        FROM unit_work_sessions work_session
        JOIN users user
          ON user.user_id = work_session.tech_user_id
        WHERE work_session.unit_id IN (${placeholders})
      ) technician_activity
      ORDER BY
        technician_activity.unit_id,
        technician_activity.activity_at,
        technician_activity.user_id
    `,
    [...unitIds, ...unitIds]
  );

  return rows;
}

async function listUnitSnapshotsForLot(lotId, connection = pool) {
  const baseRows = await listBaseUnitRowsForLot(lotId, connection);
  const unitIds = baseRows
    .map((row) => Number(row.unit_id))
    .filter((unitId) => Number.isSafeInteger(unitId) && unitId > 0);

  const [identifierRows, memoryRows, storageRows, technicianRows] = await Promise.all([
    listIdentifierRowsForUnits(unitIds, connection),
    listMemoryRowsForUnits(unitIds, connection),
    listStorageRowsForUnits(unitIds, connection),
    listTechnicianRowsForUnits(unitIds, connection)
  ]);

  return buildUnitSnapshots({
    baseRows,
    identifierRows,
    memoryRows,
    storageRows,
    technicianRows
  });
}

async function buildLotValidationReport(lotId, connection = pool) {
  const [requirements, unitSnapshots] = await Promise.all([
    lotModel.listLotRequirements(lotId),
    listUnitSnapshotsForLot(lotId, connection)
  ]);
  const activeRequirements = requirements.filter((requirement) => Number(requirement.is_active) === 1);
  const requirementSignature = buildRequirementSignature(activeRequirements);
  const overrideMap = await lotValidationOverrideModel.getActiveOverrideMapForLot({
    lotId,
    unitSnapshots,
    requirementSignature,
    connection
  });
  const validatedUnits = unitSnapshots.map((unitSnapshot) => {
    const evaluatedUnit = evaluateUnitSnapshot(unitSnapshot, activeRequirements);
    return applyManagementAcceptance(
      evaluatedUnit,
      overrideMap.get(Number(unitSnapshot.unitId)) || null
    );
  });

  return {
    supported: true,
    message: activeRequirements.length === 0
      ? 'This lot has no active requirements. Units are treated as open until requirements are added.'
      : 'Validation compares current normalized unit data against the active lot requirements.',
    requirementCount: activeRequirements.length,
    requirementSignature,
    unitsChecked: validatedUnits.length,
    unitLimit: UNIT_LIMIT,
    acceptedCount: validatedUnits.filter((unit) => unit.status === 'accepted').length,
    acceptedOverrideCount: validatedUnits.filter((unit) => unit.status === 'accepted_override').length,
    rejectedCount: validatedUnits.filter((unit) => unit.status === 'rejected').length,
    needsReviewCount: validatedUnits.filter((unit) => unit.status === 'needs_review').length,
    openCount: validatedUnits.filter((unit) => unit.status === 'open').length,
    units: validatedUnits
  };
}

module.exports = {
  UNIT_LIMIT,
  buildLotValidationReport,
  listBaseUnitRowsForLot,
  listIdentifierRowsForUnits,
  listMemoryRowsForUnits,
  listStorageRowsForUnits,
  listTechnicianRowsForUnits,
  listUnitSnapshotsForLot
};
