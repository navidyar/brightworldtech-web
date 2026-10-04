'use strict';

(() => {
  let pendingUserPermissionState = null;

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase();
  }

  function matchesSearch(haystack, query) {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;
    const searchable = normalize(haystack);
    return terms.every((term) => searchable.includes(term));
  }

  function matchesField(rowValue, controlValue) {
    const selected = normalize(controlValue);
    if (!selected) return true;
    return String(rowValue || '')
      .split('|')
      .map(normalize)
      .filter(Boolean)
      .includes(selected);
  }

  function initFilter(root) {
    if (!root || root.dataset.liveFilterReady === '1') return;
    root.dataset.liveFilterReady = '1';

    const controls = Array.from(root.querySelectorAll('[data-live-filter-control]'));
    const rows = Array.from(root.querySelectorAll('[data-live-filter-row]'));
    const groups = Array.from(root.querySelectorAll('[data-live-filter-group]'));
    const empty = root.querySelector('[data-live-filter-empty]');
    const count = root.querySelector('[data-live-filter-count]');
    const clear = root.querySelector('[data-live-filter-clear]');

    const refresh = () => {
      const filters = Object.fromEntries(controls.map((control) => [
        String(control.dataset.liveFilterControl || ''),
        control.value
      ]));

      let visibleCount = 0;
      rows.forEach((row) => {
        const searchMatches = matchesSearch(row.dataset.liveFilterSearch, filters.search);
        const fieldMatches = Object.entries(filters).every(([field, value]) => {
          if (field === 'search' || !value) return true;
          const datasetKey = `liveFilter${field.charAt(0).toUpperCase()}${field.slice(1)}`;
          return matchesField(row.dataset[datasetKey], value);
        });
        const visible = searchMatches && fieldMatches;
        row.hidden = !visible;
        if (visible) visibleCount += 1;
      });

      const autoOpenSearchGroups = root.dataset.liveFilterOpenGroups === 'search';
      const hasSearchQuery = Boolean(normalize(filters.search));

      groups.forEach((group) => {
        const groupRows = Array.from(group.querySelectorAll('[data-live-filter-row]'));
        group.hidden = groupRows.length > 0 && !groupRows.some((row) => !row.hidden);

        if (autoOpenSearchGroups && group.tagName === 'DETAILS') {
          if (hasSearchQuery && !group.hidden) {
            if (!group.open) group.dataset.liveFilterAutoOpened = '1';
            group.open = true;
          } else if (!hasSearchQuery && group.dataset.liveFilterAutoOpened === '1') {
            group.open = false;
            delete group.dataset.liveFilterAutoOpened;
          }
        }
      });

      if (empty) empty.hidden = visibleCount > 0;
      if (count) count.textContent = String(visibleCount);
      if (clear) clear.disabled = !controls.some((control) => String(control.value || '').trim());
    };

    controls.forEach((control) => {
      control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', refresh);
    });

    if (clear) {
      clear.addEventListener('click', () => {
        controls.forEach((control) => {
          control.value = '';
        });
        refresh();
        const search = controls.find((control) => control.dataset.liveFilterControl === 'search');
        if (search) search.focus();
      });
    }

    refresh();
  }

  function initPermissionGroupToggles(root) {
    root.querySelectorAll('[data-permission-groups-expand], [data-permission-groups-collapse]').forEach((button) => {
      if (button.dataset.permissionGroupsToggleReady === '1') return;
      button.dataset.permissionGroupsToggleReady = '1';
      button.addEventListener('click', () => {
        const scope = button.closest('form, .permission-user-manage-modal, .permission-role-manage-modal') || document;
        const shouldOpen = button.hasAttribute('data-permission-groups-expand');
        scope.querySelectorAll('details[data-live-filter-group]:not([hidden])').forEach((group) => {
          group.open = shouldOpen;
          delete group.dataset.liveFilterAutoOpened;
        });
      });
    });
  }

  function initBulkOverrides(root) {
    root.querySelectorAll('[data-permission-category-override]').forEach((control) => {
      if (control.dataset.permissionCategoryOverrideReady === '1') return;
      control.dataset.permissionCategoryOverrideReady = '1';
      control.addEventListener('change', () => {
        const value = String(control.value || '').trim();
        if (!value) return;
        const group = control.closest('[data-permission-override-group]');
        if (!group) return;
        group.querySelectorAll('select[data-permission-override-select]:not(:disabled)').forEach((select) => {
          select.value = value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        control.value = '';
      });
    });
  }

  function getUserPermissionFormId(form) {
    const match = String(form?.getAttribute('action') || '').match(/\/management\/users\/(\d+)\/permissions\/modal$/);
    return match ? match[1] : '';
  }

  function captureUserPermissionState(form) {
    const userId = getUserPermissionFormId(form);
    if (!userId) return null;
    const modalBody = form.closest('.modal-body');
    const search = form.querySelector('[data-live-filter-control="search"]');
    return {
      userId,
      openGroups: Array.from(form.querySelectorAll('[data-permission-group-key][open]'))
        .map((group) => String(group.dataset.permissionGroupKey || ''))
        .filter(Boolean),
      searchValue: search ? search.value : '',
      scrollTop: modalBody ? modalBody.scrollTop : 0
    };
  }

  function restoreUserPermissionState(root, state) {
    const form = root.querySelector('.permission-user-overrides-form');
    if (!form || getUserPermissionFormId(form) !== state?.userId) return;
    const openGroups = new Set(state.openGroups || []);
    form.querySelectorAll('[data-permission-group-key]').forEach((group) => {
      group.open = openGroups.has(String(group.dataset.permissionGroupKey || ''));
      delete group.dataset.liveFilterAutoOpened;
    });
    const search = form.querySelector('[data-live-filter-control="search"]');
    if (search) search.value = state.searchValue || '';
    window.setTimeout(() => {
      if (search) search.dispatchEvent(new Event('input', { bubbles: true }));
      const modalBody = form.closest('.modal-body');
      if (modalBody) modalBody.scrollTop = Number(state.scrollTop || 0);
    }, 0);
  }

  function init(root = document) {
    root.querySelectorAll('[data-live-filter]').forEach(initFilter);
    initPermissionGroupToggles(root);
    initBulkOverrides(root);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(document), { once: true });
  else init(document);

  document.addEventListener('htmx:beforeRequest', (event) => {
    const requestElement = event.detail?.elt || event.target;
    const form = requestElement instanceof HTMLFormElement
      ? requestElement
      : requestElement?.closest?.('.permission-user-overrides-form');
    if (!form?.matches('.permission-user-overrides-form')) return;
    pendingUserPermissionState = captureUserPermissionState(form);
  });

  document.addEventListener('htmx:afterSwap', (event) => {
    init(event.target);
    if (event.target.id !== 'modal-root' || !pendingUserPermissionState) return;
    restoreUserPermissionState(event.target, pendingUserPermissionState);
    pendingUserPermissionState = null;
  });
})();
