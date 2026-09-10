'use strict';

function normalizeText(value, maxLength = 160) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeLookup(value) {
  return normalizeText(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function listActiveSystemCategoryValues(connection, systemConfigCategoryId) {
  const [rows] = await connection.query(
    `SELECT cv.config_value_id AS id,
            COALESCE(NULLIF(cv.label, ''), NULLIF(cv.value, '')) AS label,
            cv.value
       FROM system_config_categories scc
       INNER JOIN config_values cv ON cv.config_category_id = scc.config_category_id
      WHERE scc.system_config_category_id = ?
        AND COALESCE(cv.is_active, 1) = 1
      ORDER BY cv.config_value_id`,
    [systemConfigCategoryId]
  );
  return rows;
}

function resolveCandidateFromRows(rows, submitted, candidates = []) {
  const submittedText = normalizeText(submitted, 160);
  const candidateValues = [submittedText, ...candidates].map(normalizeLookup).filter(Boolean);
  if (!candidateValues.length) return { status: 'unknown', submitted: submittedText || null };
  const wanted = new Set(candidateValues);
  const matches = rows.filter((row) => [row.label, row.value].some((candidate) => wanted.has(normalizeLookup(candidate))));
  if (matches.length === 1) {
    return {
      status: 'resolved',
      submitted: submittedText || null,
      resolvedId: Number(matches[0].id),
      resolvedLabel: matches[0].label
    };
  }
  if (matches.length > 1) return { status: 'ambiguous', submitted: submittedText || null };
  return { status: 'unmapped', submitted: submittedText || null };
}

async function resolveSystemConfigValue(connection, {
  systemConfigCategoryId,
  submitted,
  candidates = []
}) {
  if (!Number.isSafeInteger(Number(systemConfigCategoryId)) || Number(systemConfigCategoryId) <= 0) {
    throw new Error('A valid system configuration category ID is required.');
  }
  const rows = await listActiveSystemCategoryValues(connection, Number(systemConfigCategoryId));
  return resolveCandidateFromRows(rows, submitted, candidates);
}

module.exports = {
  normalizeLookup,
  resolveCandidateFromRows,
  resolveSystemConfigValue
};
