(function () {
  function closeOtherRows(currentRow) {
    document.querySelectorAll('.tech-detail-row:not([hidden])').forEach((row) => {
      if (row !== currentRow) {
        row.hidden = true;
      }
    });

    document.querySelectorAll('[data-unit-detail-toggle][aria-expanded="true"]').forEach((button) => {
      const targetId = button.getAttribute('data-target');

      if (!currentRow || targetId !== currentRow.id) {
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-unit-detail-toggle]');

    if (!toggle) {
      return;
    }

    const targetId = toggle.getAttribute('data-target');
    const targetRow = document.getElementById(targetId);

    if (!targetRow) {
      return;
    }

    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';

    if (isExpanded) {
      targetRow.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      return;
    }

    closeOtherRows(targetRow);
    targetRow.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  });

  document.body.addEventListener('unit-saved', () => {
    closeOtherRows(null);
  });
})();