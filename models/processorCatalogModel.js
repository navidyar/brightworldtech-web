'use strict';

const { pool } = require('./db');
const processorFamilyModel = require('./processorFamilyModel');

const MAX_PROCESSOR_MODEL_LENGTH = 150;
const MAX_PROCESSOR_FAMILY_LENGTH = 100;
const MAX_PROCESSOR_GENERATION_LENGTH = 80;

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value, maxLength = 150) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeOptionalDecimal(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSearch(value) {
  return normalizeText(value, 150);
}

function normalizeProcessorIdentity(value, brandName = '') {
  let normalized = String(value || '').toLowerCase();
  const brandTokens = String(brandName || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  normalized = normalized
    .replace(/@\s*\d+(?:\.\d+)?\s*ghz\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*ghz\b/g, ' ')
    .replace(/\b\d+(?:st|nd|rd|th)\s*(?:gen|generation)\b/g, ' ')
    .replace(/\b(?:processor|cpu|core)\b/g, ' ');

  for (const token of brandTokens) {
    normalized = normalized.replace(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ');
  }

  return normalized.replace(/[^a-z0-9]+/g, '');
}

function getCanonicalProcessorNameErrors({ brandName = '', modelCode = '' } = {}) {
  const errors = [];
  const safeBrandName = normalizeText(brandName, 100);
  const safeModelCode = normalizeText(modelCode, MAX_PROCESSOR_MODEL_LENGTH);
  if (!safeModelCode) return errors;

  if (/@\s*\d+(?:\.\d+)?(?:\s*ghz)?\b/i.test(safeModelCode) || /\b\d+(?:\.\d+)?\s*ghz\b/i.test(safeModelCode)) {
    errors.push('Keep GHz out of the Processor name. Enter speed only in Base Speed GHz.');
  }
  if (/\b\d+(?:st|nd|rd|th)\s*(?:gen|generation)\b/i.test(safeModelCode)) {
    errors.push('Keep generation text out of the Processor name. Enter it only in Generation.');
  }

  const brandTokens = safeBrandName.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  const lowerModel = safeModelCode.toLowerCase();
  if (brandTokens.some((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lowerModel))) {
    errors.push('Keep the Processor Type/brand out of the Processor name. Store it in Processor Type instead.');
  }
  return errors;
}

function getCatalogFilters(input = {}) {
  return {
    processorBrandId: normalizePositiveInteger(input.processorBrandId),
    includeInactive: String(input.includeInactive || '') === '1',
    needsReview: String(input.needsReview || '') === '1',
    search: normalizeSearch(input.search)
  };
}

async function getTableColumns(connection, tableName) {
  const [rows] = await connection.query(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name));
}

async function tableHasColumn(connection, tableName, columnName) {
  const columns = await getTableColumns(connection, tableName);
  return columns.has(columnName);
}

async function listProcessorBrands(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT processor_brand_id, name, code, is_active
      FROM processor_brands
      ORDER BY is_active DESC, name, code, processor_brand_id
    `
  );

  return rows.map((row) => ({
    id: Number(row.processor_brand_id),
    label: row.name,
    code: row.code,
    isActive: Number(row.is_active) === 1
  }));
}

function buildProcessorDisplayLabel(row) {
  const details = [
    row.processor_family,
    row.generation,
    row.base_speed_ghz !== null && row.base_speed_ghz !== undefined && row.base_speed_ghz !== ''
      ? `${Number(row.base_speed_ghz).toFixed(2)}GHz`
      : ''
  ].filter(Boolean);
  return details.length > 0 ? `${row.model_code} (${details.join(' · ')})` : row.model_code;
}

async function listProcessorCatalogOptions({ includeInactive = false } = {}, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT
        pm.processor_model_id,
        pm.processor_brand_id,
        pm.model_code,
        pm.processor_family,
        pm.generation,
        pm.base_speed_ghz,
        pm.is_active,
        pb.name AS brand_name,
        COUNT(DISTINCT umpo.unit_model_id) AS unit_model_count,
        GROUP_CONCAT(DISTINCT umpo.unit_model_id ORDER BY umpo.unit_model_id SEPARATOR ',') AS unit_model_ids,
        GROUP_CONCAT(
          DISTINCT CONCAT(m_assoc.name, ' ', um_assoc.model_name)
          ORDER BY m_assoc.name, um_assoc.model_name
          SEPARATOR '||'
        ) AS unit_model_labels
      FROM processor_models pm
      INNER JOIN processor_brands pb
        ON pb.processor_brand_id = pm.processor_brand_id
      LEFT JOIN unit_model_processor_options umpo
        ON umpo.processor_model_id = pm.processor_model_id
       AND umpo.is_active = 1
      LEFT JOIN unit_models um_assoc
        ON um_assoc.unit_model_id = umpo.unit_model_id
      LEFT JOIN manufacturers m_assoc
        ON m_assoc.manufacturer_id = um_assoc.manufacturer_id
      WHERE (? = 1 OR pm.is_active = 1)
        AND pb.is_active = 1
      GROUP BY
        pm.processor_model_id,
        pm.processor_brand_id,
        pm.model_code,
        pm.processor_family,
        pm.generation,
        pm.base_speed_ghz,
        pm.is_active,
        pb.name
      ORDER BY pb.name, pm.model_code, pm.generation, pm.processor_model_id
    `,
    [includeInactive ? 1 : 0]
  );

  return rows.map((row) => ({
    id: Number(row.processor_model_id),
    processorBrandId: Number(row.processor_brand_id),
    brandName: row.brand_name,
    modelCode: row.model_code,
    legacyFamily: row.processor_family || '',
    generation: row.generation || '',
    baseSpeedGhz: row.base_speed_ghz,
    isActive: Number(row.is_active) === 1,
    unitModelCount: Number(row.unit_model_count || 0),
    unitModelIds: String(row.unit_model_ids || '').split(',').map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0),
    unitModelLabels: String(row.unit_model_labels || '').split('||').map((value) => value.trim()).filter(Boolean),
    displayLabel: `${row.brand_name} · ${buildProcessorDisplayLabel(row)}`
  }));
}

