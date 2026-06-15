(function () {
  const guidanceByPeriod = {
    day: 'Choose one specific day. Only the Day field is used.',
    work_week: 'Choose a week. The dashboard reports Monday through Sunday for that week.',
    month: 'Choose a full month. Only the Month field is used.',
    month_to_date: 'Month-to-Date uses the current month through today. No date picker is needed.',
    custom_range: 'Choose a Start and End date. Only those two fields are used.'
  };

  function fieldMatchesPeriod(field, period) {
    const periods = String(field.dataset.periodField || '').split(/\s+/).filter(Boolean);
    return periods.includes(period);
  }

  function setDisabled(field, disabled) {
    field.querySelectorAll('input, select, textarea').forEach((input) => {
      if (!input.matches('[data-reporting-period-select]')) {
        input.disabled = disabled;
      }
    });
  }

  function updateForm(form) {
    const select = form.querySelector('[data-reporting-period-select]');
    if (!select) return;

    const period = select.value || 'day';
    const guidance = form.querySelector('[data-period-guidance]');
    if (guidance) {
      guidance.textContent = guidanceByPeriod[period] || 'Choose a reporting period first. Only visible fields are used.';
    }

    form.querySelectorAll('[data-period-field]').forEach((field) => {
      const isVisible = fieldMatchesPeriod(field, period);
      field.hidden = !isVisible;
      field.classList.toggle('is-active', isVisible);
      setDisabled(field, !isVisible);
    });
  }

  function init(root) {
    root.querySelectorAll('[data-reporting-controls]').forEach(updateForm);
  }

  document.addEventListener('change', (event) => {
    if (!event.target.matches('[data-reporting-period-select]')) return;
    const form = event.target.closest('[data-reporting-controls]');
    if (form) updateForm(form);
  });

  document.addEventListener('DOMContentLoaded', () => init(document));
  document.addEventListener('htmx:afterSwap', (event) => init(event.target || document));
})();
