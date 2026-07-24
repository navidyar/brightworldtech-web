(function () {
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

  function updateRequirementValueField({
    optionsByKey,
    requirementSelect,
    operatorSelect,
    selectWrap,
    selectInput,
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
      selectInput.required = false;

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
      populateSelect(selectInput, optionSet.options || [], currentValue);

      selectWrap.hidden = false;
      selectInput.disabled = false;
      selectInput.required = true;

      textWrap.hidden = true;
      textInput.disabled = true;
      textInput.required = false;

      if (selectHint) {
        selectHint.textContent = optionSet.options?.length > 0
          ? `Values loaded from ${optionSet.source || 'the application catalog'}.`
          : 'No active values are available for this requirement yet.';
      }

      if (fieldHint) {
        fieldHint.textContent = 'Choose one standardized value. Only supported rules are shown.';
      }

      return;
    }

    selectWrap.hidden = true;
    selectInput.disabled = true;
    selectInput.required = false;

    textWrap.hidden = false;
    textInput.disabled = false;
    textInput.required = true;
    textInput.type = 'number';
    textInput.min = '0.01';
    textInput.step = '0.01';
    textInput.placeholder = selectedRequirementKey === 'ram_gb'
      ? 'Example: 16'
      : 'Example: 512';

    if (/^[a-z_]+:\d+$/.test(textInput.value)) {
      textInput.value = '';
    }

    if (fieldHint) {
      fieldHint.textContent = 'Enter a total size in GB. Minimum and maximum comparisons are available.';
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
    const selectHint = form.querySelector('[data-required-value-select-hint]');
    const textWrap = form.querySelector('[data-required-value-text-wrap]');
    const textInput = form.querySelector('[data-required-value-text]');
    const fieldHint = form.querySelector('[data-requirement-field-hint]');

    if (!requirementSelect || !operatorSelect || !selectWrap || !selectInput || !textWrap || !textInput) {
      return;
    }

    const update = () => updateRequirementValueField({
      optionsByKey,
      requirementSelect,
      operatorSelect,
      selectWrap,
      selectInput,
      selectHint,
      textWrap,
      textInput,
      fieldHint
    });

    form.dataset.requirementFormReady = '1';
    requirementSelect.addEventListener('change', update);
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
})();