async function findLikelyProcessorMatches({ processorBrandId = null, brandName = '', modelCode = '', includeInactive = false, limit = 8, processorOptions = null } = {}, connection = pool) {
  const safeBrandId = normalizePositiveInteger(processorBrandId);
  const safeBrandName = normalizeText(brandName, 100);
  const safeModelCode = normalizeText(modelCode, MAX_PROCESSOR_MODEL_LENGTH);
  const requestedIdentity = normalizeProcessorIdentity(safeModelCode, safeBrandName);
  if (requestedIdentity.length < 4) return [];

  const options = Array.isArray(processorOptions)
    ? processorOptions.filter((processor) => includeInactive || processor.isActive)
    : await listProcessorCatalogOptions({ includeInactive }, connection);
  const candidates = options
    .filter((processor) => {
      if (safeBrandId) return processor.processorBrandId === safeBrandId;
      if (safeBrandName) {
        const requestedBrand = safeBrandName.toLowerCase().replace(/\b(?:processor|cpu|core)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
        const candidateBrand = String(processor.brandName || '').toLowerCase().replace(/\b(?:processor|cpu|core)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
        return requestedBrand === candidateBrand || requestedBrand.includes(candidateBrand) || candidateBrand.includes(requestedBrand);
      }
      return true;
    })
    .map((processor) => {
      const candidateIdentity = normalizeProcessorIdentity(processor.modelCode, processor.brandName);
      const identityMatch = candidateIdentity === requestedIdentity;
      const related = candidateIdentity.length >= 4 && (candidateIdentity.includes(requestedIdentity) || requestedIdentity.includes(candidateIdentity));
      return { ...processor, identityMatch, related, normalizedIdentity: candidateIdentity };
    })
    .filter((processor) => processor.identityMatch || processor.related)
    .sort((left, right) => Number(right.identityMatch) - Number(left.identityMatch) || left.modelCode.localeCompare(right.modelCode));

  return candidates.slice(0, Math.max(1, Math.min(Number(limit) || 8, 25)));
}

async function listProcessorModels(filters = {}, connection = pool) {
  const safeFilters = getCatalogFilters(filters);
  const where = [];
  const values = [];

  if (!safeFilters.includeInactive) where.push('pm.is_active = 1');
  if (safeFilters.processorBrandId) {
    where.push('pm.processor_brand_id = ?');
    values.push(safeFilters.processorBrandId);
  }
  if (safeFilters.needsReview) where.push('pfm.processor_model_id IS NULL');
  if (safeFilters.search) {
    const like = `%${safeFilters.search}%`;
    where.push(`(
      pm.model_code LIKE ?
      OR pm.processor_family LIKE ?
      OR pm.generation LIKE ?
      OR pb.name LIKE ?
      OR pf.name LIKE ?
      OR CAST(pm.base_speed_ghz AS CHAR) LIKE ?
    )`);
    values.push(like, like, like, like, like, like);
  }

  const [rows] = await connection.query(
    `
      SELECT
        pm.processor_model_id,
        pm.processor_brand_id,
        pm.model_code,
        pm.processor_family,
        pm.generation,
        pm.base_speed_ghz,
        pm.is_active,
        pb.name AS brand_name,
        COUNT(DISTINCT pfm.processor_family_id) AS processor_family_count,
        GROUP_CONCAT(DISTINCT pf.name ORDER BY pf.name SEPARATOR '||') AS processor_family_labels,
        COUNT(DISTINCT umpo.unit_model_id) AS unit_model_count,
        COUNT(DISTINCT u.unit_id) AS unit_count,
        COUNT(DISTINCT upcr.unit_processor_catalog_request_id) AS request_count
      FROM processor_models pm
      INNER JOIN processor_brands pb
        ON pb.processor_brand_id = pm.processor_brand_id
      LEFT JOIN processor_family_members pfm
        ON pfm.processor_model_id = pm.processor_model_id
      LEFT JOIN processor_families pf
        ON pf.processor_family_id = pfm.processor_family_id
      LEFT JOIN unit_model_processor_options umpo
        ON umpo.processor_model_id = pm.processor_model_id
      LEFT JOIN units u
        ON u.processor_model_id = pm.processor_model_id
      LEFT JOIN unit_processor_catalog_requests upcr
        ON upcr.approved_processor_model_id = pm.processor_model_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY
        pm.processor_model_id,
        pm.processor_brand_id,
        pm.model_code,
        pm.processor_family,
        pm.generation,
        pm.base_speed_ghz,
        pm.is_active,
        pb.name
      ORDER BY pb.name, pm.model_code, pm.generation, pm.processor_model_id
    `,
    values
  );

  return rows.map((row) => ({
    id: Number(row.processor_model_id),
    processorBrandId: Number(row.processor_brand_id),
    brandName: row.brand_name,
    modelCode: row.model_code,
    legacyFamily: row.processor_family || '',
    generation: row.generation || '',
    baseSpeedGhz: row.base_speed_ghz,
    isActive: Number(row.is_active) === 1,
    processorFamilyCount: Number(row.processor_family_count || 0),
    processorFamilyLabels: String(row.processor_family_labels || '').split('||').map((value) => value.trim()).filter(Boolean),
    unitModelCount: Number(row.unit_model_count || 0),
    unitCount: Number(row.unit_count || 0),
    requestCount: Number(row.request_count || 0)
  }));
}

async function getProcessorById(processorModelId, connection = pool) {
  const safeId = normalizePositiveInteger(processorModelId);
  if (!safeId) return null;

  const [rows] = await connection.query(
    `
      SELECT
        pm.processor_model_id,
        pm.processor_brand_id,
        pm.model_code,
        pm.processor_family,
        pm.generation,
        pm.base_speed_ghz,
        pm.is_active,
        pb.name AS brand_name,
        COUNT(DISTINCT pfm.processor_family_id) AS processor_family_count,
        GROUP_CONCAT(DISTINCT pf.name ORDER BY pf.name SEPARATOR '||') AS processor_family_labels,
        COUNT(DISTINCT umpo.unit_model_id) AS unit_model_count,
        COUNT(DISTINCT u.unit_id) AS unit_count,
        COUNT(DISTINCT upcr.unit_processor_catalog_request_id) AS request_count
      FROM processor_models pm
      INNER JOIN processor_brands pb
        ON pb.processor_brand_id = pm.processor_brand_id
      LEFT JOIN processor_family_members pfm
        ON pfm.processor_model_id = pm.processor_model_id
      LEFT JOIN processor_families pf
        ON pf.processor_family_id = pfm.processor_family_id
      LEFT JOIN unit_model_processor_options umpo
        ON umpo.processor_model_id = pm.processor_model_id
      LEFT JOIN units u
        ON u.processor_model_id = pm.processor_model_id
      LEFT JOIN unit_processor_catalog_requests upcr
        ON upcr.approved_processor_model_id = pm.processor_model_id
      WHERE pm.processor_model_id = ?
      GROUP BY
        pm.processor_model_id,
        pm.processor_brand_id,
        pm.model_code,
        pm.processor_family,
        pm.generation,
        pm.base_speed_ghz,
        pm.is_active,
        pb.name
      LIMIT 1
    `,
    [safeId]
  );

  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.processor_model_id),
    processorBrandId: Number(row.processor_brand_id),
    brandName: row.brand_name,
    modelCode: row.model_code,
    legacyFamily: row.processor_family || '',
    generation: row.generation || '',
    baseSpeedGhz: row.base_speed_ghz,
    isActive: Number(row.is_active) === 1,
    processorFamilyCount: Number(row.processor_family_count || 0),
    processorFamilyLabels: String(row.processor_family_labels || '').split('||').map((value) => value.trim()).filter(Boolean),
    unitModelCount: Number(row.unit_model_count || 0),
    unitCount: Number(row.unit_count || 0),
    requestCount: Number(row.request_count || 0)
  };
}

