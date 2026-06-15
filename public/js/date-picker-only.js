(function () {
  function isDateInput(target) {
    return target && target.matches && target.matches('input[type="date"], input[type="week"], input[type="month"]');
  }

  function openPicker(input) {
    if (!isDateInput(input) || typeof input.showPicker !== 'function') {
      return;
    }

    try {
      input.showPicker();
    } catch (error) {
      // Some browsers only allow showPicker() during direct user interaction.
    }
  }

  document.addEventListener('keydown', (event) => {
    if (!isDateInput(event.target)) {
      return;
    }

    const allowedKeys = new Set(['Tab', 'Escape']);

    if (!allowedKeys.has(event.key)) {
      event.preventDefault();
    }
  });

  document.addEventListener('paste', (event) => {
    if (isDateInput(event.target)) {
      event.preventDefault();
    }
  });

  document.addEventListener('drop', (event) => {
    if (isDateInput(event.target)) {
      event.preventDefault();
    }
  });

  document.addEventListener('click', (event) => {
    if (isDateInput(event.target)) {
      openPicker(event.target);
    }
  });
})();
