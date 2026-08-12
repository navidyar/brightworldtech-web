(() => {
  'use strict';

  function normalizeProcessorIdentity(value, brandName = '') {
    let normalized = String(value || '').toLowerCase();
    const brandTokens = String(brandName || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);

    normalized = normalized
      .replace(/@\s*\d+(?:\.\d+)?\s*ghz\b/g, ' ')
      .replace(/\b\d+(?:\.\d+)?\s*ghz\b/g, ' ')
      .replace(/\b\d+(?:st|nd|rd|th)\s*(?:gen|generation)\b/g, ' ')
      .replace(/\b(?:processor|cpu|core)\b/g, ' ');

    brandTokens.forEach((token) => {
      normalized = normalized.replace(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ');
    });
    return normalized.replace(/[^a-z0-9]+/g, '');
  }

  function getCanonicalNameProblems(modelCode, brandName) {
    const problems = [];
    const model = String(modelCode || '').trim();
    const brand = String(brandName || '').trim();
    if (!model) return problems;

    if (/@\s*\d+(?:\.\d+)?(?:\s*ghz)?\b/i.test(model) || /\b\d+(?:\.\d+)?\s*ghz\b/i.test(model)) {
      problems.push('remove GHz/speed from Processor and use Base Speed GHz');
    }
    if (/\b\d+(?:st|nd|rd|th)\s*(?:gen|generation)\b/i.test(model)) {
      problems.push('remove generation text from Processor and use Generation');
    }
    const brandTokens = brand.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
    if (brandTokens.some((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(model))) {
      problems.push('remove the Processor Type/brand from Processor');
    }
    return problems;
  }

  function getOptions(form) {
    const listId = form.querySelector('[data-existing-processor-search]')?.getAttribute('list');
    const datalist = listId ? document.getElementById(listId) : null;
    return datalist ? Array.from(datalist.querySelectorAll('option[data-processor-id]')) : [];
  }

  function initProcessorApprovalForm(form) {
    if (form.dataset.processorApprovalReady === '1') return;
    form.dataset.processorApprovalReady = '1';

    const existingSearch = form.querySelector('[data-existing-processor-search]');
    const existingId = form.querySelector('[data-existing-processor-id]');
    const existingHint = form.querySelector('[data-existing-processor-hint]');
    const brandSelect = form.querySelector('[data-processor-brand-select]');
    const brandName = form.querySelector('[data-canonical-processor-brand]');
    const modelCode = form.querySelector('[data-canonical-processor-model]');
    const baseSpeed = form.querySelector('[data-canonical-processor-speed]');
    const newFields = Array.from(form.querySelectorAll('[data-new-processor-field]'));
    const adminConfirmation = form.querySelector('[data-admin-confirmation]');
    const warning = form.querySelector('[data-processor-similarity-warning]');
    const warningText = form.querySelector('[data-processor-similarity-text]');
    const formatWarning = form.querySelector('[data-processor-format-warning]');
    const formatText = form.querySelector('[data-processor-format-text]');
    const approveButton = form.querySelector('[data-processor-approve-button]');
    const reviewerIsAdmin = form.dataset.reviewerIsAdmin === '1';
    const options = getOptions(form);
    const defaultExistingHint = existingHint?.textContent || '';
    let strongDuplicate = false;
    let formatInvalid = false;

    if (!existingSearch || !existingId || !modelCode) return;

    const getSelectedOption = () => options.find((option) => option.value === existingSearch.value.trim()) || null;

    const getBrandName = () => {
      if (brandSelect && brandSelect.value) {
        return brandSelect.options[brandSelect.selectedIndex]?.textContent?.trim() || '';
      }
      return brandName?.value?.trim() || '';
    };

    const updateButtonState = () => {
      const reusingExisting = Boolean(existingId.value);
      const confirmationMissing = !reviewerIsAdmin && !reusingExisting && adminConfirmation && !adminConfirmation.checked;
      if (approveButton) {
        approveButton.disabled = !reusingExisting && (strongDuplicate || formatInvalid || Boolean(confirmationMissing));
        approveButton.textContent = reusingExisting ? 'Associate Existing Processor' : 'Create and Associate Processor';
      }
    };

    const updateExistingSelection = () => {
      const selectedOption = getSelectedOption();
      existingId.value = selectedOption?.dataset.processorId || '';
      const reusingExisting = Boolean(existingId.value);

      newFields.forEach((field) => {
        field.disabled = reusingExisting;
      });

      if (!reusingExisting) {
        if (brandName) brandName.required = !brandSelect?.value;
        if (modelCode) modelCode.required = true;
        if (baseSpeed) baseSpeed.required = true;
        if (adminConfirmation && !reviewerIsAdmin) adminConfirmation.required = true;
      } else {
        if (brandName) brandName.required = false;
        if (modelCode) modelCode.required = false;
        if (baseSpeed) baseSpeed.required = false;
        if (adminConfirmation) {
          adminConfirmation.required = false;
          adminConfirmation.checked = false;
        }
      }

      if (existingHint) {
        if (selectedOption) {
          const associations = String(selectedOption.dataset.modelLabels || '').trim();
          existingHint.textContent = associations
            ? `Processor #${selectedOption.dataset.processorId} will be associated with this exact Unit Model. It is currently associated with: ${associations.replace(/ \| /g, ', ')}.`
            : `Processor #${selectedOption.dataset.processorId} will be associated with this exact Unit Model. It currently has no other active Unit Model associations.`;
        } else {
          existingHint.textContent = defaultExistingHint;
        }
      }

      updateValidationWarnings();
    };

    const updateValidationWarnings = () => {
      if (existingId.value) {
        strongDuplicate = false;
        formatInvalid = false;
        if (warning) warning.hidden = true;
        if (formatWarning) formatWarning.hidden = true;
        updateButtonState();
        return;
      }

      const normalizedInput = normalizeProcessorIdentity(modelCode.value, getBrandName());
      const matches = normalizedInput.length >= 4
        ? options.filter((option) => {
          const candidateIdentity = normalizeProcessorIdentity(option.dataset.modelCode || option.value, option.dataset.brandName || '');
          return candidateIdentity.length >= 4 && (
            candidateIdentity === normalizedInput
            || candidateIdentity.includes(normalizedInput)
            || normalizedInput.includes(candidateIdentity)
          );
        }).slice(0, 3)
        : [];
      strongDuplicate = matches.some((option) => normalizeProcessorIdentity(option.dataset.modelCode || option.value, option.dataset.brandName || '') === normalizedInput);

      if (warning && warningText) {
        warning.hidden = matches.length === 0;
        warning.classList.toggle('error', strongDuplicate);
        warningText.textContent = matches.map((option) => option.value).join('; ');
      }

      const problems = getCanonicalNameProblems(modelCode.value, getBrandName());
      formatInvalid = problems.length > 0;
      if (formatWarning && formatText) {
        formatWarning.hidden = !formatInvalid;
        formatText.textContent = problems.join('; ');
      }

      updateButtonState();
    };

    existingSearch.addEventListener('input', updateExistingSelection);
    existingSearch.addEventListener('change', updateExistingSelection);
    modelCode.addEventListener('input', updateValidationWarnings);
    brandName?.addEventListener('input', () => {
      if (brandSelect && !brandSelect.value) brandName.required = true;
      updateValidationWarnings();
    });
    brandSelect?.addEventListener('change', () => {
      if (brandName) brandName.required = !brandSelect.value && !existingId.value;
      updateValidationWarnings();
    });
    adminConfirmation?.addEventListener('change', updateButtonState);

    form.querySelectorAll('[data-use-existing-processor-value]').forEach((button) => {
      button.addEventListener('click', () => {
        existingSearch.value = button.dataset.useExistingProcessorValue || '';
        updateExistingSelection();
        existingSearch.focus();
      });
    });

    form.addEventListener('submit', (event) => {
      updateExistingSelection();
      if (!existingId.value && (strongDuplicate || formatInvalid)) {
        event.preventDefault();
        (strongDuplicate ? warning : formatWarning)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    updateExistingSelection();
  }

  function init(root = document) {
    root.querySelectorAll('[data-processor-request-approval-form]').forEach(initProcessorApprovalForm);
  }

  document.addEventListener('DOMContentLoaded', () => init(document));
})();
