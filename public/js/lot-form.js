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

  function initialize(root) {
    root.querySelectorAll('[data-lot-form], .app-form').forEach(setupLotForm);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initialize(document);
  });

  document.addEventListener('htmx:afterSwap', (event) => {
    initialize(event.target || document);
  });
})();
