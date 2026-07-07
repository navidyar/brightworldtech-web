(function () {
  function getFormFromElement(element) {
    return element ? element.closest('[data-tech-unit-form]') : null;
  }

  function getSelectedOption(select) {
    return select && select.selectedOptions.length > 0 ? select.selectedOptions[0] : null;
  }

  function normalizeSerialInput(input) {
    if (!input) {
      return '';
    }

    const normalizedValue = String(input.value || '').toUpperCase();

    if (input.value !== normalizedValue) {
      input.value = normalizedValue;
    }

    return normalizedValue.trim();
  }

  function clearDuplicateCheck(form) {
    const region = form ? form.querySelector('[data-duplicate-check-region]') : null;

    if (region) {
      region.innerHTML = '';
    }
  }

  function getDuplicateMatchCount(region) {
    const result = region ? region.querySelector('[data-duplicate-check-result]') : null;
    const rawCount = result ? Number(result.getAttribute('data-duplicate-match-count')) : NaN;

    return Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : null;
  }

  async function refreshDuplicateCheck(form) {
    const region = form ? form.querySelector('[data-duplicate-check-region]') : null;

    if (!region) {
      return { matchCount: null };
    }

    const serialInputs = Array.from(form.querySelectorAll('[data-duplicate-check-serial]'));
    const unitSerialInput = serialInputs.find((input) => input.name === 'unitSerialNumber');
    const biosSerialInput = serialInputs.find((input) => input.name === 'biosSerialNumber');
    const unitSerialNumber = normalizeSerialInput(unitSerialInput);
    const biosSerialNumber = normalizeSerialInput(biosSerialInput);

    if (!unitSerialNumber && !biosSerialNumber) {
      clearDuplicateCheck(form);
      return { matchCount: 0 };
    }

    const previousController = form._duplicateCheckAbortController;

    if (previousController) {
      previousController.abort();
    }

    const abortController = new AbortController();
    form._duplicateCheckAbortController = abortController;
    const params = new URLSearchParams();

    if (unitSerialNumber) {
      params.set('unitSerialNumber', unitSerialNumber);
    }

    if (biosSerialNumber) {
      params.set('biosSerialNumber', biosSerialNumber);
    }

    const destinationLotSelect = form.querySelector('[name="lotId"]');

    if (destinationLotSelect && destinationLotSelect.value) {
      params.set('destinationLotId', destinationLotSelect.value);
    }

    const duplicateAssumptionNonce = form.querySelector('[data-duplicate-assumption-nonce]');

    if (duplicateAssumptionNonce && duplicateAssumptionNonce.value) {
      params.set('duplicateAssumptionNonce', duplicateAssumptionNonce.value);
    }

    region.innerHTML = '<p class="field-hint tech-unit-duplicate-check-pending">Checking for existing serial matches…</p>';

    try {
      const response = await fetch(`/tech/units/duplicate-check?${params.toString()}`, {
        headers: { 'HX-Request': 'true' },
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error('Duplicate check request failed.');
      }

      if (form._duplicateCheckAbortController !== abortController) {
        return { matchCount: null };
      }

      region.innerHTML = await response.text();
      updateIntentionalDuplicateRequestControls(form);
      return { matchCount: getDuplicateMatchCount(region) };
    } catch (error) {
      if (error.name === 'AbortError') {
        return { matchCount: null };
      }

      region.innerHTML = '<div class="message error"><p>The serial duplicate check could not be completed. Refresh the check before creating a new unit.</p></div>';
      return { matchCount: null };
    }
  }

  function setSelectValue(select, value) {
    if (!select || !value) {
      return false;
    }

    const matchingOption = Array.from(select.options).find((option) => option.value === String(value));

    if (!matchingOption) {
      return false;
    }

    select.value = String(value);
    return true;
  }

  function normalizeModelSearch(value) {
    return String(value || '').trim().toLocaleLowerCase();
  }

  function getAssignableLotCatalog(form) {
    return form ? form.querySelector('[data-assignable-lot-catalog]') : null;
  }

  function getAssignableLotComboboxInput(form) {
    return form ? form.querySelector('[data-assignable-lot-combobox-input]') : null;
  }

  function getAssignableLotOptionsContainer(form) {
    return form ? form.querySelector('[data-assignable-lot-options]') : null;
  }

  function setAssignableLotComboboxLayer(form, isOpen) {
    const combobox = form ? form.querySelector('[data-assignable-lot-combobox]') : null;
    const section = combobox ? combobox.closest('.form-section') : null;

    if (section) {
      section.classList.toggle('tech-assignable-lot-combobox-open', Boolean(isOpen));
    }
  }

  function getAssignableLotOptionById(form, lotId) {
    const catalog = getAssignableLotCatalog(form);

    if (!catalog || !lotId) {
      return null;
    }

    return Array.from(catalog.options).find((option) => option.value === String(lotId)) || null;
  }

  function getAssignableLotOptionLabel(option) {
    return option ? String(option.textContent || '').trim() : '';
  }

  function getAssignableLotFilterState(form) {
    const comboboxInput = getAssignableLotComboboxInput(form);

    return {
      search: normalizeModelSearch(comboboxInput ? comboboxInput.value : '')
    };
  }

  function getVisibleAssignableLotOptions(form, includeSelectedOption, ignoreSearch) {
    const catalog = getAssignableLotCatalog(form);
    const filters = getAssignableLotFilterState(form);

    if (ignoreSearch) {
      filters.search = '';
    }

    if (!catalog) {
      return [];
    }

    return Array.from(catalog.options).filter((option) => {
      if (!option.value) {
        return false;
      }

      const isSelected = includeSelectedOption && option.value === catalog.value;
      const label = normalizeModelSearch(getAssignableLotOptionLabel(option));
      const matchesSearch = !filters.search || label.includes(filters.search);

      return matchesSearch || isSelected;
    });
  }

  function closeAssignableLotOptions(form) {
    const optionsContainer = getAssignableLotOptionsContainer(form);
    const comboboxInput = getAssignableLotComboboxInput(form);

    if (optionsContainer) {
      optionsContainer.hidden = true;
      optionsContainer.replaceChildren();
    }

    if (comboboxInput) {
      comboboxInput.setAttribute('aria-expanded', 'false');
    }

    setAssignableLotComboboxLayer(form, false);
  }

  function setAssignableLotInputValidity(form, message) {
    const comboboxInput = getAssignableLotComboboxInput(form);

    if (comboboxInput) {
      comboboxInput.setCustomValidity(message || '');
    }
  }

  function clearAssignableLotSelection(form) {
    const catalog = getAssignableLotCatalog(form);

    if (catalog) {
      catalog.value = '';
    }

    setAssignableLotInputValidity(form, '');
    updateAssignableLotAssumptionStatus(form);
    updateIntentionalDuplicateRequestControls(form);
  }

  function updateAssignableLotHint(form) {
    const hint = form ? form.querySelector('[data-assignable-lot-hint]') : null;
    const catalog = getAssignableLotCatalog(form);
    const visibleCount = getVisibleAssignableLotOptions(form, true, true).length;

    if (!hint || !catalog) {
      return;
    }

    if (visibleCount === 0) {
      hint.textContent = 'No assignable lots are currently available.';
      return;
    }

    hint.textContent = `${visibleCount} assignable lot${visibleCount === 1 ? '' : 's'} available. Search by lot name, then choose a listed lot.`;
  }

  function getIntentionalDuplicateRequestReadiness(form) {
    const lotSelect = form ? form.querySelector('[data-lot-select]') : null;
    const categorySelect = form ? form.querySelector('[data-unit-category-select]') : null;
    const unitStatusInput = form ? form.querySelector('[name="currentUnitStatusConfigValueId"]') : null;
    const missingLabels = [];

    if (!lotSelect || !String(lotSelect.value || '').trim()) {
      missingLabels.push('an Assignable Lot');
    }

    if (!categorySelect || !String(categorySelect.value || '').trim()) {
      missingLabels.push('a Unit Category');
    }

    if (!unitStatusInput || !String(unitStatusInput.value || '').trim()) {
      missingLabels.push('a Unit Status');
    }

    return {
      ready: missingLabels.length === 0,
      message: missingLabels.length === 0
        ? ''
        : `Select ${missingLabels.join(' and ')} before requesting an intentional duplicate.`
    };
  }

  function updateIntentionalDuplicateRequestControls(form) {
    const buttons = form ? Array.from(form.querySelectorAll('[data-intentional-duplicate-request-unit-id]')) : [];

    if (buttons.length === 0) {
      return;
    }

    const readiness = getIntentionalDuplicateRequestReadiness(form);

    buttons.forEach((button) => {
      const actionGroup = button.closest('.tech-duplicate-candidate-actions');
      const hint = actionGroup ? actionGroup.querySelector('[data-intentional-duplicate-request-readiness]') : null;

      button.disabled = !readiness.ready;
      button.setAttribute('aria-disabled', readiness.ready ? 'false' : 'true');

      if (hint) {
        hint.textContent = readiness.ready
          ? 'Complete the reviewer reason in the next step. No new Unit or Asset Tag is created until approval.'
          : readiness.message;
        hint.hidden = false;
      }
    });
  }

  function updateAssignableLotAssumptionStatus(form) {
    const status = form ? form.querySelector('[data-assignable-lot-assumption-status]') : null;
    const catalog = getAssignableLotCatalog(form);
    const selectedOption = getAssignableLotOptionById(form, catalog ? catalog.value : '');

    if (!status) {
      return;
    }

    if (!selectedOption) {
      status.hidden = true;
      status.removeAttribute('data-status');
      return;
    }

    const assumptionEnabled = selectedOption.getAttribute('data-allow-duplicate-unit-assumption') === '1';
    let state = status.querySelector('[data-assignable-lot-assumption-status-state]');

    if (!state) {
      status.replaceChildren(
        document.createTextNode('Existing-unit assumption is '),
        Object.assign(document.createElement('span'), {
          textContent: assumptionEnabled ? 'enabled' : 'not enabled'
        }),
        document.createTextNode(' for this lot.')
      );
      state = status.querySelector('span');
      state.setAttribute('data-assignable-lot-assumption-status-state', '');
    } else {
      state.textContent = assumptionEnabled ? 'enabled' : 'not enabled';
    }

    status.dataset.status = assumptionEnabled ? 'enabled' : 'disabled';
    status.hidden = false;
  }

  function renderAssignableLotOptions(form, openOptions, ignoreSearch) {
    const optionsContainer = getAssignableLotOptionsContainer(form);
    const comboboxInput = getAssignableLotComboboxInput(form);
    const catalog = getAssignableLotCatalog(form);

    if (!optionsContainer || !comboboxInput || !catalog) {
      return;
    }

    optionsContainer.replaceChildren();

    if (!openOptions) {
      closeAssignableLotOptions(form);
      return;
    }

    const visibleOptions = getVisibleAssignableLotOptions(form, true, ignoreSearch).slice(0, 75);

    if (visibleOptions.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'tech-assignable-lot-options-empty';
      emptyState.textContent = 'No matching assignable lots.';
      optionsContainer.appendChild(emptyState);
    } else {
      visibleOptions.forEach((option) => {
        const optionButton = document.createElement('button');
        optionButton.type = 'button';
        optionButton.className = 'tech-assignable-lot-option';
        optionButton.setAttribute('role', 'option');
        optionButton.setAttribute('data-assignable-lot-option', option.value);
        optionButton.setAttribute('aria-selected', option.value === catalog.value ? 'true' : 'false');
        optionButton.textContent = getAssignableLotOptionLabel(option);
        optionsContainer.appendChild(optionButton);
      });
    }

    optionsContainer.hidden = false;
    comboboxInput.setAttribute('aria-expanded', 'true');
    setAssignableLotComboboxLayer(form, true);
  }

  function refreshDuplicateCheckForSelectedLot(form) {
    const hasSerialSearch = Array.from(form ? form.querySelectorAll('[data-duplicate-check-serial]') : [])
      .some((input) => normalizeSerialInput(input));

    if (hasSerialSearch) {
      refreshDuplicateCheck(form);
    }
  }

  function selectAssignableLotOption(form, lotId) {
    const catalog = getAssignableLotCatalog(form);
    const comboboxInput = getAssignableLotComboboxInput(form);
    const option = getAssignableLotOptionById(form, lotId);

    if (!catalog || !comboboxInput || !option) {
      return;
    }

    catalog.value = option.value;
    comboboxInput.value = getAssignableLotOptionLabel(option);
    setAssignableLotInputValidity(form, '');
    closeAssignableLotOptions(form);
    updateAssignableLotAssumptionStatus(form);
    updateIntentionalDuplicateRequestControls(form);
    updateProductionWeightPreview(form);
    refreshDuplicateCheckForSelectedLot(form);
  }

  function resolveExactAssignableLotMatch(form) {
    const catalog = getAssignableLotCatalog(form);
    const comboboxInput = getAssignableLotComboboxInput(form);

    if (!catalog || !comboboxInput || !comboboxInput.value.trim()) {
      return false;
    }

    const normalizedValue = normalizeModelSearch(comboboxInput.value);
    const matchingOption = Array.from(catalog.options).find(
      (option) => option.value && normalizeModelSearch(getAssignableLotOptionLabel(option)) === normalizedValue
    );

    if (!matchingOption) {
      return false;
    }

    selectAssignableLotOption(form, matchingOption.value);
    return true;
  }

  function synchronizeAssignableLotCombobox(form) {
    const catalog = getAssignableLotCatalog(form);
    const comboboxInput = getAssignableLotComboboxInput(form);
    const selectedOption = getAssignableLotOptionById(form, catalog ? catalog.value : '');

    if (!catalog || !comboboxInput) {
      return;
    }

    if (selectedOption && !comboboxInput.value) {
      comboboxInput.value = getAssignableLotOptionLabel(selectedOption);
    }

    updateAssignableLotHint(form);
    updateAssignableLotAssumptionStatus(form);
  }

  function getUnitModelCatalog(form) {
    return form ? form.querySelector('[data-unit-model-catalog]') : null;
  }

  function getUnitModelSelectionInput(form) {
    return form ? form.querySelector('[data-unit-model-select]') : null;
  }

  function getUnitModelComboboxInput(form) {
    return form ? form.querySelector('[data-unit-model-combobox-input]') : null;
  }

  function getUnitModelOptionsContainer(form) {
    return form ? form.querySelector('[data-unit-model-options]') : null;
  }

  function setUnitModelComboboxLayer(form, isOpen) {
    const combobox = form ? form.querySelector('[data-unit-model-combobox]') : null;
    const section = combobox ? combobox.closest('.form-section') : null;

    if (section) {
      section.classList.toggle('tech-unit-model-combobox-open', Boolean(isOpen));
    }
  }

  function getUnitModelOptionById(form, unitModelId) {
    const catalog = getUnitModelCatalog(form);

    if (!catalog || !unitModelId) {
      return null;
    }

    return Array.from(catalog.options).find((option) => option.value === String(unitModelId)) || null;
  }

  function getUnitModelOptionLabel(option) {
    return option ? String(option.textContent || '').trim() : '';
  }

  function getModelFilterState(form) {
    const manufacturerSelect = form.querySelector('[data-manufacturer-select]');
    const comboboxInput = getUnitModelComboboxInput(form);

    return {
      manufacturerId: manufacturerSelect ? manufacturerSelect.value : '',
      search: normalizeModelSearch(comboboxInput ? comboboxInput.value : '')
    };
  }

  function optionMatchesFilters(option, filters) {
    if (!option || !option.value || !filters.manufacturerId) {
      return false;
    }

    const optionManufacturerId = option.getAttribute('data-manufacturer-id') || '';
    const label = normalizeModelSearch(getUnitModelOptionLabel(option));
    const manufacturerMatches = optionManufacturerId === filters.manufacturerId;
    const searchMatches = !filters.search || label.includes(filters.search);

    return manufacturerMatches && searchMatches;
  }

  function closeUnitModelOptions(form) {
    const optionsContainer = getUnitModelOptionsContainer(form);
    const comboboxInput = getUnitModelComboboxInput(form);

    if (optionsContainer) {
      optionsContainer.hidden = true;
      optionsContainer.replaceChildren();
    }

    if (comboboxInput) {
      comboboxInput.setAttribute('aria-expanded', 'false');
    }

    setUnitModelComboboxLayer(form, false);
  }

  function setCatalogRequestButtonState(button, isEnabled) {
    if (!button) {
      return;
    }

    button.disabled = !isEnabled;
    button.setAttribute('aria-disabled', isEnabled ? 'false' : 'true');
  }

  function updateCatalogRequestControls(form) {
    if (!form) {
      return;
    }

    const manufacturerSelect = form.querySelector('[data-manufacturer-select]');
    const categorySelect = form.querySelector('[data-unit-category-select]');
    const modelSelectionInput = getUnitModelSelectionInput(form);
    const modelComboboxInput = getUnitModelComboboxInput(form);
    const modelButton = form.querySelector('[data-catalog-request-button="model"]');
    const modelHint = form.querySelector('[data-catalog-request-model-hint]');
    const typedModelName = String(modelComboboxInput ? modelComboboxInput.value : '').trim();
    const hasSelectedModel = Boolean(modelSelectionInput && modelSelectionInput.value);
    const canRequestModel = Boolean(
      manufacturerSelect && manufacturerSelect.value
      && categorySelect && categorySelect.value
      && !hasSelectedModel
      && typedModelName.length >= 2
    );

    setCatalogRequestButtonState(modelButton, canRequestModel);

    if (modelHint) {
      if (!manufacturerSelect || !manufacturerSelect.value) {
        modelHint.textContent = 'Select Manufacturer first.';
      } else if (!categorySelect || !categorySelect.value) {
        modelHint.textContent = 'Select Unit Category, then type the exact missing model name.';
      } else if (hasSelectedModel) {
        modelHint.textContent = 'A managed Unit Model is selected. Clear it and type a different observed model name only when the needed model is missing.';
      } else if (typedModelName.length < 2) {
        modelHint.textContent = 'Type the exact missing model name to request a managed catalog addition.';
      } else {
        modelHint.textContent = 'Request a controlled review for this exact observed model name.';
      }
    }

    const processorButton = form.querySelector('[data-catalog-request-button="processor"]');
    const processorHint = form.querySelector('[data-catalog-request-processor-hint]');
    const canRequestProcessor = Boolean(modelSelectionInput && modelSelectionInput.value);
    setCatalogRequestButtonState(processorButton, canRequestProcessor);

    if (processorHint) {
      processorHint.textContent = canRequestProcessor
        ? 'Use this only when the observed Processor Type or Processor is unavailable for the selected Unit Model.'
        : 'Select a Unit Model first. Processor requests are always tied to one managed Unit Model.';
    }
  }

  function setUnitModelInputValidity(form, message) {
    const comboboxInput = getUnitModelComboboxInput(form);

    if (comboboxInput) {
      comboboxInput.setCustomValidity(message || '');
    }
  }

  function clearUnitModelSelection(form) {
    const selectionInput = getUnitModelSelectionInput(form);
    const comboboxInput = getUnitModelComboboxInput(form);

    if (selectionInput) {
      selectionInput.value = '';
    }

    if (comboboxInput) {
      comboboxInput.value = '';
    }

    setUnitModelInputValidity(form, '');
    updateCatalogRequestControls(form);
  }

  function getVisibleUnitModelOptions(form, includeSelectedOption, ignoreSearch) {
    const catalog = getUnitModelCatalog(form);
    const selectionInput = getUnitModelSelectionInput(form);
    const filters = getModelFilterState(form);

    if (ignoreSearch) {
      filters.search = '';
    }

    if (!catalog || !filters.manufacturerId) {
      return [];
    }

    const selectedId = selectionInput ? selectionInput.value : '';

    return Array.from(catalog.options).filter((option) => {
      const isSelected = includeSelectedOption && option.value === selectedId;
      const isActive = option.getAttribute('data-model-active') === '1';

      return (isActive || isSelected) && optionMatchesFilters(option, filters);
    });
  }

  function renderUnitModelOptions(form, openOptions, ignoreSearch) {
    const optionsContainer = getUnitModelOptionsContainer(form);
    const comboboxInput = getUnitModelComboboxInput(form);
    const filters = getModelFilterState(form);

    if (!optionsContainer || !comboboxInput) {
      return;
    }

    optionsContainer.replaceChildren();

    if (!filters.manufacturerId || !openOptions) {
      optionsContainer.hidden = true;
      comboboxInput.setAttribute('aria-expanded', 'false');
      setUnitModelComboboxLayer(form, false);
      return;
    }

    const visibleOptions = getVisibleUnitModelOptions(form, true, ignoreSearch).slice(0, 75);

    if (visibleOptions.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'tech-unit-model-options-empty';
      emptyState.textContent = 'No matching catalog models.';
      optionsContainer.appendChild(emptyState);
    } else {
      visibleOptions.forEach((option) => {
        const optionButton = document.createElement('button');
        optionButton.type = 'button';
        optionButton.className = 'tech-unit-model-option';
        optionButton.setAttribute('role', 'option');
        optionButton.setAttribute('data-unit-model-option', option.value);
        optionButton.setAttribute('aria-selected', option.value === (getUnitModelSelectionInput(form) || {}).value ? 'true' : 'false');
        optionButton.textContent = getUnitModelOptionLabel(option);
        optionsContainer.appendChild(optionButton);
      });
    }

    optionsContainer.hidden = false;
    comboboxInput.setAttribute('aria-expanded', 'true');
    setUnitModelComboboxLayer(form, true);
  }

  function updateUnitModelFilter(form, preserveSelection) {
    const catalog = getUnitModelCatalog(form);
    const hint = form.querySelector('[data-unit-model-hint]');
    const selectionInput = getUnitModelSelectionInput(form);
    const comboboxInput = getUnitModelComboboxInput(form);

    if (!catalog || !selectionInput || !comboboxInput) {
      return;
    }

    const filters = getModelFilterState(form);
    const hasManufacturer = Boolean(filters.manufacturerId);
    const selectedOption = getUnitModelOptionById(form, selectionInput.value);
    const selectedMatchesManufacturer = selectedOption
      && (selectedOption.getAttribute('data-manufacturer-id') || '') === filters.manufacturerId;

    if (!hasManufacturer) {
      if (!preserveSelection) {
        clearUnitModelSelection(form);
      }

      comboboxInput.disabled = true;
      comboboxInput.placeholder = 'Select manufacturer first';
      closeUnitModelOptions(form);

      if (hint) {
        hint.textContent = 'Select a manufacturer to load its model catalog.';
      }

      return;
    }

    if (!preserveSelection && selectedOption && !selectedMatchesManufacturer) {
      clearUnitModelSelection(form);
    }

    comboboxInput.disabled = false;
    comboboxInput.placeholder = 'Search or select a model';

    const refreshedSelectedOption = getUnitModelOptionById(form, selectionInput.value);

    if (refreshedSelectedOption && !comboboxInput.value) {
      comboboxInput.value = getUnitModelOptionLabel(refreshedSelectedOption);
    }

    const visibleCount = getVisibleUnitModelOptions(form, true).length;

    if (hint) {
      if (visibleCount === 0) {
        hint.textContent = 'No active models match this manufacturer. An Admin can add one in Model Catalog.';
      } else {
        hint.textContent = `${visibleCount} catalog model${visibleCount === 1 ? '' : 's'} match the selected manufacturer. Choosing one applies its Unit Category.`;
      }
    }
  }

  function selectUnitModelOption(form, unitModelId) {
    const selectionInput = getUnitModelSelectionInput(form);
    const comboboxInput = getUnitModelComboboxInput(form);
    const option = getUnitModelOptionById(form, unitModelId);

    if (!selectionInput || !comboboxInput || !option) {
      return;
    }

    selectionInput.value = option.value;
    comboboxInput.value = getUnitModelOptionLabel(option);
    setUnitModelInputValidity(form, '');
    applySelectedModelMetadata(form);
    closeUnitModelOptions(form);
  }

  function resolveExactUnitModelMatch(form) {
    const selectionInput = getUnitModelSelectionInput(form);
    const comboboxInput = getUnitModelComboboxInput(form);

    if (!selectionInput || !comboboxInput || !comboboxInput.value.trim()) {
      return false;
    }

    const normalizedValue = normalizeModelSearch(comboboxInput.value);
    const matchingOption = getVisibleUnitModelOptions(form, true).find(
      (option) => normalizeModelSearch(getUnitModelOptionLabel(option)) === normalizedValue
    );

    if (!matchingOption) {
      return false;
    }

    selectUnitModelOption(form, matchingOption.value);
    return true;
  }

  function applySelectedModelMetadata(form) {
    const selectionInput = getUnitModelSelectionInput(form);
    const manufacturerSelect = form.querySelector('[data-manufacturer-select]');
    const categorySelect = form.querySelector('[data-unit-category-select]');
    const selectedOption = getUnitModelOptionById(form, selectionInput ? selectionInput.value : '');

    if (!selectedOption || !selectedOption.value) {
      return;
    }

    const manufacturerId = selectedOption.getAttribute('data-manufacturer-id') || '';
    const categoryId = selectedOption.getAttribute('data-category-id') || '';

    if (manufacturerId) {
      setSelectValue(manufacturerSelect, manufacturerId);
    }

    if (categoryId) {
      setSelectValue(categorySelect, categoryId);
    }

    updateUnitModelFilter(form, true);
    updateProcessorFilter(form, false);
    updateIntentionalDuplicateRequestControls(form);
  }

  function getProcessorCatalog(form) {
    return form ? form.querySelector('[data-processor-catalog]') : null;
  }

  function getProcessorSelectionInput(form) {
    return form ? form.querySelector('[data-processor-model-select]') : null;
  }

  function getProcessorComboboxInput(form) {
    return form ? form.querySelector('[data-processor-combobox-input]') : null;
  }

  function getProcessorOptionsContainer(form) {
    return form ? form.querySelector('[data-processor-options]') : null;
  }

  function getProcessorBrandSelect(form) {
    return form ? form.querySelector('[data-processor-brand-select]') : null;
  }

  function getProcessorOptionById(form, processorModelId) {
    const catalog = getProcessorCatalog(form);

    if (!catalog || !processorModelId) {
      return null;
    }

    return Array.from(catalog.options).find((option) => option.value === String(processorModelId)) || null;
  }

  function getProcessorOptionLabel(option) {
    return option ? String(option.textContent || '').trim() : '';
  }

  function processorOptionSupportsUnitModel(option, unitModelId) {
    if (!option || !unitModelId) {
      return false;
    }

    const compatibleIds = String(option.getAttribute('data-compatible-unit-model-ids') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    return compatibleIds.includes(String(unitModelId));
  }

  function getVisibleProcessorOptions(form, includeSelectedOption, ignoreSearch) {
    const catalog = getProcessorCatalog(form);
    const selectionInput = getProcessorSelectionInput(form);
    const brandSelect = getProcessorBrandSelect(form);
    const modelSelectionInput = getUnitModelSelectionInput(form);
    const comboboxInput = getProcessorComboboxInput(form);

    if (!catalog || !modelSelectionInput || !modelSelectionInput.value) {
      return [];
    }

    const selectedId = selectionInput ? selectionInput.value : '';
    const selectedBrandId = brandSelect ? brandSelect.value : '';
    const search = ignoreSearch ? '' : normalizeModelSearch(comboboxInput ? comboboxInput.value : '');

    return Array.from(catalog.options).filter((option) => {
      const isSelected = includeSelectedOption && option.value === selectedId;
      const matchesModel = processorOptionSupportsUnitModel(option, modelSelectionInput.value);
      const matchesBrand = !selectedBrandId || (option.getAttribute('data-processor-brand-id') || '') === selectedBrandId;
      const matchesSearch = !search || normalizeModelSearch(getProcessorOptionLabel(option)).includes(search);

      return (matchesModel || isSelected) && matchesBrand && matchesSearch;
    });
  }

  function closeProcessorOptions(form) {
    const optionsContainer = getProcessorOptionsContainer(form);
    const comboboxInput = getProcessorComboboxInput(form);
    const combobox = form ? form.querySelector('[data-processor-combobox]') : null;
    const section = combobox ? combobox.closest('.form-section') : null;

    if (optionsContainer) {
      optionsContainer.hidden = true;
      optionsContainer.replaceChildren();
    }

    if (comboboxInput) {
      comboboxInput.setAttribute('aria-expanded', 'false');
    }

    if (section) {
      section.classList.remove('tech-unit-processor-combobox-open');
    }
  }

  function closeOpenUnitFormComboboxes(form) {
    if (!form) {
      return false;
    }

    const assignableLotOptions = getAssignableLotOptionsContainer(form);
    const unitModelOptions = getUnitModelOptionsContainer(form);
    const processorOptions = getProcessorOptionsContainer(form);
    let closedAny = false;

    if (assignableLotOptions && !assignableLotOptions.hidden) {
      closeAssignableLotOptions(form);
      closedAny = true;
    }

    if (unitModelOptions && !unitModelOptions.hidden) {
      closeUnitModelOptions(form);
      closedAny = true;
    }

    if (processorOptions && !processorOptions.hidden) {
      closeProcessorOptions(form);
      closedAny = true;
    }

    return closedAny;
  }

  function setProcessorInputValidity(form, message) {
    const input = getProcessorComboboxInput(form);

    if (input) {
      input.setCustomValidity(message || '');
    }
  }

  function clearProcessorSelection(form) {
    const selectionInput = getProcessorSelectionInput(form);
    const comboboxInput = getProcessorComboboxInput(form);

    if (selectionInput) {
      selectionInput.value = '';
    }

    if (comboboxInput) {
      comboboxInput.value = '';
    }

    setProcessorInputValidity(form, '');
  }

  function syncProcessorBrandChoices(form, preserveSelection) {
    const brandSelect = getProcessorBrandSelect(form);
    const modelSelectionInput = getUnitModelSelectionInput(form);
    const selectedProcessor = getProcessorOptionById(form, (getProcessorSelectionInput(form) || {}).value);

    if (!brandSelect) {
      return;
    }

    if (!modelSelectionInput || !modelSelectionInput.value) {
      brandSelect.value = '';
      brandSelect.disabled = true;
      Array.from(brandSelect.options).forEach((option) => {
        if (option.value) option.hidden = true;
      });
      return;
    }

    const originalBrandId = brandSelect.value;
    brandSelect.value = '';
    const compatibleBrandIds = new Set(
      getVisibleProcessorOptions(form, true, true)
        .map((option) => option.getAttribute('data-processor-brand-id') || '')
        .filter(Boolean)
    );
    brandSelect.value = originalBrandId;

    Array.from(brandSelect.options).forEach((option) => {
      if (!option.value) {
        option.hidden = false;
        option.textContent = 'Select processor type';
        return;
      }

      option.hidden = !compatibleBrandIds.has(option.value);
    });

    brandSelect.disabled = compatibleBrandIds.size === 0;

    if (selectedProcessor && selectedProcessor.getAttribute('data-processor-brand-id')) {
      brandSelect.value = selectedProcessor.getAttribute('data-processor-brand-id');
      return;
    }

    if (!preserveSelection || !compatibleBrandIds.has(brandSelect.value)) {
      brandSelect.value = compatibleBrandIds.size === 1 ? Array.from(compatibleBrandIds)[0] : '';
    }
  }

  function renderProcessorOptions(form, openOptions, ignoreSearch) {
    const optionsContainer = getProcessorOptionsContainer(form);
    const comboboxInput = getProcessorComboboxInput(form);
    const brandSelect = getProcessorBrandSelect(form);
    const combobox = form ? form.querySelector('[data-processor-combobox]') : null;
    const section = combobox ? combobox.closest('.form-section') : null;

    if (!optionsContainer || !comboboxInput) {
      return;
    }

    optionsContainer.replaceChildren();

    if (!openOptions || !brandSelect || !brandSelect.value) {
      optionsContainer.hidden = true;
      comboboxInput.setAttribute('aria-expanded', 'false');
      return;
    }

    const visibleOptions = getVisibleProcessorOptions(form, true, ignoreSearch).slice(0, 75);

    if (visibleOptions.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'tech-unit-processor-options-empty';
      emptyState.textContent = 'No compatible processors match this selection.';
      optionsContainer.appendChild(emptyState);
    } else {
      visibleOptions.forEach((option) => {
        const optionButton = document.createElement('button');
        optionButton.type = 'button';
        optionButton.className = 'tech-unit-processor-option';
        optionButton.setAttribute('role', 'option');
        optionButton.setAttribute('data-processor-option', option.value);
        optionButton.setAttribute('aria-selected', option.value === (getProcessorSelectionInput(form) || {}).value ? 'true' : 'false');
        optionButton.textContent = getProcessorOptionLabel(option);
        optionsContainer.appendChild(optionButton);
      });
    }

    optionsContainer.hidden = false;
    comboboxInput.setAttribute('aria-expanded', 'true');

    if (section) {
      section.classList.add('tech-unit-processor-combobox-open');
    }
  }

  function updateProcessorFilter(form, preserveSelection) {
    const hint = form ? form.querySelector('[data-processor-model-hint]') : null;
    const brandHint = form ? form.querySelector('[data-processor-brand-hint]') : null;
    const comboboxInput = getProcessorComboboxInput(form);
    const selectionInput = getProcessorSelectionInput(form);
    const modelSelectionInput = getUnitModelSelectionInput(form);
    const selectedOption = getProcessorOptionById(form, selectionInput ? selectionInput.value : '');

    if (!comboboxInput || !selectionInput) {
      return;
    }

    if (!modelSelectionInput || !modelSelectionInput.value) {
      if (!preserveSelection) clearProcessorSelection(form);
      comboboxInput.disabled = true;
      comboboxInput.placeholder = 'Select Unit Model first';
      syncProcessorBrandChoices(form, preserveSelection);
      closeProcessorOptions(form);
      if (hint) hint.textContent = 'Select a Unit Model to load compatible processor types and values.';
      if (brandHint) brandHint.textContent = 'Processor types are limited to the selected Unit Model.';
      return;
    }

    const selectedStillCompatible = selectedOption && processorOptionSupportsUnitModel(selectedOption, modelSelectionInput.value);

    if (!preserveSelection && selectedOption && !selectedStillCompatible) {
      clearProcessorSelection(form);
    }

    syncProcessorBrandChoices(form, preserveSelection);
    const brandSelect = getProcessorBrandSelect(form);
    const visibleCount = getVisibleProcessorOptions(form, true, true).length;

    if (!brandSelect || !brandSelect.value) {
      comboboxInput.disabled = true;
      comboboxInput.placeholder = visibleCount > 0 ? 'Select processor type first' : 'No processor catalog options';
      closeProcessorOptions(form);
      if (hint) hint.textContent = visibleCount > 0 ? 'Choose a compatible Processor Type first.' : 'No compatible processor values are cataloged for this Unit Model yet.';
      return;
    }

    comboboxInput.disabled = false;
    comboboxInput.placeholder = 'Search or select a processor';

    const refreshedSelected = getProcessorOptionById(form, selectionInput.value);
    if (refreshedSelected && !comboboxInput.value) {
      comboboxInput.value = getProcessorOptionLabel(refreshedSelected);
    }

    const typedVisibleCount = getVisibleProcessorOptions(form, true).length;
    if (hint) hint.textContent = `${typedVisibleCount} compatible processor${typedVisibleCount === 1 ? '' : 's'} match the current Unit Model and Processor Type.`;
  }

  function selectProcessorOption(form, processorModelId) {
    const selectionInput = getProcessorSelectionInput(form);
    const comboboxInput = getProcessorComboboxInput(form);
    const brandSelect = getProcessorBrandSelect(form);
    const option = getProcessorOptionById(form, processorModelId);

    if (!selectionInput || !comboboxInput || !option) {
      return;
    }

    selectionInput.value = option.value;
    comboboxInput.value = getProcessorOptionLabel(option);
    if (brandSelect) brandSelect.value = option.getAttribute('data-processor-brand-id') || '';
    setProcessorInputValidity(form, '');
    applySelectedProcessorMetadata(form, false);
    closeProcessorOptions(form);
  }

  function resolveExactProcessorMatch(form) {
    const selectionInput = getProcessorSelectionInput(form);
    const comboboxInput = getProcessorComboboxInput(form);

    if (!selectionInput || !comboboxInput || !comboboxInput.value.trim()) return false;

    const normalizedValue = normalizeModelSearch(comboboxInput.value);
    const matchingOption = getVisibleProcessorOptions(form, true).find(
      (option) => normalizeModelSearch(getProcessorOptionLabel(option)) === normalizedValue
    );

    if (!matchingOption) return false;

    selectProcessorOption(form, matchingOption.value);
    return true;
  }

  function applySelectedProcessorMetadata(form, forceOverwrite) {
    const processorInput = getProcessorSelectionInput(form);
    const speedInput = form.querySelector('[data-processor-speed-input]');
    const selectedOption = getProcessorOptionById(form, processorInput ? processorInput.value : '');

    if (!selectedOption || !speedInput) {
      return;
    }

    const baseSpeedGhz = selectedOption.getAttribute('data-base-speed-ghz') || '';

    if (!baseSpeedGhz) {
      return;
    }

    const wasAutoFilled = speedInput.getAttribute('data-auto-filled') === 'true';

    if (forceOverwrite || !speedInput.value || wasAutoFilled) {
      speedInput.value = baseSpeedGhz;
      speedInput.setAttribute('data-auto-filled', 'true');
    }
  }

  function getModuleRows(form, rowType) {
    return Array.from(form.querySelectorAll(`[data-module-row="${rowType}"]`));
  }

  function getCollectionNameForRowType(rowType) {
    if (rowType === 'memory') {
      return 'memoryModules';
    }

    if (rowType === 'storage') {
      return 'storageDevices';
    }

    if (rowType === 'cosmeticIssue') {
      return 'cosmeticIssues';
    }

    if (rowType === 'hardwareIssue') {
      return 'hardwareIssues';
    }

    return '';
  }

  function replaceIndexInName(name, rowType, index) {
    if (!name) {
      return name;
    }

    const prefix = getCollectionNameForRowType(rowType);

    if (!prefix) {
      return name;
    }

    const pattern = new RegExp(`${prefix}\\[[^\\]]+\\]`);

    return name.replace(pattern, `${prefix}[${index}]`);
  }

  function renumberModuleRows(form, rowType) {
    const rows = getModuleRows(form, rowType);

    rows.forEach((row, index) => {
      const displayNumber = index + 1;
      const display = row.querySelector('[data-module-display-number]');

      if (display) {
        display.textContent = String(displayNumber);
      }

      row.querySelectorAll('[name]').forEach((field) => {
        field.name = replaceIndexInName(field.name, rowType, index);
      });
    });
  }


  function formatProductionWeight(value) {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue.toFixed(2) : '—';
  }

  function getSelectedProductionWeight(select) {
    const selectedOption = getSelectedOption(select);

    return selectedOption ? selectedOption.getAttribute('data-production-weight') || '' : '';
  }

  function updateProductionWeightPreview(form) {
    if (!form) {
      return;
    }

    const previewValue = form.querySelector('[data-production-weight-preview-value]');
    const overrideLabel = form.querySelector('[data-production-weight-unit-override-label]');
    const overrideInput = form.querySelector('[data-production-weight-override-input]');
    const lotSelect = form.querySelector('[data-lot-select]');
    const categorySelect = form.querySelector('[data-unit-category-select]');
    const overrideValue = overrideInput ? overrideInput.value : '';
    const lotWeight = getSelectedProductionWeight(lotSelect);
    const categoryWeight = getSelectedProductionWeight(categorySelect);
    const displayValue = overrideValue || lotWeight || categoryWeight || '';
    const initialUnitOverride = overrideLabel && overrideLabel.getAttribute('data-initial-unit-override') === 'true';
    const hasOverride = Boolean(overrideValue) || (!overrideInput && initialUnitOverride);

    if (previewValue) {
      previewValue.textContent = formatProductionWeight(displayValue);
    }

    if (overrideLabel) {
      overrideLabel.hidden = !hasOverride;
    }
  }

  function updateModuleTotals(form) {
    const memoryTotal = Array.from(form.querySelectorAll('[data-memory-size-input]')).reduce((sum, input) => {
      const value = Number(input.value || 0);

      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0);

    const storageTotal = Array.from(form.querySelectorAll('[data-storage-size-input]')).reduce((sum, input) => {
      const value = Number(input.value || 0);

      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0);

    const memoryInput = form.querySelector('[data-memory-total-input]');
    const storageInput = form.querySelector('[data-storage-total-input]');
    const memoryDisplay = form.querySelector('[data-memory-total-display]');
    const storageDisplay = form.querySelector('[data-storage-total-display]');

    if (memoryInput) {
      memoryInput.value = memoryTotal > 0 ? String(memoryTotal) : '';
    }

    if (storageInput) {
      storageInput.value = storageTotal > 0 ? String(storageTotal) : '';
    }

    if (memoryDisplay) {
      memoryDisplay.textContent = String(memoryTotal || 0);
    }

    if (storageDisplay) {
      storageDisplay.textContent = String(storageTotal || 0);
    }
  }

  function addModuleRow(form, rowType) {
    const list = form.querySelector(`[data-module-list="${rowType}"]`);
    const template = form.querySelector(`template[data-module-template="${rowType}"]`);

    if (!list || !template) {
      return;
    }

    const rows = getModuleRows(form, rowType);
    const index = rows.length;
    const displayNumber = index + 1;
    const html = template.innerHTML
      .replaceAll('__INDEX__', String(index))
      .replaceAll('__DISPLAY__', String(displayNumber));

    const holder = document.createElement('div');
    holder.innerHTML = html.trim();

    const row = holder.firstElementChild;

    if (row) {
      list.appendChild(row);
    }

    renumberModuleRows(form, rowType);
    updateModuleTotals(form);
  }

  function removeModuleRow(button) {
    const row = button.closest('[data-module-row]');
    const form = getFormFromElement(button);

    if (!row || !form) {
      return;
    }

    const rowType = row.getAttribute('data-module-row');
    const rows = getModuleRows(form, rowType);

    if (rows.length <= 1) {
      row.querySelectorAll('input, select, textarea').forEach((field) => {
        if (field.tagName === 'SELECT') {
          field.selectedIndex = 0;
        } else {
          field.value = '';
        }
      });
    } else {
      row.remove();
    }

    renumberModuleRows(form, rowType);
    updateModuleTotals(form);
  }

  function renderModalMarkup(markup) {
    const modalRoot = document.querySelector('#modal-root');

    if (modalRoot) {
      modalRoot.innerHTML = markup;

      if (window.htmx && typeof window.htmx.process === 'function') {
        window.htmx.process(modalRoot);
      }
    }
  }

  function renderIntentionalDuplicateRequestFeedback(button, markup) {
    const actionGroup = button ? button.closest('.tech-duplicate-candidate-actions') : null;
    const candidateCard = button ? button.closest('.tech-duplicate-candidate-card') : null;
    const feedbackScope = candidateCard || actionGroup;

    if (!feedbackScope) {
      return;
    }

    feedbackScope.querySelectorAll('[data-intentional-duplicate-request-feedback]').forEach((feedback) => feedback.remove());

    if (actionGroup) {
      actionGroup.insertAdjacentHTML('beforebegin', markup);
      return;
    }

    feedbackScope.insertAdjacentHTML('afterbegin', markup);
  }

  function showIntentionalDuplicateRequestSubmitted(event) {
    const detail = event && event.detail ? event.detail : {};
    const eventValue = detail && detail.value && typeof detail.value === 'object' ? detail.value : detail;
    const requestId = eventValue.requestId || '';
    const requestUrl = eventValue.requestUrl || (requestId ? `/unit-requests/${encodeURIComponent(requestId)}` : '/unit-requests');
    const modalRoot = document.querySelector('#modal-root');
    const form = document.querySelector('[data-tech-unit-form]');
    const region = form ? form.querySelector('[data-duplicate-check-region]') : null;

    if (modalRoot) {
      modalRoot.innerHTML = '';
    }

    if (!region) {
      return;
    }

    region.querySelectorAll('[data-intentional-duplicate-request-feedback]').forEach((feedback) => feedback.remove());
    region.insertAdjacentHTML('afterbegin', `<div class="message success tech-intentional-duplicate-request-feedback" data-intentional-duplicate-request-feedback><p>Intentional Duplicate request #${requestId || '—'} is pending review. No new Unit or Asset Tag was created. <a href="${requestUrl}">View Unit Request</a></p></div>`);
  }

  function showCatalogRequestOpenError(form, message) {
    const action = form ? form.querySelector('.tech-catalog-request-action') : null;

    if (!action) {
      return;
    }

    action.querySelectorAll('[data-catalog-request-open-error]').forEach((item) => item.remove());
    action.insertAdjacentHTML('afterbegin', `<div class="message error" data-catalog-request-open-error><p>${message}</p></div>`);
  }

  async function openCatalogRequestModal(button) {
    const form = getFormFromElement(button);
    const requestKind = button ? button.getAttribute('data-catalog-request-button') : '';

    if (!form || !['model', 'processor'].includes(requestKind) || button.disabled) {
      return;
    }

    const params = new URLSearchParams();

    if (requestKind === 'model') {
      const manufacturerSelect = form.querySelector('[data-manufacturer-select]');
      const categorySelect = form.querySelector('[data-unit-category-select]');
      const modelInput = getUnitModelComboboxInput(form);
      params.set('manufacturerId', manufacturerSelect ? manufacturerSelect.value : '');
      params.set('unitCategoryConfigValueId', categorySelect ? categorySelect.value : '');
      params.set('requestedModelName', modelInput ? modelInput.value.trim() : '');
    } else {
      const unitModelInput = getUnitModelSelectionInput(form);
      const processorBrandSelect = getProcessorBrandSelect(form);
      const processorInput = getProcessorComboboxInput(form);
      const selectedBrandOption = getSelectedOption(processorBrandSelect);
      params.set('unitModelId', unitModelInput ? unitModelInput.value : '');
      params.set('requestedProcessorType', selectedBrandOption && selectedBrandOption.value ? selectedBrandOption.textContent.trim() : '');
      params.set('requestedProcessorName', processorInput ? processorInput.value.trim() : '');
    }

    button.disabled = true;

    try {
      const response = await fetch(`/tech/unit-catalog-requests/${encodeURIComponent(requestKind)}/modal?${params.toString()}`, {
        headers: { 'HX-Request': 'true' }
      });

      renderModalMarkup(await response.text());
    } catch (error) {
      showCatalogRequestOpenError(form, 'The Catalog Exception request could not be opened. Confirm the selected model details and try again.');
    } finally {
      updateCatalogRequestControls(form);
    }
  }

  async function openDuplicateAssumeModal(button) {
    const form = getFormFromElement(button);
    const unitId = button.getAttribute('data-duplicate-assume-unit-id');

    if (!form || !unitId) {
      return;
    }

    const unitSerialInput = form.querySelector('[name="unitSerialNumber"]');
    const biosSerialInput = form.querySelector('[name="biosSerialNumber"]');
    const destinationLotSelect = form.querySelector('[name="lotId"]');
    const params = new URLSearchParams();

    if (unitSerialInput && normalizeSerialInput(unitSerialInput)) {
      params.set('unitSerialNumber', unitSerialInput.value);
    }

    if (biosSerialInput && normalizeSerialInput(biosSerialInput)) {
      params.set('biosSerialNumber', biosSerialInput.value);
    }

    if (destinationLotSelect && destinationLotSelect.value) {
      params.set('destinationLotId', destinationLotSelect.value);
    }

    const duplicateAssumptionNonce = form.querySelector('[data-duplicate-assumption-nonce]');

    if (duplicateAssumptionNonce && duplicateAssumptionNonce.value) {
      params.set('duplicateAssumptionNonce', duplicateAssumptionNonce.value);
    }

    button.disabled = true;

    try {
      const response = await fetch(`/tech/units/${encodeURIComponent(unitId)}/assume-existing/modal?${params.toString()}`, {
        headers: { 'HX-Request': 'true' }
      });

      renderModalMarkup(await response.text());
    } catch (error) {
      const region = form.querySelector('[data-duplicate-check-region]');

      if (region) {
        region.insertAdjacentHTML('afterbegin', '<div class="message error"><p>The existing-unit assumption review could not be opened. Refresh the duplicate check and try again.</p></div>');
      }
    } finally {
      button.disabled = false;
    }
  }

  async function openIntentionalDuplicateRequestModal(button) {
    const form = getFormFromElement(button);
    const unitId = button.getAttribute('data-intentional-duplicate-request-unit-id');

    if (!form || !unitId) {
      return;
    }

    button.disabled = true;

    try {
      const requestBody = new URLSearchParams(new FormData(form));
      const response = await fetch(`/tech/units/${encodeURIComponent(unitId)}/intentional-duplicate-request/modal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'HX-Request': 'true'
        },
        body: requestBody.toString()
      });

      const responseMarkup = await response.text();

      if (response.status === 422 && response.headers.get('X-BWT-Intentional-Duplicate-Readiness') === 'invalid') {
        renderIntentionalDuplicateRequestFeedback(button, responseMarkup);
        return;
      }

      renderModalMarkup(responseMarkup);
    } catch (error) {
      const region = form.querySelector('[data-duplicate-check-region]');

      if (region) {
        region.insertAdjacentHTML('afterbegin', '<div class="message error"><p>The Intentional Duplicate request could not be opened. Complete the Create Unit form, refresh the duplicate check, and try again.</p></div>');
      }
    } finally {
      button.disabled = false;
    }
  }

  async function openDuplicateOverrideModal(button) {
    const unitId = button.getAttribute('data-duplicate-request-override-unit-id');

    if (!unitId) {
      return;
    }

    button.disabled = true;

    try {
      const response = await fetch(`/tech/units/${encodeURIComponent(unitId)}/override/modal`, {
        headers: { 'HX-Request': 'true' }
      });

      renderModalMarkup(await response.text());
    } catch (error) {
      const form = getFormFromElement(button);
      const region = form ? form.querySelector('[data-duplicate-check-region]') : null;

      if (region) {
        region.insertAdjacentHTML('afterbegin', '<div class="message error"><p>The override request could not be opened. Use the Unit Browser to review the existing unit.</p></div>');
      }
    } finally {
      button.disabled = false;
    }
  }

  function initializeForm(form) {
    if (!form || form.getAttribute('data-tech-unit-form-initialized') === 'true') {
      return;
    }

    form.setAttribute('data-tech-unit-form-initialized', 'true');
    setAssignableLotComboboxLayer(form, false);
    synchronizeAssignableLotCombobox(form);
    setUnitModelComboboxLayer(form, false);
    updateUnitModelFilter(form, true);
    updateProcessorFilter(form, true);
    renumberModuleRows(form, 'memory');
    renumberModuleRows(form, 'storage');
    updateModuleTotals(form);
    updateProductionWeightPreview(form);
    updateIntentionalDuplicateRequestControls(form);
    updateCatalogRequestControls(form);

    const processorSpeedInput = form.querySelector('[data-processor-speed-input]');

    if (processorSpeedInput && processorSpeedInput.value) {
      processorSpeedInput.setAttribute('data-auto-filled', 'false');
    }
  }

  function initializeForms(scope) {
    const root = scope || document;

    root.querySelectorAll('[data-tech-unit-form]').forEach((form) => {
      initializeForm(form);
    });
  }

  document.addEventListener('tech-unit-form-escape', (event) => {
    const modal = event.detail && event.detail.modal;

    if (!modal || !modal.matches('.tech-unit-modal')) {
      return;
    }

    const form = modal.querySelector('[data-tech-unit-form]');

    if (closeOpenUnitFormComboboxes(form)) {
      event.preventDefault();
    }
  });

  document.addEventListener('intentional-duplicate-request-submitted', showIntentionalDuplicateRequestSubmitted);

  document.addEventListener('click', (event) => {
    const catalogRequestButton = event.target.closest('[data-catalog-request-button]');

    if (catalogRequestButton) {
      event.preventDefault();
      openCatalogRequestModal(catalogRequestButton);
      return;
    }

    const assumeButton = event.target.closest('[data-duplicate-assume-unit-id]');

    if (assumeButton) {
      event.preventDefault();
      openDuplicateAssumeModal(assumeButton);
      return;
    }

    const intentionalDuplicateButton = event.target.closest('[data-intentional-duplicate-request-unit-id]');

    if (intentionalDuplicateButton) {
      event.preventDefault();
      openIntentionalDuplicateRequestModal(intentionalDuplicateButton);
      return;
    }

    const overrideButton = event.target.closest('[data-duplicate-request-override-unit-id]');

    if (overrideButton) {
      event.preventDefault();
      openDuplicateOverrideModal(overrideButton);
    }
  });

  document.addEventListener('change', (event) => {
    const modelFilterSelect = event.target.closest('[data-manufacturer-select], [data-unit-category-select]');

    if (modelFilterSelect) {
      const form = getFormFromElement(modelFilterSelect);
      updateUnitModelFilter(form, false);
      updateProcessorFilter(form, false);
      closeUnitModelOptions(form);
      updateProductionWeightPreview(form);
      updateIntentionalDuplicateRequestControls(form);
      updateCatalogRequestControls(form);
      return;
    }

    const lotSelect = event.target.closest('[data-lot-select]');

    if (lotSelect) {
      const form = getFormFromElement(lotSelect);
      synchronizeAssignableLotCombobox(form);
      updateIntentionalDuplicateRequestControls(form);
      updateProductionWeightPreview(form);
      refreshDuplicateCheckForSelectedLot(form);
      return;
    }

    const processorBrandSelect = event.target.closest('[data-processor-brand-select]');

    if (processorBrandSelect) {
      const form = getFormFromElement(processorBrandSelect);
      const selectedProcessor = getProcessorOptionById(form, (getProcessorSelectionInput(form) || {}).value);

      if (selectedProcessor && selectedProcessor.getAttribute('data-processor-brand-id') !== processorBrandSelect.value) {
        clearProcessorSelection(form);
      }

      updateProcessorFilter(form, true);
      closeProcessorOptions(form);
      updateCatalogRequestControls(form);
      return;
    }

    const moduleField = event.target.closest('[data-memory-size-input], [data-storage-size-input]');

    if (moduleField) {
      const form = getFormFromElement(moduleField);
      updateModuleTotals(form);
    }
  });

  document.addEventListener('input', (event) => {
    const assignableLotComboboxInput = event.target.closest('[data-assignable-lot-combobox-input]');

    if (assignableLotComboboxInput) {
      const form = getFormFromElement(assignableLotComboboxInput);
      const catalog = getAssignableLotCatalog(form);
      const selectedOption = getAssignableLotOptionById(form, catalog ? catalog.value : '');

      if (
        selectedOption
        && normalizeModelSearch(assignableLotComboboxInput.value) !== normalizeModelSearch(getAssignableLotOptionLabel(selectedOption))
      ) {
        clearAssignableLotSelection(form);
      }

      setAssignableLotInputValidity(form, '');
      renderAssignableLotOptions(form, true);
      return;
    }

    const modelComboboxInput = event.target.closest('[data-unit-model-combobox-input]');

    if (modelComboboxInput) {
      const form = getFormFromElement(modelComboboxInput);
      const selectionInput = getUnitModelSelectionInput(form);
      const selectedOption = getUnitModelOptionById(form, selectionInput ? selectionInput.value : '');

      if (selectedOption && normalizeModelSearch(modelComboboxInput.value) !== normalizeModelSearch(getUnitModelOptionLabel(selectedOption))) {
        selectionInput.value = '';
      }

      setUnitModelInputValidity(form, '');
      updateUnitModelFilter(form, true);
      updateProcessorFilter(form, false);
      renderUnitModelOptions(form, true);
      updateCatalogRequestControls(form);
      return;
    }

    const processorComboboxInput = event.target.closest('[data-processor-combobox-input]');

    if (processorComboboxInput) {
      const form = getFormFromElement(processorComboboxInput);
      const selectionInput = getProcessorSelectionInput(form);
      const selectedOption = getProcessorOptionById(form, selectionInput ? selectionInput.value : '');

      if (selectedOption && normalizeModelSearch(processorComboboxInput.value) !== normalizeModelSearch(getProcessorOptionLabel(selectedOption))) {
        selectionInput.value = '';
      }

      setProcessorInputValidity(form, '');
      renderProcessorOptions(form, true);
      updateCatalogRequestControls(form);
      return;
    }

    const duplicateCheckSerialInput = event.target.closest('[data-duplicate-check-serial]');

    if (duplicateCheckSerialInput) {
      normalizeSerialInput(duplicateCheckSerialInput);
      clearDuplicateCheck(getFormFromElement(duplicateCheckSerialInput));
    }

    const speedInput = event.target.closest('[data-processor-speed-input]');

    if (speedInput) {
      speedInput.setAttribute('data-auto-filled', 'false');
    }

    const productionWeightOverrideInput = event.target.closest('[data-production-weight-override-input]');

    if (productionWeightOverrideInput) {
      const form = getFormFromElement(productionWeightOverrideInput);
      updateProductionWeightPreview(form);
    }

    const moduleSizeInput = event.target.closest('[data-memory-size-input], [data-storage-size-input]');

    if (moduleSizeInput) {
      const form = getFormFromElement(moduleSizeInput);
      updateModuleTotals(form);
    }
  });

  document.addEventListener('focusin', (event) => {
    const assignableLotComboboxInput = event.target.closest('[data-assignable-lot-combobox-input]');

    if (assignableLotComboboxInput) {
      const form = getFormFromElement(assignableLotComboboxInput);
      assignableLotComboboxInput.select();
      renderAssignableLotOptions(form, true, true);
      return;
    }

    const modelComboboxInput = event.target.closest('[data-unit-model-combobox-input]');

    if (modelComboboxInput && !modelComboboxInput.disabled) {
      const form = getFormFromElement(modelComboboxInput);
      updateUnitModelFilter(form, true);
      modelComboboxInput.select();
      renderUnitModelOptions(form, true, true);
    }
  });

  document.addEventListener('focusin', (event) => {
    const processorComboboxInput = event.target.closest('[data-processor-combobox-input]');

    if (processorComboboxInput && !processorComboboxInput.disabled) {
      const form = getFormFromElement(processorComboboxInput);
      processorComboboxInput.select();
      renderProcessorOptions(form, true, true);
    }
  });

  document.addEventListener('focusout', (event) => {
    const assignableLotComboboxInput = event.target.closest('[data-assignable-lot-combobox-input]');

    if (assignableLotComboboxInput) {
      const form = getFormFromElement(assignableLotComboboxInput);

      window.setTimeout(() => {
        const combobox = form ? form.querySelector('[data-assignable-lot-combobox]') : null;

        if (!combobox || combobox.contains(document.activeElement)) {
          return;
        }

        resolveExactAssignableLotMatch(form);
        closeAssignableLotOptions(form);
      }, 125);
    }

    const duplicateCheckSerialInput = event.target.closest('[data-duplicate-check-serial]');

    if (duplicateCheckSerialInput) {
      refreshDuplicateCheck(getFormFromElement(duplicateCheckSerialInput));
    }

    const processorComboboxInput = event.target.closest('[data-processor-combobox-input]');

    if (processorComboboxInput) {
      const form = getFormFromElement(processorComboboxInput);

      window.setTimeout(() => {
        const combobox = form ? form.querySelector('[data-processor-combobox]') : null;

        if (!combobox || combobox.contains(document.activeElement)) return;

        resolveExactProcessorMatch(form);
        closeProcessorOptions(form);
      }, 125);
    }

    const modelComboboxInput = event.target.closest('[data-unit-model-combobox-input]');

    if (modelComboboxInput) {
      const form = getFormFromElement(modelComboboxInput);

      window.setTimeout(() => {
        const combobox = form ? form.querySelector('[data-unit-model-combobox]') : null;

        if (!combobox || combobox.contains(document.activeElement)) {
          return;
        }

        resolveExactUnitModelMatch(form);
        closeUnitModelOptions(form);
      }, 125);
    }
  });

  document.addEventListener('keydown', (event) => {
    const assignableLotComboboxInput = event.target.closest('[data-assignable-lot-combobox-input]');

    if (assignableLotComboboxInput) {
      const form = getFormFromElement(assignableLotComboboxInput);

      if (event.key === 'Escape') {
        closeAssignableLotOptions(form);
        return;
      }

      if (event.key !== 'Enter') {
        return;
      }

      const firstOption = form.querySelector('[data-assignable-lot-option]');

      if (firstOption) {
        event.preventDefault();
        selectAssignableLotOption(form, firstOption.getAttribute('data-assignable-lot-option'));
        return;
      }

      if (resolveExactAssignableLotMatch(form)) {
        event.preventDefault();
      }

      return;
    }

    const modelComboboxInput = event.target.closest('[data-unit-model-combobox-input]');

    if (!modelComboboxInput || modelComboboxInput.disabled) {
      return;
    }

    const form = getFormFromElement(modelComboboxInput);

    if (event.key === 'Escape') {
      closeUnitModelOptions(form);
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    const firstOption = form.querySelector('[data-unit-model-option]');

    if (firstOption) {
      event.preventDefault();
      selectUnitModelOption(form, firstOption.getAttribute('data-unit-model-option'));
      return;
    }

    if (resolveExactUnitModelMatch(form)) {
      event.preventDefault();
    }
  });

  document.addEventListener('keydown', (event) => {
    const processorComboboxInput = event.target.closest('[data-processor-combobox-input]');

    if (!processorComboboxInput || processorComboboxInput.disabled) return;

    const form = getFormFromElement(processorComboboxInput);

    if (event.key === 'Escape') {
      closeProcessorOptions(form);
      return;
    }

    if (event.key !== 'Enter') return;

    const firstOption = form.querySelector('[data-processor-option]');

    if (firstOption) {
      event.preventDefault();
      selectProcessorOption(form, firstOption.getAttribute('data-processor-option'));
      return;
    }

    if (resolveExactProcessorMatch(form)) event.preventDefault();
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-tech-unit-form]');

    if (!form || !form.querySelector('[data-duplicate-assumption-nonce]')) {
      return;
    }

    const assignableLotInput = getAssignableLotComboboxInput(form);
    const assignableLotCatalog = getAssignableLotCatalog(form);

    if (
      assignableLotInput
      && assignableLotCatalog
      && (!assignableLotCatalog.value || !resolveExactAssignableLotMatch(form))
    ) {
      setAssignableLotInputValidity(form, 'Choose an assignable lot from the list.');
      assignableLotInput.reportValidity();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (form.dataset.duplicateSubmitReplay === 'true') {
      delete form.dataset.duplicateSubmitReplay;
      return;
    }

    const hasSerialSearch = Array.from(form.querySelectorAll('[data-duplicate-check-serial]'))
      .some((input) => normalizeSerialInput(input));

    if (!hasSerialSearch || form.dataset.duplicateSubmitCheckPending === 'true') {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    form.dataset.duplicateSubmitCheckPending = 'true';

    refreshDuplicateCheck(form).then((result) => {
      delete form.dataset.duplicateSubmitCheckPending;

      if (!result || result.matchCount !== 0) {
        const region = form.querySelector('[data-duplicate-check-region]');

        if (region) {
          region.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }

        return;
      }

      form.dataset.duplicateSubmitReplay = 'true';

      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
    });
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-tech-unit-form]');

    if (!form) {
      return;
    }

    const assignableLotInput = getAssignableLotComboboxInput(form);
    const assignableLotCatalog = getAssignableLotCatalog(form);

    if (
      assignableLotInput
      && assignableLotCatalog
      && (!assignableLotCatalog.value || !resolveExactAssignableLotMatch(form))
    ) {
      setAssignableLotInputValidity(form, 'Choose an assignable lot from the list.');
      assignableLotInput.reportValidity();
      event.preventDefault();
      return;
    }

    const comboboxInput = getUnitModelComboboxInput(form);
    const selectionInput = getUnitModelSelectionInput(form);

    if (comboboxInput && selectionInput && comboboxInput.value.trim() && !selectionInput.value && !resolveExactUnitModelMatch(form)) {
      setUnitModelInputValidity(form, 'Choose a Unit Model from the catalog.');
      comboboxInput.reportValidity();
      event.preventDefault();
      return;
    }

    const processorInput = getProcessorComboboxInput(form);
    const processorSelection = getProcessorSelectionInput(form);

    if (processorInput && processorSelection && processorInput.value.trim() && !processorSelection.value && !resolveExactProcessorMatch(form)) {
      setProcessorInputValidity(form, 'Choose a compatible processor from the catalog.');
      processorInput.reportValidity();
      event.preventDefault();
    }
  });

  document.addEventListener('click', (event) => {
    const assignableLotOptionButton = event.target.closest('[data-assignable-lot-option]');

    if (assignableLotOptionButton) {
      const form = getFormFromElement(assignableLotOptionButton);
      selectAssignableLotOption(form, assignableLotOptionButton.getAttribute('data-assignable-lot-option'));
      return;
    }

    const modelOptionButton = event.target.closest('[data-unit-model-option]');

    if (modelOptionButton) {
      const form = getFormFromElement(modelOptionButton);
      selectUnitModelOption(form, modelOptionButton.getAttribute('data-unit-model-option'));
      return;
    }

    const processorOptionButton = event.target.closest('[data-processor-option]');

    if (processorOptionButton) {
      const form = getFormFromElement(processorOptionButton);
      selectProcessorOption(form, processorOptionButton.getAttribute('data-processor-option'));
      return;
    }

    const addButton = event.target.closest('[data-add-module-row]');

    if (addButton) {
      const form = getFormFromElement(addButton);
      const rowType = addButton.getAttribute('data-add-module-row');
      addModuleRow(form, rowType);
      return;
    }

    const removeButton = event.target.closest('[data-remove-module-row]');

    if (removeButton) {
      removeModuleRow(removeButton);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    initializeForms(document);
  });

  document.body.addEventListener('htmx:afterSwap', (event) => {
    initializeForms(event.target || document);
  });
})();
