(function () {
  function getRows(table) {
    return Array.from(table.querySelectorAll('tbody tr[data-lot-id]'));
  }

  function buildChildrenMap(rows) {
    const childrenByParentId = new Map();

    rows.forEach((row) => {
      const parentId = row.dataset.parentLotId || '';

      if (!parentId) {
        return;
      }

      if (!childrenByParentId.has(parentId)) {
        childrenByParentId.set(parentId, []);
      }

      childrenByParentId.get(parentId).push(row);
    });

    return childrenByParentId;
  }

  function setRowVisible(row, isVisible) {
    row.classList.toggle('lot-tree-row-hidden', !isVisible);
  }

  function setToggleState(row, isExpanded) {
    const toggle = row.querySelector('.lot-tree-toggle');

    if (!toggle) {
      return;
    }

    toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    row.dataset.treeExpanded = isExpanded ? 'true' : 'false';

    const icon = toggle.querySelector('.lot-tree-toggle-icon');
    if (icon) {
      icon.textContent = isExpanded ? '▾' : '▸';
    }
  }

  function hideDescendants(row, childrenByParentId) {
    const lotId = row.dataset.lotId;
    const childRows = childrenByParentId.get(lotId) || [];

    childRows.forEach((childRow) => {
      setRowVisible(childRow, false);
      setToggleState(childRow, false);
      hideDescendants(childRow, childrenByParentId);
    });
  }

  function showDirectChildren(row, childrenByParentId) {
    const lotId = row.dataset.lotId;
    const childRows = childrenByParentId.get(lotId) || [];

    childRows.forEach((childRow) => {
      setRowVisible(childRow, true);
    });
  }

  function toggleRowChildren(row, childrenByParentId) {
    const isExpanded = row.dataset.treeExpanded === 'true';

    if (isExpanded) {
      setToggleState(row, false);
      hideDescendants(row, childrenByParentId);
    } else {
      setToggleState(row, true);
      showDirectChildren(row, childrenByParentId);
    }
  }

  function isInteractiveClick(event) {
    return Boolean(event.target.closest('a, button, input, select, textarea, [role="button"], .lot-row-actions, .lot-tree-toggle-spacer'));
  }

  function isActionZoneClick(event, row) {
    const actions = row.querySelector('.lot-row-actions');

    if (!actions) {
      return false;
    }

    const actionCell = actions.closest('td');

    return Boolean(actionCell && actionCell.contains(event.target));
  }


  function isRootSeparatorClick(event, row) {
    if (!row.classList.contains('lot-level-0')) {
      return false;
    }

    const clickedCell = event.target.closest('td');

    if (!clickedCell || !row.contains(clickedCell)) {
      return false;
    }

    const computedStyle = window.getComputedStyle(clickedCell);
    const borderTopWidth = Number.parseFloat(computedStyle.borderTopWidth || '0');

    if (!borderTopWidth || borderTopWidth < 2) {
      return false;
    }

    const cellRect = clickedCell.getBoundingClientRect();

    return event.clientY >= cellRect.top && event.clientY <= cellRect.top + borderTopWidth;
  }

  function isToggleZoneClick(event, row) {
    const cell = row.querySelector('.lot-hierarchy-cell');

    if (!cell || !cell.contains(event.target)) {
      return false;
    }

    const toggle = row.querySelector('.lot-tree-toggle');
    const spacer = row.querySelector('.lot-tree-toggle-spacer');
    const zoneElement = toggle || spacer;

    if (!zoneElement) {
      return false;
    }

    const zoneRect = zoneElement.getBoundingClientRect();
    const expandedZone = {
      left: zoneRect.left - 8,
      right: zoneRect.right + 10,
      top: zoneRect.top - 8,
      bottom: zoneRect.bottom + 8
    };

    return event.clientX >= expandedZone.left
      && event.clientX <= expandedZone.right
      && event.clientY >= expandedZone.top
      && event.clientY <= expandedZone.bottom;
  }


  function isHierarchyIndentZoneClick(event, row) {
    const cell = row.querySelector('.lot-hierarchy-cell');

    if (!cell || !cell.contains(event.target)) {
      return false;
    }

    const toggle = row.querySelector('.lot-tree-toggle');
    const spacer = row.querySelector('.lot-tree-toggle-spacer');
    const zoneElement = toggle || spacer;

    if (!zoneElement) {
      return false;
    }

    const cellRect = cell.getBoundingClientRect();
    const zoneRect = zoneElement.getBoundingClientRect();

    return event.clientX >= cellRect.left
      && event.clientX < zoneRect.left
      && event.clientY >= cellRect.top
      && event.clientY <= cellRect.bottom;
  }

  function goToRowView(row) {
    const href = row.dataset.viewHref;

    if (!href) {
      return;
    }

    window.location.href = href;
  }

  function initializeLotTree(table) {
    const rows = getRows(table);
    const childrenByParentId = buildChildrenMap(rows);

    rows.forEach((row) => {
      const isRootRow = !row.dataset.parentLotId;
      setRowVisible(row, isRootRow);
      setToggleState(row, false);
    });

    table.addEventListener('click', (event) => {
      const toggle = event.target.closest('.lot-tree-toggle');

      if (toggle && table.contains(toggle)) {
        const row = toggle.closest('tr[data-lot-id]');

        if (row) {
          event.preventDefault();
          event.stopPropagation();
          toggleRowChildren(row, childrenByParentId);
        }

        return;
      }

      const row = event.target.closest('tr[data-lot-id]');

      if (!row || !table.contains(row)) {
        return;
      }

      if (isRootSeparatorClick(event, row)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isHierarchyIndentZoneClick(event, row)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isToggleZoneClick(event, row)) {
        event.preventDefault();
        event.stopPropagation();

        const rowToggle = row.querySelector('.lot-tree-toggle');
        if (rowToggle) {
          toggleRowChildren(row, childrenByParentId);
        }

        return;
      }

      if (isActionZoneClick(event, row) || isInteractiveClick(event)) {
        return;
      }

      goToRowView(row);
    });

    table.addEventListener('keydown', (event) => {
      const row = event.target.closest('tr[data-lot-id]');

      if (!row || !table.contains(row) || isActionZoneClick(event, row) || isInteractiveClick(event) || isHierarchyIndentZoneClick(event, row) || isToggleZoneClick(event, row)) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        goToRowView(row);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.management-lots-table').forEach(initializeLotTree);
  });
}());
