function getEmptyUnitFormValues() {
  return {
    unit_id: '',
    name: '',
    category: '',
    quantity: '',
    price: ''
  };
}

function parsePositiveInteger(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function renderUnitForm(res, {
  statusCode = 200,
  formMode = 'create',
  formValues = getEmptyUnitFormValues(),
  fieldErrors = {},
  formMessage = null,
  triggerEvent = null
} = {}) {
  if (triggerEvent) {
    res.set('HX-Trigger', triggerEvent);
  }

  return res.status(statusCode).render('fragments/unit-form', {
    formMode,
    formValues,
    fieldErrors,
    formMessage
  });
}

module.exports = {
  getEmptyUnitFormValues,
  parsePositiveInteger,
  renderUnitForm
};