'use strict';

const {
  LABEL_TEMPLATE_CATEGORIES,
  LABEL_TEMPLATE_STATUSES
} = require('../config/labelLibrary');

const categoryCodes = new Set(LABEL_TEMPLATE_CATEGORIES.map((category) => category.code));
const statusCodes = new Set(LABEL_TEMPLATE_STATUSES);

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
  const errors = [];

  if (name.length < 2) errors.push('Template name is required.');
  if (name.length > 160) errors.push('Template name must be 160 characters or fewer.');
  if (description.length > 1000) errors.push('Description must be 1,000 characters or fewer.');
  if (!categoryCodes.has(categoryCode)) errors.push('Choose a valid label category.');
  if (allowStatus && !statusCodes.has(status)) errors.push('Choose a valid template status.');

  if (errors.length) throw new LabelTemplateInputError(errors);

  return Object.freeze({
    name,
    description: description || null,
    categoryCode,
    status: allowStatus ? status : 'draft'
  });
}

function normalizeLotAssignments(input = {}, availableTemplateIds = []) {
  const allowed = new Set(availableTemplateIds.map(Number));
  const selectedIds = Array.isArray(input.templateId)
    ? input.templateId
    : input.templateId ? [input.templateId] : [];
  const requiredIds = new Set((Array.isArray(input.requiredTemplateId)
    ? input.requiredTemplateId
    : input.requiredTemplateId ? [input.requiredTemplateId] : []).map(Number));
  const activeIds = new Set((Array.isArray(input.activeTemplateId)
    ? input.activeTemplateId
    : input.activeTemplateId ? [input.activeTemplateId] : []).map(Number));
  const quantities = input.quantity || {};
  const sortOrders = input.sortOrder || {};
  const seen = new Set();
  const assignments = [];

  for (const rawId of selectedIds) {
    const labelTemplateId = Number(rawId);
    if (!Number.isSafeInteger(labelTemplateId) || labelTemplateId <= 0 || !allowed.has(labelTemplateId) || seen.has(labelTemplateId)) {
      continue;
    }
    seen.add(labelTemplateId);
    const quantity = Number(quantities[labelTemplateId]);
    const sortOrder = Number(sortOrders[labelTemplateId]);
    assignments.push({
      labelTemplateId,
      isRequired: requiredIds.has(labelTemplateId),
      defaultQuantity: Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10 ? quantity : 1,
      sortOrder: Number.isSafeInteger(sortOrder) && sortOrder > 0 ? sortOrder : (assignments.length + 1) * 10,
      isActive: activeIds.has(labelTemplateId)
    });
  }

  return assignments.sort((a, b) => a.sortOrder - b.sortOrder || a.labelTemplateId - b.labelTemplateId)
    .map((assignment, index) => ({ ...assignment, sortOrder: (index + 1) * 10 }));
}

module.exports = {
  LabelTemplateInputError,
  normalizeTemplateInput,
  normalizeLotAssignments
};