async function processorExists({ processorBrandId, modelCode, excludeProcessorModelId = null }, connection = pool) {
  const brandId = normalizePositiveInteger(processorBrandId);
  const code = normalizeText(modelCode, MAX_PROCESSOR_MODEL_LENGTH);
  const excludeId = normalizePositiveInteger(excludeProcessorModelId);
  if (!brandId || !code) return false;

  const [rows] = await connection.query(
    `
      SELECT processor_model_id
      FROM processor_models
      WHERE processor_brand_id = ?
        AND LOWER(TRIM(model_code)) = LOWER(TRIM(?))
        ${excludeId ? 'AND processor_model_id <> ?' : ''}
      LIMIT 1
    `,
    excludeId ? [brandId, code, excludeId] : [brandId, code]
  );
  return Boolean(rows[0]);
}

async function createProcessorModel(input = {}, currentUserId = null) {
  const processorBrandId = normalizePositiveInteger(input.processorBrandId);
  const modelCode = normalizeText(input.modelCode, MAX_PROCESSOR_MODEL_LENGTH);
  const legacyFamily = normalizeText(input.legacyFamily, MAX_PROCESSOR_FAMILY_LENGTH);
  const generation = normalizeText(input.generation, MAX_PROCESSOR_GENERATION_LENGTH);
  const baseSpeedGhz = normalizeOptionalDecimal(input.baseSpeedGhz);
  const isActive = input.isActive === true || input.isActive === '1';

  if (!processorBrandId || modelCode.length < 2) {
    const error = new Error('Choose a Processor Type and enter a Processor name of at least 2 characters.');
    error.code = 'BWT_PROCESSOR_CATALOG_INPUT_INVALID';
    throw error;
  }
  if (baseSpeedGhz !== null && (baseSpeedGhz < 0.01 || baseSpeedGhz > 99.99)) {
    const error = new Error('Base Speed must be blank or between 0.01 and 99.99 GHz.');
    error.code = 'BWT_PROCESSOR_CATALOG_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [brandRows] = await connection.query(
      'SELECT processor_brand_id, name FROM processor_brands WHERE processor_brand_id = ? AND is_active = 1 LIMIT 1 FOR UPDATE',
      [processorBrandId]
    );
    const brand = brandRows[0];
    if (!brand) {
      const error = new Error('Select an active Processor Type.');
      error.code = 'BWT_PROCESSOR_CATALOG_INPUT_INVALID';
      throw error;
    }

    if (await processorExists({ processorBrandId, modelCode }, connection)) {
      const error = new Error('A processor with that Processor Type and canonical Processor name already exists. Use the existing record or Resolve Duplicate instead.');
      error.code = 'BWT_PROCESSOR_CATALOG_DUPLICATE';
      throw error;
    }

    const [result] = await connection.query(
      `
        INSERT INTO processor_models (
          processor_brand_id,
          processor_family,
          model_code,
          base_speed_ghz,
          generation,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [processorBrandId, legacyFamily || null, modelCode, baseSpeedGhz, generation || null, isActive ? 1 : 0]
    );
    const processorModelId = Number(result.insertId);

    await processorFamilyModel.autoAssignProcessorFamilyMembershipWithConnection(connection, {
      processorModelId,
      processorBrandName: brand.name,
      modelCode,
      currentUserId: normalizePositiveInteger(currentUserId)
    });

    await connection.commit();
    return processorModelId;
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      error.code = 'BWT_PROCESSOR_CATALOG_DUPLICATE';
      error.message = 'A processor with that Processor Type and canonical Processor name already exists. Use the existing record or Resolve Duplicate instead.';
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function updateProcessorModel(processorModelId, input = {}, currentUserId = null) {
  const safeId = normalizePositiveInteger(processorModelId);
  const processorBrandId = normalizePositiveInteger(input.processorBrandId);
  const modelCode = normalizeText(input.modelCode, MAX_PROCESSOR_MODEL_LENGTH);
  const legacyFamily = normalizeText(input.legacyFamily, MAX_PROCESSOR_FAMILY_LENGTH);
  const generation = normalizeText(input.generation, MAX_PROCESSOR_GENERATION_LENGTH);
  const baseSpeedGhz = normalizeOptionalDecimal(input.baseSpeedGhz);
  const isActive = input.isActive === true || input.isActive === '1';

  if (!safeId || !processorBrandId || modelCode.length < 2) {
    const error = new Error('Choose a Processor Type and enter a Processor name of at least 2 characters.');
    error.code = 'BWT_PROCESSOR_CATALOG_INPUT_INVALID';
    throw error;
  }
  if (baseSpeedGhz !== null && (baseSpeedGhz < 0.01 || baseSpeedGhz > 99.99)) {
    const error = new Error('Base Speed must be blank or between 0.01 and 99.99 GHz.');
    error.code = 'BWT_PROCESSOR_CATALOG_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.query(
      `
        SELECT pm.processor_model_id, pm.processor_brand_id, pm.model_code, pb.name AS brand_name
        FROM processor_models pm
        INNER JOIN processor_brands pb ON pb.processor_brand_id = pm.processor_brand_id
        WHERE pm.processor_model_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeId]
    );
    const existing = existingRows[0];
    if (!existing) {
      await connection.rollback();
      return false;
    }

    const [brandRows] = await connection.query(
      'SELECT processor_brand_id, name FROM processor_brands WHERE processor_brand_id = ? AND is_active = 1 LIMIT 1',
      [processorBrandId]
    );
    if (!brandRows[0]) throw new Error('Select an active Processor Type.');

    if (await processorExists({ processorBrandId, modelCode, excludeProcessorModelId: safeId }, connection)) {
      const error = new Error('A processor with that Processor Type and canonical Processor name already exists. Ask an Admin to use Resolve Duplicate instead of creating another duplicate.');
      error.code = 'BWT_PROCESSOR_CATALOG_DUPLICATE';
      throw error;
    }

    await connection.query(
      `
        UPDATE processor_models
        SET processor_brand_id = ?,
            model_code = ?,
            processor_family = ?,
            generation = ?,
            base_speed_ghz = ?,
            is_active = ?
        WHERE processor_model_id = ?
        LIMIT 1
      `,
      [processorBrandId, modelCode, legacyFamily || null, generation || null, baseSpeedGhz, isActive ? 1 : 0, safeId]
    );

    const brandChanged = Number(existing.processor_brand_id) !== processorBrandId;
    const modelCodeChanged = String(existing.model_code || '').trim().toLowerCase() !== modelCode.toLowerCase();
    if ((brandChanged || modelCodeChanged) && await tableHasColumn(connection, 'processor_family_members', 'processor_model_id')) {
      const membershipCondition = brandChanged ? '' : "AND assignment_source = 'automatic'";
      const [memberRows] = await connection.query(
        `SELECT DISTINCT processor_family_id FROM processor_family_members WHERE processor_model_id = ? ${membershipCondition}`,
        [safeId]
      );
      if (memberRows.length > 0) {
        await connection.query(
          `DELETE FROM processor_family_members WHERE processor_model_id = ? ${membershipCondition}`,
          [safeId]
        );
        const familyIds = memberRows.map((row) => Number(row.processor_family_id)).filter(Boolean);
        if (familyIds.length > 0) {
          const placeholders = familyIds.map(() => '?').join(', ');
          await connection.query(
            `
              UPDATE processor_families
              SET membership_version = membership_version + 1,
                  updated_by_user_id = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE processor_family_id IN (${placeholders})
            `,
            [normalizePositiveInteger(currentUserId), ...familyIds]
          );
        }
      }
    }

    await processorFamilyModel.autoAssignProcessorFamilyMembershipWithConnection(connection, {
      processorModelId: safeId,
      processorBrandName: brandRows[0].name,
      modelCode,
      currentUserId: normalizePositiveInteger(currentUserId)
    });

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      error.code = 'BWT_PROCESSOR_CATALOG_DUPLICATE';
      error.message = 'A processor with that Processor Type and canonical Processor name already exists. Ask an Admin to use Resolve Duplicate instead.';
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function listProcessorFamilyMembershipOptions(processorModelId, connection = pool) {
  const processor = await getProcessorById(processorModelId, connection);
  if (!processor) return null;

  const [families, memberRows] = await Promise.all([
    processorFamilyModel.listProcessorFamilies({ includeInactive: true }, connection),
    connection.query(
      `
        SELECT processor_family_id, assignment_source
        FROM processor_family_members
        WHERE processor_model_id = ?
        ORDER BY processor_family_id
      `,
      [processor.id]
    ).then(([rows]) => rows)
  ]);

  const membershipByFamilyId = new Map(memberRows.map((row) => [Number(row.processor_family_id), row.assignment_source || 'manual']));
  return {
    processor,
    families: families
      .filter((family) => Number(family.processor_brand_id) === processor.processorBrandId)
      .map((family) => ({
        id: Number(family.processor_family_id),
        name: family.name,
        code: family.code,
        isActive: Number(family.is_active) === 1,
        isMember: membershipByFamilyId.has(Number(family.processor_family_id)),
        assignmentSource: membershipByFamilyId.get(Number(family.processor_family_id)) || ''
      }))
  };
}

