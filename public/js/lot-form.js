function setupUnlimitedGoalToggle() {
  const checkbox = document.querySelector('#hasUnlimitedGoal');
  const goalField = document.querySelector('#unitAmountGoalField');
  const goalInput = document.querySelector('#unitAmountGoalInput');

  if (!checkbox || !goalField || !goalInput) {
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

  checkbox.addEventListener('change', syncGoalVisibility);
  syncGoalVisibility();
}

document.addEventListener('DOMContentLoaded', () => {
  setupUnlimitedGoalToggle();
});