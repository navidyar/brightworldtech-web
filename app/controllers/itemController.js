const itemModel = require('../models/itemModel');
const { getEmptyFormValues, parsePositiveInteger, renderItemForm } = require('../helpers/formHelpers');
const { validateItemForm } = require('../helpers/itemValidation');

async function renderItemsPage(req, res) {
  try {
    res.render('pages/items');
  } catch (error) {
    console.error('Error rendering items page:', error);
    res.status(500).render('pages/error', {
      message: 'Failed to render the items page.'
    });
  }
}

async function renderItemFormFragment(req, res) {
  try {
    return renderItemForm(res);
  } catch (error) {
    console.error('Error rendering item form fragment:', error);
    res.status(500).send('<div class="error-box">Failed to load form.</div>');
  }
}

async function renderItemDetailsPage(req, res) {
  try {
    const id = parsePositiveInteger(req.params.id);

    if (!id) {
      return res.status(404).render('pages/404');
    }

    const item = await itemModel.getItemById(id);

    if (!item) {
      return res.status(404).render('pages/404');
    }

    res.render('pages/item-details', {
      item
    });
  } catch (error) {
    console.error('Error rendering item details page:', error);
    res.status(500).render('pages/error', {
      message: 'Failed to render the item details page.'
    });
  }
}

async function listItems(req, res) {
  try {
    const search = (req.query.search || '').trim();
    const sort = (req.query.sort || 'newest').trim();
    const rows = await itemModel.getAllItems(search, sort);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({
      error: 'Failed to fetch items'
    });
  }
}

async function listItemsFragment(req, res) {
  try {
    const search = (req.query.search || '').trim();
    const sort = (req.query.sort || 'newest').trim();
    const page = parsePositiveInteger(req.query.page) || 1;

    const result = await itemModel.getItemsPage(search, sort, page, 5);

    res.render('fragments/items-table', {
      items: result.rows,
      searchTerm: search,
      sort,
      page: result.page,
      totalPages: result.totalPages,
      totalCount: result.totalCount
    });
  } catch (error) {
    console.error('Error fetching items fragment:', error);
    res.status(500).send(`
      <div class="error-box">
        <p>Failed to load items.</p>
      </div>
    `);
  }
}

async function submitItemForm(req, res) {
  try {
    const validation = validateItemForm(req.body);
    const id = validation.formValues.item_id
      ? parsePositiveInteger(validation.formValues.item_id)
      : null;

    const formMode = id ? 'edit' : 'create';

    if (validation.hasErrors) {
      return renderItemForm(res, {
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

    if (validation.formValues.item_id && !id) {
      return renderItemForm(res, {
        statusCode: 400,
        formMode: 'edit',
        formValues: validation.formValues,
        fieldErrors: {},
        formMessage: {
          type: 'error',
          text: 'Valid item id is required.'
        }
      });
    }

    if (id) {
      const result = await itemModel.updateItem(id, {
        name: validation.formValues.name,
        category: validation.formValues.category,
        quantity: validation.quantityNumber,
        price: validation.priceNumber
      });

      if (result.affectedRows === 0) {
        return renderItemForm(res, {
          statusCode: 404,
          formMode: 'edit',
          formValues: validation.formValues,
          fieldErrors: {},
          formMessage: {
            type: 'error',
            text: 'Item not found.'
          }
        });
      }

      return renderItemForm(res, {
        formMode: 'create',
        formValues: getEmptyFormValues(),
        fieldErrors: {},
        formMessage: {
          type: 'success',
          text: 'Item updated successfully.'
        },
        triggerEvent: 'item-saved'
      });
    }

    await itemModel.createItem({
      name: validation.formValues.name,
      category: validation.formValues.category,
      quantity: validation.quantityNumber,
      price: validation.priceNumber
    });

    return renderItemForm(res, {
      formMode: 'create',
      formValues: getEmptyFormValues(),
      fieldErrors: {},
      formMessage: {
        type: 'success',
        text: 'Item created successfully.'
      },
      triggerEvent: 'item-saved'
    });
  } catch (error) {
    console.error('Error submitting item form:', error);
    return renderItemForm(res, {
      statusCode: 500,
      formMode: 'create',
      formValues: getEmptyFormValues(),
      fieldErrors: {},
      formMessage: {
        type: 'error',
        text: 'Failed to save item.'
      }
    });
  }
}

async function deleteItemHtmx(req, res) {
  try {
    const id = parsePositiveInteger(req.params.id);

    if (!id) {
      return renderItemForm(res, {
        statusCode: 400,
        formMode: 'create',
        formValues: getEmptyFormValues(),
        fieldErrors: {},
        formMessage: {
          type: 'error',
          text: 'Valid item id is required.'
        }
      });
    }

    const result = await itemModel.deleteItem(id);

    if (result.affectedRows === 0) {
      return renderItemForm(res, {
        statusCode: 404,
        formMode: 'create',
        formValues: getEmptyFormValues(),
        fieldErrors: {},
        formMessage: {
          type: 'error',
          text: 'Item not found.'
        }
      });
    }

    return renderItemForm(res, {
      formMode: 'create',
      formValues: getEmptyFormValues(),
      fieldErrors: {},
      formMessage: {
        type: 'success',
        text: 'Item deleted successfully.'
      },
      triggerEvent: 'item-saved'
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    return renderItemForm(res, {
      statusCode: 500,
      formMode: 'create',
      formValues: getEmptyFormValues(),
      fieldErrors: {},
      formMessage: {
        type: 'error',
        text: 'Failed to delete item.'
      }
    });
  }
}

async function createItem(req, res) {
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

    const result = await itemModel.createItem({
      name,
      category,
      quantity,
      price
    });

    res.status(201).json({
      message: 'Item created successfully.',
      id: result.insertId
    });
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({
      error: 'Failed to create item'
    });
  }
}

async function updateItem(req, res) {
  try {
    const id = parsePositiveInteger(req.params.id);
    const name = (req.body.name || '').trim();
    const category = (req.body.category || '').trim();
    const quantity = Number(req.body.quantity);
    const price = Number(req.body.price);

    if (!id) {
      return res.status(400).json({
        error: 'Valid item id is required.'
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

    const result = await itemModel.updateItem(id, {
      name,
      category,
      quantity,
      price
    });

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Item not found.'
      });
    }

    res.json({
      message: 'Item updated successfully.'
    });
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({
      error: 'Failed to update item'
    });
  }
}

async function deleteItem(req, res) {
  try {
    const id = parsePositiveInteger(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: 'Valid item id is required.'
      });
    }

    const result = await itemModel.deleteItem(id);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: 'Item not found.'
      });
    }

    res.json({
      message: 'Item deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({
      error: 'Failed to delete item'
    });
  }
}

module.exports = {
  renderItemsPage,
  renderItemFormFragment,
  renderItemDetailsPage,
  listItems,
  listItemsFragment,
  submitItemForm,
  deleteItemHtmx,
  createItem,
  updateItem,
  deleteItem
};