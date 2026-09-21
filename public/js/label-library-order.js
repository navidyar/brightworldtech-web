'use strict';

(() => {
  function getRows(list) {
    return Array.from(list.querySelectorAll('[data-label-template-order-row]'));
  }

  function setStatus(message, state = '') {
    const status = document.querySelector('[data-label-template-order-status]');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  async function saveOrder(list, previousOrder) {
    const orderedTemplateIds = getRows(list).map((row) => Number(row.dataset.templateId)).filter(Boolean);
    setStatus('Saving order…', 'saving');
    try {
      const response = await fetch(list.dataset.reorderUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedTemplateIds })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'The template order could not be saved.');
      setStatus('Order saved.', 'success');
      window.setTimeout(() => setStatus('Drag to reorder'), 1800);
    } catch (error) {
      const byId = new Map(getRows(list).map((row) => [Number(row.dataset.templateId), row]));
      previousOrder.forEach((id) => { const row = byId.get(id); if (row) list.appendChild(row); });
      setStatus(error.message || 'The template order could not be saved.', 'error');
    }
  }

  function initialize() {
    const list = document.querySelector('[data-label-template-order-list]');
    if (!list || list.dataset.reorderEnabled !== '1' || list.dataset.reorderReady === '1') return;
    list.dataset.reorderReady = '1';
    let draggingRow = null;
    let previousOrder = [];

    list.addEventListener('dragstart', (event) => {
      const handle = event.target.closest?.('[data-label-template-order-handle]');
      if (!handle) return;
      draggingRow = handle.closest('[data-label-template-order-row]');
      if (!draggingRow) return;
      previousOrder = getRows(list).map((row) => Number(row.dataset.templateId));
      if (event.dataTransfer) {
        const rect = draggingRow.getBoundingClientRect();
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.dropEffect = 'move';
        event.dataTransfer.setData('text/plain', draggingRow.dataset.templateId || '');
        event.dataTransfer.setDragImage(
          draggingRow,
          Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
          Math.max(0, Math.min(rect.height, event.clientY - rect.top))
        );
      }
      draggingRow.classList.add('is-dragging');
      list.classList.add('is-reordering');
      document.documentElement.classList.add('label-library-reordering');
    });

    list.addEventListener('dragover', (event) => {
      if (!draggingRow) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const targetRow = event.target.closest?.('[data-label-template-order-row]');
      if (!targetRow || targetRow === draggingRow) return;
      const rect = targetRow.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      list.insertBefore(draggingRow, before ? targetRow : targetRow.nextSibling);
    });

    list.addEventListener('drop', (event) => {
      if (!draggingRow) return;
      event.preventDefault();
    });

    list.addEventListener('dragend', () => {
      if (!draggingRow) return;
      draggingRow.classList.remove('is-dragging');
      list.classList.remove('is-reordering');
      document.documentElement.classList.remove('label-library-reordering');
      const currentOrder = getRows(list).map((row) => Number(row.dataset.templateId));
      const changed = currentOrder.some((id, index) => id !== previousOrder[index]);
      draggingRow = null;
      if (changed) void saveOrder(list, previousOrder);
      previousOrder = [];
    });

    list.addEventListener('keydown', (event) => {
      const handle = event.target.closest?.('[data-label-template-order-handle]');
      if (!handle || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const row = handle.closest('[data-label-template-order-row]');
      if (!row) return;
      const previous = getRows(list).map((item) => Number(item.dataset.templateId));
      if (event.key === 'ArrowUp' && row.previousElementSibling) {
        event.preventDefault();
        list.insertBefore(row, row.previousElementSibling);
      } else if (event.key === 'ArrowDown' && row.nextElementSibling) {
        event.preventDefault();
        list.insertBefore(row.nextElementSibling, row);
      } else return;
      handle.focus();
      void saveOrder(list, previous);
    });
  }

  document.addEventListener('DOMContentLoaded', initialize);
  document.addEventListener('bwtdallas:filter-fragment-updated', initialize);
})();
