function getEmptyFormValues() {
  return {
    item_id: '',
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

function renderItemForm(res, {
  statusCode = 200,
  formMode = 'create',
  formValues = getEmptyFormValues(),
  fieldErrors = {},
  formMessage = null,
  triggerEvent = null
} = {}) {
  if (triggerEvent) {
    res.set('HX-Trigger', triggerEvent);
  }

  return res.status(statusCode).render('fragments/item-form', {
    formMode,
    formValues,
    fieldErrors,
    formMessage
  });
}

module.exports = {
  getEmptyFormValues,
  parsePositiveInteger,
  renderItemForm
};