'use strict';

const { pool } = require('./db');
const { classifyProcessorFamilyCodes } = require('../services/processorFamilyClassifier');

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value, maxLength = 150) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function slugifyFamilyCode(value) {
  return normalizeText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function normalizeMemberIds(values) {
  const source = Array.isArray(values) ? values : values ? [values] : [];
  return [...new Set(source.map(normalizePositiveInteger).filter(Boolean))];
}

async function processorFamilySchemaSupported(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS table_count
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN ('processor_families', 'processor_family_members')
    `
  );

  return Number(rows[0]?.table_count || 0) === 2;
}

async function processorFamilyShortFormSupported(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS column_count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'processor_families'
        AND COLUMN_NAME = 'export_short_form'
    `
  );

  return Number(rows[0]?.column_count || 0) === 1;
}

async function listProcessorBrands(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT processor_brand_id, code, name
      FROM processor_brands
      WHERE is_active = 1
      ORDER BY name, code
    `
  );

  return rows.map((row) => ({
    id: Number(row.processor_brand_id),
    code: row.code,
    label: row.name || row.code
  }));
}

async function listProcessorFamilies({ includeInactive = true } = {}, connection = pool) {
  if (!await processorFamilySchemaSupported(connection)) return [];

  const activeFilter = includeInactive ? '' : 'WHERE pf.is_active = 1';
  const shortFormSupported = await processorFamilyShortFormSupported(connection);
  const shortFormSelect = shortFormSupported ? 'pf.export_short_form' : 'NULL AS export_short_form';
  const shortFormGroup = shortFormSupported ? ', pf.export_short_form' : '';
  const [rows] = await connection.query(
    `
      SELECT
        pf.processor_family_id,
        pf.processor_brand_id,
        pf.code,
        pf.name,
        ${shortFormSelect},
        pf.description,
        pf.membership_version,
        pf.is_active,
        pb.name AS brand_name,
        COUNT(DISTINCT pfm.processor_model_id) AS member_count,
        COUNT(DISTINCT lr.lot_requirement_id) AS requirement_count
      FROM processor_families pf
      INNER JOIN processor_brands pb
        ON pb.processor_brand_id = pf.processor_brand_id
      LEFT JOIN processor_family_members pfm
        ON pfm.processor_family_id = pf.processor_family_id
      LEFT JOIN lot_requirements lr
        ON lr.processor_family_id = pf.processor_family_id
      ${activeFilter}
      GROUP BY
        pf.processor_family_id,
        pf.processor_brand_id,
        pf.code,
        pf.name${shortFormGroup},
        pf.description,
        pf.membership_version,
        pf.is_active,
        pb.name
      ORDER BY pb.name, pf.sort_order, pf.name, pf.processor_family_id
    `
  );

  return rows.map((row) => ({
    ...row,
    processor_family_id: Number(row.processor_family_id),
    processor_brand_id: Number(row.processor_brand_id),
    membership_version: Number(row.membership_version || 1),
    is_active: Number(row.is_active),
    member_count: Number(row.member_count || 0),
    requirement_count: Number(row.requirement_count || 0)
  }));
}

async function getProcessorFamilyById(processorFamilyId, connection = pool) {
  const safeFamilyId = normalizePositiveInteger(processorFamilyId);
  if (!safeFamilyId || !await processorFamilySchemaSupported(connection)) return null;

  const shortFormSupported = await processorFamilyShortFormSupported(connection);
  const shortFormSelect = shortFormSupported ? 'pf.export_short_form' : 'NULL AS export_short_form';
  const shortFormGroup = shortFormSupported ? ', pf.export_short_form' : '';

  const [rows] = await connection.query(
    `
      SELECT
        pf.processor_family_id,
        pf.processor_brand_id,
        pf.code,
        pf.name,
        ${shortFormSelect},
        pf.description,
        pf.membership_version,
        pf.is_active,
        pb.name AS brand_name,
        COUNT(DISTINCT lr.lot_requirement_id) AS requirement_count
      FROM processor_families pf
      INNER JOIN processor_brands pb
        ON pb.processor_brand_id = pf.processor_brand_id
      LEFT JOIN lot_requirements lr
        ON lr.processor_family_id = pf.processor_family_id
      WHERE pf.processor_family_id = ?
      GROUP BY
        pf.processor_family_id,
        pf.processor_brand_id,
        pf.code,
        pf.name${shortFormGroup},
        pf.description,
        pf.membership_version,
        pf.is_active,
        pb.name
      LIMIT 1
    `,
    [safeFamilyId]
  );

  const row = rows[0];
  return row ? {
    ...row,
    processor_family_id: Number(row.processor_family_id),
    processor_brand_id: Number(row.processor_brand_id),
    membership_version: Number(row.membership_version || 1),
    is_active: Number(row.is_active),
    requirement_count: Number(row.requirement_count || 0)
  } : null;
}

async function listProcessorModelsForFamily({ processorBrandId, processorFamilyId = null }, connection = pool) {
  const safeBrandId = normalizePositiveInteger(processorBrandId);
  const safeFamilyId = normalizePositiveInteger(processorFamilyId);
  if (!safeBrandId) return [];

  const [rows] = await connection.query(
    `
      SELECT
        pm.processor_model_id,
        pm.model_code,
        pm.processor_family AS legacy_family,
        pm.generation,
        pm.base_speed_ghz,
        pm.is_active,
        CASE WHEN pfm.processor_family_id IS NULL THEN 0 ELSE 1 END AS is_member
      FROM processor_models pm
      LEFT JOIN processor_family_members pfm
        ON pfm.processor_model_id = pm.processor_model_id
       AND pfm.processor_family_id = ?
      WHERE pm.processor_brand_id = ?
      ORDER BY pm.is_active DESC, pm.generation, pm.model_code, pm.processor_model_id
    `,
    [safeFamilyId || 0, safeBrandId]
  );

  return rows.map((row) => ({
    id: Number(row.processor_model_id),
    label: row.model_code,
    legacyFamily: row.legacy_family || '',
    generation: row.generation || '',
    baseSpeedGhz: row.base_speed_ghz,
    isActive: Number(row.is_active) === 1,
    isMember: Number(row.is_member) === 1
  }));
}

async function listUnmappedProcessorModels(connection = pool) {
  if (!await processorFamilySchemaSupported(connection)) return [];

  const [rows] = await connection.query(
    `
      SELECT
        pm.processor_model_id,
        pm.model_code,
        pm.processor_family AS legacy_family,
        pm.generation,
        pb.name AS brand_name
      FROM processor_models pm
      INNER JOIN processor_brands pb
        ON pb.processor_brand_id = pm.processor_brand_id
      LEFT JOIN processor_family_members pfm
        ON pfm.processor_model_id = pm.processor_model_id
      WHERE pm.is_active = 1
        AND pb.is_active = 1
        AND pfm.processor_model_id IS NULL
      ORDER BY pb.name, pm.processor_family, pm.generation, pm.model_code, pm.processor_model_id
    `
  );

  return rows.map((row) => ({
    id: Number(row.processor_model_id),
    modelCode: row.model_code,
    legacyFamily: row.legacy_family || '',
    generation: row.generation || '',
    brandName: row.brand_name
  }));
}

async function getProcessorFamilySummary(connection = pool) {
  if (!await processorFamilySchemaSupported(connection)) {
    return { supported: false, shortFormSupported: false, familyCount: 0, activeFamilyCount: 0, mappedProcessorCount: 0, unmappedProcessorCount: 0 };
  }

  const shortFormSupported = await processorFamilyShortFormSupported(connection);

  const [[familyRow], [processorRow]] = await Promise.all([
    connection.query(
      `
        SELECT
          COUNT(*) AS family_count,
          SUM(is_active = 1) AS active_family_count
        FROM processor_families
      `
    ).then(([rows]) => rows),
    connection.query(
      `
        SELECT
          COUNT(DISTINCT CASE WHEN pfm.processor_model_id IS NOT NULL THEN pm.processor_model_id END) AS mapped_processor_count,
          COUNT(DISTINCT CASE WHEN pfm.processor_model_id IS NULL THEN pm.processor_model_id END) AS unmapped_processor_count
        FROM processor_models pm
        LEFT JOIN processor_family_members pfm
          ON pfm.processor_model_id = pm.processor_model_id
        WHERE pm.is_active = 1
      `
    ).then(([rows]) => rows)
  ]);

  return {
    supported: true,
    shortFormSupported,
    familyCount: Number(familyRow?.family_count || 0),
    activeFamilyCount: Number(familyRow?.active_family_count || 0),
    mappedProcessorCount: Number(processorRow?.mapped_processor_count || 0),
    unmappedProcessorCount: Number(processorRow?.unmapped_processor_count || 0)
  };
}

async function assertProcessorBrand(connection, processorBrandId) {
  const safeBrandId = normalizePositiveInteger(processorBrandId);
  if (!safeBrandId) throw new Error('Processor brand is required.');

  const [rows] = await connection.query(
    'SELECT processor_brand_id FROM processor_brands WHERE processor_brand_id = ? AND is_active = 1 LIMIT 1',
    [safeBrandId]
  );

  if (!rows[0]) throw new Error('Select an active processor brand.');
  return safeBrandId;
}

async function assertMemberProcessorsBelongToBrand(connection, processorBrandId, memberIds) {
  if (memberIds.length === 0) return;
  const placeholders = memberIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS matching_count
      FROM processor_models
      WHERE processor_brand_id = ?
        AND processor_model_id IN (${placeholders})
    `,
    [processorBrandId, ...memberIds]
  );

  if (Number(rows[0]?.matching_count || 0) !== memberIds.length) {
    throw new Error('One or more selected processors do not belong to the selected processor brand.');
  }
}

