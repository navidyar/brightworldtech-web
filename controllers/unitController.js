const unitModel = require('../models/unitModel');
const { getEmptyUnitFormValues, parsePositiveInteger } = require('../helpers/formHelpers');
const { validateUnitForm } = require('../helpers/unitValidation');

function normalizeRequestedPageSize(value) {
  if (value === 'all') {
    return 'all';
  }

  const parsed = parsePositiveInteger(value);
  const allowed = [50, 100, 300, 500, 1000];

  if (!parsed || !allowed.includes(parsed)) {
    return 50;
  }

  return parsed;
}

function renderUnitForm(res, {
  statusCode = 200,
  formMode = 'create',
  formValues = getEmptyUnitFormValues(),
  fieldErrors = {},
  formMessage = null
} = {}) {
  return res.status(statusCode).render('fragments/unit-form', {
    formMode,
    formValues,
    fieldErrors,
    formMessage
  });
}

async function renderUnitsPage(req, res) {
  try {
    const categories = await unitModel.getDistinctCategories();

    res.render('pages/units', {
      categories
    });
  } catch (error) {
    console.error('Error rendering units page:', error);
    res.status(500).render('pages/error', {
      message: 'Failed to render the units page.'
    });
  }
}

async function renderUnitFormFragment(req, res) {
  try {
    const id = req.query.id ? parsePositiveInteger(req.query.id) : null;

    if (!id) {
      return renderUnitForm(res);
    }

    const unit = await unitModel.getUnitById(id);

    if (!unit) {
      return renderUnitForm(res, {
        statusCode: 404,
        formMode: 'create',
        formValues: getEmptyUnitFormValues(),
        fieldErrors: {},
        formMessage: {
          type: 'error',
          text: 'Unit not found.'
        }
      });
    }

    return renderUnitForm(res, {
      formMode: 'edit',
      formValues: {
        unit_id: String(unit.id),
        name: unit.name || '',
        category: unit.category || '',
        quantity: unit.quantity ?? '',
        price: unit.price ?? ''
      },
      fieldErrors: {},
      formMessage: null
    });
  } catch (error) {
    console.error('Error rendering unit form fragment:', error);
    return res.status(500).send('<div class="error-box">Failed to load unit form.</div>');
  }
}

async function renderUnitDetailsPage(req, res) {
  try {
    const id = parsePositiveInteger(req.params.id);

    if (!id) {
      return res.status(404).render('pages/404');
    }

    const unit = await unitModel.getUnitById(id);

    if (!unit) {
      return res.status(404).render('pages/404');
    }

    res.render('pages/unit-details', {
      unit
    });
  } catch (error) {
    console.error('Error rendering unit details page:', error);
    res.status(500).render('pages/error', {
      message: 'Failed to render the unit details page.'
    });
  }
}

async function listUnits(req, res) {
  try {
    const search = (req.query.search || '').trim();
    const sort = (req.query.sort || 'created_at_desc').trim();
    const category = (req.query.category || '').trim();

    const rows = await unitModel.getAllUnits(search, sort, category);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({
      error: 'Failed to fetch units'
    });
  }
}

async function listUnitsFragment(req, res) {
  try {
    const search = (req.query.search || '').trim();
    const sort = (req.query.sort || 'created_at_desc').trim();
    const category = (req.query.category || '').trim();
    const page = parsePositiveInteger(req.query.page) || 1;
    const pageSize = normalizeRequestedPageSize(req.query.pageSize);

    const result = await unitModel.getUnitsPage(search, sort, page, pageSize, category);

    res.render('fragments/units-table', {
      units: result.rows,
      searchTerm: search,
      sort,
      category,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      totalCount: result.totalCount
    });
  } catch (error) {
    console.error('Error fetching units fragment:', error);
    res.status(500).send(`
      <div class="error-box">
        <p>Failed to load units.</p>
      </div>
    `);
  }
}