async function replaceProcessorFamilyMemberships({ processorModelId, processorFamilyIds = [], currentUserId = null }) {
  const safeProcessorId = normalizePositiveInteger(processorModelId);
  const selectedFamilyIds = [...new Set((Array.isArray(processorFamilyIds) ? processorFamilyIds : [processorFamilyIds])
    .map(normalizePositiveInteger)
    .filter(Boolean))];
  if (!safeProcessorId) {
    const error = new Error('The selected processor could not be found.');
    error.code = 'BWT_PROCESSOR_FAMILY_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [processorRows] = await connection.query(
      'SELECT processor_model_id, processor_brand_id FROM processor_models WHERE processor_model_id = ? LIMIT 1 FOR UPDATE',
      [safeProcessorId]
    );
    const processor = processorRows[0];
    if (!processor) {
      const error = new Error('The selected processor could not be found.');
      error.code = 'BWT_PROCESSOR_FAMILY_NOT_FOUND';
      throw error;
    }

    if (selectedFamilyIds.length > 0) {
      const placeholders = selectedFamilyIds.map(() => '?').join(', ');
      const [familyRows] = await connection.query(
        `
          SELECT processor_family_id, processor_brand_id
          FROM processor_families
          WHERE processor_family_id IN (${placeholders})
        `,
        selectedFamilyIds
      );
      if (familyRows.length !== selectedFamilyIds.length
        || familyRows.some((row) => Number(row.processor_brand_id) !== Number(processor.processor_brand_id))) {
        const error = new Error('Every selected Processor Family must belong to the same Processor Type as this processor.');
        error.code = 'BWT_PROCESSOR_FAMILY_BRAND_MISMATCH';
        throw error;
      }
    }

    const [currentRows] = await connection.query(
      'SELECT processor_family_id FROM processor_family_members WHERE processor_model_id = ?',
      [safeProcessorId]
    );
    const currentFamilyIds = currentRows.map((row) => Number(row.processor_family_id)).filter(Boolean);
    const currentSorted = [...new Set(currentFamilyIds)].sort((a, b) => a - b);
    const selectedSorted = [...selectedFamilyIds].sort((a, b) => a - b);
    const changed = currentSorted.length !== selectedSorted.length
      || currentSorted.some((value, index) => value !== selectedSorted[index]);

    if (!changed) {
      await connection.commit();
      return { changed: false, familyIds: selectedSorted };
    }

    await connection.query('DELETE FROM processor_family_members WHERE processor_model_id = ?', [safeProcessorId]);
    for (const processorFamilyId of selectedSorted) {
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
        [processorFamilyId, safeProcessorId, normalizePositiveInteger(currentUserId), normalizePositiveInteger(currentUserId)]
      );
    }

    const affectedFamilyIds = [...new Set([...currentSorted, ...selectedSorted])];
    if (affectedFamilyIds.length > 0) {
      const placeholders = affectedFamilyIds.map(() => '?').join(', ');
      await connection.query(
        `
          UPDATE processor_families
          SET membership_version = membership_version + 1,
              updated_by_user_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE processor_family_id IN (${placeholders})
        `,
        [normalizePositiveInteger(currentUserId), ...affectedFamilyIds]
      );
    }

    await connection.commit();
    return { changed: true, familyIds: selectedSorted };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getProcessorDeletionDetails(processorModelId, connection = pool) {
  const processor = await getProcessorById(processorModelId, connection);
  if (!processor) return null;

  let lotRequirementCount = 0;
  if (await tableHasColumn(connection, 'lot_requirements', 'processor_model_id')) {
    const [rows] = await connection.query(
      'SELECT COUNT(*) AS count_value FROM lot_requirements WHERE processor_model_id = ?',
      [processor.id]
    );
    lotRequirementCount = Number(rows[0]?.count_value || 0);
  }

  return { ...processor, lotRequirementCount };
}

