(function () {
  const LOT_REQUIREMENT_WORKFLOW_STORAGE_KEY = 'bwt-lot-requirements-updated';
  const REQUIREMENT_VALUE_RESULT_LIMIT = 100;

  function parseOptions(form) {
    const modalScript = form.closest('.modal-body')?.querySelector('[data-requirement-value-options-json]');
    const pageScript = document.getElementById('requirement-value-options-json');
    const script = modalScript || pageScript;

    if (!script) {
      return {};
    }

    try {
      return JSON.parse(script.textContent || '{}');
    } catch (error) {
      console.error('Unable to parse requirement value options.', error);
      return {};
    }
  }

  function clearSelect(select) {
    while (select.options.length > 1) {
      select.remove(1);
    }
  }

  function populateSelect(select, options, selectedValue) {
    clearSelect(select);

    options.forEach((option) => {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label || option.value;

      if (option.description) {
        optionElement.title = option.description;
      }

      if (String(option.value) === String(selectedValue)) {
        optionElement.selected = true;
      }

      select.append(optionElement);
    });
  }

  function normalizeRequirementValueSearch(value) {
    return String(value || '')
      .trim()
      .toLocaleLowerCase()
      .replace(/\s+/g, ' ');
  }

  function getRequirementValueOptionLabel(option) {
    return String(option?.label || option?.value || '').trim();
  }

  function getRequirementValueOptionSearchText(option) {
    return normalizeRequirementValueSearch([
      option?.label,
      option?.code,
      option?.description
    ].filter(Boolean).join(' '));
  }

  function filterRequirementValueOptions(options, query) {
    const normalizedQuery = normalizeRequirementValueSearch(query);

    if (!normalizedQuery) {
      return Array.isArray(options) ? options : [];
    }

    return (Array.isArray(options) ? options : []).filter((option) => (
      getRequirementValueOptionSearchText(option).includes(normalizedQuery)
    ));
  }

  function getExactRequirementValueOption(options, query) {
    const normalizedQuery = normalizeRequirementValueSearch(query);

    if (!normalizedQuery) {
      return null;
    }

    return (Array.isArray(options) ? options : []).find((option) => (
      normalizeRequirementValueSearch(getRequirementValueOptionLabel(option)) === normalizedQuery
      || normalizeRequirementValueSearch(option?.code) === normalizedQuery
    )) || null;
  }

  function updateOperatorOptions(operatorSelect, allowedOperators) {
    const allowedSet = new Set(Array.isArray(allowedOperators) ? allowedOperators : []);
    let firstAllowedValue = '';
    let selectedIsAllowed = false;

    Array.from(operatorSelect.options).forEach((option) => {
      const allowed = allowedSet.has(option.value);
      option.disabled = !allowed;
      option.hidden = !allowed;

      if (allowed && !firstAllowedValue) {
        firstAllowedValue = option.value;
      }

      if (allowed && option.selected) {
        selectedIsAllowed = true;
      }
    });

    if (!selectedIsAllowed && firstAllowedValue) {
      operatorSelect.value = firstAllowedValue;
    }
  }

  function getSelectedRequirementValueOption(selectInput, options) {
    const selectedValue = String(selectInput.value || '');

    return (Array.isArray(options) ? options : []).find((option) => (
      String(option.value) === selectedValue
    )) || null;
  }

  function setRequirementValueSearchValidity(searchInput, isValid) {
    searchInput.setCustomValidity(isValid ? '' : 'Select a value from the available list.');
  }

  function closeRequirementValueOptions(searchInput, optionsContainer) {
    optionsContainer.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
  }

  function setActiveRequirementValueOption(searchInput, optionsContainer, nextIndex) {
    const optionButtons = Array.from(optionsContainer.querySelectorAll('[data-required-value-option]'));

    if (optionButtons.length === 0) {
      searchInput.removeAttribute('aria-activedescendant');
      return;
    }

    const boundedIndex = Math.max(0, Math.min(nextIndex, optionButtons.length - 1));

    optionButtons.forEach((button, index) => {
      const isActive = index === boundedIndex;
      button.classList.toggle('is-active', isActive);

      if (isActive) {
        searchInput.setAttribute('aria-activedescendant', button.id);
        button.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function renderRequirementValueOptions({
    searchInput,
    selectInput,
    optionsContainer,
    options,
    query
  }) {
    const filteredOptions = filterRequirementValueOptions(options, query);
    const visibleOptions = filteredOptions.slice(0, REQUIREMENT_VALUE_RESULT_LIMIT);
    const selectedValue = String(selectInput.value || '');

    optionsContainer.replaceChildren();

    if (visibleOptions.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'lot-requirement-value-empty';
      emptyMessage.textContent = 'No matching values.';
      optionsContainer.append(emptyMessage);
    } else {
      visibleOptions.forEach((option, index) => {
        const optionButton = document.createElement('button');
        const optionLabel = getRequirementValueOptionLabel(option);
        optionButton.type = 'button';
        optionButton.id = `lot-requirement-value-option-${index}`;
        optionButton.className = 'lot-requirement-value-option';
        optionButton.dataset.requiredValueOption = String(option.value);
        optionButton.dataset.requiredValueLabel = optionLabel;
        optionButton.setAttribute('role', 'option');
        optionButton.setAttribute('aria-selected', String(String(option.value) === selectedValue));
        optionButton.textContent = optionLabel;

        if (option.description) {
          optionButton.title = option.description;
        }

        optionsContainer.append(optionButton);
      });

      if (filteredOptions.length > visibleOptions.length) {
        const resultNote = document.createElement('p');
        resultNote.className = 'lot-requirement-value-result-note';
        resultNote.textContent = `Showing the first ${REQUIREMENT_VALUE_RESULT_LIMIT} matches. Continue typing to narrow the list.`;
        optionsContainer.append(resultNote);
      }
    }

    optionsContainer.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    searchInput.removeAttribute('aria-activedescendant');
  }

  function selectRequirementValueOption({
    searchInput,
    selectInput,
    optionsContainer,
    option
  }) {
    if (!option) {
      return;
    }

    selectInput.value = String(option.value);
    searchInput.value = getRequirementValueOptionLabel(option);
    setRequirementValueSearchValidity(searchInput, true);
    closeRequirementValueOptions(searchInput, optionsContainer);
  }

  function resolveExactRequirementValueMatch({
    searchInput,
    selectInput,
    optionsContainer,
    options
  }) {
    const exactOption = getExactRequirementValueOption(options, searchInput.value);

    if (!exactOption) {
      return false;
    }

    selectRequirementValueOption({
      searchInput,
      selectInput,
      optionsContainer,
      option: exactOption
    });
    return true;
  }

  function updateRequirementValueField({
    optionsByKey,
    requirementSelect,
    operatorSelect,
    selectWrap,
    selectInput,
    searchInput,
    optionsContainer,
    selectHint,
    textWrap,
    textInput,
    fieldHint
  }) {
    const selectedRequirementKey = requirementSelect.value;
    const optionSet = optionsByKey[selectedRequirementKey] || null;

    updateOperatorOptions(operatorSelect, optionSet?.allowedOperators || []);

    if (!selectedRequirementKey || !optionSet) {
      selectWrap.hidden = true;
      selectInput.disabled = true;
      searchInput.disabled = true;
      searchInput.required = false;
      searchInput.value = '';
      setRequirementValueSearchValidity(searchInput, true);
      closeRequirementValueOptions(searchInput, optionsContainer);

      textWrap.hidden = false;
      textInput.disabled = false;
      textInput.required = true;

      if (fieldHint) {
        fieldHint.textContent = 'Select a requirement field to load its supported values and rules.';
      }

      return;
    }

    if (optionSet.type === 'select') {
      const currentValue = textInput.value || selectInput.value;
      const availableOptions = optionSet.options || [];
      populateSelect(selectInput, availableOptions, currentValue);

      const selectedOption = getSelectedRequirementValueOption(selectInput, availableOptions);
      searchInput.value = selectedOption ? getRequirementValueOptionLabel(selectedOption) : '';

      selectWrap.hidden = false;
      selectInput.disabled = false;
      searchInput.disabled = availableOptions.length === 0;
      searchInput.required = availableOptions.length > 0;
      searchInput.placeholder = availableOptions.length > 0
        ? 'Search or select a value'
        : 'No active values available';
      setRequirementValueSearchValidity(searchInput, Boolean(selectedOption) || availableOptions.length === 0);

      textWrap.hidden = true;
      textInput.disabled = true;
      textInput.required = false;
      closeRequirementValueOptions(searchInput, optionsContainer);

      if (selectHint) {
        selectHint.textContent = availableOptions.length > 0
          ? `${availableOptions.length.toLocaleString()} values loaded from ${optionSet.source || 'the application catalog'}. Type to search.`
          : 'No active values are available for this requirement yet.';
      }

      if (fieldHint) {
        fieldHint.textContent = 'Search and choose one standardized value. Only supported rules are shown.';
      }

      return;
    }

    selectWrap.hidden = true;
    selectInput.disabled = true;
    searchInput.disabled = true;
    searchInput.required = false;
    searchInput.value = '';
    setRequirementValueSearchValidity(searchInput, true);
    closeRequirementValueOptions(searchInput, optionsContainer);

    textWrap.hidden = false;
    textInput.disabled = false;
    textInput.required = true;

    if (optionSet.type === 'text') {
      textInput.type = 'text';
      textInput.inputMode = 'text';
      textInput.removeAttribute('min');
      textInput.removeAttribute('max');
      textInput.removeAttribute('step');
      textInput.maxLength = Number(optionSet.maximumLength || 120);
      textInput.placeholder = 'Enter exact required value';

      if (/^[a-z_]+:\d+$/.test(textInput.value)) {
        textInput.value = '';
      }

      if (fieldHint) {
        fieldHint.textContent = `${optionSet.helpText || 'Enter the exact value that the Unit must match.'} Text matching ignores capitalization and surrounding spaces.`;
      }
      return;
    }

    const numericInput = optionSet.numericInput || {};
    const minimum = numericInput.minimum ?? 0;
    const maximum = numericInput.maximum;
    const step = numericInput.step ?? 0.01;
    const exampleValue = String(numericInput.exampleValue || '').trim();

    textInput.type = 'number';
    textInput.inputMode = 'decimal';
    textInput.removeAttribute('maxlength');
    textInput.min = String(minimum);
    textInput.step = String(step);
    textInput.placeholder = exampleValue ? `Example: ${exampleValue}` : 'Enter required value';

    if (maximum === null || maximum === undefined || maximum === '') {
      textInput.removeAttribute('max');
    } else {
      textInput.max = String(maximum);
    }

    if (/^[a-z_]+:\d+$/.test(textInput.value)) {
      textInput.value = '';
    }

    if (fieldHint) {
      const suffix = optionSet.unitSuffix ? ` Values are measured in ${optionSet.unitSuffix.trim()}.` : '';
      fieldHint.textContent = `${optionSet.helpText || 'Enter the required numeric value.'}${suffix} Must Equal, Minimum, and Maximum are available.`;
    }
  }

  function setupRequirementForm(form) {
    if (form.dataset.requirementFormReady === '1') {
      return;
    }

    const optionsByKey = parseOptions(form);
    const requirementSelect = form.querySelector('[data-requirement-key]');
    const operatorSelect = form.querySelector('[data-requirement-operator]');
    const selectWrap = form.querySelector('[data-required-value-select-wrap]');
    const selectInput = form.querySelector('[data-required-value-select]');
    const searchInput = form.querySelector('[data-required-value-search]');
    const optionsContainer = form.querySelector('[data-required-value-options]');
    const selectHint = form.querySelector('[data-required-value-select-hint]');
    const textWrap = form.querySelector('[data-required-value-text-wrap]');
    const textInput = form.querySelector('[data-required-value-text]');
    const fieldHint = form.querySelector('[data-requirement-field-hint]');

    if (
      !requirementSelect
      || !operatorSelect
      || !selectWrap
      || !selectInput
      || !searchInput
      || !optionsContainer
      || !textWrap
      || !textInput
    ) {
      return;
    }

    const getCurrentOptions = () => optionsByKey[requirementSelect.value]?.options || [];

    const update = () => updateRequirementValueField({
      optionsByKey,
      requirementSelect,
      operatorSelect,
      selectWrap,
      selectInput,
      searchInput,
      optionsContainer,
      selectHint,
      textWrap,
      textInput,
      fieldHint
    });

    form.dataset.requirementFormReady = '1';
    requirementSelect.addEventListener('change', update);

    searchInput.addEventListener('focus', () => {
      if (searchInput.disabled) {
        return;
      }

      searchInput.select();
      renderRequirementValueOptions({
        searchInput,
        selectInput,
        optionsContainer,
        options: getCurrentOptions(),
        query: selectInput.value ? '' : searchInput.value
      });
    });

    searchInput.addEventListener('input', () => {
      const selectedOption = getSelectedRequirementValueOption(selectInput, getCurrentOptions());
      const selectedLabel = selectedOption ? getRequirementValueOptionLabel(selectedOption) : '';

      if (normalizeRequirementValueSearch(searchInput.value) !== normalizeRequirementValueSearch(selectedLabel)) {
        selectInput.value = '';
      }

      setRequirementValueSearchValidity(searchInput, Boolean(selectInput.value));
      renderRequirementValueOptions({
        searchInput,
        selectInput,
        optionsContainer,
        options: getCurrentOptions(),
        query: searchInput.value
      });
    });

    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeRequirementValueOptions(searchInput, optionsContainer);
        return;
      }

      if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
        return;
      }

      if (optionsContainer.hidden) {
        renderRequirementValueOptions({
          searchInput,
          selectInput,
          optionsContainer,
          options: getCurrentOptions(),
          query: searchInput.value
        });
      }

      const optionButtons = Array.from(optionsContainer.querySelectorAll('[data-required-value-option]'));
      const activeIndex = optionButtons.findIndex((button) => button.classList.contains('is-active'));

      if (event.key === 'Enter') {
        const activeOption = optionButtons[activeIndex];

        if (activeOption) {
          event.preventDefault();
          const option = getCurrentOptions().find((candidate) => (
            String(candidate.value) === String(activeOption.dataset.requiredValueOption)
          ));
          selectRequirementValueOption({ searchInput, selectInput, optionsContainer, option });
          return;
        }

        if (resolveExactRequirementValueMatch({
          searchInput,
          selectInput,
          optionsContainer,
          options: getCurrentOptions()
        })) {
          event.preventDefault();
        }
        return;
      }

      event.preventDefault();
      const nextIndex = event.key === 'ArrowDown'
        ? (activeIndex < 0 ? 0 : Math.min(activeIndex + 1, optionButtons.length - 1))
        : (activeIndex < 0 ? optionButtons.length - 1 : Math.max(activeIndex - 1, 0));
      setActiveRequirementValueOption(searchInput, optionsContainer, nextIndex);
    });

    optionsContainer.addEventListener('mousedown', (event) => {
      const optionButton = event.target.closest('[data-required-value-option]');

      if (!optionButton) {
        return;
      }

      event.preventDefault();
      const option = getCurrentOptions().find((candidate) => (
        String(candidate.value) === String(optionButton.dataset.requiredValueOption)
      ));
      selectRequirementValueOption({ searchInput, selectInput, optionsContainer, option });
      searchInput.focus();
    });

    searchInput.addEventListener('blur', () => {
      if (!selectInput.value) {
        resolveExactRequirementValueMatch({
          searchInput,
          selectInput,
          optionsContainer,
          options: getCurrentOptions()
        });
      }

      setRequirementValueSearchValidity(searchInput, Boolean(selectInput.value));
      window.setTimeout(() => closeRequirementValueOptions(searchInput, optionsContainer), 0);
    });

    form.addEventListener('submit', (event) => {
      if (selectWrap.hidden || selectInput.disabled) {
        return;
      }

      if (!selectInput.value) {
        resolveExactRequirementValueMatch({
          searchInput,
          selectInput,
          optionsContainer,
          options: getCurrentOptions()
        });
      }

      setRequirementValueSearchValidity(searchInput, Boolean(selectInput.value));

      if (!selectInput.value) {
        event.preventDefault();
        searchInput.reportValidity();
      }
    });

    update();
  }

  function initialize(root) {
    root.querySelectorAll('[data-requirement-form]').forEach(setupRequirementForm);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initialize(document);
  });

  document.addEventListener('htmx:afterSwap', (event) => {
    initialize(event.target || document);
  });

  document.body.addEventListener('htmx:afterRequest', (event) => {
    const requestConfig = event.detail?.requestConfig;
    const path = String(requestConfig?.path || '');
    const verb = String(requestConfig?.verb || '').toLowerCase();

    if (!event.detail?.successful || verb !== 'post' || !path.includes('/requirements')) {
      return;
    }

    try {
      window.localStorage.setItem(
        LOT_REQUIREMENT_WORKFLOW_STORAGE_KEY,
        JSON.stringify({ path, updatedAt: Date.now() })
      );
    } catch (error) {
      // Storage can be unavailable in restricted browsing modes. Focus and interval refreshes remain active.
    }
  });
})();
