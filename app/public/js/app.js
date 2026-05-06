let editingItemId = null;

function refreshItemsTable() {
  document.getElementById('search-form').requestSubmit();
}

function resetPageToFirst() {
  const pageInput = document.getElementById('page-input');
  if (pageInput) {
    pageInput.value = '1';
  }
}

function startEditFromButton(button) {
  editingItemId = Number(button.dataset.id);

  document.getElementById('item-id').value = button.dataset.id;
  document.getElementById('name').value = button.dataset.name;
  document.getElementById('category').value = button.dataset.category;
  document.getElementById('quantity').value = button.dataset.quantity;
  document.getElementById('price').value = Number(button.dataset.price).toFixed(2);

  document.getElementById('form-title').textContent = `Edit Item #${button.dataset.id}`;
  document.getElementById('save-button').textContent = 'Update Item';
  document.getElementById('cancel-edit').style.display = 'inline-block';

  document.getElementById('name').focus();
}

function resetFormState() {
  editingItemId = null;
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');
  const clearButton = document.getElementById('clear-search');
  const itemsContainer = document.getElementById('items-container');

  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    sortSelect.value = 'newest';
    resetPageToFirst();
    refreshItemsTable();
    searchInput.focus();
  });

  sortSelect.addEventListener('change', () => {
    resetPageToFirst();
    refreshItemsTable();
  });

  searchInput.addEventListener('input', () => {
    resetPageToFirst();
  });

  document.body.addEventListener('click', (event) => {
    const editButton = event.target.closest('.edit-button');
    const cancelEditButton = event.target.closest('#cancel-edit');

    if (editButton) {
      startEditFromButton(editButton);
      return;
    }

    if (cancelEditButton) {
      resetFormState();

      const itemFormSection = document.getElementById('item-form-section');
      if (itemFormSection) {
        htmx.ajax('GET', '/items/form', { target: '#item-form-section', swap: 'outerHTML' });
      }
    }
  });

  document.body.addEventListener('item-saved', () => {
    resetFormState();
  });

  itemsContainer.addEventListener('htmx:afterSwap', () => {
    const pageInput = document.getElementById('page-input');
    if (pageInput && !pageInput.value) {
      pageInput.value = '1';
    }
  });
});