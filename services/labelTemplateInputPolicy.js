'use strict';

const {
  LABEL_TEMPLATE_CATEGORIES,
  LABEL_TEMPLATE_STATUSES,
  LABEL_TEMPLATE_PRINT_SCOPES
} = require('../config/labelLibrary');
const {
  DEFAULT_LABEL_BUILDER_MEDIA_CODE,
  LABEL_BUILDER_DEFAULT_LENGTH_MM,
  findLabelBuilderMediaWidth,
  buildLabelBuilderGeometry
} = require('../config/labelBuilder');

const categoryCodes = new Set(LABEL_TEMPLATE_CATEGORIES.map((category) => category.code));
const statusCodes = new Set(LABEL_TEMPLATE_STATUSES);
const printScopeCodes = new Set(LABEL_TEMPLATE_PRINT_SCOPES.map((scope) => scope.code));

class LabelTemplateInputError extends Error {
  constructor(messages) {
    super((Array.isArray(messages) ? messages : [messages]).join(' '));
    this.name = 'LabelTemplateInputError';
    this.messages = Array.isArray(messages) ? messages : [messages];
  }
}

function normalizeTemplateInput(input = {}, { allowStatus = false } = {}) {
  const name = String(input.name || '').trim();
  const description = String(input.description || '').trim();
  const categoryCode = String(input.categoryCode || input.category_code || '').trim().toLowerCase();
  const status = String(input.status || 'draft').trim().toLowerCase();
  const printScope = String(input.printScope || input.print_scope || 'lot').trim().toLowerCase();
  const mediaWidthCode = String(input.mediaWidthCode || input.media_width_code || DEFAULT_LABEL_BUILDER_MEDIA_CODE).trim();
  const mediaWidth = findLabelBuilderMediaWidth(mediaWidthCode);
  const mediaGeometry = mediaWidth ? buildLabelBuilderGeometry(mediaWidth.code, LABEL_BUILDER_DEFAULT_LENGTH_MM) : null;
  const errors = [];

  if (name.length < 2) errors.push('Template name is required.');
  if (name.length > 160) errors.push('Template name must be 160 characters or fewer.');
  if (description.length > 1000) errors.push('Description must be 1,000 characters or fewer.');
  if (!categoryCodes.has(categoryCode)) errors.push('Choose a valid label category.');
  if (allowStatus && !statusCodes.has(status)) errors.push('Choose a valid template status.');
  if (!printScopeCodes.has(printScope)) errors.push('Choose whether the template is for Lot Selection or Standalone printing.');
  if (!mediaWidth || !mediaGeometry) errors.push('Choose a supported continuous roll width.');

  if (errors.length) throw new LabelTemplateInputError(errors);

  return Object.freeze({
    name,
    description: description || null,
    categoryCode,
    printScope,
    status: allowStatus ? status : 'draft',
    mediaWidthCode: mediaWidth?.code || DEFAULT_LABEL_BUILDER_MEDIA_CODE,
    mediaWidth: mediaWidth || null,
    mediaGeometry: mediaGeometry || null
  });
}

function getIndexedInputValue(input = {}, fieldName, key) {
  const directKey = `${fieldName}_${key}`;
  if (input[directKey] !== undefined) return input[directKey];

  const nested = input[fieldName];
  if (nested && typeof nested === 'object' && !Array.isArray(nested) && nested[key] !== undefined) {
    return nested[key];
  }
  const literalKey = `${fieldName}[${key}]`;
  if (input[literalKey] !== undefined) return input[literalKey];
  return undefined;
}

function normalizeLotAssignments(input = {}, availableTemplateIds = []) {
  const allowed = new Set(availableTemplateIds.map(Number));
  const selectedIds = Array.isArray(input.templateId)
    ? input.templateId
    : input.templateId ? [input.templateId] : [];
  const normalPrintIds = new Set((Array.isArray(input.normalPrintTemplateId)
    ? input.normalPrintTemplateId
    : input.normalPrintTemplateId ? [input.normalPrintTemplateId]
      : Array.isArray(input.requiredTemplateId) ? input.requiredTemplateId
        : input.requiredTemplateId ? [input.requiredTemplateId] : []).map(Number));
  const seen = new Set();
  const assignments = [];

  for (const rawId of selectedIds) {
    const labelTemplateId = Number(rawId);
    if (!Number.isSafeInteger(labelTemplateId) || labelTemplateId <= 0 || !allowed.has(labelTemplateId) || seen.has(labelTemplateId)) {
      continue;
    }
    seen.add(labelTemplateId);
    const quantity = Number(getIndexedInputValue(input, 'quantity', labelTemplateId));
    assignments.push({
      labelTemplateId,
      isRequired: normalPrintIds.has(labelTemplateId),
      defaultQuantity: Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10 ? quantity : 1,
      sortOrder: (assignments.length + 1) * 10,
      isActive: true
    });
  }

  return assignments;
}

module.exports = {
  LabelTemplateInputError,
  normalizeTemplateInput,
  normalizeLotAssignments
};
