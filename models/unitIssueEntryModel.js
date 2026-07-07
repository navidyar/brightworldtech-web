const { pool } = require('./db');

const ISSUE_TABLE = 'unit_issue_entries';
const COMMENT_TABLE = 'unit_comments';

const COSMETIC_ISSUE_CATEGORY_CODES = ['cosmetic_issue_types', 'cosmetic_issue_type', 'cosmetic_issues'];
const HARDWARE_ISSUE_CATEGORY_CODES = ['hardware_issue_types', 'hardware_issue_type', 'hardware_issues'];
const ISSUE_LOCATION_CATEGORY_CODES = ['issue_locations', 'issue_location', 'unit_issue_locations'];
const ISSUE_SEVERITY_CATEGORY_CODES = ['issue_severities', 'issue_severity', 'unit_issue_severities'];
const COMMENT_TYPE_CATEGORY_CODES = ['unit_comment_types', 'comment_types', 'note_types'];

async function tableExists(tableName, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS table_count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return Number(rows[0].table_count) > 0;
}

function normalizeText(value) {
  const normalized = String(value || '').trim();

  return normalized || '';
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);

  return normalized || null;
}

function normalizeOptionalInteger(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeIssueRows(rows) {
  if (!rows) {
    return [];
  }

  if (Array.isArray(rows)) {
    return rows.filter((row) => row && typeof row === 'object');
  }

  if (typeof rows === 'object') {
    return Object.keys(rows)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => rows[key])
      .filter((row) => row && typeof row === 'object');
  }

  return [];
}

function issueRowHasAnyValue(row) {
  return Object.values(row || {}).some((value) => normalizeText(value));
}

async function listConfigValuesByCategoryCodes(categoryCodes, connection = pool) {
  const safeCategoryCodes = categoryCodes.map((code) => normalizeText(code)).filter(Boolean);

  if (safeCategoryCodes.length === 0) {
    return [];
  }

  const categoryPlaceholders = safeCategoryCodes.map(() => '?').join(', ');
  const categoryOrderPlaceholders = safeCategoryCodes.map(() => '?').join(', ');

  const [rows] = await connection.query(
    `
      SELECT
        cc.code AS category_code,
        cv.config_value_id,
        cv.code,
        COALESCE(cv.label, cv.code) AS label,
        cv.value,
        cv.sort_order
      FROM config_categories cc
      INNER JOIN config_values cv
        ON cv.config_category_id = cc.config_category_id
      WHERE cc.code IN (${categoryPlaceholders})
        AND COALESCE(cc.is_active, 1) = 1
        AND COALESCE(cv.is_active, 1) = 1
      ORDER BY FIELD(cc.code, ${categoryOrderPlaceholders}), cv.sort_order, label, cv.code
    `,
    [...safeCategoryCodes, ...safeCategoryCodes]
  );

  return rows.map((row) => ({
    id: Number(row.config_value_id),
    categoryCode: row.category_code,
    code: row.code,
    label: row.label,
    value: row.value || row.code
  }));
}

async function findPreferredConfigValueId(categoryCodes, preferredCodes, connection = pool) {
  const options = await listConfigValuesByCategoryCodes(categoryCodes, connection);
  const preferredCodeSet = new Set(preferredCodes.map((code) => normalizeText(code)).filter(Boolean));

  const preferredOption = options.find((option) => preferredCodeSet.has(option.code));

  return preferredOption ? Number(preferredOption.id) : options[0] ? Number(options[0].id) : null;
}

function getBlankIssueFormData() {
  return {
    cosmeticIssues: [
      {
        issueTypeConfigValueId: '',
        severityConfigValueId: '',
        locationConfigValueId: '',
        issueRemark: ''
      }
    ],
    hardwareIssues: [
      {
        issueTypeConfigValueId: '',
        customIssueLabel: '',
        locationConfigValueId: '',
        issueRemark: ''
      }
    ],
    generalCommentTypeConfigValueId: '',
    generalCommentText: ''
  };
}

