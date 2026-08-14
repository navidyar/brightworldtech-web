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

    if (placementInputs.length === 0 || !parentField || !parentSelect) {
      return;
    }

    function syncPlacement() {
      const selectedPlacement = placementInputs.find((input) => input.checked)?.value || 'top_level';
      const isChildPlacement = selectedPlacement === 'child';

      parentField.hidden = !isChildPlacement;
      parentSelect.disabled = !isChildPlacement;
      parentSelect.required = isChildPlacement;

      if (parentInheritance) {
        parentInheritance.disabled = !isChildPlacement;
      }

      if (!isChildPlacement && preserveInheritance) {
        preserveInheritance.checked = true;
      }
    }

    form.dataset.lotDuplicateReady = '1';
    placementInputs.forEach((input) => input.addEventListener('change', syncPlacement));
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
