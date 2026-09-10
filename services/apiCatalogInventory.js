'use strict';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[®™©]/g, ' ')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeManufacturerText(value) {
  let text = normalizeText(value)
    .replace(/\b(incorporated|inc|corporation|corp|company|co|limited|ltd|llc|group|technologies|technology)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const aliases = new Map([
    ['hewlett packard', 'hp'],
    ['hewlett packard enterprise', 'hp'],
    ['hp', 'hp'],
    ['dell', 'dell'],
    ['lenovo', 'lenovo'],
    ['microsoft', 'microsoft'],
    ['apple', 'apple']
  ]);
  return aliases.get(text) || text;
}

function stripLeadingTokens(text, prefix) {
  if (!prefix) return text;
  return text === prefix ? '' : text.startsWith(`${prefix} `) ? text.slice(prefix.length + 1).trim() : text;
}

function normalizeModelText(value, manufacturerLabel = '') {
  let text = normalizeText(value);
  text = stripLeadingTokens(text, normalizeManufacturerText(manufacturerLabel));
  const commonPrefixes = ['dell', 'hp', 'lenovo', 'microsoft', 'apple'];
  for (const prefix of commonPrefixes) text = stripLeadingTokens(text, prefix);
  return text;
}

function normalizeProcessorText(value) {
  const withoutReportedClock = String(value ?? '').replace(/\s+@\s+[^,;]+$/i, ' ');
  return normalizeText(withoutReportedClock)
    .replace(/\b(r|tm|cpu|processor)\b/g, ' ')
    .replace(/\b(intel|amd|qualcomm|apple)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOperatingSystemText(value) {
  return normalizeText(value)
    .replace(/^microsoft\s+/, '')
    .replace(/\bprofessional\b/g, 'pro')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueMatches(candidates, submittedKey, aliasBuilder) {
  if (!submittedKey) return [];
  return candidates.filter((candidate) => {
    const aliases = aliasBuilder(candidate).filter(Boolean);
    return aliases.includes(submittedKey);
  });
}

function toResolution(submitted, matches, labelProperty = 'label') {
  if (matches.length === 1) {
    return {
      status: 'resolved',
      submitted,
      resolvedId: Number(matches[0].id),
      resolvedLabel: String(matches[0][labelProperty] || matches[0].label || '').trim()
    };
  }
  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      submitted,
      candidates: matches.slice(0, 10).map((candidate) => ({
        id: Number(candidate.id),
        label: String(candidate[labelProperty] || candidate.label || '').trim()
      }))
    };
  }
  return { status: 'unmapped', submitted };
}

function resolveManufacturerCandidate(submitted, candidates) {
  const key = normalizeManufacturerText(submitted);
  const matches = uniqueMatches(candidates, key, (candidate) => [normalizeManufacturerText(candidate.label)]);
  return toResolution(submitted, matches);
}

function resolveModelCandidate(submitted, candidates, manufacturerLabel = '') {
  const key = normalizeModelText(submitted, manufacturerLabel);
  const matches = uniqueMatches(candidates, key, (candidate) => [
    normalizeModelText(candidate.label, manufacturerLabel),
    normalizeModelText(candidate.label, candidate.manufacturerLabel || manufacturerLabel)
  ]);
  return toResolution(submitted, matches);
}

function resolveProcessorCandidate(submitted, candidates) {
  const key = normalizeProcessorText(submitted);
  const matches = uniqueMatches(candidates, key, (candidate) => {
    const model = String(candidate.modelCode || candidate.label || '').trim();
    const brand = String(candidate.brandName || '').trim();
    return [
      normalizeProcessorText(model),
      normalizeProcessorText(`${brand} ${model}`),
      normalizeProcessorText(`Core ${model}`),
      normalizeProcessorText(`${brand} Core ${model}`)
    ];
  });
  return toResolution(submitted, matches, 'label');
}

function resolveOperatingSystemCandidate(submitted, candidates) {
  const key = normalizeOperatingSystemText(submitted);
  const matches = uniqueMatches(candidates, key, (candidate) => [
    normalizeOperatingSystemText(candidate.label),
    normalizeOperatingSystemText(candidate.value)
  ]);
  return toResolution(submitted, matches);
}

async function resolveManufacturer(connection, submitted) {
  const [rows] = await connection.query(
    `SELECT manufacturer_id AS id, name AS label
       FROM manufacturers
      ORDER BY manufacturer_id`
  );
  return resolveManufacturerCandidate(submitted, rows);
}

async function resolveModel(connection, submitted, { manufacturerId, unitCategoryConfigValueId }) {
  if (!manufacturerId || !unitCategoryConfigValueId) return { status: 'unmapped', submitted, reason: 'model_context_missing' };
  const [rows] = await connection.query(
    `SELECT um.unit_model_id AS id, um.model_name AS label,
            um.manufacturer_id AS manufacturerId,
            um.unit_category_config_value_id AS unitCategoryConfigValueId,
            m.name AS manufacturerLabel
       FROM unit_models um
       INNER JOIN manufacturers m ON m.manufacturer_id = um.manufacturer_id
      WHERE um.is_active = 1
        AND um.manufacturer_id = ?
        AND um.unit_category_config_value_id = ?
      ORDER BY um.unit_model_id`,
    [manufacturerId, unitCategoryConfigValueId]
  );
  return resolveModelCandidate(submitted, rows, rows[0]?.manufacturerLabel || '');
}

async function resolveProcessor(connection, submitted, { unitModelId }) {
  if (!unitModelId) return { status: 'unmapped', submitted, reason: 'processor_context_missing' };
  const [rows] = await connection.query(
    `SELECT pm.processor_model_id AS id,
            pm.model_code AS modelCode,
            CONCAT(pb.name, ' ', pm.model_code) AS label,
            pb.name AS brandName
       FROM unit_model_processor_options option_row
       INNER JOIN processor_models pm ON pm.processor_model_id = option_row.processor_model_id
       INNER JOIN processor_brands pb ON pb.processor_brand_id = pm.processor_brand_id
      WHERE option_row.unit_model_id = ?
        AND option_row.is_active = 1
        AND pm.is_active = 1
        AND pb.is_active = 1
      ORDER BY pm.processor_model_id`,
    [unitModelId]
  );
  return resolveProcessorCandidate(submitted, rows);
}

async function resolveOperatingSystem(connection, submitted) {
  const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
  const [rows] = await connection.query(
    `SELECT cv.config_value_id AS id,
            COALESCE(NULLIF(cv.label, ''), cv.value) AS label,
            cv.value
       FROM system_config_categories scc
       INNER JOIN config_values cv ON cv.config_category_id = scc.config_category_id
      WHERE scc.system_config_category_id = ?
        AND COALESCE(cv.is_active, 1) = 1
      ORDER BY cv.config_value_id`,
    [SYSTEM_CONFIG_CATEGORY_IDS.OPERATING_SYSTEMS]
  );
  return resolveOperatingSystemCandidate(submitted, rows);
}

function storedResolutionValue(resolution) {
  const value = { submitted: resolution.submitted };
  if (resolution.status === 'resolved') {
    value.resolved_id = resolution.resolvedId;
    value.resolved_label = resolution.resolvedLabel;
  } else if (resolution.reason) {
    value.reason = resolution.reason;
  }
  if (Array.isArray(resolution.candidates) && resolution.candidates.length) value.candidates = resolution.candidates;
  return value;
}

module.exports = {
  normalizeManufacturerText,
  normalizeModelText,
  normalizeProcessorText,
  normalizeOperatingSystemText,
  resolveManufacturerCandidate,
  resolveModelCandidate,
  resolveProcessorCandidate,
  resolveOperatingSystemCandidate,
  resolveManufacturer,
  resolveModel,
  resolveProcessor,
  resolveOperatingSystem,
  storedResolutionValue
};