async function deleteProcessorModel({ processorModelId, currentUserId = null }) {
  const safeProcessorId = normalizePositiveInteger(processorModelId);
  if (!safeProcessorId) {
    const error = new Error('The selected processor could not be found.');
    error.code = 'BWT_PROCESSOR_DELETE_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [processorRows] = await connection.query(
      `
        SELECT pm.processor_model_id, pm.model_code, pm.processor_brand_id, pb.name AS brand_name
        FROM processor_models pm
        INNER JOIN processor_brands pb ON pb.processor_brand_id = pm.processor_brand_id
        WHERE pm.processor_model_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeProcessorId]
    );
    const processor = processorRows[0];
    if (!processor) {
      const error = new Error('The selected processor could not be found.');
      error.code = 'BWT_PROCESSOR_DELETE_NOT_FOUND';
      throw error;
    }

    let unitCount = 0;
    if (await tableHasColumn(connection, 'units', 'processor_model_id')) {
      const [rows] = await connection.query('SELECT COUNT(*) AS count_value FROM units WHERE processor_model_id = ?', [safeProcessorId]);
      unitCount = Number(rows[0]?.count_value || 0);
    }

    let lotRequirementCount = 0;
    if (await tableHasColumn(connection, 'lot_requirements', 'processor_model_id')) {
      const [rows] = await connection.query('SELECT COUNT(*) AS count_value FROM lot_requirements WHERE processor_model_id = ?', [safeProcessorId]);
      lotRequirementCount = Number(rows[0]?.count_value || 0);
    }

    if (unitCount > 0 || lotRequirementCount > 0) {
      await connection.query(
        'UPDATE processor_models SET is_active = 0 WHERE processor_model_id = ? LIMIT 1',
        [safeProcessorId]
      );
      await connection.commit();
      return {
        deleted: false,
        retired: true,
        processor: { id: safeProcessorId, modelCode: processor.model_code, brandName: processor.brand_name },
        retainedUnitCount: unitCount,
        retainedLotRequirementCount: lotRequirementCount,
        removedModelMappings: 0,
        removedFamilyMemberships: 0,
        clearedRequestLinks: 0
      };
    }

    let removedModelMappings = 0;
    if (await tableHasColumn(connection, 'unit_model_processor_options', 'processor_model_id')) {
      const [result] = await connection.query('DELETE FROM unit_model_processor_options WHERE processor_model_id = ?', [safeProcessorId]);
      removedModelMappings = Number(result.affectedRows || 0);
    }

    let removedFamilyMemberships = 0;
    if (await tableHasColumn(connection, 'processor_family_members', 'processor_model_id')) {
      const [familyRows] = await connection.query(
        'SELECT DISTINCT processor_family_id FROM processor_family_members WHERE processor_model_id = ?',
        [safeProcessorId]
      );
      const familyIds = familyRows.map((row) => Number(row.processor_family_id)).filter(Boolean);
      const [result] = await connection.query('DELETE FROM processor_family_members WHERE processor_model_id = ?', [safeProcessorId]);
      removedFamilyMemberships = Number(result.affectedRows || 0);
      if (familyIds.length > 0) {
        const placeholders = familyIds.map(() => '?').join(', ');
        await connection.query(
          `
            UPDATE processor_families
            SET membership_version = membership_version + 1,
                updated_by_user_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE processor_family_id IN (${placeholders})
          `,
          [normalizePositiveInteger(currentUserId), ...familyIds]
        );
      }
    }

    let clearedRequestLinks = 0;
    if (await tableHasColumn(connection, 'unit_processor_catalog_requests', 'approved_processor_model_id')) {
      const [result] = await connection.query(
        'UPDATE unit_processor_catalog_requests SET approved_processor_model_id = NULL WHERE approved_processor_model_id = ?',
        [safeProcessorId]
      );
      clearedRequestLinks = Number(result.affectedRows || 0);
    }

    await connection.query('DELETE FROM processor_models WHERE processor_model_id = ? LIMIT 1', [safeProcessorId]);
    await connection.commit();
    return {
      deleted: true,
      processor: { id: safeProcessorId, modelCode: processor.model_code, brandName: processor.brand_name },
      removedModelMappings,
      removedFamilyMemberships,
      clearedRequestLinks
    };
  } catch (error) {
    await connection.rollback();
    if (error && (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED')) {
      try {
        await connection.beginTransaction();
        const [result] = await connection.query(
          'UPDATE processor_models SET is_active = 0 WHERE processor_model_id = ? LIMIT 1',
          [safeProcessorId]
        );
        await connection.commit();
        if (Number(result.affectedRows || 0) > 0) {
          return {
            deleted: false,
            retired: true,
            processor: { id: safeProcessorId, modelCode: '', brandName: '' },
            retainedUnitCount: 0,
            retainedLotRequirementCount: 0,
            removedModelMappings: 0,
            removedFamilyMemberships: 0,
            clearedRequestLinks: 0,
            retainedByForeignKey: true
          };
        }
      } catch (retireError) {
        await connection.rollback();
        retireError.cause = error;
        throw retireError;
      }
      const retiredError = new Error('The processor could not be permanently deleted or removed from the active catalog.');
      retiredError.code = 'BWT_PROCESSOR_DELETE_IN_USE';
      throw retiredError;
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function listProcessorUnitModelAssociations(processorModelId, connection = pool) {
  const processor = await getProcessorById(processorModelId, connection);
  if (!processor) return null;

  const [rows] = await connection.query(
    `
      SELECT
        um.unit_model_id,
        um.manufacturer_id,
        m.name AS manufacturer_name,
        um.unit_category_config_value_id,
        COALESCE(cv.label, cv.value, CONCAT('Value #', cv.config_value_id), 'Uncategorized') AS unit_category_label,
        um.model_name,
        um.is_active,
        CASE WHEN umpo.unit_model_processor_option_id IS NOT NULL AND umpo.is_active = 1 THEN 1 ELSE 0 END AS is_mapped
      FROM unit_models um
      INNER JOIN manufacturers m
        ON m.manufacturer_id = um.manufacturer_id
      LEFT JOIN config_values cv
        ON cv.config_value_id = um.unit_category_config_value_id
      LEFT JOIN unit_model_processor_options umpo
        ON umpo.unit_model_id = um.unit_model_id
       AND umpo.processor_model_id = ?
      ORDER BY m.name, unit_category_label, um.model_name, um.unit_model_id
    `,
    [processor.id]
  );

  const models = rows.map((row) => ({
    id: Number(row.unit_model_id),
    manufacturerId: Number(row.manufacturer_id),
    manufacturerName: row.manufacturer_name,
    unitCategoryConfigValueId: row.unit_category_config_value_id ? Number(row.unit_category_config_value_id) : null,
    unitCategoryLabel: row.unit_category_label || 'Uncategorized',
    modelName: row.model_name,
    isActive: Number(row.is_active) === 1,
    isMapped: Number(row.is_mapped) === 1
  }));

  return {
    processor,
    models,
    manufacturers: [...new Map(models.map((model) => [model.manufacturerId, { id: model.manufacturerId, label: model.manufacturerName }])).values()],
    unitCategories: [...new Map(models.filter((model) => model.unitCategoryConfigValueId).map((model) => [model.unitCategoryConfigValueId, { id: model.unitCategoryConfigValueId, label: model.unitCategoryLabel }])).values()]
  };
}

async function replaceProcessorUnitModelAssociations({ processorModelId, unitModelIds = [] }) {
  const safeProcessorId = normalizePositiveInteger(processorModelId);
  const selectedUnitModelIds = [...new Set((Array.isArray(unitModelIds) ? unitModelIds : [unitModelIds])
    .map(normalizePositiveInteger)
    .filter(Boolean))];
  if (!safeProcessorId) {
    const error = new Error('The selected processor could not be found.');
    error.code = 'BWT_PROCESSOR_MODEL_ASSOCIATION_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [processorRows] = await connection.query(
      'SELECT processor_model_id FROM processor_models WHERE processor_model_id = ? LIMIT 1 FOR UPDATE',
      [safeProcessorId]
    );
    if (!processorRows[0]) {
      const error = new Error('The selected processor could not be found.');
      error.code = 'BWT_PROCESSOR_MODEL_ASSOCIATION_NOT_FOUND';
      throw error;
    }

    if (selectedUnitModelIds.length > 0) {
      const placeholders = selectedUnitModelIds.map(() => '?').join(', ');
      const [modelRows] = await connection.query(
        `SELECT unit_model_id FROM unit_models WHERE unit_model_id IN (${placeholders})`,
        selectedUnitModelIds
      );
      if (modelRows.length !== selectedUnitModelIds.length) {
        const error = new Error('One or more selected Unit Models no longer exist. Refresh the page and try again.');
        error.code = 'BWT_PROCESSOR_MODEL_ASSOCIATION_INVALID_MODEL';
        throw error;
      }
    }

    await connection.query(
      'UPDATE unit_model_processor_options SET is_active = 0 WHERE processor_model_id = ?',
      [safeProcessorId]
    );

    for (const unitModelId of selectedUnitModelIds) {
      await connection.query(
        `
          INSERT INTO unit_model_processor_options (unit_model_id, processor_model_id, is_active)
          VALUES (?, ?, 1)
          ON DUPLICATE KEY UPDATE is_active = 1
        `,
        [unitModelId, safeProcessorId]
      );
    }

    await connection.commit();
    return { processorModelId: safeProcessorId, unitModelCount: selectedUnitModelIds.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listMergeTargets(processorModelId, connection = pool) {
  const source = await getProcessorById(processorModelId, connection);
  if (!source) return [];
  const [rows] = await connection.query(
    `
      SELECT
        pm.processor_model_id,
        pm.model_code,
        pm.processor_family,
        pm.generation,
        pm.base_speed_ghz,
        pm.is_active,
        pb.name AS brand_name
      FROM processor_models pm
      INNER JOIN processor_brands pb ON pb.processor_brand_id = pm.processor_brand_id
      WHERE pm.processor_brand_id = ?
        AND pm.processor_model_id <> ?
        AND pm.is_active = 1
      ORDER BY pm.model_code, pm.generation, pm.processor_model_id
    `,
    [source.processorBrandId, source.id]
  );
  return rows.map((row) => ({
    id: Number(row.processor_model_id),
    modelCode: row.model_code,
    brandName: row.brand_name,
    legacyFamily: row.processor_family || '',
    generation: row.generation || '',
    baseSpeedGhz: row.base_speed_ghz,
    displayLabel: `${buildProcessorDisplayLabel(row)} · #${Number(row.processor_model_id)}`
  }));
}

