(() => {
  'use strict';

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return;

  let pendingPermissionState = null;

  function getRoleIdFromForm(form) {
    const match = String(form?.getAttribute('action') || '').match(/\/management\/roles-permissions\/(\d+)\/permissions$/);
    return match ? match[1] : '';
  }

  function capturePermissionState(form) {
    const roleId = getRoleIdFromForm(form);
    if (!roleId) return null;

    const openGroups = Array.from(form.querySelectorAll('[data-permission-group-key][open]'))
      .map((group) => String(group.dataset.permissionGroupKey || ''))
      .filter(Boolean);
    const search = form.querySelector('[data-live-filter-control="search"]');
    const state = form.querySelector('[data-live-filter-control="state"]');
    const modalBody = form.closest('.modal-body');

    return {
      roleId,
      openGroups,
      searchValue: search ? search.value : '',
      stateValue: state ? state.value : '',
      scrollTop: modalBody ? modalBody.scrollTop : 0
    };
  }

  function restorePermissionState(root, state) {
    const form = root.querySelector('.permission-role-permissions-form');
    if (!form || getRoleIdFromForm(form) !== state?.roleId) return;

    const openGroups = new Set(state.openGroups || []);
    form.querySelectorAll('[data-permission-group-key]').forEach((group) => {
      group.open = openGroups.has(String(group.dataset.permissionGroupKey || ''));
    });

    const search = form.querySelector('[data-live-filter-control="search"]');
    const approval = form.querySelector('[data-live-filter-control="state"]');
    if (search) search.value = state.searchValue || '';
    if (approval) approval.value = state.stateValue || '';

    // live-list-filter initializes on the same HTMX swap; defer events one turn so restored values win.
    window.setTimeout(() => {
      if (search) search.dispatchEvent(new Event('input', { bubbles: true }));
      if (approval) approval.dispatchEvent(new Event('change', { bubbles: true }));

      const modalBody = form.closest('.modal-body');
      if (modalBody) modalBody.scrollTop = Number(state.scrollTop || 0);
    }, 0);
  }

  function syncRoleLibraryPermissionCount(root) {
    const form = root.querySelector('.permission-role-permissions-form');
    const summary = root.querySelector('[data-role-approved-summary]');
    const roleId = getRoleIdFromForm(form);
    const approvedCount = Number(summary?.dataset.approvedCount);
    if (!roleId || !Number.isInteger(approvedCount)) return;

    const countCell = document.querySelector(`[data-role-permission-count="${roleId}"]`);
    if (countCell) countCell.textContent = String(approvedCount);
  }

  document.addEventListener('htmx:beforeRequest', (event) => {
    const requestElement = event.detail?.elt || event.target;
    const form = requestElement instanceof HTMLFormElement
      ? requestElement
      : requestElement?.closest?.('.permission-role-permissions-form');
    if (!form?.matches('.permission-role-permissions-form')) return;
    pendingPermissionState = capturePermissionState(form);
  });

  document.addEventListener('htmx:afterSwap', (event) => {
    if (event.target !== modalRoot) return;
    syncRoleLibraryPermissionCount(modalRoot);
    if (!pendingPermissionState) return;
    restorePermissionState(modalRoot, pendingPermissionState);
    pendingPermissionState = null;
  });
})();
