(function () {
  function syncPriorTechCredit(form) {
    if (!form) {
      return;
    }

    const checkbox = form.querySelector('[data-prior-tech-credit-toggle]');
    const fieldWrapper = form.querySelector('[data-prior-tech-credit-weight]');
    const weightInput = fieldWrapper ? fieldWrapper.querySelector('input[name="priorTechCreditWeight"]') : null;

    if (!checkbox || !fieldWrapper || !weightInput) {
      return;
    }

    const isEnabled = checkbox.checked;
    fieldWrapper.hidden = !isEnabled;
    weightInput.required = isEnabled;
    weightInput.disabled = !isEnabled;

    if (!isEnabled) {
      weightInput.value = '';
    }
  }

  function syncAllPriorTechCreditControls() {
    document.querySelectorAll('form[action$="/approve"]').forEach(syncPriorTechCredit);
  }

  document.addEventListener('DOMContentLoaded', syncAllPriorTechCreditControls);

  document.addEventListener('change', (event) => {
    if (!event.target.matches('[data-prior-tech-credit-toggle]')) {
      return;
    }

    syncPriorTechCredit(event.target.closest('form'));
  });
})();