async function getIssueFormOptions() {
  const [
    cosmeticIssueTypes,
    hardwareIssueTypes,
    issueLocations,
    issueSeverities,
    commentTypes
  ] = await Promise.all([
    listConfigValuesByCategoryCodes(COSMETIC_ISSUE_CATEGORY_CODES),
    listConfigValuesByCategoryCodes(HARDWARE_ISSUE_CATEGORY_CODES),
    listConfigValuesByCategoryCodes(ISSUE_LOCATION_CATEGORY_CODES),
    listConfigValuesByCategoryCodes(ISSUE_SEVERITY_CATEGORY_CODES),
    listConfigValuesByCategoryCodes(COMMENT_TYPE_CATEGORY_CODES)
  ]);

  const defaultCommentType = commentTypes.find((commentType) => commentType.code === 'general') || commentTypes[0] || null;

  return {
    issueOptionsSupported: await tableExists(ISSUE_TABLE),
    commentOptionsSupported: await tableExists(COMMENT_TABLE),
    cosmeticIssueTypes,
    hardwareIssueTypes,
    issueLocations,
    issueSeverities,
    commentTypes,
    defaultCommentTypeConfigValueId: defaultCommentType ? String(defaultCommentType.id) : ''
  };
}

async function getIssueFormDataByUnitId(unitId) {
  const safeUnitId = Number(unitId);
  const blankData = getBlankIssueFormData();

  if (!Number.isInteger(safeUnitId) || safeUnitId <= 0) {
    return blankData;
  }

  const issueTableReady = await tableExists(ISSUE_TABLE);
  const commentOptions = await getIssueFormOptions();

  const formData = {
    ...blankData,
    generalCommentTypeConfigValueId: commentOptions.defaultCommentTypeConfigValueId || '',
    generalCommentText: ''
  };

  if (!issueTableReady) {
    return formData;
  }

  const [issueRows] = await pool.query(
    `
      SELECT
        unit_issue_entry_id,
        issue_area,
        issue_type_config_value_id,
        custom_issue_label,
        severity_config_value_id,
        location_config_value_id,
        issue_remark
      FROM unit_issue_entries
      WHERE unit_id = ?
        AND is_current = 1
      ORDER BY issue_area, created_at DESC, unit_issue_entry_id DESC
    `,
    [safeUnitId]
  );

  const cosmeticIssues = [];
  const hardwareIssues = [];

  issueRows.forEach((row) => {
    if (row.issue_area === 'hardware') {
      hardwareIssues.push({
        issueTypeConfigValueId: row.issue_type_config_value_id ? String(row.issue_type_config_value_id) : '',
        customIssueLabel: row.custom_issue_label || '',
        locationConfigValueId: row.location_config_value_id ? String(row.location_config_value_id) : '',
        issueRemark: row.issue_remark || ''
      });
      return;
    }

    cosmeticIssues.push({
      issueTypeConfigValueId: row.issue_type_config_value_id ? String(row.issue_type_config_value_id) : '',
      severityConfigValueId: row.severity_config_value_id ? String(row.severity_config_value_id) : '',
      locationConfigValueId: row.location_config_value_id ? String(row.location_config_value_id) : '',
      issueRemark: row.issue_remark || ''
    });
  });

  return {
    ...formData,
    cosmeticIssues: cosmeticIssues.length > 0 ? cosmeticIssues : blankData.cosmeticIssues,
    hardwareIssues: hardwareIssues.length > 0 ? hardwareIssues : blankData.hardwareIssues
  };
}

