(function () {
  function setupLotForm(form) {
    const checkbox = form.querySelector('[data-lot-unlimited-toggle]') || form.querySelector('#hasUnlimitedGoal');
    const goalField = form.querySelector('[data-lot-goal-field]') || form.querySelector('#unitAmountGoalField');
    const goalInput = form.querySelector('[data-lot-goal-input]') || form.querySelector('#unitAmountGoalInput');

    if (!checkbox || !goalField || !goalInput || goalField.dataset.lotToggleReady === '1') {
      return;
    }

    function syncGoalVisibility() {
      if (checkbox.checked) {
        goalField.classList.add('is-hidden');
        goalInput.value = '';
        goalInput.disabled = true;
        goalInput.removeAttribute('required');
        return;
      }

      goalField.classList.remove('is-hidden');
      goalInput.disabled = false;
      goalInput.setAttribute('required', 'required');
    }

    goalField.dataset.lotToggleReady = '1';
    checkbox.addEventListener('change', syncGoalVisibility);
    syncGoalVisibility();
  }


  function setupLotDuplicateForm(form) {
    if (!form || form.dataset.lotDuplicateReady === '1') {
      return;
    }

    const placementInputs = Array.from(form.querySelectorAll('input[name="placementMode"]'));
    const parentField = form.querySelector('[data-lot-duplicate-parent-field]');
    const parentSelect = form.querySelector('[data-lot-duplicate-parent-select]');
    const preserveInheritance = form.querySelector('[data-lot-duplicate-preserve-inheritance]');
    const parentInheritance = form.querySelector('[data-lot-duplicate-parent-inheritance]');
    const destinationLabel = form.querySelector('[data-lot-duplicate-destination-label]');
    const requirementDescription = form.querySelector('[data-lot-duplicate-requirement-description]');
    const preserveTitle = form.querySelector('[data-lot-duplicate-preserve-title]');
    const preserveDescription = form.querySelector('[data-lot-duplicate-preserve-description]');
    const parentTitle = form.querySelector('[data-lot-duplicate-parent-title]');
    const parentDescription = form.querySelector('[data-lot-duplicate-parent-description]');
    const sourceLotName = String(form.dataset.sourceLotName || 'the source Lot').trim();

    if (placementInputs.length === 0 || !parentField || !parentSelect) {
      return;
    }

    function getSelectedParentLabel() {
      const option = parentSelect.selectedOptions && parentSelect.selectedOptions[0];
      if (!option || !String(option.value || '').trim()) {
        return '';
      }

      return String(option.dataset.lotFullPath || option.dataset.lotLabel || option.textContent || '').trim();
    }

    function syncPlacement() {
      const selectedPlacement = placementInputs.find((input) => input.checked)?.value || 'top_level';
      const isChildPlacement = selectedPlacement === 'child';
      const parentLabel = isChildPlacement ? getSelectedParentLabel() : '';
      const hasDestinationParent = Boolean(parentLabel);

      parentField.hidden = !isChildPlacement;
      parentSelect.disabled = !isChildPlacement;
      parentSelect.required = isChildPlacement;

      if (destinationLabel) {
        destinationLabel.textContent = hasDestinationParent
          ? `${parentLabel} (Parent Lot)`
          : (isChildPlacement ? 'Choose a Parent Lot' : 'Root-level Lot (no Parent Lot)');
      }

      if (preserveTitle) {
        preserveTitle.textContent = `Keep Unit Form & Browser Behavior from ${sourceLotName}`;
      }

      if (requirementDescription) {
        requirementDescription.textContent = hasDestinationParent
          ? `Requirements: Direct Requirements from ${sourceLotName} remain child-specific overrides. Every other Requirement automatically inherits from ${parentLabel}; no manual Restore Inheritance is needed.`
          : (isChildPlacement
              ? `Requirements: Choose a Parent Lot. Direct Requirements from ${sourceLotName} will remain child-specific overrides, and every other Requirement will automatically inherit from the destination parent.`
              : `Requirements: Direct Requirements from ${sourceLotName} are copied. This is a root-level Lot, so there is no Parent Lot to inherit additional Requirements from.`);
      }

      if (preserveDescription) {
        preserveDescription.textContent = hasDestinationParent
          ? `Place the duplicate under ${parentLabel}, but keep the effective Unit Form behavior and Unit Browser layout currently used by ${sourceLotName}.`
          : (isChildPlacement
              ? `Choose a Parent Lot. This option will keep the effective Unit Form behavior and Unit Browser layout currently used by ${sourceLotName}.`
              : `Create the duplicate as a root-level Lot and copy the effective Unit Form behavior and Unit Browser layout currently used by ${sourceLotName}.`);
      }

      if (parentTitle) {
        parentTitle.textContent = hasDestinationParent
          ? `Inherit Unit Form & Browser from ${parentLabel}`
          : 'Inherit Unit Form & Browser from Destination Parent';
      }

      if (parentDescription) {
        parentDescription.textContent = hasDestinationParent
          ? `Place the duplicate under ${parentLabel}. Direct Unit Form rules and direct Unit Browser customization from ${sourceLotName} are copied; inherited Unit Form and Browser behavior can come from ${parentLabel}.`
          : (isChildPlacement
              ? 'Choose a destination Parent Lot to enable this Unit Form and Unit Browser option.'
              : 'Available only when the duplicate is placed under another Parent Lot. Requirements follow the automatic rule above either way.');
      }

      if (parentInheritance) {
        parentInheritance.disabled = !hasDestinationParent;
      }

      if (!hasDestinationParent && preserveInheritance) {
        preserveInheritance.checked = true;
      }
    }

    form.dataset.lotDuplicateReady = '1';
    placementInputs.forEach((input) => input.addEventListener('change', syncPlacement));
    parentSelect.addEventListener('change', syncPlacement);
    syncPlacement();
  }

  function initialize(root) {
    root.querySelectorAll('[data-lot-form], .app-form').forEach(setupLotForm);
    root.querySelectorAll('[data-lot-duplicate-form]').forEach(setupLotDuplicateForm);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initialize(document);
  });

  document.addEventListener('htmx:afterSwap', (event) => {
    initialize(event.target || document);
  });
})();
