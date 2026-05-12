function validateUnitForm(body) {
  const formValues = {
    unit_id: (body.unit_id || body.item_id || '').trim(),
    name: (body.name || '').trim(),
    category: (body.category || '').trim(),
    quantity: (body.quantity ?? '').toString().trim(),
    price: (body.price ?? '').toString().trim()
  };

  const fieldErrors = {};

  if (!formValues.name) {
    fieldErrors.name = 'Unit name is required.';
  }

  if (!formValues.category) {
    fieldErrors.category = 'Category is required.';
  }

  const quantityNumber = Number(formValues.quantity);

  if (formValues.quantity === '') {
    fieldErrors.quantity = 'Quantity is required.';
  } else if (!Number.isInteger(quantityNumber) || quantityNumber < 0) {
    fieldErrors.quantity = 'Quantity must be a whole number 0 or greater.';
  }

  const priceNumber = Number(formValues.price);

  if (formValues.price === '') {
    fieldErrors.price = 'Price is required.';
  } else if (Number.isNaN(priceNumber) || priceNumber < 0) {
    fieldErrors.price = 'Price must be a number 0 or greater.';
  }

  return {
    formValues,
    fieldErrors,
    quantityNumber,
    priceNumber,
    hasErrors: Object.keys(fieldErrors).length > 0
  };
}

module.exports = {
  validateUnitForm
};