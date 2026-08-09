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
        u.assigned_to_user_id,
        assigned_user.first_name AS assigned_first_name,
        assigned_user.last_name AS assigned_last_name,
        assigned_user.email AS assigned_email,
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
        u.processor_speed_ghz,
        (
          SELECT GROUP_CONCAT(DISTINCT pfm.processor_family_id ORDER BY pfm.processor_family_id SEPARATOR ',')
          FROM processor_family_members pfm
          INNER JOIN processor_families pf
            ON pf.processor_family_id = pfm.processor_family_id
           AND pf.is_active = 1
          WHERE pfm.processor_model_id = u.processor_model_id
        ) AS processor_family_ids,
        (
          SELECT GROUP_CONCAT(DISTINCT pf.name ORDER BY pf.name SEPARATOR '||')
          FROM processor_family_members pfm
          INNER JOIN processor_families pf
            ON pf.processor_family_id = pfm.processor_family_id
           AND pf.is_active = 1
          WHERE pfm.processor_model_id = u.processor_model_id
        ) AS processor_family_labels,
        u.ram_gb,
        u.ram_type_config_value_id,
        ram_type.code AS ram_type_code,
        COALESCE(ram_type.label, ram_type.code) AS ram_type_label,
        u.storage_gb,
        u.storage_type_config_value_id,
        storage_type.code AS storage_type_code,
        COALESCE(storage_type.label, storage_type.code) AS storage_type_label,
        u.operating_system_config_value_id,
        operating_system.code AS operating_system_code,
        COALESCE(operating_system.label, operating_system.code) AS operating_system_label,
        u.battery_health_percent,
        unit_specifications.os_build,
        unit_specifications.bios_version,
        unit_specifications.absolute_status_config_value_id,
        COALESCE(absolute_status.label, absolute_status.code) AS absolute_status_label,
        unit_specifications.physical_camera_status_config_value_id,
        COALESCE(physical_camera_status.label, physical_camera_status.code) AS physical_camera_status_label,
        unit_specifications.touchscreen_status_config_value_id,
        COALESCE(touchscreen_status.label, touchscreen_status.code) AS touchscreen_status_label,
        unit_specifications.keyboard_language_config_value_id,
        COALESCE(keyboard_language.label, keyboard_language.code) AS keyboard_language_label,
        unit_specifications.complete_diagnostics_status_config_value_id,
        COALESCE(complete_diagnostics_status.label, complete_diagnostics_status.code) AS complete_diagnostics_status_label,
        unit_specifications.virus_check_status_config_value_id,
        COALESCE(virus_check_status.label, virus_check_status.code) AS virus_check_status_label,
        unit_specifications.driver_check_status_config_value_id,
        COALESCE(driver_check_status.label, driver_check_status.code) AS driver_check_status_label,
        unit_specifications.skinned_status_config_value_id,
        COALESCE(skinned_status.label, skinned_status.code) AS skinned_status_label,
        current_grade.overall_grade_config_value_id,
        COALESCE(overall_grade.label, overall_grade.code, overall_grade.value) AS overall_grade_label,
        current_outcome.outcome_code,
        CASE current_outcome.outcome_code WHEN 'pass' THEN 'Pass' WHEN 'fail' THEN 'Fail' ELSE current_outcome.outcome_code END AS outcome_label,
        u.created_at,
        u.updated_at,
        latest_lot_history.unit_lot_history_id AS latest_lot_history_id,
        latest_lot_history.moved_at AS latest_lot_moved_at
      FROM units u
      LEFT JOIN users assigned_user
        ON assigned_user.user_id = u.assigned_to_user_id
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
      LEFT JOIN config_values operating_system
        ON operating_system.config_value_id = u.operating_system_config_value_id
      LEFT JOIN unit_specifications
        ON unit_specifications.unit_id = u.unit_id
      LEFT JOIN config_values absolute_status
        ON absolute_status.config_value_id = unit_specifications.absolute_status_config_value_id
      LEFT JOIN config_values physical_camera_status
        ON physical_camera_status.config_value_id = unit_specifications.physical_camera_status_config_value_id
      LEFT JOIN config_values touchscreen_status
        ON touchscreen_status.config_value_id = unit_specifications.touchscreen_status_config_value_id
      LEFT JOIN config_values keyboard_language
        ON keyboard_language.config_value_id = unit_specifications.keyboard_language_config_value_id
      LEFT JOIN config_values complete_diagnostics_status
        ON complete_diagnostics_status.config_value_id = unit_specifications.complete_diagnostics_status_config_value_id
      LEFT JOIN config_values virus_check_status
        ON virus_check_status.config_value_id = unit_specifications.virus_check_status_config_value_id
      LEFT JOIN config_values driver_check_status
        ON driver_check_status.config_value_id = unit_specifications.driver_check_status_config_value_id
      LEFT JOIN config_values skinned_status
        ON skinned_status.config_value_id = unit_specifications.skinned_status_config_value_id
      LEFT JOIN unit_grade_assessments current_grade
        ON current_grade.unit_grade_assessment_id = (
          SELECT grade_lookup.unit_grade_assessment_id
          FROM unit_grade_assessments grade_lookup
          WHERE grade_lookup.unit_id = u.unit_id
            AND grade_lookup.is_current = 1
          ORDER BY grade_lookup.assessed_at DESC, grade_lookup.unit_grade_assessment_id DESC
          LIMIT 1
        )
      LEFT JOIN config_values overall_grade
        ON overall_grade.config_value_id = current_grade.overall_grade_config_value_id
      LEFT JOIN unit_outcomes current_outcome
        ON current_outcome.unit_outcome_id = (
          SELECT outcome_lookup.unit_outcome_id
          FROM unit_outcomes outcome_lookup
          WHERE outcome_lookup.unit_id = u.unit_id
            AND outcome_lookup.is_current = 1
          ORDER BY outcome_lookup.selected_at DESC, outcome_lookup.unit_outcome_id DESC
          LIMIT 1
        )
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
        COALESCE(ram_type.label, ram_type.code) AS ram_type_label,
        memory.memory_install_type_code,
        CASE memory.memory_install_type_code
          WHEN 'removable_module' THEN 'Removable'
          WHEN 'integrated_soldered' THEN 'Integrated / Soldered'
          WHEN 'unknown' THEN 'Unknown'
          ELSE memory.memory_install_type_code
        END AS memory_install_type_label
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
        COALESCE(storage_type.label, storage_type.code) AS storage_type_label,
        storage.wipe_status_config_value_id,
        wipe_status.code AS wipe_status_code,
        COALESCE(wipe_status.label, wipe_status.code) AS wipe_status_label
      FROM unit_storage_devices storage
      LEFT JOIN config_values storage_type
        ON storage_type.config_value_id = storage.storage_type_config_value_id
      LEFT JOIN config_values wipe_status
        ON wipe_status.config_value_id = storage.wipe_status_config_value_id
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
          AND completion.reversed_at IS NULL

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
    lotModel.listEffectiveLotRequirements(lotId),
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
