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
            cv.value,
            cv.sort_order AS sortOrder
       FROM system_config_categories scc
       INNER JOIN config_values cv ON cv.config_category_id = scc.config_category_id
      WHERE scc.system_config_category_id = ?
        AND COALESCE(cv.is_active, 1) = 1
      ORDER BY cv.sort_order, cv.config_value_id`,
    [systemConfigCategoryId]
  );
  return rows;
}

async function listActiveSystemCategoryAliases(connection, systemConfigCategoryId) {
  try {
    const [rows] = await connection.query(
      `SELECT a.tool_config_value_alias_id AS id,
              a.alias_value AS aliasValue,
              a.normalized_alias AS normalizedAlias,
              a.target_config_value_id AS targetId
         FROM system_config_categories scc
         INNER JOIN tool_config_value_aliases a ON a.config_category_id = scc.config_category_id
         INNER JOIN config_values target ON target.config_value_id = a.target_config_value_id AND target.config_category_id = a.config_category_id
        WHERE scc.system_config_category_id = ?
          AND COALESCE(a.is_active, 1) = 1
          AND COALESCE(target.is_active, 1) = 1
        ORDER BY a.tool_config_value_alias_id`,
      [systemConfigCategoryId]
    );
    return rows;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE' || Number(error?.errno) === 1146) return [];
    throw error;
  }
}

function resolveCandidateFromRows(rows, submitted, candidates = [], aliases = []) {
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
      resolvedLabel: matches[0].label,
      resolutionSource: 'configured_value'
    };
  }
  if (matches.length > 1) return { status: 'ambiguous', submitted: submittedText || null };

  const aliasMatches = (Array.isArray(aliases) ? aliases : []).filter((alias) => wanted.has(normalizeLookup(alias.normalizedAlias || alias.aliasValue)));
  const targetIds = [...new Set(aliasMatches.map((alias) => Number(alias.targetId)).filter(Boolean))];
  if (targetIds.length === 1) {
    const target = rows.find((row) => Number(row.id) === targetIds[0]);
    if (target) {
      const matchedAlias = aliasMatches.find((alias) => Number(alias.targetId) === targetIds[0]);
      return {
        status: 'resolved',
        submitted: submittedText || null,
        resolvedId: Number(target.id),
        resolvedLabel: target.label,
        resolutionSource: 'tool_alias',
        matchedAlias: matchedAlias?.aliasValue || submittedText || null
      };
    }
  }
  if (targetIds.length > 1) return { status: 'ambiguous', submitted: submittedText || null };
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
  const [rows, aliases] = await Promise.all([
    listActiveSystemCategoryValues(connection, Number(systemConfigCategoryId)),
    listActiveSystemCategoryAliases(connection, Number(systemConfigCategoryId))
  ]);
  return resolveCandidateFromRows(rows, submitted, candidates, aliases);
}

module.exports = {
  normalizeLookup,
  listActiveSystemCategoryValues,
  listActiveSystemCategoryAliases,
  resolveCandidateFromRows,
  resolveSystemConfigValue
};