async function submitUnitForm(req, res) {
  try {
    const validation = validateUnitForm(req.body);
    const id = validation.formValues.unit_id
      ? parsePositiveInteger(validation.formValues.unit_id)
      : null;

    const formMode = id ? 'edit' : 'create';

    if (validation.hasErrors) {
      return renderUnitForm(res, {
        statusCode: 400,
        formMode,
        formValues: validation.formValues,
        fieldErrors: validation.fieldErrors,
        formMessage: {
          type: 'error',
          text: 'Please correct the highlighted fields.'
        }
      });
    }

    if (validation.formValues.unit_id && !id) {
      return renderUnitForm(res, {
        statusCode: 400,
        formMode: 'edit',
        formValues: validation.formValues,
        fieldErrors: {},
        formMessage: {
          type: 'error',
          text: 'Valid unit id is required.'
        }
      });
    }

    if (id) {
      const result = await unitModel.updateUnit(id, {
        name: validation.formValues.name,
        category: validation.formValues.category,
        quantity: validation.quantityNumber,
        price: validation.priceNumber
      });

      if (result.affectedRows === 0) {
        return renderUnitForm(res, {
          statusCode: 404,
          formMode: 'edit',
          formValues: validation.formValues,
          fieldErrors: {},
          formMessage: {
            type: 'error',
            text: 'Unit not found.'
          }
        });
      }

      res.set('HX-Redirect', '/units');
      return res.status(204).send();
    }

    await unitModel.createUnit({
      name: validation.formValues.name,
      category: validation.formValues.category,
      quantity: validation.quantityNumber,
      price: validation.priceNumber
    });

    res.set('HX-Redirect', '/units');
    return res.status(204).send();
  } catch (error) {
    console.error('Error submitting unit form:', error);
    return renderUnitForm(res, {
      statusCode: 500,
      formMode: 'create',
      formValues: getEmptyUnitFormValues(),
      fieldErrors: {},
      formMessage: {
        type: 'error',
        text: 'Failed to save unit.'
      }
    });
  }
}

async function deleteUnitHtmx(req, res) {
  try {
    const id = parsePositiveInteger(req.params.id);

    if (!id) {
      return res.status(400).send('<div class="error-box">Valid unit id is required.</div>');
    }

    const result = await unitModel.deleteUnit(id);

    if (result.affectedRows === 0) {
      return res.status(404).send('<div class="error-box">Unit not found.</div>');
    }

    res.set('HX-Refresh', 'true');
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting unit:', error);
    return res.status(500).send('<div class="error-box">Failed to delete unit.</div>');
  }
}

async function createUnit(req, res) {
  try {
    const name = (req.body.name || '').trim();
    const category = (req.body.category || '').trim();
    const quantity = Number(req.body.quantity);
    const price = Number(req.body.price);

    if (!name || !category) {
      return res.status(400).json({
        error: 'Name and category are required.'
      });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      return res.status(400).json({
        error: 'Quantity must be a whole number 0 or greater.'
      });
    }

    if (Number.isNaN(price) || price < 0) {
      return res.status(400).json({
        error: 'Price must be a number 0 or greater.'
      });
    }

    const result = await unitModel.createUnit({
      name,
      category,
      quantity,
      price
    });

    res.status(201).json({
      message: 'Unit created successfully.',
      id: result.insertId
    });
  } catch (error) {
    console.error('Error creating unit:', error);
    res.status(500).json({
      error: 'Failed to create unit'
    });
  }
}

async function updateUnit(req, res) {
  try {
    const id = parsePositiveInteger(req.params.id);
    const name = (req.body.name || '').trim();
    const category = (req.body.category || '').trim();
    const quantity = Number(req.body.quantity);
    const price = Number(req.body.price);

    if (!id) {
      return res.status(400).json({
        error: 'Valid unit id is required.'
      });
    }

    if (!name || !category) {
      return res.status(400).json({
        error: 'Name and category are required.'
      });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      return res.status(400).json({
        error: 'Quantity must be a whole number 0 or greater.'
      });
    }

    if (Number.isNaN(price) || price < 0) {
      return res.status(400).json({
        error: 'Price must be a number 0 or greater.'
      });
    }

    const result = await unitModel.updateUnit(id, {
      name,
      category,
      quantity,
      price
    });

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Unit not found.'
      });
    }

    res.json({
      message: 'Unit updated successfully.'
    });
  } catch (error) {
    console.error('Error updating unit:', error);
    res.status(500).json({
      error: 'Failed to update unit'
    });
  }
}

async function deleteUnit(req, res) {
  try {
    const id = parsePositiveInteger(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: 'Valid unit id is required.'
      });
    }

    const result = await unitModel.deleteUnit(id);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Unit not found.'
      });
    }

    res.json({
      message: 'Unit deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(500).json({
      error: 'Failed to delete unit'
    });
  }
}

module.exports = {
  renderUnitsPage,
  renderUnitFormFragment,
  renderUnitDetailsPage,
  listUnits,
  listUnitsFragment,
  submitUnitForm,
  deleteUnitHtmx,
  createUnit,
  updateUnit,
  deleteUnit
};