function buildIssueInsertRows(unitId, issueArea, rows, currentUserId) {
  return normalizeIssueRows(rows)
    .filter(issueRowHasAnyValue)
    .map((row) => ({
      unitId,
      issueArea,
      issueTypeConfigValueId: normalizeOptionalInteger(row.issueTypeConfigValueId),
      customIssueLabel: issueArea === 'hardware' ? normalizeNullableText(row.customIssueLabel) : null,
      severityConfigValueId: issueArea === 'cosmetic' ? normalizeOptionalInteger(row.severityConfigValueId) : null,
      locationConfigValueId: normalizeOptionalInteger(row.locationConfigValueId),
      issueRemark: normalizeNullableText(row.issueRemark),
      currentUserId: normalizeOptionalInteger(currentUserId)
    }))
    .filter((row) => row.issueTypeConfigValueId || row.customIssueLabel || row.issueRemark || row.locationConfigValueId || row.severityConfigValueId);
}

async function replaceCurrentIssuesForArea(connection, unitId, issueArea, rows, currentUserId) {
  const newRows = buildIssueInsertRows(unitId, issueArea, rows, currentUserId);

  await connection.query(
    `
      UPDATE unit_issue_entries
      SET
        is_current = 0,
        updated_by_user_id = ?,
        updated_at = NOW()
      WHERE unit_id = ?
        AND issue_area = ?
        AND is_current = 1
    `,
    [normalizeOptionalInteger(currentUserId), unitId, issueArea]
  );

  for (const row of newRows) {
    await connection.query(
      `
        INSERT INTO unit_issue_entries (
          unit_id,
          issue_area,
          issue_type_config_value_id,
          custom_issue_label,
          severity_config_value_id,
          location_config_value_id,
          issue_remark,
          source_code,
          is_current,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 1, ?, ?)
      `,
      [
        row.unitId,
        row.issueArea,
        row.issueTypeConfigValueId,
        row.customIssueLabel,
        row.severityConfigValueId,
        row.locationConfigValueId,
        row.issueRemark,
        row.currentUserId,
        row.currentUserId
      ]
    );
  }
}

async function appendGeneralComment(connection, unitId, formData, currentUserId) {
  const commentText = normalizeText(formData.generalCommentText);

  if (!commentText) {
    return;
  }

  const requestedCommentTypeId = normalizeOptionalInteger(formData.generalCommentTypeConfigValueId);
  const commentTypeId = requestedCommentTypeId || await findPreferredConfigValueId(COMMENT_TYPE_CATEGORY_CODES, ['general'], connection);

  await connection.query(
    `
      INSERT INTO unit_comments (
        unit_id,
        note_type_config_value_id,
        comment_text,
        source_code,
        created_by_user_id
      )
      VALUES (?, ?, ?, 'manual', ?)
    `,
    [unitId, commentTypeId, commentText, normalizeOptionalInteger(currentUserId)]
  );
}

async function saveIssueDetailsForUnitWithConnection(connection, { unitId, formData, currentUserId }) {
  const safeUnitId = Number(unitId);

  if (!connection || !Number.isInteger(safeUnitId) || safeUnitId <= 0) {
    return;
  }

  const issueTableReady = await tableExists(ISSUE_TABLE, connection);
  const commentTableReady = await tableExists(COMMENT_TABLE, connection);

  if (issueTableReady) {
    await replaceCurrentIssuesForArea(connection, safeUnitId, 'cosmetic', formData.cosmeticIssues || [], currentUserId);
    await replaceCurrentIssuesForArea(connection, safeUnitId, 'hardware', formData.hardwareIssues || [], currentUserId);
  }

  if (commentTableReady) {
    await appendGeneralComment(connection, safeUnitId, formData || {}, currentUserId);
  }
}

async function saveIssueDetailsForUnit({ unitId, formData, currentUserId }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await saveIssueDetailsForUnitWithConnection(connection, { unitId, formData, currentUserId });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getBlankIssueFormData,
  getIssueFormOptions,
  getIssueFormDataByUnitId,
  saveIssueDetailsForUnit,
  saveIssueDetailsForUnitWithConnection
};