async function mergeProcessorModels({ sourceProcessorModelId, targetProcessorModelId, currentUserId = null }) {
  const sourceId = normalizePositiveInteger(sourceProcessorModelId);
  const targetId = normalizePositiveInteger(targetProcessorModelId);
  if (!sourceId || !targetId || sourceId === targetId) {
    const error = new Error('Choose a different canonical processor to receive this duplicate.');
    error.code = 'BWT_PROCESSOR_MERGE_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `
        SELECT
          pm.processor_model_id,
          pm.processor_brand_id,
          pm.model_code,
          pm.is_active,
          pb.name AS brand_name
        FROM processor_models pm
        INNER JOIN processor_brands pb ON pb.processor_brand_id = pm.processor_brand_id
        WHERE pm.processor_model_id IN (?, ?)
        ORDER BY pm.processor_model_id
        FOR UPDATE
      `,
      [sourceId, targetId]
    );
    const source = rows.find((row) => Number(row.processor_model_id) === sourceId);
    const target = rows.find((row) => Number(row.processor_model_id) === targetId);
    if (!source || !target) {
      const error = new Error('The duplicate processor or canonical processor could not be found.');
      error.code = 'BWT_PROCESSOR_MERGE_NOT_FOUND';
      throw error;
    }
    if (Number(source.processor_brand_id) !== Number(target.processor_brand_id)) {
      const error = new Error('Processors can only be merged within the same Processor Type. Edit the Processor Type first if the duplicate was categorized incorrectly.');
      error.code = 'BWT_PROCESSOR_MERGE_BRAND_MISMATCH';
      throw error;
    }

    const affected = { units: 0, unitModels: 0, processorFamilies: 0, requests: 0, lotRequirements: 0 };

    if (await tableHasColumn(connection, 'units', 'processor_model_id')) {
      const [result] = await connection.query('UPDATE units SET processor_model_id = ? WHERE processor_model_id = ?', [targetId, sourceId]);
      affected.units = Number(result.affectedRows || 0);
    }

    if (await tableHasColumn(connection, 'unit_model_processor_options', 'processor_model_id')) {
      const [mappingRows] = await connection.query(
        'SELECT unit_model_id, MAX(is_active) AS is_active FROM unit_model_processor_options WHERE processor_model_id = ? GROUP BY unit_model_id',
        [sourceId]
      );
      for (const mapping of mappingRows) {
        await connection.query(
          `
            INSERT INTO unit_model_processor_options (unit_model_id, processor_model_id, is_active)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE is_active = GREATEST(is_active, VALUES(is_active))
          `,
          [Number(mapping.unit_model_id), targetId, Number(mapping.is_active) === 1 ? 1 : 0]
        );
      }
      const [deleteResult] = await connection.query('DELETE FROM unit_model_processor_options WHERE processor_model_id = ?', [sourceId]);
      affected.unitModels = Number(deleteResult.affectedRows || 0);
    }

    if (await tableHasColumn(connection, 'processor_family_members', 'processor_model_id')) {
      const [familyRows] = await connection.query(
        `
          SELECT processor_family_id, assignment_source, created_by_user_id
          FROM processor_family_members
          WHERE processor_model_id = ?
        `,
        [sourceId]
      );
      for (const membership of familyRows) {
        await connection.query(
          `
            INSERT IGNORE INTO processor_family_members (
              processor_family_id,
              processor_model_id,
              assignment_source,
              created_by_user_id,
              updated_by_user_id
            ) VALUES (?, ?, ?, ?, ?)
          `,
          [
            Number(membership.processor_family_id),
            targetId,
            membership.assignment_source || 'manual',
            membership.created_by_user_id || null,
            normalizePositiveInteger(currentUserId)
          ]
        );
      }
      const familyIds = [...new Set(familyRows.map((row) => Number(row.processor_family_id)).filter(Boolean))];
      const [deleteResult] = await connection.query('DELETE FROM processor_family_members WHERE processor_model_id = ?', [sourceId]);
      affected.processorFamilies = Number(deleteResult.affectedRows || 0);
      if (familyIds.length > 0) {
        const placeholders = familyIds.map(() => '?').join(', ');
        await connection.query(
          `
            UPDATE processor_families
            SET membership_version = membership_version + 1,
                updated_by_user_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE processor_family_id IN (${placeholders})
          `,
          [normalizePositiveInteger(currentUserId), ...familyIds]
        );
      }
    }

    if (await tableHasColumn(connection, 'unit_processor_catalog_requests', 'approved_processor_model_id')) {
      const [result] = await connection.query(
        'UPDATE unit_processor_catalog_requests SET approved_processor_model_id = ?, approved_processor_brand_id = ? WHERE approved_processor_model_id = ?',
        [targetId, Number(target.processor_brand_id), sourceId]
      );
      affected.requests = Number(result.affectedRows || 0);
    }

    if (await tableHasColumn(connection, 'lot_requirements', 'processor_model_id')) {
      const [result] = await connection.query('UPDATE lot_requirements SET processor_model_id = ? WHERE processor_model_id = ?', [targetId, sourceId]);
      affected.lotRequirements = Number(result.affectedRows || 0);
    }

    await connection.query('UPDATE processor_models SET is_active = 1 WHERE processor_model_id = ? LIMIT 1', [targetId]);
    await connection.query('DELETE FROM processor_models WHERE processor_model_id = ? LIMIT 1', [sourceId]);

    await connection.commit();
    return {
      merged: true,
      source: { id: sourceId, modelCode: source.model_code, brandName: source.brand_name },
      target: { id: targetId, modelCode: target.model_code, brandName: target.brand_name },
      affected
    };
  } catch (error) {
    await connection.rollback();
    if (error && (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED')) {
      const mergeError = new Error('The duplicate processor still has an unhandled database reference, so the merge was rolled back without changing any Units. Contact an Admin before retrying.');
      mergeError.code = 'BWT_PROCESSOR_MERGE_REFERENCE_BLOCKED';
      mergeError.cause = error;
      throw mergeError;
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  MAX_PROCESSOR_MODEL_LENGTH,
  MAX_PROCESSOR_FAMILY_LENGTH,
  MAX_PROCESSOR_GENERATION_LENGTH,
  buildProcessorDisplayLabel,
  createProcessorModel,
  getCatalogFilters,
  getCanonicalProcessorNameErrors,
  getProcessorById,
  findLikelyProcessorMatches,
  deleteProcessorModel,
  getProcessorDeletionDetails,
  listMergeTargets,
  listProcessorBrands,
  listProcessorCatalogOptions,
  listProcessorFamilyMembershipOptions,
  listProcessorModels,
  listProcessorUnitModelAssociations,
  mergeProcessorModels,
  replaceProcessorFamilyMemberships,
  replaceProcessorUnitModelAssociations,
  normalizeOptionalDecimal,
  normalizePositiveInteger,
  normalizeProcessorIdentity,
  normalizeSearch,
  normalizeText,
  processorExists,
  updateProcessorModel
};
