(function () {
  function getFormFromElement(element) {
    return element ? element.closest('[data-tech-unit-form]') : null;
  }

  function getSelectedOption(select) {
    return select && select.selectedOptions.length > 0 ? select.selectedOptions[0] : null;
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

  function getModelFilterState(form) {
    const manufacturerSelect = form.querySelector('[data-manufacturer-select]');
    const categorySelect = form.querySelector('[data-unit-category-select]');

    return {
      manufacturerId: manufacturerSelect ? manufacturerSelect.value : '',
      categoryId: categorySelect ? categorySelect.value : ''
    };
  }

  function optionMatchesFilters(option, filters) {
    if (!option || !option.value) {
      return true;
    }

    const optionManufacturerId = option.getAttribute('data-manufacturer-id') || '';
    const optionCategoryId = option.getAttribute('data-category-id') || '';

    const manufacturerMatches = !filters.manufacturerId || !optionManufacturerId || optionManufacturerId === filters.manufacturerId;
    const categoryMatches = !filters.categoryId || !optionCategoryId || optionCategoryId === filters.categoryId;

    return manufacturerMatches && categoryMatches;
  }

  function updateUnitModelFilter(form, preserveSelection) {
    const unitModelSelect = form.querySelector('[data-unit-model-select]');
    const hint = form.querySelector('[data-unit-model-hint]');

    if (!unitModelSelect) {
      return;
    }

    const filters = getModelFilterState(form);
    let visibleCount = 0;
    let selectedOptionIsVisible = true;

    Array.from(unitModelSelect.options).forEach((option) => {
      if (!option.value) {
        option.hidden = false;
        option.disabled = false;
        return;
      }

      const matches = optionMatchesFilters(option, filters);

      option.hidden = !matches;
      option.disabled = !matches;

      if (matches) {
        visibleCount += 1;
      }

      if (option.selected && !matches) {
        selectedOptionIsVisible = false;
      }
    });

    if (!preserveSelection && !selectedOptionIsVisible) {
      unitModelSelect.value = '';
    }

    if (hint) {
      if (filters.manufacturerId || filters.categoryId) {
        hint.textContent = `${visibleCount} model option${visibleCount === 1 ? '' : 's'} match the selected manufacturer/category.`;
      } else {
        hint.textContent = 'Models can be filtered by manufacturer and category.';
      }
    }
  }

  function applySelectedModelMetadata(form) {
    const unitModelSelect = form.querySelector('[data-unit-model-select]');
    const manufacturerSelect = form.querySelector('[data-manufacturer-select]');
    const categorySelect = form.querySelector('[data-unit-category-select]');
    const selectedOption = getSelectedOption(unitModelSelect);

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
  }

  function applySelectedProcessorMetadata(form, forceOverwrite) {
    const processorSelect = form.querySelector('[data-processor-model-select]');
    const speedInput = form.querySelector('[data-processor-speed-input]');
    const selectedOption = getSelectedOption(processorSelect);

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

  function initializeForm(form) {
    if (!form || form.getAttribute('data-tech-unit-form-initialized') === 'true') {
      return;
    }

    form.setAttribute('data-tech-unit-form-initialized', 'true');
    updateUnitModelFilter(form, true);

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

  document.addEventListener('change', (event) => {
    const modelFilterSelect = event.target.closest('[data-manufacturer-select], [data-unit-category-select]');

    if (modelFilterSelect) {
      const form = getFormFromElement(modelFilterSelect);
      updateUnitModelFilter(form, false);
      return;
    }

    const unitModelSelect = event.target.closest('[data-unit-model-select]');

    if (unitModelSelect) {
      const form = getFormFromElement(unitModelSelect);
      applySelectedModelMetadata(form);
      return;
    }

    const processorSelect = event.target.closest('[data-processor-model-select]');

    if (processorSelect) {
      const form = getFormFromElement(processorSelect);
      applySelectedProcessorMetadata(form, false);
    }
  });

  document.addEventListener('input', (event) => {
    const speedInput = event.target.closest('[data-processor-speed-input]');

    if (speedInput) {
      speedInput.setAttribute('data-auto-filled', 'false');
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    initializeForms(document);
  });

  document.body.addEventListener('htmx:afterSwap', (event) => {
    initializeForms(event.target || document);
  });
})();