async function listFamilyMemberIds(connection, processorFamilyId) {
  const [rows] = await connection.query(
    `
      SELECT processor_model_id
      FROM processor_family_members
      WHERE processor_family_id = ?
      ORDER BY processor_model_id
    `,
    [processorFamilyId]
  );

  return rows.map((row) => Number(row.processor_model_id)).filter(Number.isSafeInteger);
}

function sameIntegerSet(leftValues, rightValues) {
  const left = [...new Set(leftValues.map(normalizePositiveInteger).filter(Boolean))].sort((a, b) => a - b);
  const right = [...new Set(rightValues.map(normalizePositiveInteger).filter(Boolean))].sort((a, b) => a - b);

  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function replaceFamilyMembers(connection, processorFamilyId, processorBrandId, memberIds, currentUserId) {
  await assertMemberProcessorsBelongToBrand(connection, processorBrandId, memberIds);
  await connection.query('DELETE FROM processor_family_members WHERE processor_family_id = ?', [processorFamilyId]);

  for (const processorModelId of memberIds) {
    await connection.query(
      `
        INSERT INTO processor_family_members (
          processor_family_id,
          processor_model_id,
          assignment_source,
          created_by_user_id,
          updated_by_user_id
        ) VALUES (?, ?, 'manual', ?, ?)
      `,
      [processorFamilyId, processorModelId, currentUserId || null, currentUserId || null]
    );
  }
}

async function createProcessorFamily(formData, currentUserId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const processorBrandId = await assertProcessorBrand(connection, formData.processorBrandId);
    const name = normalizeText(formData.name, 120);
    const code = slugifyFamilyCode(formData.code || name);
    const description = normalizeText(formData.description, 500) || null;
    const exportShortForm = normalizeText(formData.shortForm, 40);
    const memberIds = normalizeMemberIds(formData.memberProcessorModelIds);

    if (!await processorFamilyShortFormSupported(connection)) {
      throw new Error('Processor Family Short Form storage is not ready. Run the Stage 10A migration.');
    }
    if (name.length < 2 || code.length < 2) throw new Error('Processor family name is required.');
    if (!exportShortForm) throw new Error('Processor family Short Form is required.');

    const [result] = await connection.query(
      `
        INSERT INTO processor_families (
          processor_brand_id,
          code,
          name,
          export_short_form,
          description,
          membership_version,
          sort_order,
          is_active,
          created_by_user_id,
          updated_by_user_id
        ) VALUES (?, ?, ?, ?, ?, 1, 0, 1, ?, ?)
      `,
      [processorBrandId, code, name, exportShortForm, description, currentUserId || null, currentUserId || null]
    );

    const processorFamilyId = Number(result.insertId);
    await replaceFamilyMembers(connection, processorFamilyId, processorBrandId, memberIds, currentUserId);
    await connection.commit();
    return { processorFamilyId };
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      error.message = 'A processor family with that name or code already exists.';
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function updateProcessorFamily(processorFamilyId, formData, currentUserId) {
  const safeFamilyId = normalizePositiveInteger(processorFamilyId);
  if (!safeFamilyId) return false;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const existing = await getProcessorFamilyById(safeFamilyId, connection);
    if (!existing) {
      await connection.rollback();
      return false;
    }

    const processorBrandId = await assertProcessorBrand(connection, formData.processorBrandId);
    const name = normalizeText(formData.name, 120);
    const code = slugifyFamilyCode(formData.code || name);
    const description = normalizeText(formData.description, 500) || null;
    const exportShortForm = normalizeText(formData.shortForm, 40);
    const memberIds = normalizeMemberIds(formData.memberProcessorModelIds);
    const currentMemberIds = await listFamilyMemberIds(connection, safeFamilyId);
    const membershipChanged = Number(existing.processor_brand_id) !== processorBrandId
      || !sameIntegerSet(currentMemberIds, memberIds);
    const isActive = formData.isActive === '1' ? 1 : 0;

    if (!await processorFamilyShortFormSupported(connection)) {
      throw new Error('Processor Family Short Form storage is not ready. Run the Stage 10A migration.');
    }
    if (name.length < 2 || code.length < 2) throw new Error('Processor family name is required.');
    if (!exportShortForm) throw new Error('Processor family Short Form is required.');
    if (!isActive && existing.requirement_count > 0) {
      throw new Error('This processor family is used by a Lot requirement and cannot be deactivated.');
    }

    await connection.query(
      `
        UPDATE processor_families
        SET processor_brand_id = ?,
            code = ?,
            name = ?,
            export_short_form = ?,
            description = ?,
            membership_version = membership_version + ?,
            is_active = ?,
            updated_by_user_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE processor_family_id = ?
        LIMIT 1
      `,
      [processorBrandId, code, name, exportShortForm, description, membershipChanged ? 1 : 0, isActive, currentUserId || null, safeFamilyId]
    );

    if (membershipChanged) {
      await replaceFamilyMembers(connection, safeFamilyId, processorBrandId, memberIds, currentUserId);
    }
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      error.message = 'A processor family with that name or code already exists.';
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function autoAssignProcessorFamilyMembershipWithConnection(connection, {
  processorModelId,
  processorBrandName,
  modelCode,
  currentUserId = null
}) {
  const safeProcessorModelId = normalizePositiveInteger(processorModelId);
  if (!safeProcessorModelId || !await processorFamilySchemaSupported(connection)) return [];

  const familyCodes = classifyProcessorFamilyCodes({
    brandName: processorBrandName,
    modelCode
  });

  if (familyCodes.length === 0) return [];
  const placeholders = familyCodes.map(() => '?').join(', ');
  const [families] = await connection.query(
    `
      SELECT processor_family_id, code
      FROM processor_families
      WHERE code IN (${placeholders})
        AND is_active = 1
    `,
    familyCodes
  );

  for (const family of families) {
    const [result] = await connection.query(
      `
        INSERT IGNORE INTO processor_family_members (
          processor_family_id,
          processor_model_id,
          assignment_source,
          created_by_user_id,
          updated_by_user_id
        ) VALUES (?, ?, 'automatic', ?, ?)
      `,
      [Number(family.processor_family_id), safeProcessorModelId, currentUserId || null, currentUserId || null]
    );

    if (Number(result.affectedRows || 0) > 0) {
      await connection.query(
        `
          UPDATE processor_families
          SET membership_version = membership_version + 1,
              updated_by_user_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE processor_family_id = ?
          LIMIT 1
        `,
        [currentUserId || null, Number(family.processor_family_id)]
      );
    }
  }

  return families.map((family) => ({
    id: Number(family.processor_family_id),
    code: family.code
  }));
}

module.exports = {
  autoAssignProcessorFamilyMembershipWithConnection,
  createProcessorFamily,
  getProcessorFamilyById,
  getProcessorFamilySummary,
  listProcessorBrands,
  listProcessorFamilies,
  listProcessorModelsForFamily,
  listUnmappedProcessorModels,
  sameIntegerSet,
  normalizeMemberIds,
  processorFamilySchemaSupported,
  processorFamilyShortFormSupported,
  slugifyFamilyCode,
  updateProcessorFamily
};
