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

  document.addEventListener('change', (event) => {
    if (!event.target.matches('[data-huddle-history-type-filter]')) return;
    const form = document.querySelector('[data-huddle-history-filter-form]');
    if (!form) return;
    // The select already belongs to the form through its form= attribute.
    // Submit that single value instead of creating a duplicate messageType field.
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  });


  function activateHuddleRow(row) {
    const primary = row?.querySelector?.('[data-huddle-row-primary]');
    if (!primary) return;
    primary.click();
  }

  function isInteractiveRowTarget(target) {
    return Boolean(target?.closest?.('a, button, input, select, textarea, label, summary, [role="button"], [data-no-row-open]'));
  }

  document.addEventListener('click', (event) => {
    const row = event.target.closest?.('[data-huddle-row-open]');
    if (!row || isInteractiveRowTarget(event.target)) return;
    activateHuddleRow(row);
  });

  document.addEventListener('keydown', (event) => {
    const row = event.target.closest?.('[data-huddle-row-open]');
    if (!row || event.target !== row || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    activateHuddleRow(row);
  });

  document.addEventListener('huddlePersonalAcknowledged', (event) => {
    const recipientId = String(event.detail?.recipientId || '');
    const row = document.querySelector(`[data-huddle-row-open][data-recipient-id="${CSS.escape(recipientId)}"]`);
    if (!row) return;
    row.remove();
    const count = document.querySelector('.unit-request-results-count');
    if (!count) return;
    const current = Number.parseInt(count.textContent, 10);
    if (!Number.isFinite(current)) return;
    const next = Math.max(0, current - 1);
    count.textContent = `${next} ${next === 1 ? 'Huddle' : 'Huddles'} found`;
  });

  document.addEventListener('htmx:afterSwap', (event) => initialize(event.target));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialize(), { once: true });
  } else {
    initialize();
  }
})();
