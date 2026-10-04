(() => {
  'use strict';

  function initModelApprovalForm(form) {
    if (form.dataset.modelApprovalReady === '1') return;
    form.dataset.modelApprovalReady = '1';

    const existingId = form.querySelector('[data-existing-model-id]');
    const existingSearch = form.querySelector('[data-existing-model-search]');
    const searchHint = form.querySelector('[data-existing-model-search-hint]');
    const selectionText = form.querySelector('[data-existing-model-selection-text]');
    const categorySelect = form.querySelector('[data-model-category-select]');
    const categoryHint = form.querySelector('[data-model-category-hint]');
    const newFields = Array.from(form.querySelectorAll('[data-new-model-field]'));
    const newSection = form.querySelector('[data-new-model-section]');
    const createNewButton = form.querySelector('[data-create-new-model-instead]');
    const approveButton = form.querySelector('[data-model-approve-button]');
    const datalistId = existingSearch?.getAttribute('list');
    const datalist = datalistId ? document.getElementById(datalistId) : null;
    const options = datalist ? Array.from(datalist.querySelectorAll('option[data-model-id]')) : [];
    const defaultSearchHint = searchHint?.textContent || '';
    const defaultCategoryHint = categoryHint?.textContent || '';

    if (!existingId || !existingSearch) return;

    const optionForValue = (value) => options.find((option) => option.value === String(value || '').trim()) || null;
    const optionForId = (id) => options.find((option) => String(option.dataset.modelId || '') === String(id || '')) || null;

    const syncMode = () => {
      const reusingExisting = Boolean(existingId.value);
      const selectedOption = optionForId(existingId.value);
      const selectedCategoryId = String(selectedOption?.dataset.modelCategoryId || '').trim();
      const categoryChanged = reusingExisting && selectedCategoryId && categorySelect && String(categorySelect.value || '') !== selectedCategoryId;
      newFields.forEach((field) => {
        field.disabled = reusingExisting;
      });
      if (approveButton) {
        approveButton.textContent = reusingExisting
          ? (categoryChanged ? 'Approve Category-Specific Model' : 'Approve Using Existing Model')
          : 'Create and Approve Model';
      }
      if (categoryHint) {
        categoryHint.textContent = categoryChanged
          ? 'The selected Catalog Model will remain unchanged. Approval will create or reuse the same model name in this different Unit Category.'
          : defaultCategoryHint;
      }
    };

    const selectExisting = (id, label = '', categoryId = '', categoryLabel = '') => {
      existingId.value = String(id || '').trim();
      const option = optionForId(existingId.value);
      const resolvedCategoryId = String(categoryId || option?.dataset.modelCategoryId || '').trim();
      const resolvedCategoryLabel = categoryLabel || option?.dataset.modelCategoryLabel || '';
      const resolvedLabel = label || option?.value || (existingId.value ? `Catalog Model #${existingId.value}` : 'None selected');
      if (selectionText) selectionText.textContent = resolvedLabel;
      if (categorySelect && resolvedCategoryId) categorySelect.value = resolvedCategoryId;
      if (searchHint) searchHint.textContent = existingId.value
        ? 'An existing Catalog Model is selected. Search here only if you want to replace that selection.'
        : defaultSearchHint;
      syncMode();
    };

    const createNew = () => {
      existingId.value = '';
      existingSearch.value = '';
      if (selectionText) selectionText.textContent = 'None selected — a new Catalog Model will be created.';
      if (searchHint) searchHint.textContent = defaultSearchHint;
      syncMode();
      newSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const firstNewField = newFields.find((field) => !field.disabled);
      firstNewField?.focus({ preventScroll: true });
    };

    const applySearchSelection = () => {
      const option = optionForValue(existingSearch.value);
      if (option) {
        selectExisting(option.dataset.modelId, option.value, option.dataset.modelCategoryId, option.dataset.modelCategoryLabel);
        if (searchHint) searchHint.textContent = `${option.value} is selected for approval.`;
      } else if (existingSearch.value.trim()) {
        if (searchHint) searchHint.textContent = existingId.value
          ? 'Choose a catalog search result to replace the currently selected model.'
          : 'Choose an exact catalog search result, or use Create a New Catalog Model Instead.';
      } else if (searchHint) {
        searchHint.textContent = defaultSearchHint;
      }
    };

    form.querySelectorAll('[data-use-existing-model-id]').forEach((button) => {
      button.addEventListener('click', () => {
        selectExisting(button.dataset.useExistingModelId, button.dataset.useExistingModelLabel, button.dataset.useExistingModelCategoryId, button.dataset.useExistingModelCategoryLabel);
        existingSearch.value = '';
      });
    });

    existingSearch.addEventListener('input', applySearchSelection);
    existingSearch.addEventListener('change', applySearchSelection);
    createNewButton?.addEventListener('click', createNew);
    categorySelect?.addEventListener('change', syncMode);

    form.addEventListener('submit', () => {
      applySearchSelection();
    });

    const initialOption = optionForId(existingId.value);
    if (existingId.value && initialOption && selectionText && /None selected/i.test(selectionText.textContent || '')) {
      selectionText.textContent = initialOption.value;
    }
    syncMode();
  }

  function init(root = document) {
    root.querySelectorAll('[data-model-request-approval-form]').forEach(initModelApprovalForm);
  }

  document.addEventListener('DOMContentLoaded', () => init(document));
  document.addEventListener('unit-request:modal-loaded', (event) => init(event.detail?.root || document));
})();
