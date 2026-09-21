(() => {
  'use strict';

  function getForm(scope = document) {
    return scope.querySelector?.('[data-huddle-compose-form]') || null;
  }

  function updateRecipientCount(form) {
    if (!form) return;
    const selectedRoles = new Set(
      [...form.querySelectorAll('[data-huddle-role-target]:checked')].map((input) => input.value)
    );
    const selectedUsers = new Set(
      [...form.querySelectorAll('[data-huddle-user-target]:checked')].map((input) => input.value)
    );
    const recipientIds = new Set();
    form.querySelectorAll('[data-huddle-user-row]').forEach((row) => {
      if (selectedRoles.has(row.dataset.roleCode) || selectedUsers.has(row.dataset.userId)) {
        recipientIds.add(row.dataset.userId);
      }
    });
    const output = form.querySelector('[data-huddle-recipient-count]');
    if (output) {
      output.textContent = `${recipientIds.size} active recipient${recipientIds.size === 1 ? '' : 's'} selected`;
    }
  }

  function filterRecipients(input) {
    const form = input.closest('[data-huddle-compose-form]');
    if (!form) return;
    const query = String(input.value || '').trim().toLowerCase();
    form.querySelectorAll('[data-huddle-user-row]').forEach((row) => {
      row.hidden = Boolean(query && !String(row.dataset.search || '').includes(query));
    });
  }

  function initialize(scope = document) {
    const form = getForm(scope) || getForm(document);
    if (form) updateRecipientCount(form);
  }

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-huddle-recipient-search]')) filterRecipients(event.target);
  });

  document.addEventListener('change', (event) => {
    if (!event.target.matches('[data-huddle-role-target], [data-huddle-user-target]')) return;
    updateRecipientCount(event.target.closest('[data-huddle-compose-form]'));
  });

  document.addEventListener('htmx:afterSwap', (event) => initialize(event.target));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialize(), { once: true });
  } else {
    initialize();
  }
})();
