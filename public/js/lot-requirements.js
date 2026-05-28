(function () {
  function parseOptions() {
    const script = document.getElementById('requirement-value-options-json');

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

  function updateRequirementValueField({
    optionsByKey,
    requirementSelect,
    selectWrap,
    selectInput,
    selectHint,
    textWrap,
    textInput,
    fieldHint
  }) {
    const selectedRequirementKey = requirementSelect.value;
    const optionSet = optionsByKey[selectedRequirementKey];

    if (!selectedRequirementKey || !optionSet || optionSet.type !== 'select' || !Array.isArray(optionSet.options) || optionSet.options.length === 0) {
      selectWrap.hidden = true;
      selectInput.disabled = true;
      selectInput.required = false;

      textWrap.hidden = false;
      textInput.disabled = false;
      textInput.required = true;

      if (fieldHint) {
        fieldHint.textContent = selectedRequirementKey
          ? 'No standardized values were found yet, so this requirement uses free text.'
          : 'Select a field to see whether standardized values are available.';
      }

      return;
    }

    const currentTextValue = textInput.value;

    populateSelect(selectInput, optionSet.options, currentTextValue);

    selectWrap.hidden = false;
    selectInput.disabled = false;
    selectInput.required = true;

    textWrap.hidden = true;
    textInput.disabled = true;
    textInput.required = false;

    if (selectHint) {
      selectHint.textContent = optionSet.source === 'fallback'
        ? 'Fallback values are being used until config values are added.'
        : `Values loaded from config category: ${optionSet.source}.`;
    }

    if (fieldHint) {
      fieldHint.textContent = 'Standardized values are available for this requirement.';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('[data-requirement-form]');

    if (!form) {
      return;
    }

    const optionsByKey = parseOptions();
    const requirementSelect = form.querySelector('[data-requirement-key]');
    const selectWrap = form.querySelector('[data-required-value-select-wrap]');
    const selectInput = form.querySelector('[data-required-value-select]');
    const selectHint = form.querySelector('[data-required-value-select-hint]');
    const textWrap = form.querySelector('[data-required-value-text-wrap]');
    const textInput = form.querySelector('[data-required-value-text]');
    const fieldHint = form.querySelector('[data-requirement-field-hint]');

    if (!requirementSelect || !selectWrap || !selectInput || !textWrap || !textInput) {
      return;
    }

    const update = () => updateRequirementValueField({
      optionsByKey,
      requirementSelect,
      selectWrap,
      selectInput,
      selectHint,
      textWrap,
      textInput,
      fieldHint
    });

    requirementSelect.addEventListener('change', update);
    update();
  });
})();